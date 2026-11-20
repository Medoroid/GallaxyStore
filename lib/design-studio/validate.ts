/**
 * Artwork validation — pure, shared by the browser dropzone (instant feedback)
 * and the API routes (authoritative).
 *
 * Rules:
 *  - The format is determined by MAGIC BYTES. The client-declared MIME type and
 *    filename are advisory only (a mismatch becomes a warning, never a pass).
 *  - Dimensions / DPI / transparency are parsed from file headers in pure JS —
 *    no image decoding, no dependencies.
 *  - SVG: size-capped and structurally sniffed here; sanitization is a separate
 *    step (`svg-sanitize.ts`) so the caller controls what gets stored.
 *  - Only PNG / JPG / WebP / SVG are accepted. PDF, AI and PSD are rejected
 *    with an explicit message instead of being half-supported.
 */

import {
  ARTWORK_LIMITS,
  type ArtworkErrorCode,
  type ArtworkFormat,
  type ArtworkWarningCode,
} from "./types";

export type ValidateOptions = {
  filename?: string;
  mimeType?: string;
  maxBytes?: number;
  svgMaxBytes?: number;
  minDimensionPx?: number;
  maxDimensionPx?: number;
};

export type ArtworkValidation = {
  ok: boolean;
  code?: ArtworkErrorCode;
  /** English fallback message (API responses); clients map `code` to translations. */
  message?: string;
  format?: ArtworkFormat;
  widthPx?: number | null;
  heightPx?: number | null;
  dpi?: number | null;
  colorMode?: string | null;
  hasTransparency?: boolean | null;
  /** width / height of the intrinsic pixels (or viewBox for SVG); null when unknown. */
  ratio?: number | null;
  warnings: ArtworkWarningCode[];
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && offset + i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function be32(bytes: Uint8Array, offset: number): number {
  // >>> 0 keeps the value unsigned for large IHDR dimensions.
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function le16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function le24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

const DEFAULT_DPI = 72;

// ---------------------------------------------------------------------------
// Format sniffing
// ---------------------------------------------------------------------------

/** Remove leading XML declaration / comments / DOCTYPE (subset-aware) so the
 * real root tag can be tested. Best effort by design — this is sniffing; the
 * sanitizer does the real work later. */
function stripProlog(raw: string): string {
  let out = raw.replace(/^\uFEFF/, "");
  for (let i = 0; i < 10; i += 1) {
    const trimmed = out.replace(/^\s+/, "");
    if (trimmed.startsWith("<?")) {
      const end = trimmed.indexOf("?>");
      if (end === -1) return trimmed;
      out = trimmed.slice(end + 2);
    } else if (trimmed.startsWith("<!--")) {
      const end = trimmed.indexOf("-->");
      if (end === -1) return trimmed;
      out = trimmed.slice(end + 3);
    } else if (/^<!DOCTYPE/i.test(trimmed)) {
      let j = 9; // after "<!DOCTYPE"
      let inSubset = false;
      for (; j < trimmed.length; j += 1) {
        const ch = trimmed[j];
        if (ch === "[") inSubset = true;
        else if (ch === "]") inSubset = false;
        else if (ch === ">" && !inSubset) {
          j += 1;
          break;
        }
      }
      out = trimmed.slice(j);
    } else {
      return trimmed;
    }
  }
  return out.replace(/^\s+/, "");
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  // Decode only a prefix: detection must stay cheap even for a 50MB file that
  // turns out to be something else.
  const prefix = new TextDecoder("utf-8").decode(bytes.subarray(0, 4096));
  return /^<svg[\s>/]/i.test(stripProlog(prefix));
}

export type SniffedFormat = ArtworkFormat | "pdf" | "psd" | "ai" | "unknown";

export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (startsWith(bytes, PNG_SIG)) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 0, 4) === "%PDF") return "pdf";
  if (ascii(bytes, 0, 4) === "8BPS") return "psd";
  if (ascii(bytes, 0, 2) === "%!" || ascii(bytes, 4, 4) === "%EPS") return "ai";
  if (looksLikeSvg(bytes)) return "svg";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Header parsers (return null when the header is absent or malformed)
// ---------------------------------------------------------------------------

type ParsedRaster = {
  widthPx: number;
  heightPx: number;
  dpi: number | null;
  colorMode: string | null;
  hasTransparency: boolean;
};

function parsePng(bytes: Uint8Array): ParsedRaster | null {
  // sig(8) + IHDR length/type(8) + IHDR data(13) + crc(4) = 33 bytes minimum.
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") return null;
  const widthPx = be32(bytes, 16);
  const heightPx = be32(bytes, 20);
  if (widthPx <= 0 || heightPx <= 0) return null;
  const colorType = bytes[25];

  let dpi: number | null = null;
  let hasTrns = false;

  // Walk chunks up to IDAT — ancillary chunks like pHYs/tRNS live before it.
  let pos = 8;
  let guard = 0;
  while (pos + 8 <= bytes.length && guard < 512) {
    guard += 1;
    const length = be32(bytes, pos);
    if (length > 0x7fffffff || pos + 12 + length > bytes.length + 4) break;
    const type = ascii(bytes, pos + 4, 4);
    const dataStart = pos + 8;
    if (type === "pHYs" && length === 9 && dataStart + 9 <= bytes.length) {
      const perUnitX = be32(bytes, dataStart);
      const unit = bytes[dataStart + 8];
      if (unit === 1 && perUnitX > 0) {
        // Pixels per metre → DPI.
        dpi = Math.round(perUnitX * 0.0254);
      }
    } else if (type === "tRNS") {
      hasTrns = true;
    } else if (type === "IDAT") {
      break;
    }
    pos = dataStart + length + 4; // skip CRC
    if (pos <= 8) break;
  }

  let hasTransparency: boolean;
  let colorMode: string;
  if (colorType === 6) {
    hasTransparency = true; // RGBA
    colorMode = "RGB";
  } else if (colorType === 4) {
    hasTransparency = true; // Gray + alpha
    colorMode = "Grayscale";
  } else if (colorType === 3) {
    hasTransparency = hasTrns; // Palette — only via tRNS
    colorMode = "Indexed";
  } else if (colorType === 2) {
    hasTransparency = hasTrns;
    colorMode = "RGB";
  } else {
    hasTransparency = hasTrns; // Grayscale
    colorMode = "Grayscale";
  }

  return { widthPx, heightPx, dpi: dpi ?? DEFAULT_DPI, colorMode, hasTransparency };
}

function parseJpg(bytes: Uint8Array): ParsedRaster | null {
  let widthPx = 0;
  let heightPx = 0;
  let dpi: number | null = null;

  let i = 2; // skip SOI
  let guard = 0;
  while (i + 3 < bytes.length && guard < 1024) {
    guard += 1;
    if (bytes[i] !== 0xff) break;
    while (i < bytes.length && bytes[i] === 0xff) i += 1; // fill bytes
    if (i >= bytes.length) break;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan — dims must exist by now
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no length segment
    if (marker === 0x00) break; // stuffed byte — malformed
    if (i + 2 > bytes.length) break;
    const segmentLength = be16(bytes, i);
    if (segmentLength < 2) break;
    const dataStart = i + 2;

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && dataStart + 5 <= bytes.length) {
      heightPx = be16(bytes, dataStart + 1);
      widthPx = be16(bytes, dataStart + 3);
    }

    if (marker === 0xe0 && dataStart + 12 <= bytes.length && ascii(bytes, dataStart, 5) === "JFIF\u0000") {
      const units = bytes[dataStart + 7];
      const xDensity = be16(bytes, dataStart + 8);
      if (units === 1 && xDensity > 0) dpi = xDensity;
      else if (units === 2 && xDensity > 0) dpi = Math.round(xDensity * 2.54); // dpcm → dpi
    }

    // segmentLength counts its own 2 bytes: payload ends at dataStart + (length - 2).
    i = dataStart + segmentLength - 2;
  }

  if (widthPx <= 0 || heightPx <= 0) return null;
  return {
    widthPx,
    heightPx,
    dpi: dpi ?? DEFAULT_DPI,
    colorMode: null, // channel layout needs a full decode — left honestly unknown
    hasTransparency: false, // baseline JPEG has no alpha channel
  };
}

function parseWebp(bytes: Uint8Array): ParsedRaster | null {
  if (bytes.length < 20) return null;
  const chunkType = ascii(bytes, 12, 4);
  const dataStart = 20;

  if (chunkType === "VP8X" && dataStart + 10 <= bytes.length) {
    const flags = bytes[dataStart];
    const widthPx = 1 + le24(bytes, dataStart + 4);
    const heightPx = 1 + le24(bytes, dataStart + 7);
    if (widthPx <= 0 || heightPx <= 0) return null;
    return {
      widthPx,
      heightPx,
      dpi: DEFAULT_DPI,
      colorMode: "RGB",
      hasTransparency: (flags & 0x10) !== 0, // alpha flag
    };
  }

  if (chunkType === "VP8 " && dataStart + 10 <= bytes.length) {
    // Lossy keyframe:3-byte frame tag +9D 01 2A sync + 14-bit dims.
    if (bytes[dataStart + 3] !== 0x9d || bytes[dataStart + 4] !== 0x01 || bytes[dataStart + 5] !== 0x2a) {
      return null;
    }
    const widthPx = le16(bytes, dataStart + 6) & 0x3fff;
    const heightPx = le16(bytes, dataStart + 8) & 0x3fff;
    if (widthPx <= 0 || heightPx <= 0) return null;
    return { widthPx, heightPx, dpi: DEFAULT_DPI, colorMode: "RGB", hasTransparency: false };
  }

  if (chunkType === "VP8L" && dataStart + 5 <= bytes.length && bytes[dataStart] === 0x2f) {
    const b1 = bytes[dataStart + 1];
    const b2 = bytes[dataStart + 2];
    const b3 = bytes[dataStart + 3];
    const b4 = bytes[dataStart + 4];
    const widthPx = 1 + (b1 | ((b2 & 0x3f) << 8));
    const heightPx = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    const hasTransparency = ((b4 >> 4) & 0x01) !== 0; // alpha_is_used bit
    if (widthPx <= 0 || heightPx <= 0) return null;
    return { widthPx, heightPx, dpi: DEFAULT_DPI, colorMode: "RGB", hasTransparency };
  }

  return null;
}

/** Physical/CSS length → px (CSS units: 1in = 96px). Returns null for % / relative. */
export function parseSvgLength(raw: string): number | null {
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|pc|mm|cm|in|em|rem)?\s*$/i.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (match[2] ?? "").toLowerCase();
  switch (unit) {
    case "":
    case "px":
      return Math.round(value);
    case "pt":
      return Math.round((value * 96) / 72);
    case "pc":
      return Math.round(value * 16);
    case "in":
      return Math.round(value * 96);
    case "cm":
      return Math.round((value * 96) / 2.54);
    case "mm":
      return Math.round((value * 96) / 25.4);
    case "em":
    case "rem":
      return null; // font-relative — no honest pixel size
    default:
      return null;
  }
}

export type ParsedSvg = { widthPx: number | null; heightPx: number | null; text: string };

export function parseSvg(text: string): ParsedSvg {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return { widthPx: null, heightPx: null, text };

  const widthAttr = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  const heightAttr = /\bheight\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  const widthPx = widthAttr ? parseSvgLength(widthAttr) : null;
  const heightPx = heightAttr ? parseSvgLength(heightAttr) : null;
  if (widthPx !== null && heightPx !== null) return { widthPx, heightPx, text };

  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
      return { widthPx: widthPx ?? Math.round(parts[2]), heightPx: heightPx ?? Math.round(parts[3]), text };
    }
  }

  return { widthPx, heightPx, text };
}

// ---------------------------------------------------------------------------
// Validation entry point
// ---------------------------------------------------------------------------

const CANONICAL_MIME: Record<ArtworkFormat, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg", "image/jpg"],
  webp: ["image/webp"],
  svg: ["image/svg+xml", "text/xml", "application/xml", "text/svg+xml"],
};

const UNSUPPORTED_MESSAGES: Record<string, string> = {
  pdf: "PDF files are not supported by the Design Studio. Upload a PNG, JPG, WebP or SVG.",
  psd: "Photoshop (PSD) files are not supported by the Design Studio. Upload a PNG, JPG, WebP or SVG.",
  ai: "Illustrator/EPS files are not supported by the Design Studio. Export to SVG and upload that.",
  unknown: "Unsupported file type. Upload a PNG, JPG, WebP or SVG.",
};

function fail(code: ArtworkErrorCode, message: string): ArtworkValidation {
  return { ok: false, code, message, warnings: [] };
}

export function validateArtwork(bytes: Uint8Array, opts: ValidateOptions = {}): ArtworkValidation {
  const maxBytes = opts.maxBytes ?? ARTWORK_LIMITS.maxBytes;
  const svgMaxBytes = opts.svgMaxBytes ?? ARTWORK_LIMITS.svgMaxBytes;
  const minDim = opts.minDimensionPx ?? ARTWORK_LIMITS.minDimensionPx;
  const maxDim = opts.maxDimensionPx ?? ARTWORK_LIMITS.maxDimensionPx;

  if (!bytes || bytes.length === 0) {
    return fail("missing_file", "Choose a file to upload.");
  }
  if (bytes.length > maxBytes) {
    return fail(
      "too_large",
      `File is larger than the ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`
    );
  }

  const format = sniffFormat(bytes);
  const warnings: ArtworkWarningCode[] = [];

  if (format === "png" || format === "jpg" || format === "webp") {
    const parsed =
      format === "png" ? parsePng(bytes) : format === "jpg" ? parseJpg(bytes) : parseWebp(bytes);
    if (!parsed) {
      return fail("invalid_file", "This file could not be read. It may be damaged or incomplete.");
    }

    if (parsed.widthPx < minDim || parsed.heightPx < minDim) {
      return fail(
        "too_small_dimensions",
        `Image is ${parsed.widthPx}×${parsed.heightPx}px — at least ${minDim}×${minDim}px is required.`
      );
    }
    if (parsed.widthPx > maxDim || parsed.heightPx > maxDim) {
      return fail(
        "too_large_dimensions",
        `Image is ${parsed.widthPx}×${parsed.heightPx}px — the maximum is ${maxDim}×${maxDim}px.`
      );
    }
    if (Math.max(parsed.widthPx, parsed.heightPx) < ARTWORK_LIMITS.lowResolutionPx) {
      warnings.push("low_source_resolution");
    }

    const declared = opts.mimeType?.split(";")[0].trim().toLowerCase();
    if (declared && !CANONICAL_MIME[format].includes(declared)) {
      warnings.push("mime_mismatch");
    }

    return {
      ok: true,
      format,
      widthPx: parsed.widthPx,
      heightPx: parsed.heightPx,
      dpi: parsed.dpi,
      colorMode: parsed.colorMode,
      hasTransparency: parsed.hasTransparency,
      ratio: parsed.widthPx / parsed.heightPx,
      warnings,
    };
  }

  if (format === "svg") {
    if (bytes.length > svgMaxBytes) {
      return fail(
        "svg_too_large",
        `SVG is larger than the ${Math.floor(svgMaxBytes / (1024 * 1024))}MB limit.`
      );
    }
    const text = new TextDecoder("utf-8").decode(bytes);
    const parsed = parseSvg(text);
    const declared = opts.mimeType?.split(";")[0].trim().toLowerCase();
    if (declared && !CANONICAL_MIME.svg.includes(declared)) {
      warnings.push("mime_mismatch");
    }
    const ratio =
      parsed.widthPx !== null && parsed.heightPx !== null && parsed.heightPx > 0
        ? parsed.widthPx / parsed.heightPx
        : null;
    return {
      ok: true,
      format: "svg",
      // Vector: no pixel size is claimed when the file does not declare one,
      // and no DPI/transparency claims are made at all.
      widthPx: parsed.widthPx,
      heightPx: parsed.heightPx,
      dpi: null,
      colorMode: null,
      hasTransparency: null,
      ratio,
      warnings,
    };
  }

  return fail(
    "unsupported_type",
    UNSUPPORTED_MESSAGES[format] ?? UNSUPPORTED_MESSAGES.unknown
  );
}
