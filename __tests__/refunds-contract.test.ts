/**
 * @jest-environment node
 *
 * Contract tests for the admin refunds API. Finance transitions must run on the
 * service-role client (members of the public cannot forge a completed refund),
 * while request creation keeps the admin's JWT for the is_admin() check.
 */

const mockVerifyAdmin = jest.fn();
const mockUserRpc = jest.fn();
const mockServiceRpc = jest.fn();
const mockRefundList = jest.fn();
const mockFrom = jest.fn();
const mockChain: Record<string, jest.Mock> = {};

jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: () => mockVerifyAdmin(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ rpc: mockUserRpc })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockFrom, rpc: mockServiceRpc }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET, POST } from "@/app/api/admin/refunds/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const REFUND_ID = "22222222-2222-4222-8222-222222222222";
const RETURN_ID = "33333333-3333-4333-8333-333333333333";

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/refunds", {
    method: "POST",
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
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

  mockVerifyAdmin.mockResolvedValue({ user: { id: "admin-1" } });
  mockUserRpc.mockResolvedValue({ data: { id: "refund-1" }, error: null });
  mockServiceRpc.mockResolvedValue({ data: { id: "refund-1" }, error: null });

  for (const key of Object.keys(mockChain)) delete mockChain[key];
  mockChain.select = jest.fn(() => mockChain);
  mockChain.order = jest.fn(() => mockChain);
  mockChain.then = jest.fn((resolve) => resolve(mockRefundList()));
  mockFrom.mockReturnValue(mockChain);
  mockRefundList.mockResolvedValue({ data: [], error: null });
});

describe("Admin refunds contract", () => {
  test("rejects unauthenticated callers", async () => {
    mockVerifyAdmin.mockResolvedValue({ error: "Authorization required", status: 401 });
    const res = await POST(post({ action: "mark_completed", refund_id: REFUND_ID }));
    expect(res.status).toBe(401);
    expect(mockServiceRpc).not.toHaveBeenCalled();
  });

  test("creates a refund with the admin's own client", async () => {
    const res = await POST(
      post({
        action: "issue_refund",
        order_id: ORDER_ID,
        amount: 50,
        reason: "Damaged item",
      })
    );
    expect(res.status).toBe(200);
    expect(mockUserRpc).toHaveBeenCalledWith("issue_refund", {
      p_order_id: ORDER_ID,
      p_amount: 50,
      p_reason: "Damaged item",
      p_return_id: null,
      p_payment_id: null,
    });
    expect(mockServiceRpc).not.toHaveBeenCalled();
  });

  test("rejects a non-positive refund amount before touching the database", async () => {
    const res = await POST(
      post({
        action: "issue_refund",
        order_id: ORDER_ID,
        amount: 0,
        reason: "Damaged item",
      })
    );
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("completes a refund through the service-role client only", async () => {
    const res = await POST(
      post({
        action: "mark_completed",
        refund_id: REFUND_ID,
        payment_reference: "vodafone-123",
      })
    );
    expect(res.status).toBe(200);
    expect(mockServiceRpc).toHaveBeenCalledWith("mark_refund_completed", {
      p_refund_id: REFUND_ID,
      p_payment_reference: "vodafone-123",
    });
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("marks a refund failed through the service-role client", async () => {
    const res = await POST(
      post({
        action: "mark_failed",
        refund_id: REFUND_ID,
        reason: "Transfer rejected",
      })
    );
    expect(res.status).toBe(200);
    expect(mockServiceRpc).toHaveBeenCalledWith("mark_refund_failed", {
      p_refund_id: REFUND_ID,
      p_reason: "Transfer rejected",
    });
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("surfaces database errors as a 400 instead of a generic 500", async () => {
    mockServiceRpc.mockResolvedValue({
      data: null,
      error: new Error("Completing this refund would exceed the order total"),
    });
    const res = await POST(
      post({ action: "mark_completed", refund_id: REFUND_ID })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      message: expect.stringContaining("exceed the order total"),
    });
  });

  test("validates return status against the enum", async () => {
    const res = await POST(
      post({
        action: "update_return_status",
        return_id: RETURN_ID,
        new_status: "refunded",
      })
    );
    expect(res.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  test("updates a valid return status with the admin's client", async () => {
    const res = await POST(
      post({
        action: "update_return_status",
        return_id: RETURN_ID,
        new_status: "item_received",
        resolution_note: "Received in warehouse",
      })
    );
    expect(res.status).toBe(200);
    expect(mockUserRpc).toHaveBeenCalledWith("update_return_status", {
      p_return_id: RETURN_ID,
      p_new_status: "item_received",
      p_resolution_note: "Received in warehouse",
    });
  });

  test("lists refunds through the service-role client", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("refunds");
    expect(await res.json()).toEqual({ success: true, refunds: [] });
  });
});
