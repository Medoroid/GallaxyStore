import { submitReceipt } from "../_lib/submit-receipt";

// POST - legacy Vodafone Cash submission retained for historical orders.
// New orders use /api/payments/external-wallet, but old order pages must keep
// working against the existing Vodafone Cash RPC and records.
export async function POST(request) {
  return submitReceipt(request, {
    rpcName: "submit_vodafone_cash_receipt",
    rateLimitKey: "vodafone-cash",
    logLabel: "Vodafone Cash",
  });
}
