import { logger } from "@/lib/logger";

export function isRlsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "42501" ||
    e.message?.includes("row-level security") === true ||
    e.message?.includes("permission denied for") === true
  );
}

export function handleApiError(
  error: unknown,
  context: string,
  fallbackMessage: string,
  fallbackStatus = 500
): Response {
  if (isRlsError(error)) {
    // Missing GRANT or an RLS policy rejection — always log it, otherwise a
    // broken table privilege is indistinguishable from a real auth failure.
    logger.error(
      `[${context}] permission denied (missing GRANT or RLS policy)`,
      error
    );
    return Response.json(
      { success: false, message: "Not authorized" },
      { status: 403 }
    );
  }

  logger.error(`[${context}]`, error);

  // Missing configuration (e.g. "SUPABASE_SERVICE_ROLE_KEY is not set") — tell
  // the caller which variable to fill in instead of a bare "something failed".
  const message = error instanceof Error ? error.message : "";
  if (/^[A-Z0-9_]+ (is not set|is required|is missing)/.test(message)) {
    return Response.json({ success: false, message }, { status: fallbackStatus });
  }

  return Response.json(
    { success: false, message: fallbackMessage },
    { status: fallbackStatus }
  );
}
