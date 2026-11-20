/**
 * @jest-environment node
 *
 * Google sign-in contracts:
 *   - the provider probe reports disabled honestly (never a false green)
 *   - the probe sends the anon apikey GoTrue requires
 *   - failure / rate limiting degrade to `enabled:true` so sign-in stays usable
 *   - no credential value is ever included in the probe response
 */

const mockWarn = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: mockWarn, error: jest.fn() },
}));

jest.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "127.0.0.1",
  checkRateLimitAsync: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockRateLimit = jest.fn(async (...args: unknown[]) => {
  void args;
  return { allowed: true, remaining: 29 };
});

import { GET } from "@/app/api/auth/google-status/route";

const REQUEST = new Request("http://localhost:3000/api/auth/google-status");

type FetchInit = { headers?: Record<string, string> };
type MockResponse = { status: number; body: string; headers?: Record<string, string> };

function makeFetch(responses: MockResponse[]) {
  let index = 0;
  const fn = jest.fn(async (_url: string, _init?: FetchInit) => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      status: response.status,
      text: async () => response.body,
      headers: {
        get: (name: string) => response.headers?.[name.toLowerCase()] ?? null,
      },
    };
  });
  (globalThis as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetch(status: number, body: string, headers?: Record<string, string>) {
  return makeFetch([{ status, body, headers }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimit.mockImplementation(async () => ({ allowed: true, remaining: 29 }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
});

describe("GET /api/auth/google-status", () => {
  it("returns enabled:false when Supabase reports the provider is disabled", async () => {
    const fn = mockFetch(400, JSON.stringify({
      code: 400,
      error_code: "validation_failed",
      msg: "Unsupported provider: provider is not enabled",
    }));

    const res = await GET(REQUEST);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(mockWarn).toHaveBeenCalled();

    const init = fn.mock.calls[0][1] as FetchInit;
    expect(init.headers?.apikey).toBe("test-anon-key");
    expect(fn.mock.calls[0][0]).toContain("provider=google");
  });

  it("detects the plain-text variant of the disabled-provider error", async () => {
    mockFetch(400, "Unsupported provider: provider is not enabled");
    const res = await GET(REQUEST);
    expect((await res.json()).enabled).toBe(false);
  });

  it("reports enabled when Supabase returns a redirect", async () => {
    mockFetch(302, "");
    const res = await GET(REQUEST);
    expect((await res.json()).enabled).toBe(true);
  });

  it("degrades to enabled on unrelated 400s (never blocks sign-in)", async () => {
    mockFetch(400, JSON.stringify({ msg: "redirect URL not allowed" }));
    const res = await GET(REQUEST);
    expect((await res.json()).enabled).toBe(true);
  });

  it("degrades to enabled when the probe throws", async () => {
    (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await GET(REQUEST);
    expect((await res.json()).enabled).toBe(true);
  });

  it("skips the probe when rate limited", async () => {
    mockRateLimit.mockImplementation(async () => ({ allowed: false, remaining: 0 }));
    const fn = mockFetch(400, "Unsupported provider");
    const res = await GET(REQUEST);
    expect((await res.json()).enabled).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("never includes credential values in the response", async () => {
    mockFetch(400, "Unsupported provider");
    const res = await GET(REQUEST);
    const text = await res.text();
    expect(text).not.toContain("test-anon-key");
    expect(text).not.toContain("test-client-id");
    expect(text).not.toContain("GOCSPX");
  });

  it("reports configured:false with the exact URI when Google rejects the callback", async () => {
    const authError = Buffer.from(
      "Error 400: redirect_uri_mismatch — the request redirect URI is not registered."
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const fn = makeFetch([
      { status: 302, body: "" },
      {
        status: 302,
        body: "",
        headers: {
          location: `https://accounts.google.com/signin/oauth/error?authError=${authError}`,
        },
      },
    ]);

    const res = await GET(REQUEST);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      configured: false,
      redirectUri: "https://project.supabase.co/auth/v1/callback",
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reports configured:true (no flag) when Google's authorize endpoint is clean", async () => {
    makeFetch([
      { status: 302, body: "" },
      {
        status: 302,
        body: "",
        headers: { location: "https://accounts.google.com/o/oauth2/auth?continue=1" },
      },
    ]);
    const res = await GET(REQUEST);
    expect(await res.json()).toEqual({ enabled: true });
  });

  it("degrades to enabled:true when the Google probe throws", async () => {
    let call = 0;
    (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) {
        return { status: 302, text: async () => "", headers: { get: () => null } };
      }
      throw new Error("google unreachable");
    }) as unknown as typeof fetch;

    const res = await GET(REQUEST);
    expect(await res.json()).toEqual({ enabled: true });
  });
});
