import { submitReceipt } from "../_lib/submit-receipt";

// POST - authenticated customer submits an external-wallet transfer receipt.
// This route only creates a pending receipt; it never settles the payment.
export async function POST(request) {
  return submitReceipt(request, {
    rpcName: "submit_external_wallet_receipt",
    rateLimitKey: "external-wallet",
    logLabel: "External Wallet",
  });
}
