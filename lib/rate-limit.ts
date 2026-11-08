import { logger } from "@/lib/logger";

type RateLimitOptions = {
  /** Window length in milliseconds. Defaults to one minute. */
  windowMs?: number;
  /** Maximum requests allowed per window. Defaults to 60. */
  maxRequests?: number;
  /**
   * What to do when a configured distributed store cannot be reached.
   *
   * - "fail_open" (default): fall back to the per-process limiter so a Redis
   *   outage does not take the whole store down.
   * - "fail_closed": reject the request. Use it for money/state-changing
   *   routes where an unprotected burst is worse than a short outage.
   *
   * Note: when `REQUIRE_DISTRIBUTED_RATE_LIMIT` is enabled (production
   * launch gate), "fail_open" is overridden — every route fails closed
   * because a per-instance counter is not a real limit behind a load
   * balancer or serverless fleet.
   */
  failureMode?: "fail_open" | "fail_closed";
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  backend: "memory" | "redis" | "memory_fallback" | "unavailable";
};

const rateLimit = new Map<string, { count: number; timestamp: number; windowMs: number }>();

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 60; // per window
const STORE_TIMEOUT_MS = 1500;

let warnedMissingRedis = false;
let warnedGateMisconfig = false;

/**
 * B5 — production gate: when `REQUIRE_DISTRIBUTED_RATE_LIMIT` is enabled,
 * a distributed store (Upstash Redis) is MANDATORY. If it is missing or
 * unreachable, every rate-limited request is rejected (`backend:
 * "unavailable"`) instead of silently falling back to a per-instance
 * in-memory counter, which would not limit a distributed attacker or a
 * multi-instance deployment.
 *
 * Accepted truthy values: "true", "1", "yes" (case-insensitive).
 */
function distributedRateLimitRequired(): boolean {
  const value = process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function sweepExpired(now: number) {
  // The in-process map must not grow forever in a long-lived server.
  if (rateLimit.size < 1000) return;
  for (const [key, record] of rateLimit) {
    if (now - record.timestamp > record.windowMs) rateLimit.delete(key);
  }
}

/**
 * Single-process fixed-window limiter.
 *
 * It is a real limit for one instance, but when several instances run behind a
 * load balancer each one keeps its own counters. Use checkRateLimitAsync() for
 * any route where a cross-instance limit matters.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number } {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const now = Date.now();
  const record = rateLimit.get(key);

  sweepExpired(now);

  if (!record || now - record.timestamp > windowMs) {
    rateLimit.set(key, { count: 1, timestamp: now, windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

function distributedStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingRedis) {
      warnedMissingRedis = true;
      logger.warn(
        "[RateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not set; " +
          "using the per-instance limiter. Configure Upstash for a distributed limit."
      );
    }
    return null;
  }
  return { url: url.replace(/\/+$/, ""), token };
}

async function checkUpstash(
  store: { url: string; token: string },
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; remaining: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);

  try {
    // INCR creates the counter; PEXPIRE NX sets the window only once so the
    // window is not extended by every request.
    const res = await fetch(`${store.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${store.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, windowMs, "NX"],
      ]),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Upstash responded ${res.status}`);
    }

    const payload = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (payload?.[0]?.error) throw new Error(payload[0].error);
    if (payload?.[1]?.error) throw new Error(payload[1].error);

    const count = Number(payload?.[0]?.result);
    if (!Number.isFinite(count) || count < 0) {
      throw new Error("Upstash returned an invalid counter");
    }

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rate limit backed by Upstash Redis when configured, otherwise by the
 * in-process limiter. When Redis is configured but unreachable, the caller
 * chooses whether to fail closed or fall back locally.
 *
 * B5 gate: with `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` the in-memory
 * fallback is never used — a missing or unreachable distributed store
 * rejects the request (`backend: "unavailable"`) for every route.
 */
export async function checkRateLimitAsync(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const required = distributedRateLimitRequired();
  const store = distributedStore();

  if (!store) {
    if (required) {
      if (!warnedGateMisconfig) {
        warnedGateMisconfig = true;
        logger.error(
          "[RateLimit] REQUIRE_DISTRIBUTED_RATE_LIMIT is enabled but " +
            "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not set — " +
            "rejecting rate-limited requests until Upstash is configured."
        );
      }
      return { allowed: false, remaining: 0, backend: "unavailable" };
    }
    return { ...checkRateLimit(key, options), backend: "memory" };
  }

  try {
    const result = await checkUpstash(store, key, windowMs, maxRequests);
    return { ...result, backend: "redis" };
  } catch (error) {
    logger.warn(
      `[RateLimit] distributed store unavailable for "${key}": ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );

    if (options.failureMode === "fail_closed" || required) {
      return { allowed: false, remaining: 0, backend: "unavailable" };
    }

    return { ...checkRateLimit(key, options), backend: "memory_fallback" };
  }
}

/**
 * Only trust forwarding headers when the deployment actually sits behind a
 * proxy we control. Otherwise an attacker can rotate a spoofed
 * `x-forwarded-for` on every request and bypass the limiter.
 *
 * - `TRUST_PROXY=true|false` is an explicit override.
 * - Vercel/Cloudflare/Netlify are detected automatically.
 * - Development and tests trust the headers so local tooling keeps working;
 *   production without one of the above defaults to not trusting them.
 */
function shouldTrustProxyHeaders() {
  const configured = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  if (
    process.env.VERCEL === "1" ||
    process.env.CF_PAGES === "1" ||
    process.env.NETLIFY === "true"
  ) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function normaliseIp(value: string | null | undefined) {
  const candidate = String(value || "").split(",")[0].trim();
  if (!candidate || candidate.length > 64) return null;
  // Keep IPv4/IPv6 characters only. Reject hostnames and injected key text.
  if (!/^[0-9a-fA-F:.\[\]]+$/.test(candidate)) return null;
  return candidate.replace(/^\[|\]$/g, "");
}

export function getClientIp(request: Request): string {
  if (!shouldTrustProxyHeaders()) return "unknown";

  const headers = request.headers;

  // Cloudflare's header is set by the edge and cannot be spoofed through it.
  if (process.env.CF_PAGES === "1") {
    const cloudflareIp = normaliseIp(headers.get("cf-connecting-ip"));
    if (cloudflareIp) return cloudflareIp;
  }

  // Vercel sets this to the original client address.
  if (process.env.VERCEL === "1") {
    const vercelIp = normaliseIp(headers.get("x-vercel-forwarded-for"));
    if (vercelIp) return vercelIp;
  }

  const forwarded = normaliseIp(headers.get("x-forwarded-for"));
  if (forwarded) return forwarded;

  const realIp = normaliseIp(headers.get("x-real-ip"));
  if (realIp) return realIp;

  return "unknown";
}

export function getRateLimitHeaders(
  key: string,
  options: RateLimitOptions = {}
): Record<string, string> {
  const { remaining } = checkRateLimit(key, options);
  return {
    "X-RateLimit-Limit": String(options.maxRequests ?? DEFAULT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Policy": options.windowMs
      ? `fixed-window;w=${Math.round(options.windowMs / 1000)}`
      : "fixed-window",
  };
}
