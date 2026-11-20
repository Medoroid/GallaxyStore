/**
 * @jest-environment node
 *
 * Contract for /api/vendor/payout.
 *
 *   - the store is derived from the authenticated user, so a vendor cannot
 *     withdraw from (or probe) another store by passing a store_id
 *   - a non-positive amount is rejected before the RPC is reached
 *   - GET returns the vendor's requests and a withdrawable summary that mirrors
 *     request_vendor_payout()'s own balance check
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

jest.mock("@/lib/api-errors", () => ({
  handleApiError: (error: Error | null | undefined, _context: string, fallback: string) =>
    Response.json(
      { success: false, message: error?.message || fallback },
      { status: 500 }
    ),
}));

import { GET, POST } from "@/app/api/vendor/payout/route";

// A thenable query builder: every chained call returns itself and awaiting it
// resolves to the canned result.
function query(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.order = self;
  api.single = self;
  api.maybeSingle = self;
  api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/vendor/payout", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new Request("http://localhost/api/vendor/payout", {
    method: "GET",
    headers: { Authorization: "Bearer token" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("POST /api/vendor/payout", () => {
  test("derives the store from the session and ignores a client-supplied store_id", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "stores") return query({ data: { id: "owned-store" }, error: null });
      return query({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: { id: "payout-1" }, error: null });

    const res = await POST(
      postRequest({ amount: 25, store_id: "someone-elses-store" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("request_vendor_payout", {
      p_store_id: "owned-store",
      p_amount: 25,
      p_method: "bank_transfer",
    });
  });

  test("forwards a valid payout method to the RPC", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "stores") return query({ data: { id: "owned-store" }, error: null });
      return query({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: { id: "payout-2" }, error: null });

    const res = await POST(postRequest({ amount: 10, method: "paypal" }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("request_vendor_payout", {
      p_store_id: "owned-store",
      p_amount: 10,
      p_method: "paypal",
    });
  });

  test("rejects an unknown payout method without calling the RPC", async () => {
    const res = await POST(postRequest({ amount: 10, method: "cash_carrier_pigeon" }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects a non-positive amount before calling the RPC", async () => {
    const res = await POST(postRequest({ amount: 0 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/vendor/payout", () => {
  test("returns requests plus a withdrawable summary", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "stores") return query({ data: { id: "owned-store" }, error: null });
      if (table === "vendor_payout_requests") {
        return query({
          data: [
            {
              id: "payout-1",
              requested_amount: 50,
              status: "pending",
              created_at: "2026-10-01T00:00:00Z",
            },
          ],
          error: null,
        });
      }
      if (table === "vendor_earnings") {
        return query({
          data: [
            { net_amount: 80, status: "available" },
            { net_amount: 20, status: "available" },
            { net_amount: 10, status: "paid" },
          ],
          error: null,
        });
      }
      return query({ data: null, error: null });
    });

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.payouts).toHaveLength(1);
    // 100 available - 50 already pending.
    expect(body.summary.available_balance).toBe(100);
    expect(body.summary.withdrawable_balance).toBe(50);
    expect(body.summary.pending_amount).toBe(50);
  });
});
