import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  clearExternalWalletPaymentCapabilityCache,
  getExternalWalletPaymentCapability,
} from "@/lib/payment-capabilities";

function dbWithRpc(rpc: jest.Mock): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

const missing = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.test" },
};
const existsButRejected = {
  data: null,
  error: { code: "P0001", message: "Must be authenticated" },
};

describe("external wallet capability probe", () => {
  beforeEach(() => {
    clearExternalWalletPaymentCapabilityCache();
  });

  test("reports unavailable when both wallet RPCs are missing", async () => {
    const rpc = jest.fn().mockResolvedValue(missing);
    const result = await getExternalWalletPaymentCapability(dbWithRpc(rpc));

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/not enabled/i);
    expect(rpc).toHaveBeenCalledWith("initiate_external_wallet_payment", {
      p_order_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(rpc).toHaveBeenCalledWith(
      "submit_external_wallet_receipt",
      expect.objectContaining({
        p_order_id: "00000000-0000-0000-0000-000000000000",
      })
    );
  });

  test("treats an auth rejection as proof the function exists", async () => {
    const rpc = jest.fn().mockResolvedValue(existsButRejected);
    const result = await getExternalWalletPaymentCapability(dbWithRpc(rpc));

    expect(result).toEqual({ available: true, reason: null });
  });

  test("requires both the initiate and receipt RPCs", async () => {
    const rpc = jest.fn(async (name: string) =>
      name === "initiate_external_wallet_payment" ? existsButRejected : missing
    );
    const result = await getExternalWalletPaymentCapability(dbWithRpc(rpc));

    expect(result.available).toBe(false);
  });

  test("caches success briefly and can be cleared", async () => {
    const rpc = jest.fn().mockResolvedValue(existsButRejected);
    const db = dbWithRpc(rpc);

    expect((await getExternalWalletPaymentCapability(db)).available).toBe(true);
    rpc.mockResolvedValue(missing);
    expect((await getExternalWalletPaymentCapability(db)).available).toBe(true);

    clearExternalWalletPaymentCapabilityCache();
    expect((await getExternalWalletPaymentCapability(db)).available).toBe(false);
  });

  test("fails closed when the probe itself throws", async () => {
    const rpc = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await getExternalWalletPaymentCapability(dbWithRpc(rpc));

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/could not be verified/i);
  });
});
