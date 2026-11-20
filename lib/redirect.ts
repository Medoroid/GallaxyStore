/**
 * Shared redirect helpers for auth flows.
 * A "next" destination must be a LOCAL absolute path — never an external URL,
 * protocol-relative URL or backslash-normalization trick.
 */
export function isSafeNext(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("://")) return false;
  if (value.includes("\\")) return false;
  return true;
}

export function safeNext(value: unknown, fallback = "/"): string {
  return isSafeNext(value) ? value : fallback;
}

export function loginUrl(next?: string | null): string {
  return isSafeNext(next)
    ? `/login?next=${encodeURIComponent(next)}`
    : "/login";
}

export function callbackUrl(origin: string, next?: string | null): string {
  const target = safeNext(next);
  return `${origin}/auth/callback?next=${encodeURIComponent(target)}`;
}
