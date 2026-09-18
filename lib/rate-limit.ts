const rateLimit = new Map<string, { count: number; timestamp: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60; // per window

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimit.get(key);

  if (!record || now - record.timestamp > WINDOW_MS) {
    rateLimit.set(key, { count: 1, timestamp: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (record.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}

export function getRateLimitHeaders(key: string): Record<string, string> {
  const { remaining } = checkRateLimit(key);
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Policy": "fixed-window",
  };
}
