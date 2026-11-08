import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

function countOrZero(result) {
  if (result.error) {
    logger.warn("[Admin Stats] count failed:", result.error.message);
    return 0;
  }
  return result.count ?? 0;
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // Admin views are service-role only; the service role client is used only
    // after verifyAdmin has proven the caller is an administrator.
    const db = getServiceRoleClient();

    const [
      ordersResult,
      paymentsResult,
      productsCount,
      usersCount,
      galleryCount,
      dailySales,
      productPerformance,
      inventoryStatus,
    ] = await Promise.all([
      db
        .from("orders")
        .select(
          "id, order_number, status, total, currency, placed_at, created_at, shipping_address_snapshot"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      db.from("payments").select("amount, currency, status, provider"),
      db.from("products").select("id", { count: "exact", head: true }).is("deleted_at", null),
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("gallery_images").select("id", { count: "exact", head: true }),
      db
        .from("admin_daily_sales")
        .select("sale_date, currency, gross_revenue, order_count")
        .order("sale_date", { ascending: false })
        .limit(30),
      db
        .from("admin_product_performance")
        .select("product_id, name, sku, currency, revenue, units_sold, order_count")
        .order("revenue", { ascending: false })
        .limit(5),
      db
        .from("admin_inventory_status")
        .select("product_id, product_name, variant_sku, stock_quantity, low_stock_threshold, is_low_stock")
        .eq("is_low_stock", true)
        .order("stock_quantity", { ascending: true }),
    ]);

    if (ordersResult.error) {
      logger.error("[Admin Stats] orders query failed:", ordersResult.error.message);
      return Response.json(
        { success: false, message: "Could not load order statistics" },
        { status: 500 }
      );
    }

    const orders = ordersResult.data ?? [];
    const payments = paymentsResult.data ?? [];

    const pendingOrders = orders.filter((order) => order.status === "pending").length;

    // Money is grouped by currency. Reporting a single number across currencies
    // would be wrong, so the UI receives an explicit per-currency breakdown.
    const revenueMap = new Map();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      const currency = String(payment.currency || "USD").toUpperCase();
      revenueMap.set(currency, (revenueMap.get(currency) || 0) + Number(payment.amount || 0));
    }
    const revenueByCurrency = [...revenueMap.entries()].map(([currency, revenue]) => ({
      currency,
      revenue: Number(revenue.toFixed(2)),
    }));
    const singleCurrency = revenueByCurrency.length === 1 ? revenueByCurrency[0] : null;

    return Response.json({
      success: true,
      stats: {
        total_orders: orders.length,
        pending_orders: pendingOrders,
        total_products: countOrZero(productsCount),
        total_users: countOrZero(usersCount),
        total_gallery: countOrZero(galleryCount),
        // Only present when every successful payment used the same currency.
        total_revenue: singleCurrency ? singleCurrency.revenue : null,
        revenue_currency: singleCurrency ? singleCurrency.currency : null,
        revenue_by_currency: revenueByCurrency,
        daily_sales: dailySales.error ? [] : dailySales.data ?? [],
        top_products: productPerformance.error ? [] : productPerformance.data ?? [],
        inventory_alerts: inventoryStatus.error ? [] : inventoryStatus.data ?? [],
      },
      recent_orders: orders.slice(0, 10),
      warnings: [dailySales, productPerformance, inventoryStatus]
        .filter((result) => result.error)
        .map((result) => result.error.message),
    });
  } catch (error) {
    logger.error("[Admin Stats] unexpected error", error);
    return Response.json({ success: false, message: "Failed to fetch stats" }, { status: 500 });
  }
}
