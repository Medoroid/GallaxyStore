import {
  parseSvgLength,
  sniffFormat,
  validateArtwork,
} from "@/lib/design-studio/validate";
import { ARTWORK_LIMITS } from "@/lib/design-studio/types";

// ---------------------------------------------------------------------------
// Binary fixtures (crafted headers — no real encoders involved)
// ---------------------------------------------------------------------------

function be32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function be16(n: number): number[] {
  return [(n >>> 8) & 255, n & 255];
}

function le16(n: number): number[] {
  return [n & 255, (n >>> 8) & 255];
}

function le24(n: number): number[] {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
}

function ascii(s: string): number[] {
  return Array.from(s, (ch) => ch.charCodeAt(0));
}

type PngOptions = {
  width: number;
  height: number;
  colorType?: number;
  /** pixels per metre written into pHYs (omit for no pHYs chunk) */
  phys?: number;
  trns?: number[];
};

function png({ width, height, colorType = 6, phys, trns }: PngOptions): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  // IHDR
  bytes.push(...be32(13), ...ascii("IHDR"), ...be32(width), ...be32(height));
  bytes.push(8, colorType, 0, 0, 0, 0, 0, 0, 0);
  if (phys !== undefined) {
    bytes.push(...be32(9), ...ascii("pHYs"), ...be32(phys), ...be32(phys), 1, 0, 0, 0, 0);
  }
  if (trns) {
    bytes.push(...be32(trns.length), ...ascii("tRNS"), ...trns, 0, 0, 0, 0);
  }
  // Minimal IDAT so the chunk walk terminates
  bytes.push(...be32(4), ...ascii("IDAT"), 1, 2, 3, 4, 0, 0, 0, 0);
  return new Uint8Array(bytes);
}

type JpgOptions = {
  width: number;
  height: number;
  dpi?: number;
  units?: number;
  progressive?: boolean;
};

function jpg({ width, height, dpi, units, progressive = false }: JpgOptions): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  if (dpi !== undefined) {
    // APP0 / JFIF: "JFIF\0" + version + units + Xdensity + Ydensity
    bytes.push(0xff, 0xe0, ...be16(14), ...ascii("JFIF"), 0, 1, 2, units ?? 1, ...be16(dpi), ...be16(dpi));
  }
  const sofMarker = progressive ? 0xc2 : 0xc0;
  // SOF: precision + height + width + 1 component (id, sampling, quant table)
  // Length = payload(9) + the 2 length bytes themselves.
  bytes.push(0xff, sofMarker, ...be16(11), 8, ...be16(height), ...be16(width), 1, 1, 0x11, 0);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
}

function webpVp8x(width: number, height: number, alpha: boolean): Uint8Array {
  const payload = [
    alpha ? 0x10 : 0x00, // flags — bit 0x10 = alpha
    0, 0, 0,
    ...le24(width - 1),
    ...le24(height - 1),
  ];
  return new Uint8Array([
    ...ascii("RIFF"), ...le16(0), ...le16(20 + payload.length), ...ascii("WEBP"),
    ...ascii("VP8X"), ...le16(payload.length), ...le16(0), ...payload,
  ]);
}

function webpVp8(width: number, height: number): Uint8Array {
  const payload = [
    0x00, 0x00, 0x00, // frame tag
    0x9d, 0x01, 0x2a, // sync code
    ...le16(width),
    ...le16(height),
  ];
  return new Uint8Array([
    ...ascii("RIFF"), ...le16(0), ...le16(20 + payload.length), ...ascii("WEBP"),
    ...ascii("VP8 "), ...le16(payload.length), ...le16(0), ...payload,
  ]);
}

function webpVp8l(width: number, height: number, alpha: boolean): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const b1 = w & 0xff;
  const b2 = ((w >> 8) & 0x3f) | ((h & 0x3) << 6);
  const b3 = (h >> 2) & 0xff;
  const b4 = ((h >> 10) & 0x0f) | ((alpha ? 1 : 0) << 4);
  const payload = [0x2f, b1, b2, b3, b4];
  return new Uint8Array([
    ...ascii("RIFF"), ...le16(0), ...le16(20 + payload.length), ...ascii("WEBP"),
    ...ascii("VP8L"), ...le16(payload.length), ...le16(0), ...payload,
  ]);
}

function svgBytes(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

// ---------------------------------------------------------------------------

describe("sniffFormat (magic bytes — never the client's word)", () => {
  it("detects PNG, JPG, WebP and SVG", () => {
    expect(sniffFormat(png({ width: 4, height: 4 }))).toBe("png");
    expect(sniffFormat(jpg({ width: 4, height: 4 }))).toBe("jpg");
    expect(sniffFormat(webpVp8x(4, 4, false))).toBe("webp");
    expect(sniffFormat(svgBytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe("svg");
  });

  it("recognises explicitly unsupported formats so the message can be specific", () => {
    expect(sniffFormat(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniffFormat(new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1]))).toBe("psd");
    expect(sniffFormat(new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0"))).toBe("ai");
    expect(sniffFormat(new Uint8Array([1, 2, 3, 4, 5]))).toBe("unknown");
  });

  it("finds SVG behind an XML declaration, comments and a DOCTYPE with subset", () => {
    const body =
      "<?xml version='1.0'?>\n<!-- exported -->\n" +
      "<!DOCTYPE svg [<!ENTITY foo 'bar'>]>\n" +
      "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    expect(sniffFormat(svgBytes(body))).toBe("svg");
  });
});

describe("validateArtwork — PNG", () => {
  it("parses dimensions, pHYs DPI and alpha transparency", () => {
    const result = validateArtwork(png({ width: 1200, height: 900, colorType: 6, phys: 3937 }));
    expect(result.ok).toBe(true);
    expect(result.format).toBe("png");
    expect(result.widthPx).toBe(1200);
    expect(result.heightPx).toBe(900);
    expect(result.dpi).toBe(100); // 3937 px/m ≈ 100 dpi
    expect(result.hasTransparency).toBe(true);
    expect(result.colorMode).toBe("RGB");
    expect(result.ratio).toBeCloseTo(4 / 3, 5);
    expect(result.warnings).toEqual([]);
  });

  it("defaults DPI to 72 when pHYs is absent", () => {
    const result = validateArtwork(png({ width: 1200, height: 1200 }));
    expect(result.ok).toBe(true);
    expect(result.dpi).toBe(72);
  });

  it("treats palette PNGs as transparent only with a tRNS chunk", () => {
    const opaque = validateArtwork(png({ width: 1200, height: 1200, colorType: 3 }));
    expect(opaque.hasTransparency).toBe(false);
    const transparent = validateArtwork(
      png({ width: 1200, height: 1200, colorType: 3, trns: [1, 2, 3] })
    );
    expect(transparent.hasTransparency).toBe(true);
    expect(transparent.colorMode).toBe("Indexed");
  });

  it("warns when the source resolution is low but accepts the file", () => {
    const result = validateArtwork(png({ width: 400, height: 400 }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("low_source_resolution");
  });

  it("rejects images below the minimum dimension", () => {
    const result = validateArtwork(png({ width: 100, height: 100 }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("too_small_dimensions");
    expect(result.message).toContain("100×100");
  });

  it("rejects images above the maximum dimension", () => {
    const result = validateArtwork(png({ width: 11000, height: 500 }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("too_large_dimensions");
  });

  it("rejects a truncated PNG as invalid", () => {
    const good = png({ width: 1200, height: 1200 });
    const result = validateArtwork(good.slice(0, 20));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_file");
  });
});

describe("validateArtwork — JPG", () => {
  it("parses SOF dimensions and JFIF DPI", () => {
    const result = validateArtwork(jpg({ width: 2000, height: 1500, dpi: 300, units: 1 }));
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(2000);
    expect(result.heightPx).toBe(1500);
    expect(result.dpi).toBe(300);
    expect(result.hasTransparency).toBe(false); // JPEG never has alpha
  });

  it("accepts progressive SOF2 frames", () => {
    const result = validateArtwork(jpg({ width: 1600, height: 1200, progressive: true }));
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(1600);
  });

  it("defaults DPI to 72 without JFIF density", () => {
    const result = validateArtwork(jpg({ width: 1600, height: 1200 }));
    expect(result.dpi).toBe(72);
  });

  it("rejects a header-only stub as invalid", () => {
    const result = validateArtwork(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_file");
  });
});

describe("validateArtwork — WebP", () => {
  it("parses VP8X canvas size and alpha flag", () => {
    const result = validateArtwork(webpVp8x(1440, 2560, true));
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(1440);
    expect(result.heightPx).toBe(2560);
    expect(result.hasTransparency).toBe(true);
  });

  it("parses lossy VP8 keyframes", () => {
    const result = validateArtwork(webpVp8(1000, 500));
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(1000);
    expect(result.heightPx).toBe(500);
    expect(result.hasTransparency).toBe(false);
  });

  it("parses lossless VP8L including its alpha bit", () => {
    const result = validateArtwork(webpVp8l(800, 600, true));
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(800);
    expect(result.heightPx).toBe(600);
    expect(result.hasTransparency).toBe(true);
  });
});

describe("validateArtwork — SVG", () => {
  it("takes intrinsic size from width/height and makes no DPI/transparency claims", () => {
    const result = validateArtwork(
      svgBytes("<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'></svg>")
    );
    expect(result.ok).toBe(true);
    expect(result.format).toBe("svg");
    expect(result.widthPx).toBe(600);
    expect(result.heightPx).toBe(400);
    expect(result.dpi).toBeNull();
    expect(result.hasTransparency).toBeNull();
    expect(result.colorMode).toBeNull();
    expect(result.ratio).toBeCloseTo(1.5, 5);
  });

  it("falls back to the viewBox", () => {
    const result = validateArtwork(
      svgBytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'></svg>")
    );
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBe(800);
    expect(result.heightPx).toBe(800);
  });

  it("converts physical units (mm) to pixels", () => {
    expect(parseSvgLength("10cm")).toBe(378); // 10 × 96 / 2.54 ≈ 377.95
    expect(parseSvgLength("72pt")).toBe(96);
    expect(parseSvgLength("50%")).toBeNull();
    expect(parseSvgLength("12em")).toBeNull();
  });

  it("accepts a dimension-less SVG (no px size claimed, no dimension limits applied)", () => {
    const result = validateArtwork(
      svgBytes("<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0 L10 10'/></svg>")
    );
    expect(result.ok).toBe(true);
    expect(result.widthPx).toBeNull();
    expect(result.heightPx).toBeNull();
    expect(result.ratio).toBeNull();
  });

  it("enforces the smaller SVG size cap", () => {
    const big = svgBytes(
      `<svg xmlns='http://www.w3.org/2000/svg'>${"a".repeat(3000)}</svg>`
    );
    const result = validateArtwork(big, { svgMaxBytes: 1000 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("svg_too_large");
  });
});

describe("validateArtwork — shared rules", () => {
  it("rejects an empty selection", () => {
    const result = validateArtwork(new Uint8Array(0));
    expect(result.code).toBe("missing_file");
  });

  it("rejects files over the byte limit before parsing anything", () => {
    const bytes = png({ width: 1200, height: 1200 });
    const result = validateArtwork(bytes, { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("too_large");
  });

  it("rejects PDF/PSD/AI with actionable messages", () => {
    const pdf = validateArtwork(new TextEncoder().encode("%PDF-1.7 binary"));
    expect(pdf.code).toBe("unsupported_type");
    expect(pdf.message).toContain("PNG, JPG, WebP or SVG");

    const psd = validateArtwork(new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0]));
    expect(psd.code).toBe("unsupported_type");
    expect(psd.message).toContain("PSD");

    const ai = validateArtwork(new TextEncoder().encode("%!PS-Adobe-3.0"));
    expect(ai.code).toBe("unsupported_type");
    expect(ai.message).toContain("SVG");
  });

  it("ignores the client-declared MIME on success but records a mismatch warning", () => {
    const bytes = png({ width: 1200, height: 1200 });
    const honest = validateArtwork(bytes, { mimeType: "image/png" });
    expect(honest.warnings).toEqual([]);

    const lying = validateArtwork(bytes, { mimeType: "image/jpeg" });
    expect(lying.ok).toBe(true); // magic bytes won — the file is accepted
    expect(lying.format).toBe("png");
    expect(lying.warnings).toContain("mime_mismatch");
  });

  it("exposes the shared limits so client and server cannot drift", () => {
    expect(ARTWORK_LIMITS.maxBytes).toBe(50 * 1024 * 1024);
    expect(ARTWORK_LIMITS.svgMaxBytes).toBe(2 * 1024 * 1024);
    expect(ARTWORK_LIMITS.minDimensionPx).toBe(200);
    expect(ARTWORK_LIMITS.maxDimensionPx).toBe(10000);
  });
});
