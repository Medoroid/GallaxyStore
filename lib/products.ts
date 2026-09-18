import { supabase } from "./supabaseClient";

export type ProductStatus = "draft" | "published" | "archived";
export type ProductVisibility = "visible" | "hidden";

export type ProductLookup = {
  id: string;
  name: string;
  slug?: string | null;
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
  categories(id, name, slug),
  brands(id, name, slug),
  stores(id, name),
  product_images(id, storage_path, alt_text, is_primary, sort_order)
`;

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

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function productToForm(product: SupabaseProduct): ProductFormValues {
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
    published_at: status === "published" ? new Date().toISOString() : null,
  };
}

export async function fetchProducts() {
  const request = withSupabaseTimeout(
    supabase
    .from("products")
    .select(productSelect)
    .is("deleted_at", null)
      .order("created_at", { ascending: false })
  );

  const { data, error } = await request.query;
  request.done();

  if (error) throw error;
  return (data ?? []) as unknown as SupabaseProduct[];
}

export async function fetchFeaturedProducts(limit = 8) {
  const request = withSupabaseTimeout(
    supabase
    .from("products")
    .select(productSelect)
    .eq("status", "published")
    .eq("visibility", "visible")
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
      .limit(limit)
  );

  const { data, error } = await request.query;
  request.done();

  if (error) throw error;
  return (data ?? []) as unknown as SupabaseProduct[];
}

export async function fetchProductById(id: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .abortSignal(controller.signal)
    .single();
  clearTimeout(timeoutId);

  if (error) throw error;
  return data as unknown as SupabaseProduct;
}

export async function fetchRelatedProducts(product: SupabaseProduct, limit = 4) {
  let query = supabase
    .from("products")
    .select(productSelect)
    .neq("id", product.id)
    .eq("status", "published")
    .eq("visibility", "visible")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (product.category_id) {
    query = query.eq("category_id", product.category_id);
  }

  const request = withSupabaseTimeout(query);
  const { data, error } = await request.query;
  request.done();

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

export async function createProduct(values: ProductFormValues) {
  const { error } = await supabase.from("products").insert(formToProductPayload(values));
  if (error) throw error;
}

export async function updateProduct(id: string, values: ProductFormValues) {
  const { error } = await supabase
    .from("products")
    .update(formToProductPayload(values))
    .eq("id", id);

  if (error) throw error;
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

export function productImageUrl(product: Partial<SupabaseProduct>) {
  const primaryImage = product.product_images
    ?.slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .find((image) => image.storage_path);
  const storagePath = primaryImage?.storage_path?.trim();

  if (!storagePath) {
    return productCardImage(product);
  }

  if (storagePath.startsWith("http://") || storagePath.startsWith("https://") || storagePath.startsWith("/")) {
    return storagePath;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return productCardImage(product);
  }

  return `${supabaseUrl}/storage/v1/object/public/${storagePath}`;
}

export function toProductCardProduct(product: SupabaseProduct) {
  const image = productImageUrl(product);

  return {
    id: product.id,
    title: product.name,
    name: product.name,
    thumbnail: image,
    image,
    category: product.categories?.name ?? "Uncategorized",
    price: Number(product.base_price ?? 0),
    discountPercentage: product.compare_at_price
      ? Math.round(((Number(product.compare_at_price) - Number(product.base_price ?? 0)) / Number(product.compare_at_price)) * 100)
      : 0,
    rating: Number(product.avg_rating ?? 0),
    badge: product.is_featured ? "Featured" : undefined,
  };
}
