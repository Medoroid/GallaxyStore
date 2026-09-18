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

// POST - Pay with wallet
export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(`wallet:${ip}`);

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

    const { order_id, amount } = await request.json();

    if (!order_id) {
      return Response.json(
        { success: false, message: "order_id is required" },
        { status: 400 }
      );
    }

    // Use the pay_with_wallet RPC which handles ownership, balance validation, atomic deduction
    const { data: payment, error: payError } = await SupabaseClient
      .rpc("pay_with_wallet", {
        p_order_id: order_id,
        p_amount: amount || null,
      });

    if (payError) {
      logger.error("[Wallet Payment Error]", payError);
      return Response.json(
        { success: false, message: payError.message || "Payment failed" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, payment });
  } catch (error) {
    return handleApiError(error, "Wallet Payment POST", "Payment failed");
  }
}

// GET - Get wallet balance
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

    const { data: wallet, error } = await SupabaseClient
      .from("wallets")
      .select("id, balance, currency")
      .eq("user_id", user.id)
      .single();

    if (error || !wallet) {
      return Response.json({ success: true, wallet: null });
    }

    return Response.json({ success: true, wallet });
  } catch (error) {
    return handleApiError(error, "Wallet GET", "Failed to fetch wallet");
  }
}
