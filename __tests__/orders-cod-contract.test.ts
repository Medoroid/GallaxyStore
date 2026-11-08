/**
 * @jest-environment node
 *
 * Server contract for order creation/payment initiation:
 *   - the browser cannot choose a disabled provider
 *   - the server never trusts a client-supplied amount or owner
 *   - COD creates a pending payment (never `succeeded`)
 *   - external wallet is only offered when the private setting is complete
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockLoadWallet = jest.fn();
const mockCapability = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
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
  getServiceRoleClient: () => ({ from: jest.fn() }),
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

jest.mock("@/lib/email", () => ({
  sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/orders/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CART_ID = "22222222-2222-4222-8222-222222222222";

function query(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.is = self;
  api.in = self;
  api.order = self;
  api.limit = self;
  api.maybeSingle = async () => result;
  api.single = async () => result;
  api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

function request(paymentMethod: string = "cod") {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cart_id: CART_ID,
      shipping_address: {
        full_name: "Test Customer",
        email: "customer@example.com",
        phone: "01012345678",
        address: "1 Test Street",
        city: "Cairo",
        state: "Cairo",
        zip_code: "12345",
        country: "Egypt",
      },
      customer_note: null,
      // Deliberately hostile browser values; the server must ignore them.
      shipping_fee: 999,
      total: 1,
      user_id: "attacker",
      currency: "USD",
      payment_method: paymentMethod,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockLoadWallet.mockResolvedValue({ enabled: false });
  mockCapability.mockResolvedValue({ available: true, reason: null });

  const cartRow = {
    id: CART_ID,
    owner_id: "user-1",
    status: "active",
    coupon_code: null,
  };
  const cartItems = [
    {
      id: "cart-item-1",
      product_name: "Galaxy Tee",
      quantity: 1,
      unit_price_snapshot: 150,
      current_price: 150,
      price_changed_since_added: false,
      available_stock: 10,
    },
  ];

  mockFrom.mockImplementation((table: string) => {
    if (table === "carts") return query({ data: cartRow, error: null });
    if (table === "cart_items_detailed") return query({ data: cartItems, error: null });
    if (table === "cart_totals") return query({ data: { subtotal: 150 }, error: null });
    if (table === "order_items") return query({ data: [], error: null });
    return query({ data: null, error: null });
  });

  mockRpc.mockImplementation((name: string) => {
    if (name === "checkout") {
      return Promise.resolve({
        data: {
          id: ORDER_ID,
          order_number: "GS-1001",
          total: 150,
          currency: "EGP",
          status: "pending",
        },
        error: null,
      });
    }
    if (name === "pay_with_cod") {
      return Promise.resolve({
        data: { id: "pay-cod", provider: "cod", status: "pending", amount: 150 },
        error: null,
      });
    }
    if (name === "initiate_external_wallet_payment") {
      return Promise.resolve({
        data: { id: "pay-wallet", provider: "external_wallet", status: "pending", amount: 150 },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("POST /api/orders payment initiation", () => {
  test("creates a pending COD payment and ignores browser amounts", async () => {
    const res = await POST(request("cod"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      order_id: ORDER_ID,
      payment_method: "cod",
      payment_id: "pay-cod",
      payment_status: "pending",
    });
    expect(body.payment_status).not.toBe("succeeded");

    const checkoutCall = mockRpc.mock.calls.find(([name]) => name === "checkout");
    expect(checkoutCall?.[1]).toMatchObject({ p_shipping_fee: 0, p_cart_id: CART_ID });
    expect(checkoutCall?.[1]).not.toHaveProperty("user_id");
    expect(checkoutCall?.[1]).not.toHaveProperty("total");

    const paymentCall = mockRpc.mock.calls.find(([name]) => name === "pay_with_cod");
    expect(paymentCall?.[1]).toEqual({ p_order_id: ORDER_ID });
  });

  test("rejects disabled card/Paymob providers before creating an order", async () => {
    for (const method of ["stripe", "paymob", "wallet", "vodafone_cash", "bitcoin"]) {
      const res = await POST(request(method));
      expect(res.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalledWith("checkout", expect.anything());
  });

  test("does not offer external wallet when the private setting is disabled", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: false,
      provider_name: "Vodafone Cash",
      account_name: "Store",
      account_number: "",
      instructions: "",
    });

    const res = await POST(request("external_wallet"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalledWith("checkout", expect.anything());
  });

  test("rejects external wallet before creating an order when its RPCs are missing", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: true,
      provider_name: "Vodafone Cash",
      account_name: "Gallaxy Store",
      account_number: "01012345678",
      instructions: "",
    });
    mockCapability.mockResolvedValue({
      available: false,
      reason: "Wallet payments are not enabled on this deployment.",
    });

    const res = await POST(request("external_wallet"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not enabled/i);
    expect(mockRpc).not.toHaveBeenCalledWith("checkout", expect.anything());
  });

  test("creates a pending external-wallet payment when configured", async () => {
    mockLoadWallet.mockResolvedValue({
      enabled: true,
      provider_name: "Vodafone Cash",
      account_name: "Gallaxy Store",
      account_number: "01012345678",
      instructions: "",
    });

    const res = await POST(request("external_wallet"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      order_id: ORDER_ID,
      payment_method: "external_wallet",
      payment_id: "pay-wallet",
      payment_status: "pending",
    });
    expect(mockRpc).toHaveBeenCalledWith("initiate_external_wallet_payment", {
      p_order_id: ORDER_ID,
    });
    expect(body).not.toHaveProperty("client_secret");
  });

  test("returns the same payment id on an idempotent retry", async () => {
    const first = await (await POST(request("cod"))).json();
    const second = await (await POST(request("cod"))).json();

    expect(first.payment_id).toBe("pay-cod");
    expect(second.payment_id).toBe("pay-cod");
    expect(mockRpc.mock.calls.filter(([name]) => name === "pay_with_cod")).toHaveLength(2);
  });

  test("does not claim success when the payment RPC fails", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_shipping_options") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "checkout") {
        return Promise.resolve({
          data: { id: ORDER_ID, order_number: "GS-1001", total: 150, currency: "EGP" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error("payment insert failed") });
    });

    const res = await POST(request("cod"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, order_id: ORDER_ID });
    expect(body).not.toHaveProperty("payment_status");
  });

  test("completes a fully discounted (zero-total) order without a payment row", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "checkout") {
        return Promise.resolve({
          data: { id: ORDER_ID, order_number: "GS-1002", total: 0, currency: "EGP", status: "pending" },
          error: null,
        });
      }
      if (name === "complete_zero_total_order") {
        return Promise.resolve({ data: { id: ORDER_ID, status: "paid" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request("cod"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      order_id: ORDER_ID,
      free_order: true,
      payment_id: null,
      payment_status: "paid",
    });
    expect(mockRpc).toHaveBeenCalledWith("complete_zero_total_order", { p_order_id: ORDER_ID });
    expect(mockRpc).not.toHaveBeenCalledWith("pay_with_cod", expect.anything());
    expect(mockRpc).not.toHaveBeenCalledWith(
      "initiate_external_wallet_payment",
      expect.anything()
    );
  });

  test("does not claim the free order completed when the RPC fails", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_shipping_options") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "checkout") {
        return Promise.resolve({
          data: { id: ORDER_ID, order_number: "GS-1003", total: 0, currency: "EGP" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: new Error("not authenticated") });
    });

    const res = await POST(request("cod"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, order_id: ORDER_ID });
    expect(body).not.toHaveProperty("payment_status");
  });
});
