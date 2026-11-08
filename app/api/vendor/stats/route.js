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
      vendorProducts,
      vendorOrderItems,
    ] = await Promise.all([
      SupabaseClient.from("vendor_dashboard_overview").select("*").eq("store_id", store.id).single(),
      SupabaseClient.from("vendor_monthly_stats").select("*").eq("store_id", store.id).order("month", { ascending: false }).limit(12),
      SupabaseClient.from("vendor_top_products").select("*").eq("store_id", store.id).order("units_sold", { ascending: false }).limit(10),
      SupabaseClient.from("vendor_sales_by_category").select("*").eq("store_id", store.id).order("revenue", { ascending: false }),
      SupabaseClient.from("vendor_revenue_over_time").select("*").eq("store_id", store.id).order("sale_date", { ascending: false }).limit(30),
      SupabaseClient.from("vendor_pending_shipments").select("*").eq("store_id", store.id),
      SupabaseClient.from("vendor_printing_queue").select("*").eq("store_id", store.id),
      // Per-product view: aggregate to a store-level metric below.
      SupabaseClient.from("vendor_conversion_metrics").select("*").eq("store_id", store.id),
      SupabaseClient.from("vendor_refund_rate").select("*").eq("store_id", store.id).maybeSingle(),
      SupabaseClient
        .from("products")
        .select("id, name, slug, base_price, currency, avg_rating, status, created_at, categories(name)")
        .eq("store_id", store.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      SupabaseClient
        .from("vendor_order_items")
        .select(
          "order_id, order_number, order_status, customer_id, placed_at, product_id, product_name_snapshot, quantity, line_total"
        )
        .eq("store_id", store.id)
        .is("order_deleted_at", null)
        .order("placed_at", { ascending: false })
        .limit(500),
    ]);

    const products = vendorProducts.data ?? [];
    const productIds = products.map((product) => product.id);

    // Stock lives on product_variants; aggregate it for the product list.
    const stockByProduct = new Map();
    if (productIds.length > 0) {
      const { data: variants, error: variantsError } = await SupabaseClient
        .from("product_variants")
        .select("product_id, stock_quantity")
        .in("product_id", productIds);
      if (variantsError) {
        logger.warn("[Vendor Stats] variants lookup failed:", variantsError.message);
      }
      for (const variant of variants ?? []) {
        stockByProduct.set(
          variant.product_id,
          (stockByProduct.get(variant.product_id) ?? 0) + Number(variant.stock_quantity ?? 0)
        );
      }
    }

    // Orders are assembled from the vendor_order_items view (the vendor is not
    // the order owner, so the orders table is not directly readable).
    const soldByProduct = new Map();
    const ordersById = new Map();
    for (const item of vendorOrderItems.data ?? []) {
      soldByProduct.set(
        item.product_id,
        (soldByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0)
      );

      let order = ordersById.get(item.order_id);
      if (!order) {
        order = {
          id: item.order_id,
          order_number: item.order_number,
          status: item.order_status,
          created_at: item.placed_at,
          total: 0,
          items: [],
        };
        ordersById.set(item.order_id, order);
      }
      order.total += Number(item.line_total ?? 0);
      order.items.push({ product_name: item.product_name_snapshot, quantity: item.quantity });
    }

    const productRows = products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      base_price: product.base_price,
      currency: product.currency,
      avg_rating: product.avg_rating,
      is_active: product.status === "published",
      stock_quantity: stockByProduct.get(product.id) ?? 0,
      total_sold: soldByProduct.get(product.id) ?? 0,
      created_at: product.created_at,
      categories: product.categories ?? null,
    }));

    const recentOrders = [...ordersById.values()].slice(0, 50);

    // vendor_conversion_metrics is one row per product; roll it up for the card.
    const conversion = (conversionMetrics.data ?? []).reduce(
      (acc, row) => {
        acc.view_count += Number(row.view_count ?? 0);
        acc.units_sold += Number(row.units_sold ?? 0);
        acc.orders_count += Number(row.orders_count ?? 0);
        return acc;
      },
      { view_count: 0, units_sold: 0, orders_count: 0 }
    );
    conversion.conversion_rate_pct =
      conversion.view_count > 0
        ? Math.round((conversion.orders_count / conversion.view_count) * 10000) / 100
        : 0;

    return Response.json({
      success: true,
      dashboard: dashboardOverview.data || {},
      monthly_stats: monthlyStats.data || [],
      top_products: topProducts.data || [],
      sales_by_category: salesByCategory.data || [],
      revenue_over_time: revenueOverTime.data || [],
      pending_shipments: pendingShipments.data || [],
      printing_queue: printingQueue.data || [],
      conversion_metrics: conversion,
      refund_rate: refundRate.data || {},
      products: productRows,
      recent_orders: recentOrders,
    });
  } catch (error) {
    logger.error("[Vendor Stats Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch vendor stats" },
      { status: 500 }
    );
  }
}
