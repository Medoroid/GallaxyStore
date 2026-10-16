import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST - customer submits Vodafone Cash transfer details + receipt
export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`vodafone-cash:${ip}`);

  if (!allowed) {
    return Response.json(
      { success: false, message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

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

    const { order_id, payer_phone, transfer_reference, receipt_path } = await request.json();

    if (!order_id || !payer_phone || !transfer_reference || !receipt_path) {
      return Response.json(
        {
          success: false,
          message: "order_id, payer_phone, transfer_reference and receipt_path are required",
        },
        { status: 400 }
      );
    }

    // The receipt must live in the caller's own folder inside the bucket.
    if (typeof receipt_path !== "string" || !receipt_path.startsWith(`${user.id}/`)) {
      return Response.json(
        { success: false, message: "Invalid receipt path" },
        { status: 403 }
      );
    }

    const { data: payment, error } = await SupabaseClient
      .rpc("submit_vodafone_cash_receipt", {
        p_order_id: order_id,
        p_payer_phone: payer_phone,
        p_transfer_reference: transfer_reference,
        p_receipt_path: receipt_path,
      });

    if (error) {
      logger.warn("[Vodafone Cash] submit rejected:", error.message);
      return Response.json(
        { success: false, message: error.message || "Failed to submit payment details" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, payment });
  } catch (error) {
    return handleApiError(error, "Vodafone Cash POST", "Failed to submit payment details");
  }
}
