import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { validateUploadedImageBytes } from "@/lib/image-upload-validation";
import {
  PRODUCT_IMAGE_MIME_EXTENSIONS,
  MAX_PRODUCT_IMAGE_BYTES,
} from "@/lib/product-image-upload";
import {
  SITE_BANNER_BUCKET,
  isMissingContentInfra,
  contentMigrationRequiredResponse,
} from "@/lib/site-content";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * Upload a category/brand image from the admin form.
 *
 * Reuses the existing public `site-banners` bucket under a `catalog/` prefix —
 * no new bucket, policies or migration required. Admin actions use the service
 * role; the URL returned here is written directly to categories.image_url or
 * brands.logo_url by the existing catalog API.
 */
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
    const storagePath = `catalog/${crypto.randomUUID()}.${check.extension}`;
    const { error: uploadError } = await db.storage
      .from(SITE_BANNER_BUCKET)
      .upload(storagePath, Buffer.from(bytes), {
        contentType: check.mime,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data } = db.storage.from(SITE_BANNER_BUCKET).getPublicUrl(storagePath);
    logger.info("[Admin Catalog Images] uploaded", { path: storagePath, by: auth.user.id });
    return Response.json({ success: true, url: data.publicUrl, path: storagePath }, { status: 201 });
  } catch (error) {
    if (isMissingContentInfra(error)) return contentMigrationRequiredResponse();
    return handleApiError(error, "Admin Catalog Images POST", "Failed to upload image");
  }
}
