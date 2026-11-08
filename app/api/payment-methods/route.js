import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import {
  loadExternalWalletSettings,
  publicExternalWalletSettings,
} from "@/lib/payment-settings";
import { getExternalWalletPaymentCapability } from "@/lib/payment-capabilities";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET - authenticated payment methods and the display-only wallet details.
// The private store setting is read on the server; only the account fields a
// customer needs to make the transfer are returned.
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const {
      data: { user },
      error: authError,
    } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    let externalWallet = publicExternalWalletSettings(null);
    const db = getServiceRoleClient();

    try {
      const settings = await loadExternalWalletSettings(db);
      externalWallet = publicExternalWalletSettings(settings);
    } catch (settingsError) {
      // COD must keep working even if the private settings row is unavailable.
      logger.warn("[Payment Methods] wallet settings unavailable:", settingsError.message);
    }

    // Settings and database functions are deployed separately. Do not advertise
    // a wallet option the checkout RPC cannot actually start.
    if (externalWallet.enabled) {
      const capability = await getExternalWalletPaymentCapability(db);
      if (!capability.available) {
        externalWallet = {
          ...externalWallet,
          enabled: false,
          availability_message: capability.reason,
        };
      }
    }

    return Response.json(
      {
        success: true,
        cod: {
          enabled: true,
          provider_name: "Cash on Delivery",
          instructions: "Pay in cash when your order arrives.",
        },
        external_wallet: externalWallet,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error, "Payment Methods GET", "Failed to load payment methods");
  }
}
