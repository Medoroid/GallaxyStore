import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const PRODUCT_IMAGES_BUCKET = "product-images";
const DESIGN_PREVIEWS_BUCKET = "design-previews";

// Storage paths in the DB are a mix of absolute URLs, bucket-prefixed paths and
// bucket-relative paths. Normalise them into one public URL.
function publicStorageUrl(client, bucket, path) {
  const value = String(path ?? "").trim();
  if (!value) return null;
  if (
    /^(https?:)?\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  const objectPath = value.startsWith(`${bucket}/`)
    ? value.slice(bucket.length + 1)
    : value;
  return client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}

// Mockups are written to design-previews/mockups/{designId}/{template}/…
// There is no DB row pointing at them, so the admin view lists the folder.
async function listMockupFiles(client, prefix, depth = 0) {
  if (depth > 2) return [];
  const { data, error } = await client.storage
    .from(DESIGN_PREVIEWS_BUCKET)
    .list(prefix, { limit: 100 });
  if (error) {
    logger.warn("[Admin Orders] mockup listing failed:", error.message);
    return [];
  }

  const files = [];
  const folders = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null || entry.id === undefined) {
      folders.push(path);
    } else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) {
      files.push({ name: entry.name, path });
    }
  }

  if (files.length > 0) return files;
  for (const folder of folders) {
    files.push(...(await listMockupFiles(client, folder, depth + 1)));
  }
  return files;
}

async function findMockupUrl(client, designId, settings) {
  if (!designId) return null;
  const config =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {};
  const templateKey =
    typeof config.template_key === "string" ? config.template_key : null;
  const view = typeof config.view === "string" ? config.view : null;
  const color = typeof config.color === "string" ? config.color : null;

  const prefix = templateKey
    ? `mockups/${designId}/${templateKey}`
    : `mockups/${designId}`;
  const files = await listMockupFiles(client, prefix);
  if (files.length === 0) return null;

  const chosen =
    (view && color && files.find((file) => file.name.startsWith(`${view}-${color}-`))) ||
    (view && files.find((file) => file.name.startsWith(`${view}-`))) ||
    files[0];

  return client.storage
    .from(DESIGN_PREVIEWS_BUCKET)
    .getPublicUrl(chosen.path).data.publicUrl;
}

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

  const [paymentsRes, shipmentsRes, itemsRes] = await Promise.all([
    client
      .from("payments")
      .select("id, order_id, provider, provider_payment_id, amount, status, created_at, raw_response")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
    client
      .from("shipments")
      .select("order_id, shipping_method_id, created_at")
      .in("order_id", orderIds),
    client
      .from("order_items")
      .select(
        "id, order_id, variant_id, customization_id, product_name_snapshot, sku_snapshot, options_snapshot, unit_price_snapshot, quantity, line_total, printing_instructions, is_gift_wrapped, gift_note, status, created_at"
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
  ]);

  if (paymentsRes.error) {
    logger.warn("[Admin Orders] payments lookup failed:", paymentsRes.error.message);
  }
  if (shipmentsRes.error) {
    logger.warn("[Admin Orders] shipments lookup failed:", shipmentsRes.error.message);
  }
  if (itemsRes.error) {
    logger.warn("[Admin Orders] order items lookup failed:", itemsRes.error.message);
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

  // Line items are what the admin actually fulfils: the product, its options
  // and — for custom prints — the artwork layers and print job state.
  const items = itemsRes.data ?? [];
  const itemIds = items.map((item) => item.id);
  const customizationIds = [
    ...new Set(items.map((item) => item.customization_id).filter(Boolean)),
  ];

  const [printFilesRes, printJobsRes, customizationsRes, layersRes] =
    await Promise.all([
      itemIds.length
        ? client
            .from("order_item_print_files")
            .select(
              "order_item_id, layer_type, z_index, text_content, font_size, text_color, design_file_path, file_format, print_area_name, printing_area_width, printing_area_height, area_dpi, bleed_mm"
            )
            .in("order_item_id", itemIds)
        : { data: [], error: null },
      itemIds.length
        ? client
            .from("print_jobs")
            .select("id, order_item_id, status, notes, created_at, completed_at")
            .in("order_item_id", itemIds)
        : { data: [], error: null },
      customizationIds.length
        ? client
            .from("product_customizations")
            .select("id, name, preview_image_url, preview_settings")
            .in("id", customizationIds)
        : { data: [], error: null },
      customizationIds.length
        ? client
            .from("product_customization_layers")
            .select("customization_id, design_id, layer_type, z_index")
            .in("customization_id", customizationIds)
        : { data: [], error: null },
    ]);

  if (printFilesRes.error) {
    logger.warn("[Admin Orders] print files lookup failed:", printFilesRes.error.message);
  }
  if (printJobsRes.error) {
    logger.warn("[Admin Orders] print jobs lookup failed:", printJobsRes.error.message);
  }
  if (customizationsRes.error) {
    logger.warn("[Admin Orders] customization lookup failed:", customizationsRes.error.message);
  }
  if (layersRes.error) {
    logger.warn("[Admin Orders] customization layers lookup failed:", layersRes.error.message);
  }

  // Studio artwork lives in the private design-uploads bucket.
  await Promise.all(
    (printFilesRes.data ?? []).map(async (file) => {
      if (!file.design_file_path) return;
      const { data, error } = await client.storage
        .from("design-uploads")
        .createSignedUrl(file.design_file_path, 3600);
      if (error) {
        logger.warn("[Admin Orders] design file URL failed:", error.message);
        return;
      }
      file.design_url = data?.signedUrl ?? null;
    })
  );

  const customizationById = new Map(
    (customizationsRes.data ?? []).map((row) => [row.id, row])
  );

  // Product thumbnails: the variant image wins, then the product's primary image.
  const variantIds = [
    ...new Set(items.map((item) => item.variant_id).filter(Boolean)),
  ];
  const variantsRes = variantIds.length
    ? await client
        .from("product_variants")
        .select("id, product_id, image_url")
        .in("id", variantIds)
    : { data: [], error: null };
  if (variantsRes.error) {
    logger.warn("[Admin Orders] variants lookup failed:", variantsRes.error.message);
  }
  const variantById = new Map(
    (variantsRes.data ?? []).map((row) => [row.id, row])
  );
  const productIds = [
    ...new Set(
      (variantsRes.data ?? []).map((row) => row.product_id).filter(Boolean)
    ),
  ];
  const imagesRes = productIds.length
    ? await client
        .from("product_images")
        .select("product_id, variant_id, storage_path, is_primary, sort_order")
        .in("product_id", productIds)
    : { data: [], error: null };
  if (imagesRes.error) {
    logger.warn("[Admin Orders] product images lookup failed:", imagesRes.error.message);
  }
  const imagesByProduct = new Map();
  for (const image of imagesRes.data ?? []) {
    const list = imagesByProduct.get(image.product_id) ?? [];
    list.push(image);
    imagesByProduct.set(image.product_id, list);
  }
  for (const list of imagesByProduct.values()) {
    list.sort(
      (a, b) =>
        Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
  }

  const productImageFor = (item) => {
    const variant = variantById.get(item.variant_id);
    const variantUrl = publicStorageUrl(
      client,
      PRODUCT_IMAGES_BUCKET,
      variant?.image_url
    );
    if (variantUrl) return variantUrl;

    const images = variant?.product_id
      ? imagesByProduct.get(variant.product_id) ?? []
      : [];
    const image =
      images.find((row) => row.variant_id && row.variant_id === item.variant_id) ||
      images.find((row) => !row.variant_id) ||
      images[0];
    return publicStorageUrl(client, PRODUCT_IMAGES_BUCKET, image?.storage_path);
  };

  // Image layers carry the user_designs id; text-only designs have none.
  const designIdByCustomization = new Map();
  for (const layer of layersRes.data ?? []) {
    if (!layer.design_id) continue;
    if (!designIdByCustomization.has(layer.customization_id)) {
      designIdByCustomization.set(layer.customization_id, layer.design_id);
    }
  }

  const mockupByCustomization = new Map();
  await Promise.all(
    customizationIds.map(async (id) => {
      const customization = customizationById.get(id);
      const preview = customization?.preview_image_url;
      if (preview) {
        const url = publicStorageUrl(client, DESIGN_PREVIEWS_BUCKET, preview);
        if (url) {
          mockupByCustomization.set(id, url);
          return;
        }
      }
      const url = await findMockupUrl(
        client,
        designIdByCustomization.get(id),
        customization?.preview_settings
      );
      if (url) mockupByCustomization.set(id, url);
    })
  );

  const printFilesByItem = new Map();
  for (const file of printFilesRes.data ?? []) {
    const list = printFilesByItem.get(file.order_item_id) ?? [];
    list.push(file);
    printFilesByItem.set(file.order_item_id, list);
  }

  const printJobsByItem = new Map();
  for (const job of printJobsRes.data ?? []) {
    const list = printJobsByItem.get(job.order_item_id) ?? [];
    list.push(job);
    printJobsByItem.set(job.order_item_id, list);
  }

  const itemsByOrder = new Map();
  for (const item of items) {
    const customization = item.customization_id
      ? customizationById.get(item.customization_id)
      : null;
    const preview = customization?.preview_image_url;
    const printFiles = (printFilesByItem.get(item.id) ?? []).sort(
      (a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)
    );
    const artwork =
      printFiles.find((file) => file.design_url) ??
      printFiles.find((file) => file.design_file_path) ??
      null;
    const enriched = {
      ...item,
      product_image_url: productImageFor(item),
      customization_name: customization?.name ?? null,
      customization_preview_url: preview
        ? /^https?:\/\//i.test(preview)
          ? preview
          : client.storage.from("customization-previews").getPublicUrl(preview).data
              .publicUrl
        : null,
      mockup_url: item.customization_id
        ? mockupByCustomization.get(item.customization_id) ?? null
        : null,
      artwork_url: artwork?.design_url ?? null,
      artwork_path: artwork?.design_file_path ?? null,
      print_files: printFiles,
      print_jobs: (printJobsByItem.get(item.id) ?? []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    };
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(enriched);
    itemsByOrder.set(item.order_id, list);
  }

  for (const row of rows) {
    row.items = itemsByOrder.get(row.id) ?? [];
  }

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
