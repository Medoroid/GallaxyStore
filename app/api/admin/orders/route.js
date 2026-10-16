import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

// Client bound to the admin's own JWT — required for RPCs that check is_admin()
function getUserClient(request) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// Reading orders can use the service role when configured (bypasses RLS),
// otherwise fall back to the admin's JWT — but only if that user really is an
// admin in the database, otherwise RLS would silently return an empty list.
function getReadClient(request) {
  try {
    return { client: getServiceRoleClient(), scoped: false };
  } catch (error) {
    logger.warn("[Admin Orders] SUPABASE_SERVICE_ROLE_KEY missing, using admin JWT:", error.message);
    return { client: getUserClient(request), scoped: true };
  }
}

// Attach the "nature of the order" to each row: how it is being paid
// (cash on delivery / card / wallet) and how it is being shipped
// (express vs standard). All lookups are batched and non-fatal.
async function withOrderNature(client, orders) {
  if (!orders || orders.length === 0) return orders ?? [];

  const orderIds = orders.map((o) => o.id);

  const [paymentsRes, shipmentsRes] = await Promise.all([
    client
      .from("payments")
      .select("order_id, provider, provider_payment_id, amount, status, created_at, raw_response")
      .in("order_id", orderIds),
    client
      .from("shipments")
      .select("order_id, shipping_method_id, created_at")
      .in("order_id", orderIds),
  ]);

  if (paymentsRes.error) {
    logger.warn("[Admin Orders] payments lookup failed:", paymentsRes.error.message);
  }
  if (shipmentsRes.error) {
    logger.warn("[Admin Orders] shipments lookup failed:", shipmentsRes.error.message);
  }

  const paymentsByOrder = new Map();
  for (const payment of paymentsRes.data ?? []) {
    const list = paymentsByOrder.get(payment.order_id) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.order_id, list);
  }
  for (const list of paymentsByOrder.values()) {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Newest shipment wins when the order itself does not carry the method.
  const shipmentByOrder = new Map();
  for (const shipment of shipmentsRes.data ?? []) {
    if (!shipment.shipping_method_id) continue;
    const previous = shipmentByOrder.get(shipment.order_id);
    if (
      !previous ||
      new Date(shipment.created_at).getTime() > new Date(previous.created_at).getTime()
    ) {
      shipmentByOrder.set(shipment.order_id, shipment);
    }
  }

  const methodIds = new Set();
  for (const order of orders) {
    if (order.shipping_method_id) methodIds.add(order.shipping_method_id);
  }
  for (const shipment of shipmentByOrder.values()) {
    methodIds.add(shipment.shipping_method_id);
  }

  let methods = [];
  if (methodIds.size > 0) {
    const { data, error } = await client
      .from("shipping_methods")
      .select("id, name, slug, type, carrier, min_delivery_days, max_delivery_days")
      .in("id", [...methodIds]);

    if (error) {
      logger.warn("[Admin Orders] shipping methods lookup failed:", error.message);
    } else {
      methods = data ?? [];
    }
  }
  const methodsById = new Map(methods.map((method) => [method.id, method]));

  const rows = orders.map((order) => {
    const attempts = paymentsByOrder.get(order.id) ?? [];
    // A settled attempt beats the most recent retry.
    const payment =
      attempts.find((attempt) => attempt.status === "succeeded") ?? attempts[0] ?? null;

    const shipment = shipmentByOrder.get(order.id);
    const methodId = order.shipping_method_id || shipment?.shipping_method_id || null;

    return {
      ...order,
      payment,
      payments: attempts,
      shipping_method_id: methodId,
      shipping_method: methodId ? (methodsById.get(methodId) ?? null) : null,
    };
  });

  // Transfer receipts live in a private bucket — hand the admin a signed URL.
  await Promise.all(
    rows.map(async (row) => {
      const receiptPath = row.payment?.raw_response?.receipt_path;
      if (!receiptPath) return;

      const { data, error } = await client.storage
        .from("payment-receipts")
        .createSignedUrl(receiptPath, 3600);

      if (error) {
        logger.warn("[Admin Orders] receipt URL failed:", error.message);
        return;
      }

      row.payment = { ...row.payment, receipt_url: data?.signedUrl ?? null };
    })
  );

  return rows;
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { client: SupabaseClient, scoped } = getReadClient(request);

    if (scoped) {
      const { data: isAdmin, error: adminError } = await SupabaseClient.rpc("is_admin");
      if (adminError || isAdmin !== true) {
        return Response.json(
          {
            success: false,
            message:
              "Cannot load orders: SUPABASE_SERVICE_ROLE_KEY is not set and this account is not an admin in the database (set profiles.role = 'admin').",
          },
          { status: 403 }
        );
      }
    }

    const { data: orders, error } = await SupabaseClient
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ success: true, orders: await withOrderNature(SupabaseClient, orders ?? []) });
  } catch (error) {
    return handleApiError(error, "Admin Orders GET", "Failed to fetch orders");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // update_order_status() raises 'Admin only' unless auth.uid() is a real
    // admin, so the service role (no auth.uid) can never be used here.
    const SupabaseClient = getUserClient(request);
    const { order_id, status, note, action, approve } = await request.json();

    // Vodafone Cash: the admin checked the transfer against the receipt.
    if (action === "verify_payment") {
      if (!order_id) {
        return Response.json(
          { success: false, message: "order_id is required" },
          { status: 400 }
        );
      }

      const approved = approve !== false;
      const { error } = await SupabaseClient.rpc("verify_vodafone_cash_payment", {
        p_order_id: order_id,
        p_approve: approved,
        p_note: note || null,
      });

      if (error) {
        logger.error("Failed to verify payment", error);
        return Response.json(
          { success: false, message: error.message || "Failed to verify payment" },
          { status: 400 }
        );
      }

      return Response.json({
        success: true,
        order_id,
        status: approved ? "paid" : "pending",
      });
    }

    if (!order_id || !status) {
      return Response.json(
        { success: false, message: "order_id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "paid", "processing", "printing", "shipped", "delivered", "cancelled", "refunded", "partially_refunded"];
    if (!validStatuses.includes(status)) {
      return Response.json(
        { success: false, message: "Invalid status" },
        { status: 400 }
      );
    }

    const { error } = await SupabaseClient
      .rpc("update_order_status", {
        p_order_id: order_id,
        p_new_status: status,
        p_note: note || null,
      });

    if (error) {
      logger.error("Failed to update order", error);
      return Response.json(
        { success: false, message: error.message || "Failed to update order" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, order_id, status });
  } catch (error) {
    return handleApiError(error, "Admin Orders PATCH", "Failed to update order");
  }
}
