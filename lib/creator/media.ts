/**
 * Shared formatting and media helpers for creator-facing UI (dashboard and
 * public profile). Pure functions — safe in both server and client bundles.
 */

export function formatDate(
  iso: string | null | undefined,
  locale: string
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build a public Storage URL. Accepts absolute http(s)/data URLs and
 * site-relative paths as-is; a bare object name needs `defaultBucket`
 * (e.g. "avatars", "design-previews"); a "bucket/name" path is used verbatim.
 */
export function publicStorageUrl(
  path: string | null | undefined,
  defaultBucket?: string
): string | null {
  const value = typeof path === "string" ? path.trim() : "";
  if (!value) return null;
  if (/^(https?:|data:|\/)/.test(value)) return value;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  if (value.includes("/")) {
    return `${base}/storage/v1/object/public/${value}`;
  }
  if (!defaultBucket) return null;
  return `${base}/storage/v1/object/public/${defaultBucket}/${value}`;
}

/** Bucket that stores generated previews and mockups (public-read). */
export const DESIGN_PREVIEW_BUCKET = "design-previews";

/**
 * Public URL for a design-preview object.
 *
 * Preview paths are stored as bare object names inside the public
 * `design-previews` bucket (`mockups/…`), which `publicStorageUrl` would
 * misread as a `bucket/name` path and serve without its bucket — so the
 * prefix is normalised here. Full URLs and already bucket-prefixed paths
 * pass through unchanged.
 */
export function designPreviewUrl(
  path: string | null | undefined
): string | null {
  const value = typeof path === "string" ? path.trim() : "";
  if (!value) return null;
  if (/^(https?:|data:|\/)/.test(value)) return value;
  const prefixed = value.startsWith(`${DESIGN_PREVIEW_BUCKET}/`)
    ? value
    : `${DESIGN_PREVIEW_BUCKET}/${value}`;
  return publicStorageUrl(prefixed);
}
