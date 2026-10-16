import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // receipts are private; link expires in 1h

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET - Short-lived signed URL for the customer's own transfer receipt.
// The bucket stays private: no public URLs, no service-role key, and RLS only
// lets the order owner (or an admin) read the payment row.
export async function GET(request, { params }) {
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
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return Response.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("payment");

    // RLS: an owner can only read payments of their own orders.
    let query = SupabaseClient
      .from("payments")
      .select(
        "id, order_id, provider, status, amount, provider_payment_id, created_at, raw_response"
      )
      .eq("order_id", id)
      .eq("provider", "vodafone_cash");

    if (paymentId) {
      query = query.eq("id", paymentId);
    }

    const { data: payments, error: paymentsError } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    if (paymentsError) {
      logger.warn("[Receipt GET] payments lookup failed:", paymentsError.message);
      return Response.json(
        { success: false, message: "Failed to load receipt" },
        { status: 500 }
      );
    }

    const payment = payments?.[0] ?? null;
    const receiptPath = payment?.raw_response?.receipt_path;

    if (!payment || !receiptPath) {
      return Response.json(
        { success: false, message: "No receipt has been submitted for this order" },
        { status: 404 }
      );
    }

    const { data, error } = await SupabaseClient.storage
      .from("payment-receipts")
      .createSignedUrl(receiptPath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      logger.warn("[Receipt GET] signed URL failed:", error?.message);
      return Response.json(
        {
          success: false,
          message:
            "Receipt storage is not available yet. Please contact support if this keeps happening.",
        },
        { status: 503 }
      );
    }

    return Response.json({
      success: true,
      url: data.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
      payment: {
        id: payment.id,
        provider: payment.provider,
        status: payment.status,
        amount: payment.amount,
        provider_payment_id: payment.provider_payment_id,
        uploaded_at: payment.raw_response?.uploaded_at ?? payment.created_at ?? null,
        payer_phone: payment.raw_response?.payer_phone ?? null,
        verify_note: payment.raw_response?.verify_note ?? null,
        rejected: payment.raw_response?.rejected === true,
      },
    });
  } catch (error) {
    logger.error("[Receipt GET Error]", error);
    return Response.json(
      { success: false, message: "Failed to load receipt" },
      { status: 500 }
    );
  }
}
