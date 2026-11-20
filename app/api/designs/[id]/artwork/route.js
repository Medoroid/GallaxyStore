import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";
import { requireUser } from "@/lib/creator/api";
import { editorStateForReplacement } from "@/lib/design-studio/editor-state";
import {
  DESIGN_UPLOAD_BUCKET,
  migrationGuard,
  prepareArtwork,
  readUpload,
  uploadFailure,
  artworkStoragePath,
} from "@/lib/design-studio/server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — replace the artwork of an existing design.
 *
 * Versioning model (verified against the live DB triggers):
 *  1. insert the NEW version with `is_current: false` (the trigger assigns
 *     `version_number = max + 1`);
 *  2. attach the file row to it;
 *  3. activate it (`is_current: true`) — `enforce_single_current_version`
 *     atomically flips the old version off, and `sync_design_status_from_version`
 *     resets `user_designs.status` to the version's status (draft), clears
 *     `rejection_reason` and review metadata.
 *
 * Doing it in this order means a failure at any step can be unwound WITHOUT
 * ever disturbing the previously current version or the design's status: the
 * creator's design stays exactly as it was. All previous artwork objects stay
 * in Storage (originals preserved per version); every write runs under the
 * caller's JWT so RLS ownership applies.
 */
export async function POST(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-artwork:${ip}`, {
      maxRequests: 10,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many uploads. Please wait a minute." },
        { status: 429 }
      );
    }

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }

    const guard = await migrationGuard(auth.client, "designs.replace_artwork");
    if (guard.missing) return guard.response;

    const upload = await readUpload(request, "file");
    if (!upload.ok) return upload.response;

    const prepared = prepareArtwork(upload.bytes, {
      filename: upload.file.name,
      mimeType: upload.file.type,
    });
    if (!prepared.ok) return uploadFailure(prepared);

    // Load the design + its current version (RLS scopes to the caller).
    const { data: row, error: loadError } = await auth.client
      .from("user_designs")
      .select(
        "id, status, design_versions!inner(id, editor_state, version_number)"
      )
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .eq("design_versions.is_current", true)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }
    const currentVersion = row.design_versions?.[0];
    if (!currentVersion) {
      return Response.json(
        {
          success: false,
          code: "no_current_version",
          message: "This design has no current version to replace.",
        },
        { status: 409 }
      );
    }

    const storagePath = artworkStoragePath(auth.user.id, id, prepared.format);

    const { error: uploadError } = await auth.client.storage
      .from(DESIGN_UPLOAD_BUCKET)
      .upload(storagePath, Buffer.from(prepared.storeBytes), {
        contentType: prepared.contentType,
        upsert: false,
      });
    if (uploadError) {
      return Response.json(
        {
          success: false,
          code: "storage_rejected",
          message: `Storage rejected the file: ${uploadError.message}`,
        },
        { status: 400 }
      );
    }

    const cleanupStorage = async () => {
      try {
        await auth.client.storage.from(DESIGN_UPLOAD_BUCKET).remove([storagePath]);
      } catch {
        // best effort
      }
    };

    // Carry the creator's placement into the new version; the box is refit to
    // the new artwork's aspect so a different ratio can never distort.
    const nextEditorState = editorStateForReplacement(
      currentVersion.editor_state,
      prepared.widthPx && prepared.heightPx ? prepared.widthPx / prepared.heightPx : null
    );

    const { data: newVersion, error: versionError } = await auth.client
      .from("design_versions")
      .insert({
        design_id: id,
        status: "draft",
        is_current: false, // activated only after the file row exists
        editor_state: nextEditorState,
      })
      .select("id, version_number, status, created_at")
      .single();

    if (versionError) {
      await cleanupStorage();
      throw versionError;
    }

    const { error: fileError } = await auth.client.from("design_files").insert({
      version_id: newVersion.id,
      file_format: prepared.format,
      storage_path: storagePath,
      original_filename: String(upload.file.name ?? "").slice(0, 255) || null,
      mime_type: prepared.contentType,
      file_size_bytes: prepared.storeBytes.length,
      width_px: prepared.widthPx,
      height_px: prepared.heightPx,
      dpi: prepared.dpi,
      color_mode: prepared.colorMode,
      has_transparent_background: prepared.hasTransparency,
      checksum_sha256: prepared.sha256,
      is_primary: true,
      scan_status: "pending",
    });

    if (fileError) {
      // Unwind: version first (it is a non-current draft → owner-delete allowed),
      // then the uploaded object. The design itself was never touched.
      await auth.client.from("design_versions").delete().eq("id", newVersion.id);
      await cleanupStorage();
      throw fileError;
    }

    // Activate — DB triggers flip the old version and sync the design status.
    const { error: activateError } = await auth.client
      .from("design_versions")
      .update({ is_current: true })
      .eq("id", newVersion.id)
      .eq("design_id", id);
    if (activateError) {
      await auth.client.from("design_files").delete().eq("version_id", newVersion.id);
      await auth.client.from("design_versions").delete().eq("id", newVersion.id);
      await cleanupStorage();
      throw activateError;
    }

    // Re-read: the sync trigger has reset the design to draft by now.
    const { data: finalRow, error: finalError } = await auth.client
      .from("user_designs")
      .select(
        "id, title, slug, status, is_public, rejection_reason, updated_at, design_versions!inner(id, version_number, status, is_current, editor_state, design_files(id, storage_path, original_filename, file_format, mime_type, file_size_bytes, width_px, height_px, dpi, color_mode, has_transparent_background, is_primary, scan_status))"
      )
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .eq("design_versions.is_current", true)
      .maybeSingle();
    if (finalError) throw finalError;

    const version = finalRow?.design_versions?.[0] ?? null;
    const files = version?.design_files ?? [];

    return Response.json(
      {
        success: true,
        design: {
          id: finalRow?.id ?? id,
          title: finalRow?.title ?? null,
          slug: finalRow?.slug ?? null,
          status: finalRow?.status ?? "draft",
          is_public: finalRow?.is_public ?? false,
          rejection_reason: finalRow?.rejection_reason ?? null,
          updated_at: finalRow?.updated_at ?? null,
          version: version
            ? {
                id: version.id,
                version_number: version.version_number,
                status: version.status,
                is_current: version.is_current,
                editor_state: version.editor_state ?? null,
                file: files.find((file) => file.is_primary) ?? files[0] ?? null,
              }
            : null,
        },
        warnings: prepared.warnings,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Design Artwork POST", "Could not replace the artwork.");
  }
}
