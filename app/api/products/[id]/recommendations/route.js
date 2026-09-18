import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Get recommended products for a given product
export async function GET(request, { params }) {
  try {
    const { id: product_id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8", 10);

    const { data, error } = await SupabaseClient.rpc("get_recommended_products", {
      p_product_id: product_id,
      p_limit: limit,
    });

    if (error) {
      logger.error("[Recommendations] RPC error:", error);
      throw error;
    }
    return Response.json({ success: true, products: data || [] });
  } catch (error) {
    logger.error("[Recommendations Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
