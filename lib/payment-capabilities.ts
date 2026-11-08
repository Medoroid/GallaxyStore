import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRpcError } from "@/lib/supabase/rpc-errors";
import { logger } from "@/lib/logger";

/**
 * Detects whether the external-wallet payment RPCs exist in the connected
 * database. Migrations are applied separately from the application, so a
 * deployment can briefly expose wallet settings while the RPCs are missing.
 *
 * The probe calls each RPC with a nil order id. Both functions check
 * `auth.uid()` before touching any row, so a service-role call fails with
 * "Must be authenticated" when the function exists and with PGRST202 when it
 * does not. Nothing is written either way.
 */

export type PaymentCapability = {
  available: boolean;
  reason: string | null;
};

const CACHE_TTL_MS = 60_000;
const FAILURE_TTL_MS = 15_000;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

let cached: { expiresAt: number; value: PaymentCapability } | null = null;
let inFlight: Promise<PaymentCapability> | null = null;

async function rpcExists(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>
): Promise<boolean> {
  const { error } = await db.rpc(name, args);
  if (!error) return true;
  if (isMissingRpcError(error)) return false;
  // Any other error means PostgREST resolved the function and the function
  // rejected the probe (for example "Must be authenticated").
  return true;
}

export async function getExternalWalletPaymentCapability(
  db: SupabaseClient
): Promise<PaymentCapability> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [initiateExists, receiptExists] = await Promise.all([
        rpcExists(db, "initiate_external_wallet_payment", { p_order_id: NIL_UUID }),
        rpcExists(db, "submit_external_wallet_receipt", {
          p_order_id: NIL_UUID,
          p_payer_phone: "000000",
          p_transfer_reference: "PROBE",
          p_receipt_path: "probe",
        }),
      ]);

      const available = initiateExists && receiptExists;
      const value: PaymentCapability = {
        available,
        reason: available
          ? null
          : "Wallet transfers are not enabled on this deployment yet. Choose cash on delivery.",
      };
      cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    } catch (error) {
      logger.warn("[payment-capabilities] external wallet probe failed", error);
      const value: PaymentCapability = {
        available: false,
        reason:
          "Wallet transfer availability could not be verified. Choose cash on delivery or try again later.",
      };
      cached = { expiresAt: Date.now() + FAILURE_TTL_MS, value };
      return value;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function clearExternalWalletPaymentCapabilityCache() {
  cached = null;
  inFlight = null;
}
