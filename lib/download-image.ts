/**
 * Client-side image download helper for admin previews.
 *
 * Signed Supabase URLs are cross-origin, so a plain `<a download>` is ignored
 * by browsers. Fetch the bytes first and hand them to the browser as a blob;
 * if CORS or the network blocks that, fall back to opening the image.
 */
export async function downloadImage(url: string | null | undefined, filename: string) {
  if (!url) return;
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function safeFilename(value: string) {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "image"
  );
}

export function imageFilename(prefix: string, url: string | null | undefined) {
  const pathname = (url ?? "").split("?")[0].split("#")[0];
  const ext = pathname.split(".").pop()?.toLowerCase();
  const allowed = ["jpg", "jpeg", "png", "webp", "gif", "svg"];
  return `${safeFilename(prefix)}.${ext && allowed.includes(ext) ? ext : "png"}`;
}
