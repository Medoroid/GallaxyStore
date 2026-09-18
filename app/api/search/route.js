import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Search products with full-text search, filters, facets, and suggestions
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "search";

    if (mode === "suggestions") {
      const prefix = searchParams.get("q") || "";
      const limit = parseInt(searchParams.get("limit") || "8", 10);

      const { data, error } = await SupabaseClient.rpc("get_search_suggestions", {
        p_prefix: prefix,
        p_limit: limit,
      });

      if (error) throw error;
      return Response.json({ success: true, suggestions: data || [] });
    }

    if (mode === "facets") {
      const query = searchParams.get("q") || null;
      const category_id = searchParams.get("category_id") || null;

      const { data, error } = await SupabaseClient.rpc("get_search_facets", {
        p_query: query,
        p_category_id: category_id,
      });

      if (error) throw error;
      return Response.json({ success: true, facets: data || [] });
    }

    if (mode === "popular") {
      const limit = parseInt(searchParams.get("limit") || "10", 10);
      const days = parseInt(searchParams.get("days") || "30", 10);

      const { data, error } = await SupabaseClient.rpc("get_popular_searches", {
        p_limit: limit,
        p_days: days,
      });

      if (error) throw error;
      return Response.json({ success: true, popular: data || [] });
    }

    // Default: full product search
    const query = searchParams.get("q") || null;
    const category_id = searchParams.get("category_id") || null;
    const brand_id = searchParams.get("brand_id") || null;
    const min_price = searchParams.get("min_price")
      ? parseFloat(searchParams.get("min_price"))
      : null;
    const max_price = searchParams.get("max_price")
      ? parseFloat(searchParams.get("max_price"))
      : null;
    const min_rating = searchParams.get("min_rating")
      ? parseFloat(searchParams.get("min_rating"))
      : null;
    const in_stock_only = searchParams.get("in_stock_only") === "true";
    const sort = searchParams.get("sort") || "relevance";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const page_size = parseInt(searchParams.get("page_size") || "24", 10);

    // Log search for analytics (fire and forget)
    const authHeader = request.headers.get("authorization");
    let session_token = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await SupabaseClient.auth.getUser(token);
      if (user) {
        // Logged-in user: log with user_id (handled by RPC internally)
      }
    } else {
      session_token = searchParams.get("session_token") || null;
    }

    const { data, error } = await SupabaseClient.rpc("search_products", {
      p_query: query,
      p_category_id: category_id,
      p_brand_id: brand_id,
      p_min_price: min_price,
      p_max_price: max_price,
      p_min_rating: min_rating,
      p_in_stock_only: in_stock_only,
      p_sort: sort,
      p_page: page,
      p_page_size: page_size,
    });

    if (error) throw error;

    // Log search asynchronously (don't block response)
    if (query) {
      SupabaseClient.rpc("log_search", {
        p_query: query,
        p_result_count: data?.length || 0,
        p_session_token: session_token,
      }).then(() => {}).catch(() => {});
    }

    return Response.json({
      success: true,
      products: data || [],
      page,
      page_size,
    });
  } catch (error) {
    logger.error("[Search GET Error]", error);
    return Response.json(
      { success: false, message: "Search failed" },
      { status: 500 }
    );
  }
}
