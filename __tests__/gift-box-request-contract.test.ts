/**
 * @jest-environment node
 *
 * A2 contract tests — /api/gift-box:
 *   - auth FIRST (401 before any body/field validation)
 *   - input validation only after authentication (400s)
 *   - real persistence via the service role (no simulated success)
 *   - CHECK-constraint fallback ('other' + notes marker) while the prepared
 *     migration is not applied — feature keeps working either way
 *   - honest failure (never success:true) when persistence fails
 *   - rate limit rejection (429, fail-closed)
 */

const mockGetUser = jest.fn();
const mockInsert = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockRateAllowed = { value: true };
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: jest.fn(async () => ({
    allowed: (mockRateAllowed as { value: boolean }).value,
    remaining: 5,
    backend: "memory",
  })),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: (row: Record<string, unknown>) => {
        mockInsert(row);
        return {
          select: () => ({
            single: async () => mockInsertResult(),
          }),
        };
      },
    })),
  })),
}));

type InsertResult =
  | { data: Record<string, unknown> | null; error: { code?: string } | null }
  | undefined;
let insertResults: InsertResult[] = [];
let insertCall = 0;
function mockInsertResult(): NonNullable<InsertResult> {
  const next = insertResults[insertCall] ?? { data: null, error: { code: "XX000" } };
  insertCall += 1;
  return next;
}

import { POST } from "@/app/api/gift-box/route";

const VALID_BODY = {
  occasion: "birthday",
  budget: 75,
  message: "Mugs, prints and stickers in blue tones",
  name: "Nour Hassan",
  email: "nour@example.com",
};

function makeRequest(body?: unknown, authed = true): Request {
  return new Request("http://localhost:3000/api/gift-box", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authed ? { Authorization: "Bearer valid-token" } : {}),
    },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateAllowed.value = true;
  insertResults = [];
  insertCall = 0;
  mockGetUser.mockImplementation(async (token: string) =>
    token === "valid-token"
      ? { data: { user: { id: "user-111" } }, error: null }
      : { data: { user: null }, error: { message: "invalid token" } }
  );
});

describe("auth ordering (C3 rule applied to the gift-box API)", () => {
  test("guest gets 401 — before body validation", async () => {
    const res = await POST(makeRequest(undefined, false));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("garbage body without auth still returns 401 (auth precedes validation)", async () => {
    const req = new Request("http://localhost:3000/api/gift-box", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("invalid bearer token gets 401", async () => {
    const req = new Request("http://localhost:3000/api/gift-box", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer forged",
      },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("input validation (after auth)", () => {
  test("invalid JSON -> 400", async () => {
    const req = new Request("http://localhost:3000/api/gift-box", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test.each([
    ["missing name", { ...VALID_BODY, name: "  " }],
    ["bad email", { ...VALID_BODY, email: "not-an-email" }],
    ["unknown occasion", { ...VALID_BODY, occasion: "quinceanera" }],
    ["empty message", { ...VALID_BODY, message: "" }],
    ["negative budget", { ...VALID_BODY, budget: -5 }],
    ["absurd budget", { ...VALID_BODY, budget: 99_999_999 }],
  ])("%s -> 400 and no insert", async (_label, body) => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("persistence", () => {
  test("clean success uses product_type 'gift_box' and returns the request number", async () => {
    insertResults = [
      {
        data: { id: "req-1", request_number: "CP-2026-ABC12345", status: "new" },
        error: null,
      },
    ];
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.request.request_number).toBe("CP-2026-ABC12345");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.product_type).toBe("gift_box");
    expect(row.user_id).toBe("user-111");
    expect(String(row.notes)).toContain("[GIFT BOX REQUEST]");
    expect(String(row.notes)).toContain("Occasion: birthday");
    expect(row.status).toBe("new");
  });

  test("falls back to 'other' + marker when the CHECK rejects 'gift_box'", async () => {
    insertResults = [
      { data: null, error: { code: "23514" } },
      {
        data: { id: "req-2", request_number: "CP-2026-FALLBACK", status: "new" },
        error: null,
      },
    ];
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.request.request_number).toBe("CP-2026-FALLBACK");
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][0].product_type).toBe("gift_box");
    expect(mockInsert.mock.calls[1][0].product_type).toBe("other");
    expect(String(mockInsert.mock.calls[1][0].notes)).toContain("[GIFT BOX REQUEST]");
  });

  test("unexpected DB failure -> error response, NEVER success", async () => {
    insertResults = [
      { data: null, error: { code: "XX000" } },
      { data: null, error: { code: "42P01" } },
    ];
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBeGreaterThanOrEqual(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  test("optional budget may be omitted", async () => {
    insertResults = [
      {
        data: { id: "req-3", request_number: "CP-2026-NOBUDGET", status: "new" },
        error: null,
      },
    ];
    const withoutBudget = {
      occasion: VALID_BODY.occasion,
      message: VALID_BODY.message,
      name: VALID_BODY.name,
      email: VALID_BODY.email,
    };
    const res = await POST(makeRequest(withoutBudget));
    expect(res.status).toBe(201);
    const row = mockInsert.mock.calls[0][0];
    expect(String(row.notes)).not.toContain("Budget:");
  });
});

describe("rate limiting", () => {
  test("429 when the fail-closed limiter rejects", async () => {
    mockRateAllowed.value = false;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
