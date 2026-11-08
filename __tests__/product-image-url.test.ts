/**
 * Image URL resolution.
 *
 * The DB stores raw Supabase storage paths (e.g. "folder/pic.png"). Rendering
 * those directly gives a broken <img>, so both the product cards and the
 * cart/wishlist views must run them through this helper.
 */

import { productImageUrl, productImageUrlFromPath } from "@/lib/products";

jest.mock("@/lib/supabaseClient", () => ({
  supabase: { from: jest.fn(), storage: { from: jest.fn() } },
}));

const SUPABASE_URL = "https://demo.supabase.co";
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

describe("productImageUrlFromPath", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  });

  test("returns null for empty paths", () => {
    expect(productImageUrlFromPath(null)).toBeNull();
    expect(productImageUrlFromPath(undefined)).toBeNull();
    expect(productImageUrlFromPath("")).toBeNull();
    expect(productImageUrlFromPath("   ")).toBeNull();
  });

  test("passes through absolute, root-relative and data URLs unchanged", () => {
    expect(productImageUrlFromPath("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png"
    );
    expect(productImageUrlFromPath("http://cdn.example.com/a.png")).toBe(
      "http://cdn.example.com/a.png"
    );
    expect(productImageUrlFromPath("/local/a.png")).toBe("/local/a.png");
    expect(productImageUrlFromPath("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  test("builds a public storage URL for a bucket-relative path", () => {
    expect(productImageUrlFromPath("folder/pic.png")).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/product-images/folder/pic.png`
    );
  });

  test("does not duplicate the bucket prefix on legacy rows", () => {
    expect(productImageUrlFromPath("product-images/folder/pic.png")).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/product-images/folder/pic.png`
    );
  });

  test("returns null when the Supabase URL is not configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(productImageUrlFromPath("folder/pic.png")).toBeNull();
  });
});

describe("productImageUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  });

  test("prefers the primary image and resolves it to a public URL", () => {
    const url = productImageUrl({
      name: "Neon Tee",
      product_images: [
        {
          id: "img-2",
          storage_path: "folder/secondary.png",
          alt_text: null,
          is_primary: false,
          sort_order: 2,
        },
        {
          id: "img-1",
          storage_path: "folder/primary.png",
          alt_text: null,
          is_primary: true,
          sort_order: 1,
        },
      ],
    });

    expect(url).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/product-images/folder/primary.png`
    );
  });

  test("falls back to a bundled product image when there are no images", () => {
    expect(productImageUrl({ name: "Plain Tee" })).toBe("/product-tshirt.jpg");
  });
});
