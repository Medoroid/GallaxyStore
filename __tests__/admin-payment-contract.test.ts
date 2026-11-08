/**
 * @jest-environment node
 *
 * Admin payment decisions are server-authoritative:
 *   - only an admin may call them
 *   - the server chooses the verification RPC from the stored provider
 *   - COD collection is a separate, explicit action
 *   - every successful decision is audited
 */

const mockVerifyAdmin = jest.fn();
const mockUserRpc = jest.fn();
const mockUserFrom = jest.fn();
const mockPaymentLookup = jest.fn();
const mockRecordAudit = jest.fn();
const mockServiceFrom = jest.fn();

jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: () => mockVerifyAdmin(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ rpc: mockUserRpc, from: mockUserFrom })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({
    from: mockServiceFrom,
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: { email: "customer@example.com" } },
        }),
      },
    },
  }),
}));

jest.mock("@/lib/admin-audit", () => ({
  recordAdminAudit: (...args: unknown[]) => mockRecordAudit(...args),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/email", () => ({
  sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
}));

import { PATCH } from "@/app/api/admin/orders/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/orders", {
    method: "PATCH",
    headers: {
      authorization: "Bearer admin-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockVerifyAdmin.mockResolvedValue({
    user: { id: "admin-1", email: "admin@example.com" },
  });

  const paymentChain: Record<
    "select" | "eq" | "order" | "limit" | "maybeSingle",
    jest.Mock
  > = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: mockPaymentLookup,
  };
  paymentChain.select.mockImplementation(() => paymentChain);
  paymentChain.eq.mockImplementation(() => paymentChain);
  paymentChain.order.mockImplementation(() => paymentChain);
  paymentChain.limit.mockImplementation(() => paymentChain);
  mockUserFrom.mockReturnValue(paymentChain);
  mockPaymentLookup.mockResolvedValue({
    data: { id: "pay-wallet", provider: "external_wallet", status: "pending" },
    error: null,
  });

  mockUserRpc.mockResolvedValue({
    data: {
      id: "receipt-1",
      payment_id: "pay-wallet",
      status: "approved",
      transfer_reference: "TRX-1",
    },
    error: null,
  });

  mockServiceFrom.mockImplementation((table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: ORDER_ID,
                order_number: "GS-1001",
                user_id: "user-1",
                total: 150,
                currency: "EGP",
                shipping_address_snapshot: { full_name: "Test Customer" },
              },
              error: null,
            }),
          }),
        }),
      };
    }
    return { insert: async () => ({ error: null }) };
  });
});

describe("PATCH /api/admin/orders payment decisions", () => {
  test("rejects non-admin callers before touching payment state", async () => {
    mockVerifyAdmin.mockResolvedValue({ error: "Admin access required", status: 403 });

    const res = await PATCH(request({ action: "verify_payment", order_id: ORDER_ID }));
    expect(res.status).toBe(403);
    expect(mockUserRpc).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  test("requires an explicit approve/reject decision", async () => {
    const res = await PATCH(request({ action: "verify_payment", order_id: ORDER_ID }));
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  test("routes an external-wallet approval to the generic RPC and audits it", async () => {
    const res = await PATCH(
      request({
        action: "verify_payment",
        order_id: ORDER_ID,
        approve: true,
        note: "Matched the transfer",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      order_id: ORDER_ID,
      provider: "external_wallet",
      status: "paid",
    });
    expect(mockUserRpc).toHaveBeenCalledWith("verify_external_wallet_payment", {
      p_order_id: ORDER_ID,
      p_approve: true,
      p_note: "Matched the transfer",
    });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order.payment_verified",
        entityId: ORDER_ID,
        details: expect.objectContaining({ provider: "external_wallet" }),
      })
    );
  });

  test("keeps the legacy Vodafone RPC for historical orders", async () => {
    mockPaymentLookup.mockResolvedValue({
      data: { id: "pay-vodafone", provider: "vodafone_cash", status: "pending" },
      error: null,
    });

    const res = await PATCH(
      request({
        action: "verify_payment",
        order_id: ORDER_ID,
        approve: false,
        note: "Reference does not match",
      })
    );

    expect(res.status).toBe(200);
    expect(mockUserRpc).toHaveBeenCalledWith("verify_vodafone_cash_payment", {
      p_order_id: ORDER_ID,
      p_approve: false,
      p_note: "Reference does not match",
    });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "order.payment_rejected" })
    );
  });

  test("records COD cash collection only through the explicit action", async () => {
    mockUserRpc.mockResolvedValue({
      data: { id: PAYMENT_ID, order_id: ORDER_ID, provider: "cod", status: "succeeded" },
      error: null,
    });

    const res = await PATCH(
      request({
        action: "mark_cod_collected",
        order_id: ORDER_ID,
        payment_id: PAYMENT_ID,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      order_id: ORDER_ID,
      payment_id: PAYMENT_ID,
      payment_status: "succeeded",
    });
    expect(mockUserRpc).toHaveBeenCalledWith("mark_cod_collected", {
      p_payment_id: PAYMENT_ID,
    });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "order.cod_collected" })
    );
  });

  test("requires a payment id before recording COD cash", async () => {
    const res = await PATCH(request({ action: "mark_cod_collected", order_id: ORDER_ID }));
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("does not verify a COD payment with the receipt flow", async () => {
    mockPaymentLookup.mockResolvedValue({
      data: { id: PAYMENT_ID, provider: "cod", status: "pending" },
      error: null,
    });

    const res = await PATCH(
      request({ action: "verify_payment", order_id: ORDER_ID, approve: true })
    );
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("rejects a card payment from the receipt flow", async () => {
    mockPaymentLookup.mockResolvedValue({
      data: { id: "pay-stripe", provider: "stripe", status: "pending" },
      error: null,
    });

    const res = await PATCH(
      request({ action: "verify_payment", order_id: ORDER_ID, approve: true })
    );
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("surfaces a duplicate decision as a safe 400 without auditing success", async () => {
    mockUserRpc.mockResolvedValue({
      data: null,
      error: new Error("Payment is already approved"),
    });

    const res = await PATCH(
      request({ action: "verify_payment", order_id: ORDER_ID, approve: true })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toMatch(/already approved/i);
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});
