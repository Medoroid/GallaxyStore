import { verifyAdmin } from "../../../_lib/verifyAdmin";
import { handleApiError } from "@/lib/api-errors";
import { validateTemplatePayload } from "@/lib/mockup-library/validate";
import { composeMockup } from "@/lib/mockup-library/compose";
import { safeImageHref } from "@/lib/design-studio/mockup";

export const runtime = "nodejs";

/**
 * POST — compose a mockup from UNSAVED admin edits for preview-before-publish.
 * Nothing is persisted. The same validator/compositor used by the public
 * storefront runs here, so the preview is authoritative.
 */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = validateTemplatePayload(body?.template ?? body);
    if (!parsed.ok) {
      return Response.json(
        { success: false, message: parsed.error, field: parsed.field },
        { status: 400 }
      );
    }

    const viewKey = String(body?.view_key ?? parsed.value.views[0]?.key ?? "");
    const colorKey = String(body?.color_key ?? parsed.value.colors[0]?.key ?? "");
    const artworkHref = safeImageHref(body?.artwork_href ?? null);
    // Prefer a real photo when the draft includes an uploaded data URL.
    const photoAsset = (parsed.value.photoAssets ?? []).find(
      (asset) => asset.isActive !== false && asset.colorKey === colorKey && asset.viewKey === viewKey
    );
    const photoHref = photoAsset ? safeImageHref(photoAsset.src) : null;
    const photo = photoAsset && photoHref
      ? {
          href: photoHref,
          canvas: { w: photoAsset.width, h: photoAsset.height },
          printArea: {
            x: photoAsset.printArea.x * photoAsset.width,
            y: photoAsset.printArea.y * photoAsset.height,
            w: photoAsset.printArea.w * photoAsset.width,
            h: photoAsset.printArea.h * photoAsset.height,
          },
          maskPath: `M ${photoAsset.printArea.x * photoAsset.width} ${photoAsset.printArea.y * photoAsset.height} ` +
            `H ${(photoAsset.printArea.x + photoAsset.printArea.w) * photoAsset.width} ` +
            `V ${(photoAsset.printArea.y + photoAsset.printArea.h) * photoAsset.height} ` +
            `H ${photoAsset.printArea.x * photoAsset.width} Z`,
          blend: photoAsset.blend,
          opacity: photoAsset.opacity,
          texture: photoAsset.texture,
        }
      : undefined;
    const result = composeMockup({
      template: parsed.value,
      viewKey,
      colorKey,
      artworkHref,
      transform: { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 },
      photo,
    });
    if (!result) {
      return Response.json(
        { success: false, message: "This view/colour combination cannot be rendered." },
        { status: 400 }
      );
    }

    return Response.json({ success: true, svg: result.svg, view: viewKey, color: colorKey });
  } catch (error) {
    return handleApiError(error, "Admin mockup preview", "Could not render the preview.");
  }
}
