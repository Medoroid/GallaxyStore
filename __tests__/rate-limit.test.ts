/** @jest-environment node */

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";

const originalFetch = global.fetch;

function upstashResponse(count: number) {
  return {
    ok: true,
    json: async () => [{ result: count }, { result: 1 }],
  } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;
});

afterAll(() => {
  global.fetch = originalFetch;
  delete process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;
});

describe("checkRateLimitAsync without Redis", () => {
  test("uses the in-process fixed window", async () => {
    const key = `memory-${Date.now()}`;

    const first = await checkRateLimitAsync(key, { maxRequests: 2, windowMs: 60_000 });
    const second = await checkRateLimitAsync(key, { maxRequests: 2, windowMs: 60_000 });
    const third = await checkRateLimitAsync(key, { maxRequests: 2, windowMs: 60_000 });

    expect(first).toMatchObject({ allowed: true, backend: "memory", remaining: 1 });
    expect(second).toMatchObject({ allowed: true, backend: "memory", remaining: 0 });
    expect(third).toMatchObject({ allowed: false, backend: "memory", remaining: 0 });
  });
});

describe("checkRateLimitAsync with Upstash", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
  });

  test("uses the shared counter and rejects above the limit", async () => {
    global.fetch = jest.fn().mockResolvedValue(upstashResponse(3));

    const result = await checkRateLimitAsync("shared-key", { maxRequests: 2, windowMs: 60_000 });

    expect(result).toMatchObject({ allowed: false, backend: "redis", remaining: 0 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://redis.example.com/pipeline",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      })
    );
  });

  test("fails closed when the shared store is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await checkRateLimitAsync("closed-key", {
      maxRequests: 10,
      windowMs: 60_000,
      failureMode: "fail_closed",
    });

    expect(result).toMatchObject({ allowed: false, backend: "unavailable" });
  });

  test("falls back to the local limiter when the route tolerates it", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));

    const result = await checkRateLimitAsync("open-key", {
      maxRequests: 10,
      windowMs: 60_000,
      failureMode: "fail_open",
    });

    expect(result).toMatchObject({ allowed: true, backend: "memory_fallback" });
  });

  test("treats a non-OK Redis response as a store failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await checkRateLimitAsync("error-key", {
      maxRequests: 10,
      failureMode: "fail_closed",
    });

    expect(result.allowed).toBe(false);
    expect(result.backend).toBe("unavailable");
  });

  test("treats a failed PEXPIRE command as a store failure", async () => {
    // A counter with no expiry can permanently block a key, so the second
    // command must be checked as well as INCR.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { error: "ERR PEXPIRE failed" }],
    } as Response);

    const result = await checkRateLimitAsync("expire-error-key", {
      maxRequests: 10,
      failureMode: "fail_closed",
    });

    expect(result.allowed).toBe(false);
    expect(result.backend).toBe("unavailable");
  });
});

describe("checkRateLimitAsync with REQUIRE_DISTRIBUTED_RATE_LIMIT (B5 gate)", () => {
  test("rejects every request when Redis is not configured — no memory fallback", async () => {
    process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT = "true";

    const first = await checkRateLimitAsync(`gate-missing-a-${Date.now()}`, { maxRequests: 10 });
    const second = await checkRateLimitAsync(`gate-missing-b-${Date.now()}`, { maxRequests: 10 });

    expect(first).toMatchObject({ allowed: false, remaining: 0, backend: "unavailable" });
    expect(second).toMatchObject({ allowed: false, remaining: 0, backend: "unavailable" });
  });

  test("overrides fail_open when Redis is unreachable — route fails closed", async () => {
    process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT = "true";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await checkRateLimitAsync("gate-open-key", {
      maxRequests: 10,
      windowMs: 60_000,
      failureMode: "fail_open",
    });

    expect(result).toMatchObject({ allowed: false, backend: "unavailable" });
  });

  test("normal Redis flow is unaffected while the gate is enabled", async () => {
    process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT = "true";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    global.fetch = jest.fn().mockResolvedValue(upstashResponse(1));

    const result = await checkRateLimitAsync("gate-ok-key", { maxRequests: 10, windowMs: 60_000 });

    expect(result).toMatchObject({ allowed: true, backend: "redis", remaining: 9 });
  });

  test.each([
    ["true", true],
    ["1", true],
    ["YES", true],
    ["  true  ", true],
    ["false", false],
    ["0", false],
    ["no", false],
    ["", false],
  ])("REQUIRE_DISTRIBUTED_RATE_LIMIT=%j enables=%s", async (value, expected) => {
    process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT = value;

    const result = await checkRateLimitAsync(`gate-parse-${Date.now()}`, { maxRequests: 10 });

    if (expected) {
      expect(result).toMatchObject({ allowed: false, backend: "unavailable" });
    } else {
      // Gate off + no Redis: legacy behaviour, in-memory fallback.
      expect(result).toMatchObject({ allowed: true, backend: "memory" });
    }
  });

  test("gate off (unset) keeps the in-memory fallback even when Redis is unreachable", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));

    const result = await checkRateLimitAsync("no-gate-key", {
      maxRequests: 10,
      failureMode: "fail_open",
    });

    expect(result).toMatchObject({ allowed: true, backend: "memory_fallback" });
  });
});

describe("getClientIp", () => {
  test("uses the first forwarded address", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip and then unknown", () => {
    const realIp = new Request("http://localhost", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(realIp)).toBe("9.9.9.9");

    const none = new Request("http://localhost");
    expect(getClientIp(none)).toBe("unknown");
  });

  test("does not trust spoofable forwarding headers when TRUST_PROXY=false", () => {
    process.env.TRUST_PROXY = "false";
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("unknown");
    delete process.env.TRUST_PROXY;
  });

  test("uses the platform header when the deployment is behind a trusted proxy", () => {
    process.env.TRUST_PROXY = "true";
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
    delete process.env.TRUST_PROXY;
  });

  test("rejects malformed or injected addresses", () => {
    process.env.TRUST_PROXY = "true";
    const malformed = new Request("http://localhost", {
      headers: { "x-forwarded-for": "not-an-ip<script>" },
    });
    expect(getClientIp(malformed)).toBe("unknown");
    delete process.env.TRUST_PROXY;
  });

  test("prefers Cloudflare's edge header on Cloudflare Pages", () => {
    process.env.CF_PAGES = "1";
    const request = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
    delete process.env.CF_PAGES;
  });
});
