/**
 * @jest-environment node
 *
 * Contract for review voting/reporting:
 *   - the review must exist and cannot be the caller's own
 *   - an unchanged vote / an open report is rejected as a duplicate
 *   - invalid ids and reasons are rejected before any RPC call
 */

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 19, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/api-errors", () => ({
  handleApiError: (error: Error | null | undefined, _context: string, fallback: string) =>
    Response.json({ success: false, message: error?.message || fallback }, { status: 500 }),
}));

import { POST as vote } from "@/app/api/reviews/[id]/vote/route";
import { POST as report } from "@/app/api/reviews/[id]/report/route";

const REVIEW_ID = "33333333-3333-4333-8333-333333333333";

let reviewRow: Record<string, unknown> | null;
let existingVote: Record<string, unknown> | null;
let existingReport: Record<string, unknown> | null;

function query(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.in = self;
  api.maybeSingle = self;
  api.single = self;
  api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  reviewRow = { id: REVIEW_ID, user_id: "author-user", deleted_at: null };
  existingVote = null;
  existingReport = null;

  mockGetUser.mockResolvedValue({ data: { user: { id: "voter-user" } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "reviews") return query({ data: reviewRow, error: null });
    if (table === "review_votes") return query({ data: existingVote, error: null });
    if (table === "review_reports") return query({ data: existingReport, error: null });
    return query({ data: null, error: null });
  });
  mockRpc.mockResolvedValue({ data: { id: "row-1" }, error: null });
});

describe("review voting", () => {
  test("rejects a malformed review id before touching the database", async () => {
    const res = await vote(jsonRequest({ vote_type: "helpful" }), params("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("rejects an invalid vote type", async () => {
    const res = await vote(jsonRequest({ vote_type: "like" }), params(REVIEW_ID));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects a missing review", async () => {
    reviewRow = null;
    const res = await vote(jsonRequest({ vote_type: "helpful" }), params(REVIEW_ID));
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects voting on your own review", async () => {
    reviewRow = { id: REVIEW_ID, user_id: "voter-user", deleted_at: null };
    const res = await vote(jsonRequest({ vote_type: "helpful" }), params(REVIEW_ID));
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects an unchanged duplicate vote", async () => {
    existingVote = { id: "vote-1", vote_type: "helpful" };
    const res = await vote(jsonRequest({ vote_type: "helpful" }), params(REVIEW_ID));
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("records a new vote", async () => {
    const res = await vote(jsonRequest({ vote_type: "helpful" }), params(REVIEW_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("vote_review", {
      p_review_id: REVIEW_ID,
      p_vote_type: "helpful",
    });
  });
});

describe("review reporting", () => {
  test("rejects an unknown reason", async () => {
    const res = await report(jsonRequest({ reason: "because" }), params(REVIEW_ID));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects a missing review", async () => {
    reviewRow = null;
    const res = await report(jsonRequest({ reason: "spam" }), params(REVIEW_ID));
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects reporting your own review", async () => {
    reviewRow = { id: REVIEW_ID, user_id: "voter-user", deleted_at: null };
    const res = await report(jsonRequest({ reason: "spam" }), params(REVIEW_ID));
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects a duplicate open report", async () => {
    existingReport = { id: "report-1", status: "pending" };
    const res = await report(jsonRequest({ reason: "spam" }), params(REVIEW_ID));
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("submits a valid report", async () => {
    const res = await report(
      jsonRequest({ reason: "spam", details: "Duplicate advertising" }),
      params(REVIEW_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("report_review", {
      p_review_id: REVIEW_ID,
      p_reason: "spam",
      p_details: "Duplicate advertising",
    });
  });
});
