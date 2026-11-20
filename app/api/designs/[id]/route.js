import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";
import { requireUser } from "@/lib/creator/api";
import { validateDesignPatch } from "@/lib/design-studio/design-input";
import { migrationGuard } from "@/lib/design-studio/server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One shape for both GET and PATCH responses: the design + its current
// version (with editor_state) + the primary artwork file.
const DESIGN_SELECT = `
  id, title, slug, description, status, is_public, rejection_reason, category_id, created_at, updated_at,
  design_versions!inner(
    id, version_number, status, is_current, editor_state, created_at, updated_at,
    design_files(
      id, storage_path, original_filename, file_format, mime_type, file_size_bytes,
      width_px, height_px, dpi, color_mode, has_transparent_background, is_primary, scan_status
    )
  )
`;

function normalizeDesign(row) {
  if (!row) return null;
  const version = row.design_versions?.[0] ?? null;
  const files = version?.design_files ?? [];
  const { design_versions: _versions, ...design } = row;
  return {
    ...design,
    version: version
      ? {
          id: version.id,
          version_number: version.version_number,
          status: version.status,
          is_current: version.is_current,
          editor_state: version.editor_state ?? null,
          created_at: version.created_at,
          updated_at: version.updated_at,
          file: files.find((file) => file.is_primary) ?? files[0] ?? null,
        }
      : null,
  };
}

function notFound() {
  return Response.json(
    { success: false, code: "not_found", message: "Design not found." },
    { status: 404 }
  );
}

async function loadOwnDesign(client, userId, designId) {
  const { data, error } = await client
    .from("user_designs")
    .select(DESIGN_SELECT)
    .eq("id", designId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .eq("design_versions.is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET — one design for the editor (current version + editor_state + file).
export async function GET(request, { params }) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) return notFound();

    // editor_state lives in the studio migration — honest 503 when absent.
    const guard = await migrationGuard(auth.client, "designs.get");
    if (guard.missing) return guard.response;

    const row = await loadOwnDesign(auth.client, auth.user.id, id);
    if (!row) return notFound();

    return Response.json({ success: true, design: normalizeDesign(row) });
  } catch (error) {
    return handleApiError(error, "Design GET", "Could not load the design.");
  }
}

const PATCH_MESSAGES = {
  not_an_object: "Request body must be a JSON object.",
  empty_patch: "Nothing to update.",
  invalid_title: `Title must be 1–80 characters.`,
  invalid_description: "Description must be 2000 characters or fewer.",
  invalid_category: "Unknown category.",
  invalid_editor_state: "Editor state is not valid.",
};

// PATCH — title / description / category / editor_state only.
// The allow-list rejects status, is_public, reviewed_*, slug, owner_id … —
// creators cannot touch approval fields, structurally (plan D5/D7).
export async function PATCH(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-patch:${ip}`, {
      maxRequests: 60,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) return notFound();

    const guard = await migrationGuard(auth.client, "designs.patch");
    if (guard.missing) return guard.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, code: "not_an_object", message: PATCH_MESSAGES.not_an_object },
        { status: 400 }
      );
    }

    const parsed = validateDesignPatch(body);
    if (!parsed.ok) {
      return Response.json(
        {
          success: false,
          code: parsed.code,
          field: parsed.field ?? null,
          message:
            parsed.code === "field_not_allowed"
              ? `The field "${parsed.field}" cannot be changed from the studio.`
              : PATCH_MESSAGES[parsed.code] ?? "Invalid design data.",
        },
        { status: 400 }
      );
    }

    // Existence under the caller's scope: someone else's (or deleted) design
    // is indistinguishable from a missing one — never leak its existence.
    const existing = await auth.client
      .from("user_designs")
      .select("id")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return notFound();

    const value = parsed.value;
    const designFields = {};
    if (value.title !== undefined) designFields.title = value.title;
    if (value.description !== undefined) designFields.description = value.description;
    if (value.category_id !== undefined) designFields.category_id = value.category_id;

    if (Object.keys(designFields).length > 0) {
      const { error } = await auth.client
        .from("user_designs")
        .update(designFields)
        .eq("id", id)
        .eq("owner_id", auth.user.id);
      if (error) throw error;
    }

    if (value.editor_state !== undefined) {
      // editor_state lives on the CURRENT version (RLS: owner write).
      const { data: updated, error } = await auth.client
        .from("design_versions")
        .update({ editor_state: value.editor_state })
        .eq("design_id", id)
        .eq("is_current", true)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) return notFound();
    }

    const row = await loadOwnDesign(auth.client, auth.user.id, id);
    if (!row) return notFound();

    return Response.json({ success: true, design: normalizeDesign(row) });
  } catch (error) {
    return handleApiError(error, "Design PATCH", "Could not save the design.");
  }
}

// DELETE — soft delete: creators have no hard-DELETE right on user_designs
// (RLS `designs_delete_admin_only`), so this stamps deleted_at. Storage and
// rows stay intact for admin recovery, and the row vanishes from every
// creator/public query (`deleted_at is null` filters everywhere).
export async function DELETE(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-delete:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) return notFound();

    const existing = await auth.client
      .from("user_designs")
      .select("id")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return notFound();

    const { error } = await auth.client
      .from("user_designs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", auth.user.id);
    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Design DELETE", "Could not delete the design.");
  }
}
