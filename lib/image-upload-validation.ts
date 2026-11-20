/**
 * Server-side upload validation for public/private image assets.
 *
 * A browser-supplied `file.type` and filename are NOT evidence of file type.
 * This helper composes the project's two existing byte sniffers so every upload
 * route can derive the stored MIME/extension from the ACTUAL bytes.
 *
 * It intentionally keeps each caller's existing MIME allow-list and size cap:
 * legitimate files behave exactly as before, while a renamed executable,
 * HTML or SVG payload is rejected instead of being stored as "image/png".
 */

import { detectImageMime } from "@/lib/receipt-file";
import { sniffFormat } from "@/lib/design-studio/validate";

export type UploadMimeMap = Record<string, string>;

export type UploadedImageCheck =
  | { ok: true; mime: string; extension: string }
  | { ok: false; message: string };

const FORMAT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  svg: "image/svg+xml",
  psd: "image/psd",
  ai: "application/postscript",
};

function canonicalMime(mime: string): string {
  return mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
}

export function validateUploadedImageBytes(
  bytes: Uint8Array,
  options: { allowed: UploadMimeMap; maxBytes: number }
): UploadedImageCheck {
  if (!bytes || bytes.length === 0) {
    return { ok: false, message: "The file is empty" };
  }
  if (bytes.length > options.maxBytes) {
    return {
      ok: false,
      message: `The file is larger than ${Math.round(options.maxBytes / (1024 * 1024))} MB`,
    };
  }

  let mime = detectImageMime(bytes);
  if (!mime) {
    const fallback = FORMAT_MIME[sniffFormat(bytes)];
    if (fallback) mime = fallback;
  }
  if (!mime) {
    return {
      ok: false,
      message: "Unsupported or mismatched file content — the bytes are not a recognised image",
    };
  }

  mime = canonicalMime(mime);
  const extension = options.allowed[mime];
  if (!extension) {
    return { ok: false, message: `Unsupported file type: ${mime}` };
  }

  // The extension/MIME used for storage always come from the bytes, never
  // from the client-supplied declaration.
  return { ok: true, mime, extension };
}
