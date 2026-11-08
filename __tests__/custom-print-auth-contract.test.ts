/**
 * @jest-environment node
 *
 * C3 contract tests — POST /api/custom-print:
 *   - rate limit still comes first (429, fail-closed)
 *   - an UNAUTHENTICATED request gets 401 before any input validation,
 *     never a misleading 400 about missing fields (the original defect)
 *   - an invalid/expired Bearer token also gets 401
 *   - an AUTHENTICATED request keeps the original validation order
 *     (content-type 400 -> field 400)
 *   - guests are never uploaded to storage (401 happens before any write)
 */

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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockServiceClient = {
  storage: { from: jest.fn(() => ({ upload: jest.fn(), remove: jest.fn() })) },
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({ single: jest.fn() })),
    })),
  })),
};
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => mockServiceClient,
}));

const mockAuthUser: { id: string | null } = { id: "user-123" };
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: mockAuthUser.id ? { id: mockAuthUser.id } : null },
      })),
    },
  })),
}));

import { POST } from "@/app/api/custom-print/route";

function emptyRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/custom-print", {
    method: "POST",
    headers,
  });
}

function multipartRequest(
  fields: Record<string, string> = {},
  headers: Record<string, string> = {}
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("http://localhost:3000/api/custom-print", {
    method: "POST",
    headers,
    body: form,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateAllowed.value = true;
  mockAuthUser.id = "user-123";
  delete process.env.SHIPPING_CALCULATE_WEIGHT;
});

describe("rate limiting stays first", () => {
  test("rejected request -> 429 even without auth", async () => {
    mockRateAllowed.value = false;

    const res = await POST(emptyRequest());

    expect(res.status).toBe(429);
  });
});

describe("C3 — authentication before validation", () => {
  test("unauthenticated empty POST -> 401 (not 400)", async () => {
    const res = await POST(emptyRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ success: false, code: "auth_required" });
    expect(body.message).toMatch(/sign in/i);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  test("unauthenticated request with multipart body -> still 401, never a field error", async () => {
    const res = await POST(multipartRequest({ customer_name: "Nour" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("auth_required");
    expect(body.message).not.toMatch(/email/i);
  });

  test("invalid/expired Bearer token -> 401", async () => {
    mockAuthUser.id = null; // getUser resolves with no user

    const res = await POST(emptyRequest({ Authorization: "Bearer expired-token" }));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("auth_required");
  });

  test("no storage upload or insert happens for unauthenticated requests", async () => {
    await POST(emptyRequest());

    expect(mockServiceClient.storage.from).not.toHaveBeenCalled();
    expect(mockServiceClient.from).not.toHaveBeenCalled();
  });
});

describe("authenticated requests keep the original validation order", () => {
  const AUTH = { Authorization: "Bearer valid-token" };

  test("wrong content-type -> 400", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/custom-print", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/multipart/i);
  });

  test("missing required fields -> 400 with the original messages", async () => {
    const res = await POST(multipartRequest({}, AUTH));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name is required/i);
  });

  test("invalid email -> 400", async () => {
    const res = await POST(
      multipartRequest({ customer_name: "Nour", customer_email: "not-an-email" }, AUTH)
    );

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/valid email/i);
  });
});
