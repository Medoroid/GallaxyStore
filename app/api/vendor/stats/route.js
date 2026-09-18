import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET - Fetch vendor dashboard stats using vendor_* views
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    // Get vendor's store
    const { data: store } = await SupabaseClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!store) {
      return Response.json(
        { success: false, message: "No store found" },
        { status: 404 }
      );
    }

    const [
      dashboardOverview,
      monthlyStats,
      topProducts,
      salesByCategory,
      revenueOverTime,
      pendingShipments,
      printingQueue,
      conversionMetrics,
      refundRate,
    ] = await Promise.all([
      SupabaseClient.from("vendor_dashboard_overview").select("*").eq("store_id", store.id).single(),
      SupabaseClient.from("vendor_monthly_stats").select("*").eq("store_id", store.id).order("month", { ascending: false }).limit(12),
      SupabaseClient.from("vendor_top_products").select("*").eq("store_id", store.id).order("total_sold", { ascending: false }).limit(10),
      SupabaseClient.from("vendor_sales_by_category").select("*").eq("store_id", store.id).order("total_revenue", { ascending: false }),
      SupabaseClient.from("vendor_revenue_over_time").select("*").eq("store_id", store.id).order("date", { ascending: false }).limit(30),
      SupabaseClient.from("vendor_pending_shipments").select("*").eq("store_id", store.id),
      SupabaseClient.from("vendor_printing_queue").select("*").eq("store_id", store.id),
      SupabaseClient.from("vendor_conversion_metrics").select("*").eq("store_id", store.id).single(),
      SupabaseClient.from("vendor_refund_rate").select("*").eq("store_id", store.id).single(),
    ]);

    return Response.json({
      success: true,
      dashboard: dashboardOverview.data || {},
      monthly_stats: monthlyStats.data || [],
      top_products: topProducts.data || [],
      sales_by_category: salesByCategory.data || [],
      revenue_over_time: revenueOverTime.data || [],
      pending_shipments: pendingShipments.data || [],
      printing_queue: printingQueue.data || [],
      conversion_metrics: conversionMetrics.data || {},
      refund_rate: refundRate.data || {},
    });
  } catch (error) {
    logger.error("[Vendor Stats Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch vendor stats" },
      { status: 500 }
    );
  }
}
