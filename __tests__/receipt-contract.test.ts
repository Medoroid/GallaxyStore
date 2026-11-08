/**
 * @jest-environment node
 *
 * Contract tests for private payment receipts. The bucket must never expose a
 * public URL: customers receive a short-lived signed URL for their own order,
 * resolved through RLS with their own JWT.
 */

const mockGetUser = jest.fn();
const mockListPayments = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockChain: Record<string, jest.Mock> = {};
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: {
      from: () => ({ createSignedUrl: mockCreateSignedUrl }),
    },
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from "@/app/api/orders/[id]/receipt/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function request(url = `http://localhost/api/orders/${ORDER_ID}/receipt`) {
  return new Request(url, {
    headers: { authorization: "Bearer user-token" },
  });
}

function params(id: string | null = ORDER_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  // Rebuild the fluent query chain used by the route.
  for (const key of Object.keys(mockChain)) delete mockChain[key];
  mockChain.select = jest.fn(() => mockChain);
  mockChain.eq = jest.fn(() => mockChain);
  mockChain.order = jest.fn(() => mockChain);
  mockChain.limit = jest.fn(() => mockListPayments());

  mockFrom.mockReturnValue(mockChain);
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockListPayments.mockResolvedValue({
    data: [
      {
        id: "pay-1",
        order_id: ORDER_ID,
        provider: "vodafone_cash",
        status: "pending",
        amount: 120,
        provider_payment_id: "vodafone-ref",
        created_at: "2026-10-01T10:00:00Z",
        raw_response: {
          receipt_path: "user-1/receipt.jpg",
          payer_phone: "01000000000",
          uploaded_at: "2026-10-01T10:01:00Z",
        },
      },
    ],
    error: null,
  });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://test.supabase.co/storage/v1/signed/receipt?token=x" },
    error: null,
  });
});

describe("Payment receipt contract", () => {
  test("requires authentication", async () => {
    const res = await GET(new Request(`http://localhost/api/orders/${ORDER_ID}/receipt`), params());
    expect(res.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("rejects an invalid token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("bad jwt") });
    const res = await GET(request(), params());
    expect(res.status).toBe(401);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  test("requires an order id", async () => {
    const res = await GET(request(), params(""));
    expect(res.status).toBe(400);
  });

  test("scopes the payment lookup to the order without a provider filter", async () => {
    await GET(request(), params());
    expect(mockFrom).toHaveBeenCalledWith("payments");
    expect(mockChain.eq).toHaveBeenCalledWith("order_id", ORDER_ID);
    // Historical Vodafone and external-wallet receipts share this endpoint.
    expect(mockChain.eq).not.toHaveBeenCalledWith("provider", "vodafone_cash");
  });

  test("can target a specific payment attempt", async () => {
    await GET(
      request(`http://localhost/api/orders/${ORDER_ID}/receipt?payment=pay-2`),
      params()
    );
    expect(mockChain.eq).toHaveBeenCalledWith("id", "pay-2");
  });

  test("returns a receipt for an external-wallet payment too", async () => {
    mockListPayments.mockResolvedValue({
      data: [
        {
          id: "pay-wallet",
          order_id: ORDER_ID,
          provider: "external_wallet",
          status: "pending",
          amount: 120,
          provider_payment_id: null,
          created_at: "2026-10-02T10:00:00Z",
          raw_response: { receipt_path: "user-1/receipt-wallet.jpg" },
        },
      ],
      error: null,
    });

    const res = await GET(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payment.provider).toBe("external_wallet");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user-1/receipt-wallet.jpg", 3600);
  });

  test("returns 404 when no receipt was submitted", async () => {
    mockListPayments.mockResolvedValue({ data: [], error: null });
    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  test("returns 503 when a signed URL cannot be created", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error("storage down") });
    const res = await GET(request(), params());
    expect(res.status).toBe(503);
  });

  test("returns a one-hour signed URL and safe payment metadata", async () => {
    const res = await GET(request(), params());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.expires_in).toBe(3600);
    expect(body.url).toContain("token=x");
    expect(body.payment).toMatchObject({
      id: "pay-1",
      provider: "vodafone_cash",
      amount: 120,
    });

    // The private object path must not leak to the client.
    expect(JSON.stringify(body)).not.toContain("user-1/receipt.jpg");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user-1/receipt.jpg", 3600);
  });
});
