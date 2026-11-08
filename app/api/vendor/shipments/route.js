import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import {
  aggregateOrderStatus,
  canTransitionShipment,
  isShipmentStatus,
  orderItemStatusForShipment,
  parseCarrier,
  parseShipmentNote,
  parseTrackingNumber,
  parseTrackingUrl,
} from "@/lib/shipments";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TERMINAL_ORDER_STATUSES = new Set([
  "cancelled",
  "refunded",
  "partially_refunded",
  "delivered",
]);

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function json(message, status) {
  return Response.json({ success: false, message }, { status });
}

function uuid(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(candidate) ? candidate : null;
}

async function authenticateVendor(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { error: json("Authorization required", 401) };

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { error: json("Authorization required", 401) };

  const userClient = getSupabaseForUser(token);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(token);

  if (authError || !user) return { error: json("Invalid token", 401) };

  const { data: store, error: storeError } = await userClient
    .from("stores")
    .select("id, name, status")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) return { error: json("Vendor store not found", 403) };

  return { user, userClient, store };
}

async function loadShippingMethods(db) {
  const { data, error } = await db
    .from("shipping_methods")
    .select("id, name, carrier, min_delivery_days, max_delivery_days, type")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function methodById(methods) {
  return new Map(methods.map((method) => [method.id, method]));
}

function publicMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    name: method.name,
    carrier: method.carrier,
    type: method.type,
    min_delivery_days: method.min_delivery_days,
    max_delivery_days: method.max_delivery_days,
  };
}

/**
 * GET /api/vendor/shipments
 *
 * Returns:
 *   - shipments that only contain this vendor's order items
 *   - orders/items that are ready to ship
 *   - active shipping methods for orders that have no method recorded
 *
 * Customer names, emails, phones and addresses are deliberately never selected.
 */
export async function GET(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`vendor-shipments:${ip}`, {
      maxRequests: 120,
      windowMs: 60_000,
      failureMode: "fail_open",
    });
    if (!allowed) return json("Too many requests. Please try again shortly.", 429);

    const auth = await authenticateVendor(request);
    if (auth.error) return auth.error;

    const { userClient, store } = auth;
    const db = getServiceRoleClient();

    const { data: items, error: itemsError } = await userClient
      .from("vendor_order_items")
      .select(
        "order_item_id, order_id, order_number, order_status, placed_at, product_name_snapshot, quantity, item_status"
      )
      .eq("store_id", store.id)
      .is("order_deleted_at", null)
      .order("placed_at", { ascending: false })
      .limit(1000);

    if (itemsError) throw itemsError;

    const ownItems = items ?? [];
    const itemById = new Map(ownItems.map((item) => [item.order_item_id, item]));
    const orderIds = [...new Set(ownItems.map((item) => item.order_id))];

    let shipments = [];
    let shipmentItems = [];

    if (orderIds.length > 0) {
      const { data: shipmentRows, error: shipmentsError } = await db
        .from("shipments")
        .select(
          "id, order_id, shipping_method_id, status, carrier, tracking_number, tracking_url, estimated_delivery_date_min, estimated_delivery_date_max, created_at, shipped_at, delivered_at, notes"
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (shipmentsError) throw shipmentsError;
      shipments = shipmentRows ?? [];

      if (shipments.length > 0) {
        const { data: shipmentItemRows, error: shipmentItemsError } = await db
          .from("shipment_items")
          .select("shipment_id, order_item_id, quantity")
          .in(
            "shipment_id",
            shipments.map((shipment) => shipment.id)
          );

        if (shipmentItemsError) throw shipmentItemsError;
        shipmentItems = shipmentItemRows ?? [];
      }
    }

    const methods = await loadShippingMethods(db);
    const methodMap = methodById(methods);

    const itemsByShipment = new Map();
    for (const row of shipmentItems) {
      const list = itemsByShipment.get(row.shipment_id) ?? [];
      list.push(row);
      itemsByShipment.set(row.shipment_id, list);
    }

    const activeShippedItemIds = new Set();
    const visibleShipments = [];

    for (const shipment of shipments) {
      const rows = itemsByShipment.get(shipment.id) ?? [];
      if (rows.length === 0) continue;

      const everyItemIsOurs = rows.every((row) => itemById.has(row.order_item_id));
      if (!everyItemIsOurs) {
        // A legacy/admin shipment may mix stores. Never expose it to a vendor.
        logger.warn("[vendor-shipments] skipped mixed-store shipment", {
          shipment_id: shipment.id,
        });
        continue;
      }

      if (shipment.status !== "cancelled") {
        for (const row of rows) activeShippedItemIds.add(row.order_item_id);
      }

      visibleShipments.push({
        ...shipment,
        item_count: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        shipping_method: publicMethod(methodMap.get(shipment.shipping_method_id)),
        items: rows
          .map((row) => itemById.get(row.order_item_id))
          .filter(Boolean)
          .map((item) => ({
            order_item_id: item.order_item_id,
            product_name: item.product_name_snapshot,
            quantity: item.quantity,
            status: item.item_status,
          })),
      });
    }

    const eligibleGroups = new Map();
    for (const item of ownItems) {
      if (activeShippedItemIds.has(item.order_item_id)) continue;
      const group = eligibleGroups.get(item.order_id) ?? [];
      group.push(item);
      eligibleGroups.set(item.order_id, group);
    }

    const eligibleOrderIds = [...eligibleGroups.keys()];
    let orders = [];
    if (eligibleOrderIds.length > 0) {
      const { data: orderRows, error: ordersError } = await db
        .from("orders")
        .select("id, status, shipping_method_id, deleted_at")
        .in("id", eligibleOrderIds);

      if (ordersError) throw ordersError;
      orders = orderRows ?? [];
    }

    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const eligibleOrders = [];

    for (const [orderId, orderItems] of eligibleGroups) {
      const order = orderMap.get(orderId);
      if (!order || order.deleted_at) continue;
      if (TERMINAL_ORDER_STATUSES.has(order.status)) continue;

      const method = methodMap.get(order.shipping_method_id) ?? null;
      const firstItem = orderItems[0];
      eligibleOrders.push({
        order_id: orderId,
        order_number: firstItem.order_number,
        order_status: order.status,
        placed_at: firstItem.placed_at,
        shipping_method: publicMethod(method),
        suggested_carrier: method?.carrier ?? null,
        items: orderItems.map((item) => ({
          order_item_id: item.order_item_id,
          product_name: item.product_name_snapshot,
          quantity: item.quantity,
          status: item.item_status,
        })),
      });
    }

    return Response.json({
      success: true,
      store: { id: store.id, name: store.name },
      shipments: visibleShipments,
      eligible_orders: eligibleOrders,
      shipping_methods: methods.map(publicMethod),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/vendor/shipments");
  }
}

async function createShipment(db, user, userClient, store, body) {
  const orderId = uuid(body.order_id);
  if (!orderId) return json("A valid order id is required", 400);

  const requestedIds = Array.isArray(body.order_item_ids)
    ? [...new Set(body.order_item_ids.map(uuid).filter(Boolean))]
    : [];
  if (requestedIds.length === 0) {
    return json("Select at least one order item to ship", 400);
  }

  const { data: ownedItems, error: ownedError } = await userClient
    .from("vendor_order_items")
    .select(
      "order_item_id, order_id, quantity, product_name_snapshot, item_status, order_status, order_deleted_at"
    )
    .eq("store_id", store.id)
    .eq("order_id", orderId)
    .in("order_item_id", requestedIds);

  if (ownedError) throw ownedError;
  if ((ownedItems ?? []).length !== requestedIds.length) {
    return json("One or more order items do not belong to your store", 403);
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, status, shipping_method_id, deleted_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order || order.deleted_at) return json("Order not found", 404);
  if (["cancelled", "refunded", "partially_refunded", "delivered"].includes(order.status)) {
    return json("This order can no longer be shipped", 409);
  }

  // A wallet/card order that is still waiting for payment must not be handed to
  // the carrier. COD orders legitimately stay pending until delivery.
  let isCodOrder = false;
  if (order.status === "pending") {
    const { data: payments, error: paymentsError } = await db
      .from("payments")
      .select("provider, status")
      .eq("order_id", orderId);

    if (paymentsError) {
      logger.warn("[vendor-shipments] could not verify payment status", {
        order_id: orderId,
        error: paymentsError.message,
      });
      return json("Could not verify the payment status. Please retry.", 503);
    }

    const rows = payments ?? [];
    if (
      rows.some(
        (payment) =>
          payment.provider !== "cod" &&
          ["pending", "processing"].includes(payment.status)
      )
    ) {
      return json("This order is still awaiting payment and cannot be shipped yet", 409);
    }

    isCodOrder = rows.some((payment) => payment.provider === "cod");
    if (!isCodOrder) {
      return json("This order is awaiting payment and cannot be shipped yet", 409);
    }
  }

  const { data: existingLinks, error: linksError } = await db
    .from("shipment_items")
    .select("order_item_id, shipment_id")
    .in("order_item_id", requestedIds);

  if (linksError) throw linksError;

  if ((existingLinks ?? []).length > 0) {
    const { data: existingShipments, error: existingError } = await db
      .from("shipments")
      .select("id, status")
      .in(
        "id",
        existingLinks.map((link) => link.shipment_id)
      );

    if (existingError) throw existingError;
    const activeShipmentIds = new Set(
      (existingShipments ?? [])
        .filter((shipment) => shipment.status !== "cancelled")
        .map((shipment) => shipment.id)
    );
    const blocked = existingLinks.filter((link) => activeShipmentIds.has(link.shipment_id));
    if (blocked.length > 0) {
      return json("Some selected items are already in an active shipment", 409);
    }
  }

  const methodId = uuid(body.shipping_method_id) || uuid(order.shipping_method_id);
  if (!methodId) return json("Select a shipping method for this order", 400);

  const { data: method, error: methodError } = await db
    .from("shipping_methods")
    .select("id, name, carrier, min_delivery_days, max_delivery_days, type")
    .eq("id", methodId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (methodError) throw methodError;
  if (!method) return json("The selected shipping method is not available", 400);

  let carrier;
  let trackingNumber;
  let trackingUrl;
  let note;
  try {
    carrier = parseCarrier(body.carrier) ?? parseCarrier(method.carrier);
    trackingNumber = parseTrackingNumber(body.tracking_number);
    trackingUrl = parseTrackingUrl(body.tracking_url);
    note = parseShipmentNote(body.note);
  } catch (validationError) {
    return json(validationError.message, 400);
  }

  const requestedStatus = isShipmentStatus(body.status) ? body.status : null;
  const status =
    requestedStatus && ["pending", "label_created"].includes(requestedStatus)
      ? requestedStatus
      : trackingNumber
        ? "label_created"
        : "pending";

  const { data: shipment, error: shipmentError } = await db
    .from("shipments")
    .insert({
      order_id: orderId,
      shipping_method_id: method.id,
      carrier,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      status,
      notes: note,
      shipping_fee_charged: 0,
    })
    .select("*")
    .single();

  if (shipmentError) throw shipmentError;

  const itemMap = new Map((ownedItems ?? []).map((item) => [item.order_item_id, item]));
  const { error: linkError } = await db.from("shipment_items").insert(
    requestedIds.map((orderItemId) => ({
      shipment_id: shipment.id,
      order_item_id: orderItemId,
      quantity: Number(itemMap.get(orderItemId)?.quantity ?? 1),
    }))
  );

  if (linkError) {
    await db.from("shipments").delete().eq("id", shipment.id);
    throw linkError;
  }

  // Best-effort item/order state. The shipment trigger is the authoritative
  // status log; a failed order transition must not roll back the shipment.
  const { error: itemUpdateError } = await db
    .from("order_items")
    .update({ status: "processing" })
    .in("id", requestedIds)
    .in("status", ["pending", "processing"]);

  if (itemUpdateError) {
    logger.warn("[vendor-shipments] could not mark items processing", {
      shipment_id: shipment.id,
      error: itemUpdateError.message,
    });
  }

  if (order.status === "paid" || (order.status === "pending" && isCodOrder)) {
    const { error: orderUpdateError } = await db
      .from("orders")
      .update({ status: "processing" })
      .eq("id", orderId)
      .eq("status", order.status);
    if (orderUpdateError) {
      logger.warn("[vendor-shipments] could not move order to processing", {
        order_id: orderId,
        error: orderUpdateError.message,
      });
    }
  }

  return Response.json({
    success: true,
    shipment: {
      ...shipment,
      shipping_method: publicMethod(method),
      items: requestedIds.map((orderItemId) => ({
        order_item_id: orderItemId,
        product_name: itemMap.get(orderItemId)?.product_name_snapshot,
        quantity: itemMap.get(orderItemId)?.quantity,
      })),
    },
  });
}

async function updateShipmentStatus(db, user, userClient, store, body) {
  const shipmentId = uuid(body.shipment_id);
  if (!shipmentId) return json("A valid shipment id is required", 400);

  if (!isShipmentStatus(body.status)) {
    return json("Choose a valid shipment status", 400);
  }
  const nextStatus = body.status;

  const { data: shipment, error: shipmentError } = await db
    .from("shipments")
    .select("*")
    .eq("id", shipmentId)
    .maybeSingle();

  if (shipmentError) throw shipmentError;
  if (!shipment) return json("Shipment not found", 404);

  const { data: links, error: linksError } = await db
    .from("shipment_items")
    .select("order_item_id")
    .eq("shipment_id", shipmentId);

  if (linksError) throw linksError;
  const itemIds = (links ?? []).map((link) => link.order_item_id);
  if (itemIds.length === 0) return json("Shipment has no items", 409);

  const { data: ownedItems, error: ownedError } = await userClient
    .from("vendor_order_items")
    .select("order_item_id")
    .eq("store_id", store.id)
    .in("order_item_id", itemIds);

  if (ownedError) throw ownedError;
  if ((ownedItems ?? []).length !== itemIds.length) {
    return json("This shipment contains items from another store", 403);
  }

  if (!canTransitionShipment(shipment.status, nextStatus)) {
    return json(
      `Invalid shipment status transition: ${shipment.status} -> ${nextStatus}`,
      409
    );
  }

  const updates = { status: nextStatus };
  try {
    if (Object.prototype.hasOwnProperty.call(body, "tracking_number")) {
      updates.tracking_number = parseTrackingNumber(body.tracking_number);
    }
    if (Object.prototype.hasOwnProperty.call(body, "tracking_url")) {
      updates.tracking_url = parseTrackingUrl(body.tracking_url);
    }
    if (Object.prototype.hasOwnProperty.call(body, "carrier")) {
      updates.carrier = parseCarrier(body.carrier);
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      updates.notes = parseShipmentNote(body.note);
    }
  } catch (validationError) {
    return json(validationError.message, 400);
  }

  const { data: updated, error: updateError } = await db
    .from("shipments")
    .update(updates)
    .eq("id", shipmentId)
    .select("*")
    .single();

  if (updateError) {
    if (/invalid shipment status transition/i.test(updateError.message)) {
      return json(updateError.message, 409);
    }
    throw updateError;
  }

  const itemStatus = orderItemStatusForShipment(nextStatus);
  if (itemStatus) {
    let query = db.from("order_items").update({ status: itemStatus }).in("id", itemIds);
    if (itemStatus === "shipped") {
      // Never downgrade an item that was already delivered.
      query = query.in("status", ["pending", "processing", "printed"]);
    }
    const { error: itemUpdateError } = await query;
    if (itemUpdateError) {
      logger.warn("[vendor-shipments] could not update order items", {
        shipment_id: shipmentId,
        error: itemUpdateError.message,
      });
    }
  }

  // Order status is a separate, stricter state machine. Only perform a direct
  // transition the live trigger allows; otherwise leave it for the admin flow
  // and keep the shipment (the customer-facing delivery source) correct.
  const { data: allItems, error: allItemsError } = await db
    .from("order_items")
    .select("status")
    .eq("order_id", shipment.order_id);

  if (!allItemsError) {
    const aggregate = aggregateOrderStatus((allItems ?? []).map((item) => item.status));
    if (aggregate) {
      const { data: order } = await db
        .from("orders")
        .select("status")
        .eq("id", shipment.order_id)
        .maybeSingle();

      // `processing -> shipped` is the COD/fulfilment path once every item has
      // a shipment. The database transition function is widened by the review
      // migration; the order update is best-effort so a missing migration does
      // not roll back the shipment itself.
      const allowed =
        (aggregate === "shipped" &&
          ["paid", "processing", "printing"].includes(order?.status)) ||
        (aggregate === "delivered" && order?.status === "shipped");

      if (allowed) {
        const { error: orderUpdateError } = await db
          .from("orders")
          .update({ status: aggregate })
          .eq("id", shipment.order_id)
          .eq("status", order.status);
        if (orderUpdateError) {
          logger.warn("[vendor-shipments] could not update order status", {
            order_id: shipment.order_id,
            error: orderUpdateError.message,
          });
        }
      }
    }
  }

  return Response.json({ success: true, shipment: updated });
}

/**
 * POST /api/vendor/shipments
 *
 * Actions:
 *   create        - create a shipment for selected items of one of this store's orders
 *   update_status - move one of this store's shipments through the status machine
 *
 * Writes use the service role only after the vendor's ownership of every item
 * has been verified through the RLS-protected vendor_order_items view.
 */
export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`vendor-shipments-write:${ip}`, {
      maxRequests: 60,
      windowMs: 60_000,
      failureMode: "fail_closed",
    });
    if (!allowed) return json("Too many requests. Please try again shortly.", 429);

    const auth = await authenticateVendor(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json("Invalid request body", 400);

    const db = getServiceRoleClient();
    const { user, userClient, store } = auth;

    if (body.action === "create") {
      return createShipment(db, user, userClient, store, body);
    }
    if (body.action === "update_status") {
      return updateShipmentStatus(db, user, userClient, store, body);
    }

    return json("Unknown action", 400);
  } catch (error) {
    return handleApiError(error, "POST /api/vendor/shipments");
  }
}
