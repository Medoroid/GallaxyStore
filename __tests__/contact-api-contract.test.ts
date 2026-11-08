/**
 * @jest-environment node
 *
 * B4 contract tests — /api/contact (real contact-form delivery):
 *   - rate limit rejection first (429, fail-closed)
 *   - input validation (400) before any delivery attempt
 *   - honest 503 when the store has no configured support email
 *   - honest 503 when RESEND_API_KEY is missing (never a fake success)
 *   - honest 502 when the provider rejects the message
 *   - 201/200 success only after the provider accepts, with reply_to set
 *   - no PII (name/email/body) is written to logs
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

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
};
jest.mock("@/lib/logger", () => ({ logger: mockLogger }));

const mockSettings = { support_email: "owner@galaxy.example" as string | null };
jest.mock("@/lib/storeSettings", () => ({
  getPublicStoreSettings: jest.fn(async () => ({ ...mockSettings })),
}));

const mockSendResult: { success: boolean } = { success: true };
const mockSendContactMessage = jest.fn(
  async (data: unknown): Promise<{ success: boolean }> => {
    void data; // signature mirror; delivery outcome controlled via mockSendResult
    return mockSendResult;
  }
);
jest.mock("@/lib/email", () => ({
  sendContactMessage: (data: unknown) => mockSendContactMessage(data),
}));

import { POST } from "@/app/api/contact/route";

const VALID_BODY = {
  name: "Nour Hassan",
  email: "nour@example.com",
  subject: "Order question",
  message: "Hi — when will my order ship?",
};

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  mockRateAllowed.value = true;
  mockSettings.support_email = "owner@galaxy.example";
  mockSendResult.success = true;
  process.env.RESEND_API_KEY = "re_test_key";
});

afterAll(() => {
  if (ORIGINAL_RESEND_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_RESEND_KEY;
});

describe("rate limiting (fail-closed)", () => {
  test("429 when the limiter rejects — no delivery attempted", async () => {
    mockRateAllowed.value = false;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect(mockSendContactMessage).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  test("invalid JSON -> 400", async () => {
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockSendContactMessage).not.toHaveBeenCalled();
  });

  test.each([
    ["missing name", { ...VALID_BODY, name: "  " }],
    ["bad email", { ...VALID_BODY, email: "not-an-email" }],
    ["empty subject", { ...VALID_BODY, subject: "" }],
    ["empty message", { ...VALID_BODY, message: "" }],
    ["oversized message", { ...VALID_BODY, message: "x".repeat(5001) }],
    ["oversized name", { ...VALID_BODY, name: "x".repeat(101) }],
  ])("%s -> 400 and no delivery", async (_label, body) => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(mockSendContactMessage).not.toHaveBeenCalled();
  });
});

describe("configuration honesty", () => {
  test("503 when no support_email is configured — never a fake success", async () => {
    mockSettings.support_email = null;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockSendContactMessage).not.toHaveBeenCalled();
  });

  test("503 when RESEND_API_KEY is missing — never a fake success", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockSendContactMessage).not.toHaveBeenCalled();
  });

  test("502 when the provider fails to accept the message", async () => {
    mockSendResult.success = false;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe("successful delivery", () => {
  test("200 only after the provider accepts; delivered to support_email with reply_to", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockSendContactMessage).toHaveBeenCalledTimes(1);
    const arg = mockSendContactMessage.mock.calls[0][0] as Record<string, string>;
    expect(arg.to).toBe("owner@galaxy.example");
    expect(arg.email).toBe("nour@example.com");
    expect(arg.name).toBe("Nour Hassan");
    expect(arg.subject).toBe("Order question");
    expect(arg.message).toBe("Hi — when will my order ship?");
  });

  test("logs contain lengths only — never the visitor's name, email or body", async () => {
    await POST(makeRequest(VALID_BODY));

    const infoCall = mockLogger.info.mock.calls.find(
      (call) => String(call[0]).includes("delivered")
    );
    expect(infoCall).toBeDefined();
    const serialized = JSON.stringify(infoCall);
    expect(serialized).not.toContain("Nour Hassan");
    expect(serialized).not.toContain("nour@example.com");
    expect(serialized).not.toContain("when will my order ship");
    expect(serialized).toContain("subjectLength");
    expect(serialized).toContain("messageLength");
  });
});
