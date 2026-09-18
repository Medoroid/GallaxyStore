import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../_lib/verifyAdmin";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const token = request.headers.get("authorization").replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);

    const [
      ordersOverview,
      dailySales,
      customersOverview,
      inventoryStatus,
      productPerformance,
      recentOrdersResult,
    ] = await Promise.all([
      SupabaseClient.from("admin_orders_overview").select("*").limit(1),
      SupabaseClient.from("admin_daily_sales").select("*").order("date", { ascending: false }).limit(30),
      SupabaseClient.from("admin_customers_overview").select("*").limit(1),
      SupabaseClient.from("admin_inventory_status").select("*"),
      SupabaseClient.from("admin_product_performance").select("*").order("total_revenue", { ascending: false }).limit(5),
      SupabaseClient.from("admin_orders_overview")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const overview = ordersOverview.data?.[0] || {};
    const customers = customersOverview.data?.[0] || {};

    return Response.json({
      success: true,
      stats: {
        total_orders: overview.total_orders || 0,
        total_products: overview.total_products || 0,
        total_revenue: overview.total_revenue || 0,
        pending_orders: overview.pending_orders || 0,
        total_users: customers.total_customers || 0,
        total_gallery: 0,
        daily_sales: dailySales.data || [],
        top_products: productPerformance.data || [],
        inventory_alerts: inventoryStatus.data || [],
      },
      recent_orders: recentOrdersResult.data || [],
    });
  } catch {
    return Response.json(
      { success: false, message: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
