/**
 * Browser-side mockup rasterizer — the thin canvas bridge between the pure
 * SVG compositor (`mockup.ts`) and the PNG that POST /api/designs/[id]/mockups
 * accepts (PNG-only by protocol).
 *
 * Pipeline: artwork blob → data URL → `<image href>` inside the composed SVG
 * → data URL → `Image` → `<canvas>` → `toBlob("image/png")`.
 *
 * Security/robustness notes:
 *  - the SVG contains ONLY `data:image/…;base64` refs (the pure
 *    `safeImageHref` allow-list), so the canvas never taints and `toBlob`
 *    always works — no external fetch can enter the render;
 *  - SVG-as-image never executes scripts inside the markup;
 *  - every failure rejects with a stable error `message` the UI maps to an
 *    honest retry state — never a silent blank "preview".
 *
 * Kept deliberately small: canvas/Image/FileReader are browser APIs the unit
 * environment cannot emulate faithfully, so the logic here is trivial by
 * design and covered by the API contract tests on the other side of the PNG.
 */

/** UTF-8-safe `data:image/svg+xml;base64,…` encoding of a composed mockup. */
export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** Read any blob (the fetched artwork bytes) as a `data:` URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("artwork_read_failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Rasterize a composed mockup SVG into a PNG blob at its intrinsic size
 * (viewBox units are declared as px in `buildMockupSvg`), scaled by
 * `opts.scale` when a higher-resolution preview is wanted.
 */
export function rasterizeSvgToPng(
  svg: string,
  opts: { scale?: number } = {}
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      reject(new Error("canvas_unavailable"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Number.isFinite(opts.scale) && (opts.scale ?? 1) > 0 ? (opts.scale as number) : 1;
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas_unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) =>
          blob && blob.size > 0
            ? resolve(blob)
            : reject(new Error("png_encode_failed")),
        "image/png"
      );
    };
    img.onerror = () => reject(new Error("svg_load_failed"));
    img.src = svgDataUrl(svg);
  });
}
