import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { validateUploadedImageBytes } from "@/lib/image-upload-validation";
import {
  PRODUCT_IMAGE_MIME_EXTENSIONS,
  MAX_PRODUCT_IMAGE_BYTES,
} from "@/lib/product-image-upload";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  isMissingThemeTables,
  migrationRequiredResponse,
} from "../../_lib/themeAdmin";

export const runtime = "nodejs";

/**
 * Theme assets: upload / list / delete files in the public `theme-assets`
 * bucket (the migration creates it: public read, 5 MB, image mime allowlist).
 *
 * - POST   multipart form-data { file, theme_id, asset_type } → row + URL
 * - GET    ?theme_id=<uuid> → the theme's assets
 * - DELETE ?id=<uuid>       → row + storage object (both, best effort)
 *
 * The file rules are shared with product images (lib/product-image-upload.ts)
 * so there is one place that keeps size/mime limits honest. The public URL is
 * returned immediately; the studio writes it into the theme's `assets` config
 * block (banner/background fields) with one click.
 */

const BUCKET = "theme-assets";

const ASSET_TYPES = [
  "background_desktop",
  "background_mobile",
  "banner_desktop",
  "banner_mobile",
  "icon",
  "logo",
  "artwork",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_COLUMNS = "id, theme_id, asset_type, asset_url, mobile_asset_url, metadata, created_at";

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const themeId = url.searchParams.get("theme_id");
    if (!themeId || !UUID_RE.test(themeId)) {
      return Response.json(
        { success: false, message: "theme_id (uuid) is required" },
        { status: 400 }
      );
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("theme_assets")
      .select(LIST_COLUMNS)
      .eq("theme_id", themeId)
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      throw error;
    }

    return Response.json({ success: true, assets: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Admin Theme Assets GET", "Failed to load theme assets");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return Response.json(
        { success: false, message: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const themeId = form.get("theme_id");
    const assetType = form.get("asset_type");
    if (typeof themeId !== "string" || !UUID_RE.test(themeId)) {
      return Response.json({ success: false, message: "theme_id (uuid) is required" }, { status: 400 });
    }
    if (typeof assetType !== "string" || !ASSET_TYPES.includes(assetType)) {
      return Response.json(
        { success: false, message: `asset_type must be one of: ${ASSET_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const file = form.get("file") ?? form.get("image");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return Response.json({ success: false, message: "No image file provided" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUploadedImageBytes(bytes, {
      allowed: PRODUCT_IMAGE_MIME_EXTENSIONS,
      maxBytes: MAX_PRODUCT_IMAGE_BYTES,
    });
    if (!check.ok) {
      return Response.json({ success: false, message: check.message }, { status: 400 });
    }

    const db = getServiceRoleClient();

    // Honest404 before touching storage (FK would catch it too, but later).
    const { data: theme, error: themeError } = await db
      .from("store_themes")
      .select("id, name")
      .eq("id", themeId)
      .maybeSingle();
    if (themeError) {
      if (isMissingThemeTables(themeError)) return migrationRequiredResponse();
      throw themeError;
    }
    if (!theme) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const storagePath = `${themeId}/${crypto.randomUUID()}.${check.extension}`;
    const buffer = Buffer.from(bytes);
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: check.mime, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = db.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: asset, error: insertError } = await db
      .from("theme_assets")
      .insert({
        theme_id: themeId,
        asset_type: assetType,
        asset_url: publicUrl.publicUrl,
        metadata: { path: storagePath, contentType: check.mime },
      })
      .select(LIST_COLUMNS)
      .single();
    if (insertError) {
      // Roll the storage object back so a failed row never leaves orphans.
      await db.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      if (isMissingThemeTables(insertError)) return migrationRequiredResponse();
      throw insertError;
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.asset.upload",
      entityType: "theme_asset",
      entityId: asset.id,
      details: { theme_id: themeId, asset_type: assetType, path: storagePath },
    });
    invalidateThemeCache();

    logger.info("[Theme Assets] uploaded", { themeId, assetType, path: storagePath });
    return Response.json({ success: true, asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Theme Assets POST", "Failed to upload theme asset");
  }
}

export async function DELETE(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !UUID_RE.test(id)) {
      return Response.json({ success: false, message: "id (uuid) is required" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { data: asset, error } = await db
      .from("theme_assets")
      .select(LIST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      throw error;
    }
    if (!asset) {
      return Response.json({ success: false, message: "Asset not found" }, { status: 404 });
    }

    const { error: deleteError } = await db.from("theme_assets").delete().eq("id", id);
    if (deleteError) {
      if (isMissingThemeTables(deleteError)) return migrationRequiredResponse();
      throw deleteError;
    }

    // Storage cleanup is best effort — a stuck object costs 5 MB, a failed
    // request would confuse the admin into re-uploading.
    const path = asset.metadata?.path;
    if (typeof path === "string" && path) {
      const { error: storageError } = await db.storage.from(BUCKET).remove([path]);
      if (storageError) logger.warn("[Theme Assets] storage remove failed:", storageError);
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.asset.delete",
      entityType: "theme_asset",
      entityId: id,
      details: { theme_id: asset.theme_id, asset_type: asset.asset_type },
    });
    invalidateThemeCache();

    return Response.json({ success: true, deleted: id });
  } catch (error) {
    return handleApiError(error, "Admin Theme Assets DELETE", "Failed to delete theme asset");
  }
}
