import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * GET /api/vendor/orders
 *
 * Vendor orders are assembled from vendor_order_items (the vendor does not own
 * the order row and must not read the whole orders table). The customer's
 * display name is resolved through a restricted service-role lookup limited to
 * the customer ids that appear in this store's own order items. Email, phone
 * and the delivery address are deliberately never selected here.
 */
export async function GET(request) {
  try {
    const { allowed } = await checkRateLimitAsync(`vendor-orders:${getClientIp(request)}`, {
      maxRequests: 60,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const { data: store, error: storeError } = await userClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (storeError) throw storeError;
    if (!store) {
      return Response.json(
        { success: false, message: "No store found for this account" },
        { status: 403 }
      );
    }

    const db = getServiceRoleClient();

    // vendor_order_items is a view whose WHERE clause calls owns_store(auth.uid()).
    // It must be queried with the user's JWT; the service-role client has no
    // auth.uid() and would silently return zero rows.
    const { data: items, error: itemsError } = await userClient
      .from("vendor_order_items")
      .select(
        `order_item_id, order_id, order_number, order_status, customer_id, placed_at,
         product_id, product_name_snapshot, quantity, line_total,
         unit_price_snapshot, item_status`
      )
      .eq("store_id", store.id)
      .is("order_deleted_at", null)
      .order("placed_at", { ascending: false })
      .limit(500);

    if (itemsError) throw itemsError;

    const rows = items ?? [];
    const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
    const productIds = [...new Set(rows.map((row) => row.product_id).filter(Boolean))];

    const [profilesResult, productsResult] = await Promise.all([
      customerIds.length > 0
        ? db.from("profiles").select("id, full_name").in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? db.from("products").select("id, currency").in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) {
      // A missing profile must not hide the order itself.
      logger.warn("[Vendor Orders] customer name lookup failed:", profilesResult.error.message);
    }
    if (productsResult.error) {
      logger.warn("[Vendor Orders] product currency lookup failed:", productsResult.error.message);
    }

    const customerNames = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name])
    );
    const productCurrencies = new Map(
      (productsResult.data ?? []).map((product) => [product.id, product.currency])
    );

    const ordersById = new Map();

    for (const item of rows) {
      let order = ordersById.get(item.order_id);
      if (!order) {
        order = {
          id: item.order_id,
          order_number: item.order_number,
          status: item.order_status,
          created_at: item.placed_at,
          total: 0,
          currency: productCurrencies.get(item.product_id) || null,
          customer_name: customerNames.get(item.customer_id) || null,
          items: [],
        };
        ordersById.set(item.order_id, order);
      }

      order.total += Number(item.line_total ?? 0);
      order.items.push({
        id: item.order_item_id,
        product_id: item.product_id,
        product_name: item.product_name_snapshot,
        quantity: item.quantity,
        unit_price: Number(item.unit_price_snapshot ?? 0),
        line_total: Number(item.line_total ?? 0),
        status: item.item_status,
      });

      if (!order.currency && productCurrencies.get(item.product_id)) {
        order.currency = productCurrencies.get(item.product_id);
      }
    }

    return Response.json({
      success: true,
      store_id: store.id,
      orders: [...ordersById.values()],
    });
  } catch (error) {
    return handleApiError(error, "Vendor Orders GET", "Failed to fetch vendor orders");
  }
}
