/**
 * @jest-environment node
 *
 * Server-side shipping contract:
 *   - a shipping method must exist in get_shipping_options for the address
 *   - the fee sent to checkout comes from shipping_rates, not the browser
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: jest.fn() }),
}));

jest.mock("@/lib/email", () => ({
  sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/orders/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CART_ID = "22222222-2222-4222-8222-222222222222";
const METHOD_ID = "44444444-4444-4444-8444-444444444444";

function query(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.maybeSingle = self;
  api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

function request(shippingMethodId: string) {
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
        country: "Egypt",
      },
      shipping_method_id: shippingMethodId,
      // The browser must not be able to choose the fee.
      shipping_fee: 0,
      payment_method: "cod",
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "carts") {
      return query({
        data: { id: CART_ID, owner_id: "user-1", status: "active", coupon_code: null },
        error: null,
      });
    }
    if (table === "cart_items_detailed") {
      return query({
        data: [
          {
            id: "cart-item-1",
            product_name: "Galaxy Tee",
            quantity: 1,
            unit_price_snapshot: 100,
            current_price: 100,
            price_changed_since_added: false,
            available_stock: 10,
          },
        ],
        error: null,
      });
    }
    if (table === "cart_totals") return query({ data: { subtotal: 100 }, error: null });
    if (table === "order_items") return query({ data: [], error: null });
    return query({ data: null, error: null });
  });

  mockRpc.mockImplementation((name: string) => {
    if (name === "get_shipping_options") {
      return Promise.resolve({
        data: [{ method_id: METHOD_ID, name: "Standard", fee: 25 }],
        error: null,
      });
    }
    if (name === "checkout") {
      return Promise.resolve({
        data: { id: ORDER_ID, order_number: "GS-2001", total: 125, currency: "EGP" },
        error: null,
      });
    }
    if (name === "pay_with_cod") {
      return Promise.resolve({ data: { id: "pay-1", status: "pending" }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("POST /api/orders shipping", () => {
  test("rejects a shipping method that is not available for the address", async () => {
    const res = await POST(request("55555555-5555-4555-8555-555555555555"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalledWith("checkout", expect.anything());
  });

  test("uses the fee from shipping_rates instead of the request body", async () => {
    const res = await POST(request(METHOD_ID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);

    const checkoutCall = mockRpc.mock.calls.find(([name]) => name === "checkout");
    expect(checkoutCall?.[1]).toMatchObject({
      p_cart_id: CART_ID,
      p_shipping_fee: 25,
    });
  });

  test("does not start payment when the shipping method cannot be saved", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_shipping_options") {
        return Promise.resolve({
          data: [{ method_id: METHOD_ID, name: "Standard", fee: 25 }],
          error: null,
        });
      }
      if (name === "checkout") {
        return Promise.resolve({
          data: { id: ORDER_ID, order_number: "GS-2003", total: 125, currency: "EGP" },
          error: null,
        });
      }
      if (name === "set_order_shipping_method") {
        return Promise.resolve({ data: null, error: { message: "write failed" } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request(METHOD_ID));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, order_id: ORDER_ID });
    expect(mockRpc).not.toHaveBeenCalledWith("pay_with_cod", expect.anything());
  });

  test("does not create a payment for a zero-total order", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_shipping_options") {
        return Promise.resolve({
          data: [{ method_id: METHOD_ID, name: "Free", fee: 0 }],
          error: null,
        });
      }
      if (name === "checkout") {
        return Promise.resolve({
          data: { id: ORDER_ID, order_number: "GS-2002", total: 0, currency: "EGP" },
          error: null,
        });
      }
      if (name === "complete_zero_total_order") {
        return Promise.resolve({ data: { id: ORDER_ID, status: "paid" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request(METHOD_ID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ success: true, free_order: true, payment_status: "paid" });
    expect(mockRpc).not.toHaveBeenCalledWith("pay_with_cod", expect.anything());
  });
});
