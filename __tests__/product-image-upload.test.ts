import {
  isProductImagePathForProduct,
  MAX_PRODUCT_IMAGE_BYTES,
  productImageStoragePath,
  validateProductImageFile,
} from "@/lib/product-image-upload";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

describe("product image validation", () => {
  test.each([
    ["image/jpeg", "jpg", "image/jpeg"],
    ["image/jpg", "jpg", "image/jpeg"],
    ["image/png", "png", "image/png"],
    ["image/webp", "webp", "image/webp"],
    ["image/gif", "gif", "image/gif"],
    ["image/avif", "avif", "image/avif"],
  ])("accepts %s", (type, extension, contentType) => {
    expect(validateProductImageFile({ type, size: 1024 })).toEqual({
      ok: true,
      extension,
      contentType,
    });
  });

  test("rejects unsupported, empty and oversized files", () => {
    expect(validateProductImageFile({ type: "image/svg+xml", size: 10 })).toMatchObject({
      ok: false,
    });
    expect(validateProductImageFile({ type: "image/png", size: 0 })).toMatchObject({
      ok: false,
    });
    expect(
      validateProductImageFile({ type: "image/png", size: MAX_PRODUCT_IMAGE_BYTES + 1 })
    ).toMatchObject({ ok: false });
  });
});

describe("product image storage paths", () => {
  test("paths are always rooted at the product id", () => {
    const path = productImageStoragePath(PRODUCT_ID, "PNG", "unique");
    expect(path).toBe(`${PRODUCT_ID}/unique.png`);
    expect(isProductImagePathForProduct(path, PRODUCT_ID)).toBe(true);
  });

  test("rejects traversal, backslashes and another product's folder", () => {
    expect(isProductImagePathForProduct(`${PRODUCT_ID}/../secret.png`, PRODUCT_ID)).toBe(
      false
    );
    expect(isProductImagePathForProduct(`${PRODUCT_ID}\\image.png`, PRODUCT_ID)).toBe(false);
    expect(
      isProductImagePathForProduct("22222222-2222-4222-8222-222222222222/image.png", PRODUCT_ID)
    ).toBe(false);
    expect(isProductImagePathForProduct("", PRODUCT_ID)).toBe(false);
  });

  test("rejects an empty extension", () => {
    expect(() => productImageStoragePath(PRODUCT_ID, "///", "unique")).toThrow(
      /invalid image extension/i
    );
  });
});
