import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuthSuccess = {
  ok: true;
  user: { id: string; email?: string };
  client: SupabaseClient;
};

export type AuthFailure = {
  ok: false;
  response: Response;
};

function unauthorized(message: string, status: 401 | 403): Response {
  return Response.json({ success: false, message }, { status });
}

/**
 * Standard bearer-token authentication for creator/studio API routes.
 * Mirrors the wishlist/vendor house pattern: a per-request client scoped to
 * the caller's JWT so RLS sees the real auth.uid().
 */
export async function requireUser(request: Request): Promise<AuthSuccess | AuthFailure> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, response: unauthorized("Authorization required", 401) };
  }

  const token = authHeader.replace("Bearer ", "");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    return { ok: false, response: unauthorized("Invalid token", 401) };
  }

  return { ok: true, user: user as { id: string; email?: string }, client };
}

/**
 * True when PostgREST/Postgres reports that a table is absent — i.e. the
 * Creator Studio migration has not been applied to this environment yet.
 * Surfaced as an honest 503 instead of a generic 500 so operators know the
 * exact next step.
 */
export function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "PGRST202" || e.code === "42P01" || e.code === "42883") return true;
  const message = e.message ?? "";
  // Only genuine missing-relation messages. A missing COLUMN also says
  // "does not exist" but must surface as a real error, not MIGRATION_REQUIRED.
  return (
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    /relation\s+["\S]+["\s]+\bdoes not exist\b/i.test(message)
  );
}

export function migrationRequiredResponse(context: string): Response {
  return Response.json(
    {
      success: false,
      code: "MIGRATION_REQUIRED",
      message:
        "Creator Studio tables are missing in this environment. Apply supabase/migrations/20261110120000_creator_studio_core.sql first.",
      context,
    },
    { status: 503 }
  );
}
