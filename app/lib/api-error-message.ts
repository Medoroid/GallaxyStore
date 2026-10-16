/**
 * Maps HTTP responses from our own API routes to a message that is safe and
 * useful to show a customer. Never leaks secrets, SQL or stack traces.
 */

const SECRET_PATTERNS = [
  /service_role/i,
  /supabase[_-]?secret/i,
  /stripe[_-]?(secret|webhook)/i,
  /paymob.*hmac/i,
  /postgres(ql)?:\/\//i,
  /eyJ[A-Za-z0-9_-]{10,}\./, // JWT
  /\bpassword\b\s*[:=]/i,
  /at\s+\w+\s+\(.+:\d+:\d+\)/, // stack frame
  /PostgrestException|PgError|column ".*" does not exist/i,
];

export function containsSensitiveDetails(message: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(message));
}

/** First line only — Supabase errors can be long and multi-line. */
function firstLine(message: string): string {
  const line = message.split("\n")[0].trim();
  return line.length > 300 ? `${line.slice(0, 297)}...` : line;
}

const STATUS_FALLBACK: Record<number, string> = {
  400: "Some of the details you sent were rejected. Please review them and try again.",
  401: "Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "We could not find what you were looking for.",
  409: "This request conflicts with something that already exists.",
  413: "The file is too large.",
  422: "Some of the details you sent were invalid.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
};

/**
 * @param status  HTTP status of the API response
 * @param body    Parsed JSON body (may be null / not an object)
 * @param fallback Message to use when the backend did not give us anything
 */
export function apiErrorMessage(
  status: number,
  body: unknown,
  fallback: string
): string {
  const message =
    body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";

  if (message && !containsSensitiveDetails(message)) {
    // 500s from our own routes may still carry a raw driver message — prefer
    // the generic copy unless the backend produced an intentional, readable one.
    if (status >= 500 && /^(Failed to|Internal)/i.test(message)) {
      return STATUS_FALLBACK[status] ?? fallback;
    }
    return firstLine(message);
  }

  if (status >= 500) return STATUS_FALLBACK[500] ?? fallback;
  return STATUS_FALLBACK[status] ?? fallback;
}

/** Storage upload failures come back as Supabase `StorageError.message`. */
export function storageErrorMessage(message: string | undefined | null): string {
  const value = (message ?? "").trim();
  if (!value) return "Could not upload the receipt. Please try again.";

  if (/bucket.*not found|not found.*bucket/i.test(value)) {
    return "Receipt upload is not available yet. Please contact support before transferring.";
  }
  if (/row-level security|violates row-level|not authorized|permission denied/i.test(value)) {
    return "You are not allowed to upload receipts for this order.";
  }
  if (/too large|exceeded|payload/i.test(value)) {
    return "The receipt image is too large. Please upload one under 5 MB.";
  }
  if (/MIME type|unsupported|content type/i.test(value)) {
    return "That file type is not supported. Use a JPG, PNG or WEBP image.";
  }
  if (/duplicate|already exists/i.test(value)) {
    return "That file name was already used. Please try again.";
  }
  if (containsSensitiveDetails(value)) {
    return "Could not upload the receipt. Please try again.";
  }
  return firstLine(value);
}
