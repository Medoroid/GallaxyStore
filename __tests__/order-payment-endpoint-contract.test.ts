/**
 * @jest-environment node
 *
 * Server contract for POST /api/orders/[id]/payment — the repair path for an
 * order that was created but whose payment attempt never started:
 *   - only the owner of a pending order may resume the payment
 *   - card/Paymob providers stay rejected
 *   - external wallet is only offered when the private setting is complete
 *   - a zero-total order is completed as paid with no payment row
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockLoadWallet = jest.fn();
const mockCapability = jest.fn();
const mockServiceFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })),
        })),
      })),
    })),
  })),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockServiceFrom }),
}));

jest.mock("@/lib/payment-settings", () => {
  const actual = jest.requireActual<typeof import("@/lib/payment-settings")>(
    "@/lib/payment-settings"
  );
  return {
    ...actual,
    loadExternalWalletSettings: (...args: unknown[]) => mockLoadWallet(...args),
  };
});

jest.mock("@/lib/payment-capabilities", () => ({
  getExternalWalletPaymentCapability: (...args: unknown[]) => mockCapability(...args),
}));

import { POST } from "@/app/api/orders/[id]/payment/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

const ctx = { params: Promise.resolve({ id: ORDER_ID }) };

function request(method: string) {
  return new Request(`http://localhost/api/orders/${ORDER_ID}/payment`, {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ payment_method: method }),
  });
}

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "GS-2001",
    status: "pending",
    total: 150,
    currency: "EGP",
    user_id: "user-1",
    payment_method: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockMaybeSingle.mockResolvedValue({ data: pendingOrder(), error: null });
  mockLoadWallet.mockResolvedValue({ enabled: false });
  mockCapability.mockResolvedValue({ available: true, reason: null });
  mockServiceFrom.mockReset();
  mockRpc.mockResolvedValue({
    data: { id: "pay-1", provider: "cod", status: "pending", amount: 150 },
    error: null,
  });
});

describe("POST /api/orders/[id]/payment", () => {
  test("starts a COD payment for the owner's pending order", async () => {
    const res = await POST(request("cod"), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      free_order: false,
      payment_method: "cod",
      payment_status: "pending",
    });
    expect(mockRpc).toHaveBeenCalledWith("pay_with_cod", { p_order_id: ORDER_ID });
  });

  test("rejects a disabled card/Paymob provider", async () => {
    const res = await POST(request("stripe"), ctx);
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("returns 404 for an order the user does not own", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(request("cod"), ctx);
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("refuses an order that is not awaiting payment", async () => {
    mockMaybeSingle.mockResolvedValue({ data: pendingOrder({ status: "paid" }), error: null });
    const res = await POST(request("cod"), ctx);
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("does not offer external wallet when the private setting is disabled", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: false,
      provider_name: "Vodafone Cash",
      account_name: "Store",
      account_number: "",
      instructions: "",
    });
    const res = await POST(request("external_wallet"), ctx);
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects external wallet when the payment RPCs are missing", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: true,
      provider_name: "Vodafone Cash",
      account_name: "Store",
      account_number: "01012345678",
      instructions: "",
    });
    mockCapability.mockResolvedValue({
      available: false,
      reason: "Wallet payments are not enabled on this deployment.",
    });

    const res = await POST(request("external_wallet"), ctx);
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalledWith(
      "initiate_external_wallet_payment",
      expect.anything()
    );
  });

  test("starts an external-wallet payment only when configured", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: true,
      provider_name: "Vodafone Cash",
      account_name: "Store",
      account_number: "01012345678",
      instructions: "",
    });
    mockRpc.mockResolvedValue({
      data: { id: "pay-wallet", provider: "external_wallet", status: "pending", amount: 150 },
      error: null,
    });

    const res = await POST(request("external_wallet"), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.free_order).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith("initiate_external_wallet_payment", {
      p_order_id: ORDER_ID,
    });
  });

  test("completes a zero-total order as free without a payment row", async () => {
    mockMaybeSingle.mockResolvedValue({ data: pendingOrder({ total: 0 }), error: null });
    mockRpc.mockImplementation((name: string) => {
      if (name === "complete_zero_total_order") {
        return Promise.resolve({ data: { id: ORDER_ID, status: "paid" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request("cod"), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      free_order: true,
      payment_id: null,
      payment_status: "paid",
    });
    expect(mockRpc).toHaveBeenCalledWith("complete_zero_total_order", { p_order_id: ORDER_ID });
    expect(mockRpc).not.toHaveBeenCalledWith("pay_with_cod", expect.anything());
  });

  test("returns an idempotent success for an already-paid zero-total order", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: pendingOrder({ status: "paid", total: 0 }),
      error: null,
    });

    const res = await POST(request("cod"), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      free_order: true,
      payment_id: null,
      payment_status: "paid",
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  test("fails safely instead of using a service-role fallback when zero-total RPC is missing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: pendingOrder({ total: 0 }), error: null });
    mockRpc.mockImplementation((name: string) => {
      if (name === "complete_zero_total_order") {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request("cod"), ctx);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      order_id: ORDER_ID,
      order_number: "GS-2001",
    });
    expect(body.message).toMatch(/not enabled on this deployment/i);
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  test("reports a conflict instead of success when the payment RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("This order is already paid") });
    const res = await POST(request("cod"), ctx);
    expect(res.status).toBe(409);
  });

  test("requires authentication", async () => {
    const res = await POST(
      new Request(`http://localhost/api/orders/${ORDER_ID}/payment`, { method: "POST" }),
      ctx
    );
    expect(res.status).toBe(401);
  });
});
