import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { validateProductImageFile } from "@/lib/product-image-upload";
import { SITE_BANNER_BUCKET } from "@/lib/site-content";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * Uploads a banner/section image into the public `site-banners` bucket and
 * returns its public URL. The admin UI stores that URL on the banner/section
 * row, so the storefront never has to resolve storage paths at render time.
 *
 * File type/size rules are shared with product images
 * (lib/product-image-upload.ts) — one place to keep the limits honest.
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

    const check = validateProductImageFile(file);
    if (!check.ok) {
      return Response.json({ success: false, message: check.message }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const storagePath = `site/${crypto.randomUUID()}.${check.extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await db.storage
      .from(SITE_BANNER_BUCKET)
      .upload(storagePath, buffer, { contentType: check.contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data } = db.storage.from(SITE_BANNER_BUCKET).getPublicUrl(storagePath);
    logger.info("[Admin Content Images] uploaded", {
      path: storagePath,
      by: auth.user.id,
    });

    return Response.json({ success: true, url: data.publicUrl, path: storagePath }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Content Images POST", "Failed to upload image");
  }
}
