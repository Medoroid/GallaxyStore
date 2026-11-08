/**
 * Server-side receipt image validation.
 *
 * A browser-supplied MIME type and filename are not evidence. The API downloads
 * the private object and checks the actual file signature before it creates a
 * receipt row. This also means a user cannot bypass the storage bucket's MIME
 * allow-list by uploading a renamed HTML/SVG/PDF file.
 */

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export type ReceiptValidation =
  | { ok: true; mime: string }
  | { ok: false; message: string };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let index = start; index < start + length; index += 1) {
    out += String.fromCharCode(bytes[index] ?? 0);
  }
  return out;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

/** Return the real image type inferred from the file signature. */
export function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return "image/gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  // HEIC/HEIF/AVIF are ISO-BMFF containers with an `ftyp` box and image brands.
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brands = new Set<string>();
    const maxBox = Math.min(bytes.length, 64);
    for (let offset = 8; offset + 4 <= maxBox; offset += 4) {
      brands.add(ascii(bytes, offset, 4));
    }
    if (
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some(
        (brand) => brands.has(brand)
      )
    ) {
      return "image/heic";
    }
    if (brands.has("avif") || brands.has("avis")) return "image/avif";
  }

  return null;
}

export function validateReceiptBytes(bytes: Uint8Array): ReceiptValidation {
  if (bytes.length === 0) {
    return { ok: false, message: "That receipt file is empty. Choose another image." };
  }
  if (bytes.length > RECEIPT_MAX_BYTES) {
    return {
      ok: false,
      message: "Receipt image is larger than 5 MB. Choose a smaller image.",
    };
  }

  const mime = detectImageMime(bytes);
  if (!mime) {
    return {
      ok: false,
      message: "That file is not a supported receipt image. Use a JPG, PNG, WEBP or HEIC image.",
    };
  }

  return { ok: true, mime };
}
