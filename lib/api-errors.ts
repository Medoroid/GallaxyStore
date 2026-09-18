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
    return Response.json(
      { success: false, message: "Admin access required" },
      { status: 403 }
    );
  }

  logger.error(`[${context}]`, error);

  return Response.json(
    { success: false, message: fallbackMessage },
    { status: fallbackStatus }
  );
}
