import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { recordAdminAudit } from "@/lib/admin-audit";
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

// Audit is best-effort: a missing service-role key must not turn an already
// committed payment decision into a 500 for the admin.
function getAuditClient() {
  try {
    return getServiceRoleClient();
  } catch (error) {
    logger.warn("[Admin Orders] audit client unavailable:", error.message);
    return null;
  }
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
      .select("id, order_id, provider, provider_payment_id, amount, status, created_at, raw_response")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
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

  const paymentIds = (paymentsRes.data ?? []).map((payment) => payment.id);
  const receiptsRes = paymentIds.length
    ? await client
        .from("payment_receipts")
        .select(
          "id, payment_id, provider, transfer_reference, payer_phone, receipt_url, status, admin_notes, created_at"
        )
        .in("payment_id", paymentIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (receiptsRes.error) {
    logger.warn("[Admin Orders] receipts lookup failed:", receiptsRes.error.message);
  }

  const receiptByPayment = new Map();
  for (const receipt of receiptsRes.data ?? []) {
    if (!receiptByPayment.has(receipt.payment_id)) {
      receiptByPayment.set(receipt.payment_id, receipt);
    }
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
      payment: payment
        ? { ...payment, receipt: receiptByPayment.get(payment.id) ?? null }
        : null,
      payments: attempts.map((attempt) => ({
        ...attempt,
        receipt: receiptByPayment.get(attempt.id) ?? null,
      })),
      shipping_method_id: methodId,
      shipping_method: methodId ? (methodsById.get(methodId) ?? null) : null,
    };
  });

  // Transfer receipts live in a private bucket — hand the admin a signed URL.
  await Promise.all(
    rows.map(async (row) => {
      const receipt = row.payment?.receipt;
      const receiptPath =
        receipt?.receipt_url || row.payment?.raw_response?.receipt_path;
      if (!receiptPath) return;

      const { data, error } = await client.storage
        .from("payment-receipts")
        .createSignedUrl(receiptPath, 3600);

      if (error) {
        logger.warn("[Admin Orders] receipt URL failed:", error.message);
        return;
      }

      row.payment = {
        ...row.payment,
        receipt_url: data?.signedUrl ?? null,
        receipt: receipt
          ? { ...receipt, signed_url: data?.signedUrl ?? null }
          : null,
      };
    })
  );

  return rows;
}

async function notifyOrderStatus(orderId, status) {
  const db = getServiceRoleClient();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, user_id, status, total, currency, shipping_address_snapshot")
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.user_id) return;

  // Defensive: never email "paid" while the persisted order is still pending.
  // The live sync_order_payment_status trigger normally moves a pending order to
  // paid as soon as a payment succeeds (including the legacy COD RPC), so this
  // only catches an unexpected provider/path that settled the payment without
  // updating the order.
  if (status === "paid" && order.status === "pending") {
    logger.warn("[Admin Orders] skipping paid email for an order still pending");
    return;
  }

  const { data: userData } = await db.auth.admin.getUserById(order.user_id);
  const email = userData?.user?.email;
  if (!email) return;

  const { sendOrderStatusUpdate } = await import("@/lib/email");
  await sendOrderStatusUpdate({
    orderId: order.id,
    orderNumber: order.order_number,
    customerName:
      order.shipping_address_snapshot?.full_name ||
      userData?.user?.user_metadata?.full_name ||
      "Customer",
    customerEmail: email,
    status,
    total: Number(order.total || 0),
    currency: order.currency || "USD",
  });
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
    const { order_id, status, note, action, approve, payment_id } = await request.json();

    // Cash on delivery: the courier actually collected the cash.
    if (action === "mark_cod_collected") {
      if (!payment_id) {
        return Response.json(
          { success: false, message: "payment_id is required" },
          { status: 400 }
        );
      }

      const { data: payment, error } = await SupabaseClient.rpc("mark_cod_collected", {
        p_payment_id: payment_id,
      });

      if (error) {
        logger.error("Failed to collect COD payment", error);
        return Response.json(
          { success: false, message: error.message || "Failed to record the cash collection" },
          { status: 400 }
        );
      }

      const collectedOrderId = payment?.order_id || order_id || null;
      if (collectedOrderId) {
        await notifyOrderStatus(collectedOrderId, "paid").catch((notifyError) =>
          logger.warn("[Admin Orders] status email failed:", notifyError.message)
        );
      }

      const auditClient = getAuditClient();
      if (auditClient) {
        await recordAdminAudit(auditClient, {
          actorId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          action: "order.cod_collected",
          entityType: "order",
          entityId: collectedOrderId,
          details: { payment_id, note: note || null },
        });
      }

      return Response.json({
        success: true,
        order_id: collectedOrderId,
        payment_id,
        payment_status: "succeeded",
      });
    }

    // Wallet transfer: the admin checked the receipt against the transfer.
    if (action === "verify_payment") {
      if (!order_id) {
        return Response.json(
          { success: false, message: "order_id is required" },
          { status: 400 }
        );
      }
      if (typeof approve !== "boolean") {
        return Response.json(
          { success: false, message: "approve must be true or false" },
          { status: 400 }
        );
      }

      // Pick the provider on the server; the browser must not choose which
      // verification RPC runs.
      const { data: payment, error: paymentError } = await SupabaseClient
        .from("payments")
        .select("id, provider, status")
        .eq("order_id", order_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paymentError) {
        logger.error("Failed to load payment for verification", paymentError);
        return Response.json(
          { success: false, message: "Could not load the payment" },
          { status: 500 }
        );
      }

      if (!payment) {
        return Response.json(
          { success: false, message: "No payment was found for this order" },
          { status: 400 }
        );
      }

      let rpcName = null;
      if (payment.provider === "external_wallet") {
        rpcName = "verify_external_wallet_payment";
      } else if (payment.provider === "vodafone_cash") {
        // Legacy orders keep their original RPC and evidence.
        rpcName = "verify_vodafone_cash_payment";
      }

      if (!rpcName) {
        return Response.json(
          {
            success: false,
            message:
              payment.provider === "cod"
                ? "Cash on delivery is recorded with 'Mark cash collected', not receipt verification."
                : "This payment provider cannot be verified from this screen.",
          },
          { status: 400 }
        );
      }

      const approved = approve !== false;
      const { error } = await SupabaseClient.rpc(rpcName, {
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

      if (approved) {
        await notifyOrderStatus(order_id, "paid").catch((notifyError) =>
          logger.warn("[Admin Orders] status email failed:", notifyError.message)
        );
      }

      const auditClient = getAuditClient();
      if (auditClient) {
        await recordAdminAudit(auditClient, {
          actorId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          action: approved ? "order.payment_verified" : "order.payment_rejected",
          entityType: "order",
          entityId: order_id,
          details: { note: note || null, provider: payment.provider, payment_id: payment.id },
        });
      }

      return Response.json({
        success: true,
        order_id,
        provider: payment.provider,
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

    await notifyOrderStatus(order_id, status).catch((notifyError) =>
      logger.warn("[Admin Orders] status email failed:", notifyError.message)
    );

    const auditClient = getAuditClient();
    if (auditClient) {
      await recordAdminAudit(auditClient, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "order.status_changed",
        entityType: "order",
        entityId: order_id,
        details: { status, note: note || null },
      });
    }

    return Response.json({ success: true, order_id, status });
  } catch (error) {
    return handleApiError(error, "Admin Orders PATCH", "Failed to update order");
  }
}
