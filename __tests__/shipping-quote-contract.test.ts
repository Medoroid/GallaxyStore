/**
 * @jest-environment node
 *
 * B6 contract tests — GET /api/shipping (the checkout address-step quote):
 *   - missing country -> 400
 *   - flag OFF (default): weight stays 0 and NO weight lookup runs
 *     (legacy behaviour the pre-migration checkout() RPC accepts)
 *   - destination is ALWAYS normalised ("Egypt" -> "EG") so the quote uses
 *     the zone the customer actually lives in, not the default zone
 *   - flag ON + items: real weight resolved from the DB (variant weight,
 *     product fallback), passed as p_weight_grams
 *   - flag ON + structurally invalid `items` -> 400
 *   - flag ON + weight lookup failure -> honest 503 (never a weight-0 quote)
 *   - response shape unchanged for existing callers
 */

const mockRpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
const mockTableRows: Record<string, Array<Record<string, unknown>>> = {};
const mockTableErrors: Record<string, string> = {};

const mockClient = {
  rpc: jest.fn(async (name: string, params: Record<string, unknown>) => {
    mockRpcCalls.push({ name, params });
    if (name === "get_shipping_options") {
      return {
        data: [
          {
            method_id: "aaaaaaa1-0000-4000-8000-000000000001",
            method_name: "Standard",
            method_type: "standard",
            carrier: "Aramex",
            fee: 9.99,
            min_delivery_days: 3,
            max_delivery_days: 7,
            is_free: false,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  }),
  from: jest.fn((table: string) => ({
    select: () => ({
      in: () =>
        Promise.resolve({
          data: mockTableErrors[table] ? null : (mockTableRows[table] ?? []),
          error: mockTableErrors[table] ? { message: mockTableErrors[table] } : null,
        }),
    }),
  })),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockClient),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from "@/app/api/shipping/route";

const VARIANT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_A = "22222222-2222-4222-8222-222222222222";

function shippingRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost:3000/api/shipping");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url.toString(), { method: "GET" });
}

function lastShippingRpc(): Record<string, unknown> {
  const call = mockRpcCalls[mockRpcCalls.length - 1];
  if (!call || call.name !== "get_shipping_options") {
    throw new Error("get_shipping_options was not called");
  }
  return call.params;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpcCalls.length = 0;
  for (const key of Object.keys(mockTableRows)) delete mockTableRows[key];
  for (const key of Object.keys(mockTableErrors)) delete mockTableErrors[key];
  delete process.env.SHIPPING_CALCULATE_WEIGHT;
});

afterAll(() => {
  delete process.env.SHIPPING_CALCULATE_WEIGHT;
});

describe("input validation", () => {
  test("missing country -> 400, no RPC call", async () => {
    const res = await GET(shippingRequest({ subtotal: "75" }));

    expect(res.status).toBe(400);
    expect(mockRpcCalls).toHaveLength(0);
    expect(await res.json()).toMatchObject({ success: false });
  });
});

describe("flag OFF (default legacy behaviour)", () => {
  test("weight stays 0 and no DB lookup runs", async () => {
    const res = await GET(
      shippingRequest({ country: "Egypt", subtotal: "75", items: "[]" })
    );

    expect(res.status).toBe(200);
    expect(lastShippingRpc()).toEqual({
      p_country: "EG",
      p_order_subtotal: 75,
      p_weight_grams: 0,
    });
    expect(mockClient.from).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ success: true, options: expect.any(Array) });
  });

  test("explicitly disabled via env", async () => {
    process.env.SHIPPING_CALCULATE_WEIGHT = "false";

    await GET(shippingRequest({ country: "Kuwait", subtotal: "10" }));

    expect(lastShippingRpc()).toMatchObject({ p_country: "KW", p_weight_grams: 0 });
    expect(mockClient.from).not.toHaveBeenCalled();
  });
});

describe("destination normalisation (always applied)", () => {
  test.each([
    ["Egypt", "EG"],
    ["Saudi Arabia", "SA"],
    ["UAE", "AE"],
    ["eg", "EG"],
    ["Other", "Other"], // rest of world -> default zone inside the RPC
  ])("%s -> %s", async (input, expected) => {
    await GET(shippingRequest({ country: input, subtotal: "40" }));

    expect(lastShippingRpc()).toMatchObject({ p_country: expected });
  });
});

describe("flag ON (weight-aware quotes)", () => {
  beforeEach(() => {
    process.env.SHIPPING_CALCULATE_WEIGHT = "true";
  });

  test("resolves real weight from variant and product rows", async () => {
    mockTableRows.product_variants = [
      { id: VARIANT_A, weight_grams: 500, product_id: PRODUCT_A },
    ];
    mockTableRows.products = [{ id: PRODUCT_A, weight_grams: null }];

    const res = await GET(
      shippingRequest({
        country: "Egypt",
        subtotal: "80",
        items: JSON.stringify([{ variant_id: VARIANT_A, quantity: 3 }]),
      })
    );

    expect(res.status).toBe(200);
    expect(lastShippingRpc()).toEqual({
      p_country: "EG",
      p_order_subtotal: 80,
      p_weight_grams: 1500,
    });
  });

  test("NULL variant weight falls back to product weight", async () => {
    mockTableRows.product_variants = [
      { id: VARIANT_A, weight_grams: null, product_id: PRODUCT_A },
    ];
    mockTableRows.products = [{ id: PRODUCT_A, weight_grams: 900 }];

    await GET(
      shippingRequest({
        country: "Egypt",
        subtotal: "10",
        items: JSON.stringify([{ variant_id: VARIANT_A, quantity: 1 }]),
      })
    );

    expect(lastShippingRpc()).toMatchObject({ p_weight_grams: 900 });
  });

  test("missing items param keeps weight 0 (no lookup)", async () => {
    const res = await GET(shippingRequest({ country: "Egypt", subtotal: "10" }));

    expect(res.status).toBe(200);
    expect(lastShippingRpc()).toMatchObject({ p_weight_grams: 0 });
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  test("structurally invalid items -> 400", async () => {
    const res = await GET(
      shippingRequest({ country: "Egypt", subtotal: "10", items: "not json" })
    );

    expect(res.status).toBe(400);
    expect(mockRpcCalls).toHaveLength(0);
  });

  test("malformed entries are dropped, valid ones still weight", async () => {
    mockTableRows.product_variants = [
      { id: VARIANT_A, weight_grams: 200, product_id: PRODUCT_A },
    ];
    mockTableRows.products = [];

    const res = await GET(
      shippingRequest({
        country: "Egypt",
        subtotal: "10",
        items: JSON.stringify([
          { variant_id: "not-a-uuid", quantity: 50 },
          { variant_id: VARIANT_A, quantity: 2 },
        ]),
      })
    );

    expect(res.status).toBe(200);
    expect(lastShippingRpc()).toMatchObject({ p_weight_grams: 400 });
  });

  test("weight lookup failure -> honest 503, no weight-0 quote", async () => {
    mockTableErrors.product_variants = "permission denied";

    const res = await GET(
      shippingRequest({
        country: "Egypt",
        subtotal: "10",
        items: JSON.stringify([{ variant_id: VARIANT_A, quantity: 1 }]),
      })
    );

    expect(res.status).toBe(503);
    expect(mockRpcCalls).toHaveLength(0);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
