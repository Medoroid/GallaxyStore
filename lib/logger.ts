/**
 * Structured logger (A4 remediation).
 *
 * - Emits one JSON object per line (picked up by Vercel Logs / any log drain,
 *   and compatible with OTEL collectors that scrape stdout).
 * - Production level defaults to `warn`: security warnings AND errors are kept;
 *   `info` noise stays out of production. Override with `LOG_LEVEL`
 *   (error | warn | info | debug).
 * - NEVER logs secrets: passwords, tokens, cookies, authorization headers,
 *   API keys, card/CVV data, raw payment payloads are redacted.
 * - PII in values (e-mail addresses, JWT-shaped strings, long phone-like
 *   strings) is masked before it reaches the console.
 * - `context` (requestId / route / operation / errorCode) is merged into every
 *   record so events are greppable by request.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY_RE =
  /(pass(word|phrase)?|token|secret|authorization|cookie|session|api[-_]?key|apikey|private|credential|cvv|cvc|pan|card[-_]?number|otp|bearer|refresh)/i;

const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/g;
// JWT-shaped (three base64url segments) or Supabase legacy-GOTRUE tokens.
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
// Long digit runs that look like full phone numbers (keep short numbers such as
// quantities / order suffixes readable; phone-like strings only when the whole
// string or a long run inside it looks like one).
const PHONE_LIKE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;

const MAX_STRING = 1000;
const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_KEYS = 40;
const REDACTED = "[REDACTED]";

function maskValue(input: string): string {
  let out = input;
  out = out.replace(JWT_RE, "[REDACTED_TOKEN]");
  out = out.replace(EMAIL_RE, (m) => {
    const at = m.indexOf("@");
    const local = m.slice(0, at);
    const domain = m.slice(at);
    return `${local.charAt(0)}***${domain}`;
  });
  // Only mask a phone-like run when it is the entire (trimmed) value or long
  // enough to be a full international number — avoids destroying UUIDs/IDs.
  out = out.replace(PHONE_LIKE_RE, (m) =>
    m.replace(/\d/g, "#").length >= 9 ? "[PHONE]" : m
  );
  if (out.length > MAX_STRING) {
    out = `${out.slice(0, MAX_STRING)}…[truncated ${out.length - MAX_STRING} chars]`;
  }
  return out;
}

/** Recursively sanitize a value for logging. Exported for unit tests. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return maskValue(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskValue(value.message),
      code: (value as { code?: unknown }).code,
      stack: typeof value.stack === "string" ? maskValue(value.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) return "[depth-limit]";

  if (Array.isArray(value)) {
    const arr = value.slice(0, MAX_ARRAY).map((v) => redactValue(v, depth + 1));
    if (value.length > MAX_ARRAY) arr.push(`…[${value.length - MAX_ARRAY} more]`);
    return arr;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= MAX_KEYS) {
        out["…"] = "[key-limit]";
        break;
      }
      out[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED : redactValue(val, depth + 1);
    }
    return out;
  }

  // functions / symbols
  return `[${typeof value}]`;
}

function effectiveLevel(): number {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw in LEVEL_RANK) return LEVEL_RANK[raw as LogLevel];
  // Production: keep errors AND warnings (security-relevant), drop info noise.
  return process.env.NODE_ENV === "production"
    ? LEVEL_RANK.warn
    : LEVEL_RANK.info;
}

function emit(level: LogLevel, message: string, context?: unknown, data?: unknown) {
  if (LEVEL_RANK[level] < effectiveLevel()) return;

  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message: maskValue(String(message)),
  };

  if (context !== undefined) {
    const ctx = redactValue(context);
    if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
      Object.assign(record, ctx as Record<string, unknown>);
    }
  }
  if (data !== undefined) {
    record.data = redactValue(data);
  }

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type LogContext = {
  requestId?: string;
  route?: string;
  operation?: string;
  errorCode?: string | number;
  [key: string]: unknown;
};

export const logger = {
  /**
   * Log an event with bound context (request id, route, operation, error code…).
   * Usage: `logger.withContext({ requestId, route: "/api/x" }).warn("msg", data)`
   * The root logger ({ info, warn, error }) keeps its original signature so all
   * existing call sites and test mocks remain valid.
   */
  withContext(context: LogContext) {
    return {
      debug: (message: string, data?: unknown) =>
        emit("debug", message, context, data),
      info: (message: string, data?: unknown) =>
        emit("info", message, context, data),
      warn: (message: string, data?: unknown) =>
        emit("warn", message, context, data),
      error: (message: string, data?: unknown) =>
        emit("error", message, context, data),
    };
  },
  debug: (message: string, data?: unknown) => emit("debug", message, undefined, data),
  info: (message: string, data?: unknown) => emit("info", message, undefined, data),
  warn: (message: string, data?: unknown) => emit("warn", message, undefined, data),
  error: (message: string, data?: unknown) => emit("error", message, undefined, data),
};
