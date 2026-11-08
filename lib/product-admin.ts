import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side product helpers shared by the admin and vendor product APIs.
 *
 * Keeping validation in one place means the vendor endpoint cannot drift from
 * the admin endpoint (and vice versa). Nothing here reads a caller-supplied
 * `store_id`: callers pass the trusted store id explicitly for vendor writes.
 */

export const PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);
export const PRODUCT_VISIBILITIES = new Set(["visible", "hidden"]);
export const MAX_PRODUCT_IMAGES = 12;
export const MAX_IMAGE_PATH_LENGTH = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugify(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uuidOrNull(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(candidate) ? candidate : null;
}

export type ProductPayload = {
  name: string;
  slug: string;
  category_id: string | null;
  brand_id: string | null;
  store_id: string | null;
  short_description: string | null;
  description: string | null;
  status: string;
  visibility: string;
  is_featured: boolean;
  base_price: number;
  compare_at_price: number | null;
  currency: string;
  color: string | null;
  available_colors: string[];
  published_at: string | null;
  updated_at: string;
};

type ParseOptions = {
  /**
   * Trusted store id. When present it always wins over anything in the body,
   * so a vendor can never create a product for another store.
   */
  storeId?: string | null;
};

export function parseProductPayload(body: Record<string, unknown> | null | undefined, options: ParseOptions = {}): ProductPayload {
  const name = String(body?.name || "").trim();
  if (!name) throw new Error("Product name is required");

  const basePrice = Number(body?.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("A valid base price is required");
  }

  const compareAtRaw = body?.compare_at_price;
  const compareAt =
    compareAtRaw === null || compareAtRaw === undefined || compareAtRaw === ""
      ? null
      : Number(compareAtRaw);

  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) {
    throw new Error("Compare-at price must be a positive number");
  }

  const status = String(body?.status || "draft");
  if (!PRODUCT_STATUSES.has(status)) throw new Error("Invalid product status");

  const visibility = String(body?.visibility || "visible");
  if (!PRODUCT_VISIBILITIES.has(visibility)) throw new Error("Invalid product visibility");

  const currency = String(body?.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code");

  const colors = Array.isArray(body?.available_colors)
    ? body.available_colors
    : String(body?.available_colors || "").split(",");
  const availableColors = colors.map((color) => String(color).trim()).filter(Boolean);

  const slug = slugify(body?.slug || name);
  if (!slug) throw new Error("Could not derive a slug from the product name");

  const storeId =
    options.storeId !== undefined
      ? options.storeId
      : uuidOrNull(body?.store_id);

  return {
    name,
    slug,
    category_id: uuidOrNull(body?.category_id),
    brand_id: uuidOrNull(body?.brand_id),
    store_id: storeId,
    short_description: String(body?.short_description || "").trim() || null,
    description: String(body?.description || "").trim() || null,
    status,
    visibility,
    is_featured: Boolean(body?.is_featured),
    base_price: basePrice,
    compare_at_price: compareAt !== null && compareAt > basePrice ? compareAt : null,
    currency,
    color: String(body?.color || "").trim() || null,
    available_colors: availableColors,
    published_at: status === "published" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

export function normaliseStock(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

/**
 * Validate an optional image list. Returns `null` when the caller did not send
 * an `images` field at all, so an update can leave existing images untouched.
 */
export function parseProductImages(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw new Error("images must be an array");

  if (value.length > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error("Each image must be a URL or storage path");
    const path = entry.trim();
    if (!path) throw new Error("Image entries cannot be empty");
    if (path.length > MAX_IMAGE_PATH_LENGTH) throw new Error("Image path is too long");
    return path;
  });
}

export async function replaceProductImages(
  db: SupabaseClient,
  productId: string,
  images: string[]
) {
  const { error: deleteError } = await db
    .from("product_images")
    .delete()
    .eq("product_id", productId);
  if (deleteError) throw deleteError;

  if (images.length === 0) return;

  const rows = images.map((storagePath, index) => ({
    product_id: productId,
    storage_path: storagePath,
    alt_text: null,
    is_primary: index === 0,
    sort_order: index,
  }));

  const { error: insertError } = await db.from("product_images").insert(rows);
  if (insertError) throw insertError;
}

export async function syncDefaultVariant(
  db: SupabaseClient,
  productId: string,
  payload: ProductPayload,
  stockQuantity?: unknown
) {
  const { data: existing, error } = await db
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    const updates: Record<string, unknown> = {
      price: payload.base_price,
      compare_at_price: payload.compare_at_price,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Only touch stock when the caller actually sent a value. A name-only
    // update must not silently zero the default variant's stock.
    if (stockQuantity !== undefined && stockQuantity !== null && stockQuantity !== "") {
      updates.stock_quantity = normaliseStock(stockQuantity);
    }

    const { error: updateError } = await db
      .from("product_variants")
      .update(updates)
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }

  const sku = `${payload.slug}-${productId.replace(/-/g, "")}`.toUpperCase().slice(0, 120);
  const { error: insertError } = await db.from("product_variants").insert({
    product_id: productId,
    sku,
    price: payload.base_price,
    compare_at_price: payload.compare_at_price,
    stock_quantity: normaliseStock(stockQuantity),
    is_default: true,
    is_active: true,
  });
  if (insertError) throw insertError;
}
