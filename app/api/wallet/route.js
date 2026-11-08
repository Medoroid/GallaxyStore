import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST - Blocked. Paying from the internal wallet balance is not an approved
// payment method for new orders: checkout only accepts cash on delivery and a
// manual wallet transfer with an admin-reviewed receipt. The route is kept so
// old builds receive an explicit answer instead of a 404, and so no browser or
// direct API call can settle an order through a disabled provider. Historical
// wallet balances stay readable through GET.
export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json(
      { success: false, message: "Authorization required" },
      { status: 401 }
    );
  }

  logger.warn("[Wallet] blocked a wallet-balance payment attempt");

  return Response.json(
    {
      success: false,
      disabled: true,
      message:
        "Paying from the wallet balance is disabled. Choose cash on delivery or a manual wallet transfer with receipt verification.",
    },
    { status: 410 }
  );
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
