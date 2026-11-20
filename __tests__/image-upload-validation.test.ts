/**
 * Security regression tests — upload validation uses the bytes, not the
 * browser-supplied filename/MIME. A renamed executable or active SVG must be
 * rejected before any Storage write.
 */

import { validateUploadedImageBytes } from "@/lib/image-upload-validation";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

const IMAGE_MAP = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const PRINT_MAP = { ...IMAGE_MAP, "application/pdf": "pdf" };

describe("validateUploadedImageBytes", () => {
  it("accepts a real PNG and uses its detected MIME/extension", () => {
    const result = validateUploadedImageBytes(PNG, { allowed: IMAGE_MAP, maxBytes: 5 * 1024 * 1024 });
    expect(result).toEqual({ ok: true, mime: "image/png", extension: "png" });
  });

  it("derives the type only from bytes (no caller-supplied MIME is accepted)", () => {
    const result = validateUploadedImageBytes(PNG, { allowed: IMAGE_MAP, maxBytes: 5 * 1024 * 1024 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.mime).toBe("image/png");
  });

  it("rejects an executable renamed to .png", () => {
    const result = validateUploadedImageBytes(EXE, { allowed: IMAGE_MAP, maxBytes: 5 * 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects an active SVG masquerading as an image", () => {
    const result = validateUploadedImageBytes(SVG, { allowed: IMAGE_MAP, maxBytes: 5 * 1024 * 1024 });
    expect(result.ok).toBe(false);
  });

  it("allows PDF only for routes whose allow-list includes it", () => {
    expect(
      validateUploadedImageBytes(PDF, { allowed: IMAGE_MAP, maxBytes: 10 * 1024 * 1024 }).ok
    ).toBe(false);
    expect(
      validateUploadedImageBytes(PDF, { allowed: PRINT_MAP, maxBytes: 10 * 1024 * 1024 })
    ).toEqual({ ok: true, mime: "application/pdf", extension: "pdf" });
  });

  it("enforces the size cap from the bytes, not file.size", () => {
    const result = validateUploadedImageBytes(PNG, { allowed: IMAGE_MAP, maxBytes: 10 });
    expect(result.ok).toBe(false);
  });
});
