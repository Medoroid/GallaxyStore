/** @jest-environment node */

const mockGetUser = jest.fn();
const mockUserFrom = jest.fn();
const mockDbFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockUserFrom,
    rpc: mockRpc,
  })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockDbFrom }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST } from "@/app/api/checkout/preview/route";

const CART_ID = "22222222-2222-4222-8222-222222222222";
const METHOD_ID = "44444444-4444-4444-8444-444444444444";
const COUPON_ID = "55555555-5555-4555-8555-555555555555";

type Operation = "select" | "insert" | "update" | "delete";

function makeBuilder(
  table: string,
  handler: (context: {
    table: string;
    operation: Operation;
    payload: unknown;
    filters: Array<[string, unknown]>;
    terminal: "then" | "single" | "maybeSingle";
  }) => unknown
) {
  const state = {
    operation: "select" as Operation,
    payload: undefined as unknown,
    filters: [] as Array<[string, unknown]>,
  };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = () => builder;
  builder.insert = (payload: unknown) => {
    state.operation = "insert";
    state.payload = payload;
    return builder;
  };
  builder.update = (payload: unknown) => {
    state.operation = "update";
    state.payload = payload;
    return builder;
  };
  builder.delete = () => {
    state.operation = "delete";
    return builder;
  };
  for (const method of ["eq", "is", "in", "neq"]) {
    builder[method] = (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    };
  }
  builder.order = chain;
  builder.limit = chain;

  const resolve = (terminal: "then" | "single" | "maybeSingle") =>
    handler({ table, ...state, terminal });

  builder.single = () => Promise.resolve(resolve("single"));
  builder.maybeSingle = () => Promise.resolve(resolve("maybeSingle"));
  builder.then = (
    onResolve: (value: unknown) => unknown,
    onReject?: (reason: unknown) => unknown
  ) => Promise.resolve(resolve("then")).then(onResolve, onReject);

  return builder;
}

function fromWith(
  handler: (context: {
    table: string;
    operation: Operation;
    payload: unknown;
    filters: Array<[string, unknown]>;
    terminal: "then" | "single" | "maybeSingle";
  }) => unknown
) {
  return (table: string) => makeBuilder(table, handler);
}

function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/checkout/preview", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cart_id: CART_ID,
      country: "Egypt",
      shipping_address: {
        full_name: "Test Customer",
        phone: "01012345678",
        address: "1 Test Street",
        city: "Cairo",
        country: "Egypt",
      },
      ...body,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

  mockUserFrom.mockImplementation(
    fromWith(({ table }) => {
      if (table === "carts") {
        return {
          data: {
            id: CART_ID,
            owner_id: "user-1",
            status: "active",
            currency: "EGP",
            coupon_id: COUPON_ID,
            coupon_code: "SAVE10",
            discount_amount: 0,
          },
          error: null,
        };
      }
      if (table === "cart_items_detailed") {
        return {
          data: [
            {
              id: "cart-item-1",
              variant_id: "variant-1",
              quantity: 2,
              unit_price_snapshot: 100,
              current_price: 100,
              price_changed_since_added: false,
              available_stock: 10,
              product_name: "Galaxy Tee",
              color: null,
              size: null,
            },
          ],
          error: null,
        };
      }
      if (table === "cart_items") {
        return { data: [{ id: "cart-item-1", is_gift_wrapped: true }], error: null };
      }
      return { data: null, error: null };
    })
  );

  mockDbFrom.mockImplementation(
    fromWith(({ table }) => {
      if (table === "coupons") {
        return {
          data: {
            id: COUPON_ID,
            code: "SAVE10",
            type: "percentage",
            value: 10,
            min_order_amount: null,
            max_discount_amount: null,
            max_uses: null,
            max_uses_per_user: null,
            used_count: 0,
            starts_at: null,
            expires_at: null,
            is_active: true,
          },
          error: null,
        };
      }
      if (table === "orders") return { count: 0, error: null };
      return { data: null, error: null };
    })
  );

  mockRpc.mockImplementation((name: string) => {
    if (name === "calculate_tax") return Promise.resolve({ data: 0, error: null });
    if (name === "gift_wrap_fee") return Promise.resolve({ data: 4.99, error: null });
    if (name === "get_shipping_options") {
      return Promise.resolve({
        data: [
          {
            method_id: METHOD_ID,
            method_name: "Standard",
            method_type: "flat",
            carrier: "DHL",
            fee: 25,
            is_free: false,
            min_delivery_days: 2,
            max_delivery_days: 5,
          },
          {
            method_id: "66666666-6666-4666-8666-666666666666",
            method_name: "Free",
            method_type: "flat",
            carrier: null,
            fee: 0,
            is_free: true,
            min_delivery_days: 7,
            max_delivery_days: 10,
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("POST /api/checkout/preview", () => {
  test("derives totals, an uncapped coupon and the selected shipping fee on the server", async () => {
    const res = await POST(request({ shipping_method_id: METHOD_ID }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      cart_id: CART_ID,
      currency: "EGP",
      item_count: 2,
      subtotal: 200,
      discount: 20,
      tax: 0,
      shipping_fee: 25,
      gift_wrap_fee: 4.99,
      gift_wrap_item_count: 1,
      total: 209.99,
      selected_shipping_method_id: METHOD_ID,
    });
    expect(body.coupon).toMatchObject({ code: "SAVE10", valid: true, error: null });
    expect(body.items[0]).toMatchObject({ unit_price: 100, quantity: 2 });
    expect(body.price_changes).toEqual([]);
    expect(body.stock_issues).toEqual([]);
  });

  test("rejects a cart owned by another user before calculating anything", async () => {
    mockUserFrom.mockImplementation(
      fromWith(({ table }) => {
        if (table === "carts") {
          return {
            data: { id: CART_ID, owner_id: "someone-else", status: "active" },
            error: null,
          };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("fails closed instead of showing a zero shipping fee when shipping lookup fails", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "calculate_tax") return Promise.resolve({ data: 0, error: null });
      if (name === "gift_wrap_fee") return Promise.resolve({ data: 4.99, error: null });
      if (name === "get_shipping_options") {
        return Promise.resolve({ data: null, error: { message: "shipping down" } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = await POST(request({ shipping_method_id: METHOD_ID }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.message).toMatch(/shipping/i);
  });

  test("reports price and stock changes instead of hiding them", async () => {
    mockUserFrom.mockImplementation(
      fromWith(({ table }) => {
        if (table === "carts") {
          return {
            data: {
              id: CART_ID,
              owner_id: "user-1",
              status: "active",
              currency: "EGP",
              coupon_id: null,
              coupon_code: null,
              discount_amount: 0,
            },
            error: null,
          };
        }
        if (table === "cart_items_detailed") {
          return {
            data: [
              {
                id: "cart-item-1",
                variant_id: "variant-1",
                quantity: 3,
                unit_price_snapshot: 100,
                current_price: 120,
                price_changed_since_added: true,
                available_stock: 1,
                product_name: "Galaxy Tee",
                color: null,
                size: null,
              },
            ],
            error: null,
          };
        }
        if (table === "cart_items") return { data: [], error: null };
        return { data: null, error: null };
      })
    );

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.price_changes).toEqual([
      {
        cart_item_id: "cart-item-1",
        product_name: "Galaxy Tee",
        old_price: 100,
        new_price: 120,
      },
    ]);
    expect(body.stock_issues).toEqual([
      {
        cart_item_id: "cart-item-1",
        product_name: "Galaxy Tee",
        requested: 3,
        available: 1,
      },
    ]);
  });
});
