import { createClient } from "@supabase/supabase-js";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT_MAP = {
  relevance: "relevance",
  newest: "popularity",
  price_asc: "price_asc",
  "price-asc": "price_asc",
  price_desc: "price_desc",
  "price-desc": "price_desc",
  rating: "rating",
  popularity: "popularity",
  "name-asc": "name_asc",
};

function intParam(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function uuidParam(value) {
  return value && UUID_RE.test(value) ? value : null;
}

function moneyParam(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "search";

    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`search:${ip}`, {
      maxRequests: 60,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json({ success: false, message: "Too many requests" }, { status: 429 });
    }

    const SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );

    if (mode === "suggestions") {
      const prefix = (searchParams.get("q") || "").trim().slice(0, 100);
      const limit = intParam(searchParams.get("limit"), 8, { min: 1, max: 20 });

      if (prefix.length < 2) {
        return Response.json({ success: true, suggestions: [] });
      }

      const { data, error } = await SupabaseClient.rpc("get_search_suggestions", {
        p_prefix: prefix,
        p_limit: limit,
      });

      if (error) throw error;

      return Response.json({
        success: true,
        suggestions: (data ?? []).map((row) => ({
          id: row.ref_id,
          name: row.suggestion,
          category: row.type,
        })),
      });
    }

    if (mode === "facets") {
      const query = (searchParams.get("q") || "").trim().slice(0, 200) || null;
      const categoryId = uuidParam(searchParams.get("category_id"));

      const { data, error } = await SupabaseClient.rpc("get_search_facets", {
        p_query: query,
        p_category_id: categoryId,
      });

      if (error) throw error;
      return Response.json({ success: true, facets: data || { categories: [], brands: [] } });
    }

    if (mode === "popular") {
      const limit = intParam(searchParams.get("limit"), 10, { min: 1, max: 50 });
      const days = intParam(searchParams.get("days"), 30, { min: 1, max: 365 });

      const { data, error } = await SupabaseClient.rpc("get_popular_searches", {
        p_limit: limit,
        p_days: days,
      });

      if (error) throw error;
      return Response.json({ success: true, popular: data || [] });
    }

    // Default: full product search
    const query = (searchParams.get("q") || "").trim().slice(0, 200) || null;
    const categoryId = uuidParam(searchParams.get("category_id"));
    const brandId = uuidParam(searchParams.get("brand_id"));
    const minPrice = moneyParam(searchParams.get("min_price"));
    const maxPrice = moneyParam(searchParams.get("max_price"));
    const minRating = moneyParam(searchParams.get("min_rating"));
    const inStockOnly = searchParams.get("in_stock_only") === "true";
    const sort = SORT_MAP[searchParams.get("sort") || "relevance"] || "relevance";
    const page = intParam(searchParams.get("page"), 1, { min: 1, max: 1000 });
    const pageSize = intParam(searchParams.get("page_size"), 24, { min: 1, max: 60 });

    const { data, error } = await SupabaseClient.rpc("search_products", {
      p_query: query,
      p_category_id: categoryId,
      p_brand_id: brandId,
      p_min_price: minPrice,
      p_max_price: maxPrice,
      p_min_rating: minRating,
      p_in_stock_only: inStockOnly,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) throw error;

    const rows = data ?? [];
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const productIds = rows.map((row) => row.product_id);

    // Enrich with the fields ProductCard needs (currency, category slug, images).
    let enriched = new Map();
    if (productIds.length > 0) {
      const { data: products, error: enrichError } = await SupabaseClient
        .from("products")
        .select(
          `id, slug, name, short_description, currency, compare_at_price, is_featured,
           categories(id, name, slug),
           product_images(id, storage_path, alt_text, is_primary, sort_order)`
        )
        .in("id", productIds);

      if (enrichError) {
        logger.warn("[Search] enrichment failed:", enrichError.message);
      } else {
        enriched = new Map((products ?? []).map((product) => [product.id, product]));
      }
    }

    const products = rows.map((row) => {
      const extra = enriched.get(row.product_id);
      return {
        id: row.product_id,
        slug: extra?.slug ?? row.slug,
        name: extra?.name ?? row.name,
        short_description: extra?.short_description ?? row.short_description,
        base_price: Number(row.min_price ?? 0),
        compare_at_price: extra?.compare_at_price ? Number(extra.compare_at_price) : null,
        currency: extra?.currency || "USD",
        avg_rating: Number(row.avg_rating ?? 0),
        rating_count: Number(row.rating_count ?? 0),
        is_featured: Boolean(row.is_featured),
        in_stock: Boolean(row.in_stock),
        categories: extra?.categories ?? (row.category_name ? { name: row.category_name, slug: null } : null),
        product_images:
          extra?.product_images ??
          (row.primary_image
            ? [{ id: row.product_id, storage_path: row.primary_image, alt_text: row.name, is_primary: true, sort_order: 0 }]
            : []),
      };
    });

    if (query) {
      // Analytics is best-effort and must never fail the search response.
      void SupabaseClient.rpc("log_search", {
        p_query: query,
        p_result_count: total,
        p_session_token: searchParams.get("session_token") || null,
      }).then(
        () => undefined,
        (logError) => logger.warn("[Search] log_search failed:", logError.message)
      );
    }

    return Response.json({
      success: true,
      products,
      facets: await (async () => {
        const { data: facetData } = await SupabaseClient.rpc("get_search_facets", {
          p_query: query,
          p_category_id: categoryId,
        });
        return facetData || { categories: [], brands: [] };
      })(),
      total,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
      query,
    });
  } catch (error) {
    logger.error("[Search GET Error]", error);
    return Response.json({ success: false, message: "Search failed" }, { status: 500 });
  }
}
