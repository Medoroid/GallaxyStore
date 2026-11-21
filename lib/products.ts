import { supabase } from "./supabaseClient";
import { isMissingSizesColumn } from "./product-admin";

export type ProductStatus = "draft" | "published" | "archived";
export type ProductVisibility = "visible" | "hidden";

export type ProductLookup = {
  id: string;
  name: string;
  slug?: string | null;
};

/** Variant data embedded in product reads for client-side selection. */
export type ProductVariantEmbed = {
  id: string;
  price: number;
  is_default: boolean;
  is_active: boolean;
  deleted_at: string | null;
  product_variant_options: Array<{
    attribute_value_id: string;
    product_attribute_values: { value: string } | null;
  }>;
};

export type SupabaseProduct = {
  id: string;
  store_id: string | null;
  brand_id: string | null;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  status: ProductStatus;
  visibility: ProductVisibility;
  is_featured: boolean;
  base_price: number;
  compare_at_price: number | null;
  currency: string;
  avg_rating: number;
  rating_count: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  color: string | null;
  available_colors: string[];
  available_sizes: string[];
  categories: ProductLookup | null;
  brands: ProductLookup | null;
  stores: ProductLookup | null;
  product_images: Array<{
    id: string;
    storage_path: string | null;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }>;
  product_variants?: ProductVariantEmbed[];
};

export type ProductFormValues = {
  name: string;
  slug: string;
  category_id: string;
  brand_id: string;
  store_id: string;
  short_description: string;
  description: string;
  status: ProductStatus;
  visibility: ProductVisibility;
  is_featured: boolean;
  base_price: string;
  compare_at_price: string;
  currency: string;
  color: string;
  available_colors: string;
  available_sizes: string;
  stock_quantity: string;
};

export const emptyProductForm: ProductFormValues = {
  name: "",
  slug: "",
  category_id: "",
  brand_id: "",
  store_id: "",
  short_description: "",
  description: "",
  status: "draft",
  visibility: "visible",
  is_featured: false,
  base_price: "",
  compare_at_price: "",
  currency: "USD",
  color: "",
  available_colors: "",
  available_sizes: "",
  stock_quantity: "100",
};

export const productSelect = `
  id,
  store_id,
  brand_id,
  category_id,
  name,
  slug,
  short_description,
  description,
  status,
  visibility,
  is_featured,
  base_price,
  compare_at_price,
  currency,
  avg_rating,
  rating_count,
  view_count,
  published_at,
  created_at,
  updated_at,
  deleted_at,
  color,
  available_colors,
  available_sizes,
  categories(id, name, slug),
  brands(id, name, slug),
  stores(id, name),
  product_images(id, storage_path, alt_text, is_primary, sort_order),
  product_variants(id, price, is_default, is_active, deleted_at, product_variant_options(attribute_value_id, product_attribute_values(value)))
`;

/**
 * `productSelect` minus the `available_sizes` column.
 *
 * `products.available_sizes` ships in supabase/migrations/20261115120000. A
 * deployment running this code before that SQL is applied gets HTTP 400
 * (`42703 — column products.available_sizes does not exist`) for every product
 * read, which emptied the storefront. Reads below always try the full select
 * first (so sizes appear the moment the migration lands) and fall back to this
 * reduced one — the read-side twin of `omitAvailableSizes()` in
 * lib/product-admin.ts.
 */
export const productSelectWithoutSizes = productSelect.replace(
  /\s*available_sizes,/,
  ""
);

function withSupabaseTimeout<TQuery extends { abortSignal: (signal: AbortSignal) => TQuery }>(
  query: TQuery,
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    query: query.abortSignal(controller.signal),
    done: () => clearTimeout(timeoutId),
  };
}

export type ProductsReadResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Runs one products read with the full `productSelect`, then retries exactly
 * once with `productSelectWithoutSizes` — but only when the failure is the
 * known missing-`available_sizes` error (42703 / PGRST204 naming that column,
 * see `isMissingSizesColumn`). Every other error is returned untouched so real
 * failures are never swallowed by the retry.
 *
 * `build` must create a fresh query per call (the retry runs it again) and may
 * return an optional `done()` that is always invoked once the attempt settles,
 * which is how callers clear their timeout timer.
 */
export async function selectProductsWithFallback(
  build: (select: string) => { query: PromiseLike<unknown>; done?: () => void }
): Promise<ProductsReadResult> {
  const exec = async (select: string): Promise<ProductsReadResult> => {
    const { query, done } = build(select);
    try {
      return (await query) as ProductsReadResult;
    } finally {
      done?.();
    }
  };

  const first = await exec(productSelect);
  if (isMissingSizesColumn(first.error)) {
    return exec(productSelectWithoutSizes);
  }
  return first;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ProductVariantInfo = {
  id: string;
  price: number;
  stock_quantity: number;
};

export function productToForm(
  product: SupabaseProduct,
  variant?: ProductVariantInfo | null
): ProductFormValues {
  return {
    name: product.name ?? "",
    slug: product.slug ?? "",
    category_id: product.category_id ?? "",
    brand_id: product.brand_id ?? "",
    store_id: product.store_id ?? "",
    short_description: product.short_description ?? "",
    description: product.description ?? "",
    status: product.status ?? "draft",
    visibility: product.visibility ?? "visible",
    is_featured: Boolean(product.is_featured),
    base_price: product.base_price?.toString() ?? "",
    compare_at_price: product.compare_at_price?.toString() ?? "",
    currency: product.currency ?? "USD",
    color: product.color ?? "",
    available_colors: product.available_colors?.join(", ") ?? "",
    available_sizes: product.available_sizes?.join(", ") ?? "",
    // المنتجات اللى ملهاش variant بتيجي من الفورم بمخزون افتراضى
    stock_quantity: variant ? String(variant.stock_quantity) : "100",
  };
}

export function formToProductPayload(values: ProductFormValues) {
  const name = values.name.trim();
  const status = values.status;

  return {
    name,
    slug: values.slug.trim() || slugify(name),
    category_id: values.category_id || null,
    brand_id: values.brand_id || null,
    store_id: values.store_id || null,
    short_description: values.short_description.trim() || null,
    description: values.description.trim() || null,
    status,
    visibility: values.visibility,
    is_featured: values.is_featured,
    base_price: Number(values.base_price || 0),
    compare_at_price: values.compare_at_price ? Number(values.compare_at_price) : null,
    currency: (values.currency.trim() || "USD").toUpperCase(),
    color: values.color.trim() || null,
    available_colors: values.available_colors
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean),
    available_sizes: values.available_sizes
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean),
    published_at: status === "published" ? new Date().toISOString() : null,
  };
}

export async function fetchProducts() {
  const { data, error } = await selectProductsWithFallback((select) =>
    withSupabaseTimeout(
      supabase
        .from("products")
        .select(select)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    )
  );

  if (error) throw error;
  return (data ?? []) as unknown as SupabaseProduct[];
}

export async function fetchFeaturedProducts(limit = 8) {
  const { data, error } = await selectProductsWithFallback((select) =>
    withSupabaseTimeout(
      supabase
        .from("products")
        .select(select)
        .eq("status", "published")
        .eq("visibility", "visible")
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit)
    )
  );

  if (error) throw error;
  return (data ?? []) as unknown as SupabaseProduct[];
}

export type CategoryWithCount = {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  count: number;
};

/**
 * B4 — active categories with the real number of published products.
 * Categories without published products are dropped so the storefront never
 * advertises empty sections with invented counts.
 */
export async function fetchCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [categoriesRes, productsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, image_url")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("products")
      .select("category_id")
      .eq("status", "published")
      .eq("visibility", "visible")
      .is("deleted_at", null),
  ]);

  const firstError = categoriesRes.error ?? productsRes.error;
  if (firstError) throw firstError;

  const counts = new Map<string, number>();
  for (const row of (productsRes.data ?? []) as Array<{ category_id: string | null }>) {
    if (row.category_id) {
      counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    }
  }

  return ((categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
  }>)
    .map((category) => ({
      ...category,
      count: counts.get(category.id) ?? 0,
    }))
    .filter((category) => category.count > 0);
}

export async function fetchProductById(id: string) {
  const { data, error } = await selectProductsWithFallback((select) => {
    const request = withSupabaseTimeout(
      supabase.from("products").select(select).eq("id", id).is("deleted_at", null)
    );
    return { query: request.query.single(), done: request.done };
  });

  if (error) throw error;
  return data as unknown as SupabaseProduct;
}

export async function fetchRelatedProducts(product: SupabaseProduct, limit = 4) {
  const { data, error } = await selectProductsWithFallback((select) => {
    let query = supabase
      .from("products")
      .select(select)
      .neq("id", product.id)
      .eq("status", "published")
      .eq("visibility", "visible")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (product.category_id) {
      query = query.eq("category_id", product.category_id);
    }

    return withSupabaseTimeout(query);
  });

  if (error) throw error;
  return (data ?? []) as unknown as SupabaseProduct[];
}

export async function fetchProductLookups() {
  const [categories, brands, stores] = await Promise.all([
    supabase.from("categories").select("id, name, slug").is("deleted_at", null).order("sort_order"),
    supabase.from("brands").select("id, name, slug").is("deleted_at", null).order("name"),
    supabase.from("stores").select("id, name").is("deleted_at", null).order("name"),
  ]);

  const firstError = categories.error ?? brands.error ?? stores.error;
  if (firstError) throw firstError;

  return {
    categories: (categories.data ?? []) as ProductLookup[],
    brands: (brands.data ?? []) as ProductLookup[],
    stores: (stores.data ?? []) as ProductLookup[],
  };
}

export async function fetchDefaultVariant(
  productId: string
): Promise<ProductVariantInfo | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, price, stock_quantity")
    .eq("product_id", productId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ProductVariantInfo | null) ?? null;
}

export type ProductAttribution = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

/**
 * Creator attribution for a store product (Phase 7 acceptance: "Designed by").
 *
 * Reads the PUBLIC RLS slice of `creator_design_products` — only rows linked
 * to a published + visible product are exposed to anon, and only the public
 * persona fields are selected (never private account data). Returns null for
 * ordinary vendor/admin products, in which case nothing renders.
 */
export async function fetchProductAttribution(
  productId: string
): Promise<ProductAttribution | null> {
  const { data, error } = await supabase
    .from("creator_design_products")
    .select("creator_profiles(username, display_name, avatar_url)")
    .eq("product_id", productId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const profile = (
    data as {
      creator_profiles: {
        username: string;
        display_name: string;
        avatar_url: string | null;
      } | null;
    } | null
  )?.creator_profiles;

  if (!profile || typeof profile.username !== "string" || !profile.username) return null;

  return {
    username: profile.username,
    display_name:
      typeof profile.display_name === "string" && profile.display_name
        ? profile.display_name
        : profile.username,
    avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
  };
}

function defaultVariantSku(values: ProductFormValues, productId: string) {
  const base = slugify(values.slug || values.name) || "product";
  return `${base}-${productId.replace(/-/g, "")}`.toUpperCase();
}

/**
 * أى منتج لازم يبقى ليه variant واحد على الأقل، وإلا ما ينفع يتحط في السلة
 * (cart route بيرمى "No active variant found for product ...").
 * بيتعمل variant افتراضى بالسعر والمخزون من الفورم، أو بيتحدّث لو موجود.
 */
async function syncDefaultVariant(productId: string, values: ProductFormValues) {
  const price = Number(values.base_price || 0);
  const stock_quantity = Math.max(0, Math.trunc(Number(values.stock_quantity || 0)));
  const existing = await fetchDefaultVariant(productId);

  if (existing) {
    const { error } = await supabase
      .from("product_variants")
      .update({ price, stock_quantity })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("product_variants").insert({
    product_id: productId,
    sku: defaultVariantSku(values, productId),
    price,
    stock_quantity,
    is_default: true,
    is_active: true,
  });
  if (error) throw error;
}

export async function createProduct(values: ProductFormValues) {
  const { data, error } = await supabase
    .from("products")
    .insert(formToProductPayload(values))
    .select("id")
    .single();
  if (error) throw error;

  await syncDefaultVariant(data.id as string, values);
}

export async function updateProduct(id: string, values: ProductFormValues) {
  const { error } = await supabase
    .from("products")
    .update(formToProductPayload(values))
    .eq("id", id);

  if (error) throw error;

  await syncDefaultVariant(id, values);
}

export async function archiveProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", id);

  if (error) throw error;
}

export function productCardImage(product: Partial<SupabaseProduct>) {
  const category = product.categories?.slug ?? product.categories?.name?.toLowerCase() ?? "";
  const name = product.name?.toLowerCase() ?? "";
  const haystack = `${category} ${name}`;

  if (haystack.includes("mug")) return "/product-mug.jpg";
  if (haystack.includes("phone")) return "/product-phonecase.jpg";
  if (haystack.includes("poster")) return "/product-poster.jpg";
  if (haystack.includes("sticker")) return "/product-stickers.jpg";
  if (haystack.includes("gift")) return "/product-giftbox.jpg";
  if (haystack.includes("frame")) return "/product-frame.jpg";

  return "/product-tshirt.jpg";
}

export const PRODUCT_IMAGES_BUCKET = "product-images";

export function productImageUrlFromPath(storagePath: string | null | undefined) {
  const path = storagePath?.trim();
  if (!path) return null;

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/") ||
    path.startsWith("data:")
  ) {
    return path;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  // Some legacy rows already store "product-images/..." while newer rows store
  // a path relative to the bucket. Normalise instead of duplicating the bucket.
  const objectPath = path.startsWith(`${PRODUCT_IMAGES_BUCKET}/`)
    ? path.slice(PRODUCT_IMAGES_BUCKET.length + 1)
    : path;

  return `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${objectPath}`;
}

export function productImageUrl(product: Partial<SupabaseProduct>) {
  const primaryImage = product.product_images
    ?.slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .find((image) => image.storage_path);

  return productImageUrlFromPath(primaryImage?.storage_path) ?? productCardImage(product);
}

export function validCompareAtPrice(product: Partial<SupabaseProduct>) {
  const price = Number(product.base_price ?? 0);
  const compareAt = Number(product.compare_at_price ?? 0);
  return compareAt > price ? compareAt : null;
}

export function toProductCardProduct(product: SupabaseProduct) {
  const image = productImageUrl(product);
  const price = Number(product.base_price ?? 0);
  const originalPrice = validCompareAtPrice(product);
  const discountPercentage = originalPrice
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  return {
    id: product.id,
    title: product.name,
    name: product.name,
    thumbnail: image,
    image,
    category: product.categories?.name ?? "Uncategorized",
    price,
    // Only a genuine discount (compare_at_price > price) is exposed.
    originalPrice,
    discountPercentage,
    currency: (product.currency || "USD").toUpperCase(),
    rating: Number(product.avg_rating ?? 0),
    badge: product.is_featured ? "Featured" : undefined,
  };
}
