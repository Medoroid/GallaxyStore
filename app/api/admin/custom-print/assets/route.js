import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { validateArtwork } from "@/lib/design-studio/validate";
import { sanitizeSvg } from "@/lib/design-studio/svg-sanitize";

export const runtime = "nodejs";

const BUCKET = "mockup-assets";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * POST — upload a replacement mockup image (multipart "file").
 *
 * Files are magic-byte validated, SVG is sanitised, and the original bytes are
 * preserved in the private `mockup-assets` bucket. The returned base64 data URL
 * is for inline SVG composition only — admins paste it into a template layer.
 */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }
    const { allowed } = await checkRateLimitAsync(`mockup-asset:${getClientIp(request)}`, {
      maxRequests: 20,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json({ success: false, message: "Too many uploads." }, { status: 429 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return Response.json({ success: false, message: "A file is required." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateArtwork(bytes, {
      filename: file.name,
      mimeType: file.type,
      maxBytes: MAX_BYTES,
      svgMaxBytes: MAX_BYTES,
      // Mockup layers include small repeating texture tiles — the 200 px
      // minimum applies to customer artwork, not to product template assets.
      minDimensionPx: 1,
    });
    if (!validation.ok) {
      return Response.json(
        { success: false, message: validation.message ?? "Unsupported image." },
        { status: 400 }
      );
    }

    const ext = validation.format === "jpeg" ? "jpg" : validation.format;
    const path = `admin/${crypto.randomUUID()}.${ext}`;
    let storeBytes = bytes;
    let contentType = file.type || `image/${ext}`;
    if (validation.format === "svg") {
      const sanitized = sanitizeSvg(new TextDecoder().decode(bytes));
      if (!sanitized.ok || !sanitized.svg) {
        return Response.json(
          { success: false, message: "The SVG contains unsupported markup and was rejected." },
          { status: 400 }
        );
      }
      storeBytes = new TextEncoder().encode(sanitized.svg);
      contentType = "image/svg+xml";
    }

    const db = getServiceRoleClient();
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(storeBytes), {
      contentType,
      upsert: false,
    });
    if (error) throw error;

    const mime = contentType === "image/svg+xml"
      ? "image/svg+xml"
      : contentType.startsWith("image/") ? contentType : "image/png";
    const base64 = Buffer.from(storeBytes).toString("base64");

    return Response.json({
      success: true,
      path,
      bucket: BUCKET,
      data_url: `data:${mime};base64,${base64}`,
      format: validation.format,
    });
  } catch (error) {
    return handleApiError(error, "Admin mockup asset upload", "Could not upload the mockup asset.");
  }
}
