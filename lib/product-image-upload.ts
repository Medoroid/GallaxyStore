/**
 * Shared validation for product-image uploads.
 *
 * Storage policies key ownership off the first folder segment, so every path
 * must start with the product UUID. The helper also rejects traversal and
 * backslash paths before they reach Storage.
 */

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type ProductImageFileLike = {
  type?: string;
  size?: number;
};

export function validateProductImageFile(
  file: ProductImageFileLike
):
  | { ok: true; extension: string; contentType: string }
  | { ok: false; message: string } {
  const type = String(file.type || "").toLowerCase();
  const extension = PRODUCT_IMAGE_MIME_EXTENSIONS[type];

  if (!extension) {
    return {
      ok: false,
      message: `Unsupported image type: ${type || "unknown"}`,
    };
  }

  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: "The image file is empty" };
  }
  if (size > MAX_PRODUCT_IMAGE_BYTES) {
    return { ok: false, message: "Each image must be 5MB or smaller" };
  }

  // `image/jpg` is a common browser alias, but the storage bucket only allows
  // the registered `image/jpeg` MIME type.
  return {
    ok: true,
    extension,
    contentType: type === "image/jpg" ? "image/jpeg" : type,
  };
}

export function productImageStoragePath(
  productId: string,
  extension: string,
  uniqueId: string = crypto.randomUUID()
): string {
  const safeExtension = String(extension).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExtension) throw new Error("Invalid image extension");
  const safeId = String(uniqueId).replace(/[^a-zA-Z0-9-]/g, "");
  if (!safeId) throw new Error("Invalid image identifier");
  return `${productId}/${safeId}.${safeExtension}`;
}

export function isProductImagePathForProduct(path: unknown, productId: string): boolean {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("\\") || path.includes("..")) return false;
  return path.startsWith(`${productId}/`);
}
