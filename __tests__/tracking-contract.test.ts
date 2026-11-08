/**
 * @jest-environment node
 *
 * Contract tests for order tracking. Tracking must require both an order
 * reference and the account email, and must not reveal whether an order exists
 * when the email does not match.
 */

const mockMaybeSingle = jest.fn();
const mockGetUserById = jest.fn();
const mockItemsEq = jest.fn();
const mockCheckRateLimit = jest.fn();

const orderChain = {
  select: jest.fn(),
  is: jest.fn(),
  limit: jest.fn(),
  eq: jest.fn(),
  maybeSingle: mockMaybeSingle,
};
orderChain.select.mockReturnValue(orderChain);
orderChain.is.mockReturnValue(orderChain);
orderChain.limit.mockReturnValue(orderChain);
orderChain.eq.mockReturnValue(orderChain);

const itemsChain = {
  select: jest.fn(),
  eq: mockItemsEq,
};
itemsChain.select.mockReturnValue(itemsChain);

const mockDb = {
  from: jest.fn((table: string) =>
    table === "orders" ? orderChain : itemsChain
  ),
  auth: { admin: { getUserById: mockGetUserById } },
};

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => mockDb,
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string, options?: unknown) => mockCheckRateLimit(key, options),
  checkRateLimitAsync: async (key: string, options?: unknown) => ({
    ...mockCheckRateLimit(key, options),
    backend: "memory",
  }),
  getClientIp: (request: Request) =>
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from "@/app/api/orders/track/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

const order = {
  id: ORDER_ID,
  order_number: "GS-1001",
  user_id: "user-1",
  status: "shipped",
  subtotal: 100,
  tax: 0,
  shipping_fee: 20,
  discount_amount: 0,
  total: 120,
  currency: "EGP",
  shipping_address_snapshot: { full_name: "Sara" },
  placed_at: "2026-10-01T10:00:00Z",
  created_at: "2026-10-01T10:00:00Z",
};

function request(query: string) {
  return new Request(`http://localhost/api/orders/track?${query}`, {
    headers: { "x-forwarded-for": "203.0.113.5" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  orderChain.eq.mockReturnValue(orderChain);
  mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 5 });
  mockMaybeSingle.mockResolvedValue({ data: order, error: null });
  mockGetUserById.mockResolvedValue({
    data: { user: { email: "Customer@Example.com" } },
    error: null,
  });
  mockItemsEq.mockResolvedValue({
    data: [
      {
        product_name_snapshot: "Mug",
        sku_snapshot: "MUG-1",
        quantity: 2,
        unit_price_snapshot: 50,
        line_total: 100,
        status: "shipped",
      },
    ],
    error: null,
  });
});

describe("Order tracking contract", () => {
  test("requires both order reference and email", async () => {
    const res = await GET(request("order_number=GS-1001"));
    expect(res.status).toBe(400);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  test("rejects malformed emails", async () => {
    const res = await GET(request("order_number=GS-1001&email=not-an-email"));
    expect(res.status).toBe(400);
  });

  test("returns 429 when the rate limit is exhausted", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0 });
    const res = await GET(
      request("order_number=GS-1001&email=customer@example.com")
    );
    expect(res.status).toBe(429);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  test("returns a generic 404 for a guessed order number", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(
      request("order_number=GS-9999&email=customer@example.com")
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      message: "Order not found",
    });
  });

  test("returns the same generic 404 when the email does not match", async () => {
    const res = await GET(
      request(`order_id=${ORDER_ID}&email=attacker@example.com`)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      message: "Order not found",
    });
    expect(mockItemsEq).not.toHaveBeenCalled();
  });

  test("returns the order and items for the matching email", async () => {
    const res = await GET(
      request(`order_id=${ORDER_ID}&email=customer@example.com`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.id).toBe(ORDER_ID);
    expect(body.order.items).toHaveLength(1);
    expect(body.order.items[0].product_name_snapshot).toBe("Mug");
    expect(mockCheckRateLimit).toHaveBeenCalledWith("track:203.0.113.5", {
      windowMs: 600000,
      maxRequests: 10,
      failureMode: "fail_closed",
    });
    expect(mockItemsEq).toHaveBeenCalledWith("order_id", ORDER_ID);
  });
});
