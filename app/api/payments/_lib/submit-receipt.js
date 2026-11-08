import { createClient } from "@supabase/supabase-js";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { RECEIPT_MAX_BYTES, validateReceiptBytes } from "@/lib/receipt-file";
import { isMissingRpcError } from "@/lib/supabase/rpc-errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?[0-9\s\-()]{6,20}$/;

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

function rpcErrorResponse(error, provider) {
  const message = String(error?.message || "");

  if (isMissingRpcError(error)) {
    return json(
      "Wallet transfer verification is not enabled on this deployment yet. Please use cash on delivery or contact support.",
      503
    );
  }

  if (/order not found or access denied|permission denied|not authorized/i.test(message)) {
    return json("Order not found or access denied.", 403);
  }
  if (/already used by another order|duplicate key|unique/i.test(message)) {
    return json("That transfer reference is already used by another order.", 409);
  }
  if (/already paid/i.test(message)) {
    return json("This order is already paid.", 409);
  }
  if (/not awaiting payment/i.test(message)) {
    return json("This order is not awaiting payment.", 409);
  }
  if (
    /cash on delivery|not using a wallet transfer|not using vodafone cash|already in progress/i.test(
      message
    )
  ) {
    return json(message, 409);
  }
  if (/payment not found/i.test(message)) {
    return json("Payment attempt not found.", 404);
  }
  if (/valid payer phone|valid transfer reference|receipt image is required|invalid receipt path/i.test(message)) {
    return json(message, 400);
  }

  logger.error(`[${provider}] submit receipt RPC failed:`, error);
  return json("Failed to submit the receipt. Please try again.", 500);
}

/**
 * Shared receipt submission pipeline. It never marks a payment as paid: the
 * RPC only stores a pending receipt for an admin to review.
 */
export async function submitReceipt(request, { rpcName, rateLimitKey, logLabel }) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimitAsync(`${rateLimitKey}:${ip}`, {
    maxRequests: 5,
    failureMode: "fail_closed",
  });

  if (!allowed) {
    return json("Too many requests. Please try again later.", 429);
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return json("Authorization required", 401);

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) return json("Invalid token", 401);

    const body = await request.json().catch(() => ({}));
    const order_id = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const payer_phone = typeof body?.payer_phone === "string" ? body.payer_phone.trim() : "";
    const transfer_reference =
      typeof body?.transfer_reference === "string" ? body.transfer_reference.trim() : "";
    const receipt_path =
      typeof body?.receipt_path === "string" ? body.receipt_path.trim() : "";

    if (!order_id || !payer_phone || !transfer_reference || !receipt_path) {
      return json(
        "order_id, payer_phone, transfer_reference and receipt_path are required",
        400
      );
    }
    if (!UUID_RE.test(order_id)) return json("Invalid order id", 400);
    if (!PHONE_RE.test(payer_phone)) return json("A valid payer phone is required", 400);
    if (transfer_reference.length < 4 || transfer_reference.length > 120) {
      return json("A valid transfer reference is required", 400);
    }

    // The object must be in the caller's own folder for this exact order.
    const expectedPrefix = `${user.id}/${order_id}/`;
    if (
      receipt_path.includes("\\") ||
      receipt_path.includes("..") ||
      !receipt_path.startsWith(expectedPrefix)
    ) {
      return json("Invalid receipt path", 403);
    }

    // Download through the user's own JWT so storage RLS is the first gate.
    const { data: file, error: downloadError } = await SupabaseClient.storage
      .from("payment-receipts")
      .download(receipt_path);

    if (downloadError || !file) {
      logger.warn(`[${logLabel}] receipt download failed:`, downloadError?.message);
      return json("Receipt image not found. Upload it again and retry.", 400);
    }

    if (typeof file.size === "number" && file.size > RECEIPT_MAX_BYTES) {
      await removeObject(SupabaseClient, receipt_path);
      return json("Receipt image is larger than 5 MB. Choose a smaller image.", 413);
    }

    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      logger.warn(`[${logLabel}] receipt could not be read`);
      return json("Receipt image could not be read. Upload it again and retry.", 400);
    }

    const validation = validateReceiptBytes(bytes);
    if (!validation.ok) {
      await removeObject(SupabaseClient, receipt_path);
      return json(validation.message, 415);
    }

    const { data: receipt, error } = await SupabaseClient.rpc(rpcName, {
      p_order_id: order_id,
      p_payer_phone: payer_phone,
      p_transfer_reference: transfer_reference,
      p_receipt_path: receipt_path,
    });

    if (error) {
      logger.warn(`[${logLabel}] submit rejected:`, error.message);
      return rpcErrorResponse(error, logLabel);
    }

    // `payment` is kept as an alias for older clients; it is a receipt row and
    // its status can only be pending (or a previous decision for idempotency).
    return Response.json({ success: true, receipt, payment: receipt }, { status: 201 });
  } catch (error) {
    return handleApiError(error, logLabel, "Failed to submit payment details");
  }
}

async function removeObject(client, path) {
  try {
    await client.storage.from("payment-receipts").remove([path]);
  } catch (error) {
    logger.warn("[Receipt] could not remove rejected upload:", error?.message);
  }
}


