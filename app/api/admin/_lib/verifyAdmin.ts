import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];

function getClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The token must be attached here: is_admin() / admin_users rely on
    // auth.uid(), which is null for a plain anon client.
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

interface AdminSuccess {
  user: { id: string; email?: string };
  error?: undefined;
  status?: undefined;
}

interface AdminError {
  error: string;
  status: number;
  user?: undefined;
}

export type AdminResult = AdminSuccess | AdminError;

/** Only "object genuinely absent" errors may unlock the bootstrap fallback. */
function isMissingSchemaObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code)) return true;
  return /does not exist|could not find the|schema cache/i.test(error.message || "");
}

/**
 * Verify admin status with fail-closed checks.
 *
 * Order: is_admin() RPC -> admin_users row -> bootstrap ADMIN_EMAILS.
 * A database/network error is NEVER treated as "not admin but try a weaker
 * check": it returns 403. The env allow-list is only used when both database
 * checks are genuinely absent (fresh install, before the admin migration).
 */
export async function verifyAdmin(request: Request): Promise<AdminResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { error: "Authorization required", status: 401 };

  const token = authHeader.replace("Bearer ", "");
  const supabase = getClient(token);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return { error: "Invalid token", status: 401 };

  let rpcMissing = false;
  let tableMissing = false;

  // Primary: database role via is_admin() (uses profiles.role).
  try {
    const { data: isAdminRpc, error: rpcError } = await supabase.rpc("is_admin");
    if (rpcError) {
      if (!isMissingSchemaObject(rpcError)) {
        logger.warn(`[Admin Auth] is_admin() failed for ${user.id}: ${rpcError.code || "unknown"}`);
        return { error: "Not authorized", status: 403 };
      }
      rpcMissing = true;
    } else if (isAdminRpc === true) {
      return { user: user as AdminSuccess["user"] };
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (!isMissingSchemaObject({ code })) {
      logger.warn(`[Admin Auth] is_admin() threw for ${user.id}`);
      return { error: "Not authorized", status: 403 };
    }
    rpcMissing = true;
  }

  // Secondary: explicit admin_users row.
  try {
    const { data, error: tableError } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tableError) {
      if (!isMissingSchemaObject(tableError)) {
        logger.warn(`[Admin Auth] admin_users lookup failed for ${user.id}`);
        return { error: "Not authorized", status: 403 };
      }
      tableMissing = true;
    } else if (data) {
      return { user: user as AdminSuccess["user"] };
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (!isMissingSchemaObject({ code })) {
      logger.warn(`[Admin Auth] admin_users lookup threw for ${user.id}`);
      return { error: "Not authorized", status: 403 };
    }
    tableMissing = true;
  }

  // Both database checks succeeded and said "no" -> reject. Never fall back
  // to an email list when RBAC is actually available.
  if (!rpcMissing && !tableMissing) {
    return { error: "Not authorized", status: 403 };
  }

  // Bootstrap only: both admin tables/RPCs are absent on this deployment.
  if (ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    logger.warn(
      `[Admin Auth] User ${user.email} authenticated via ADMIN_EMAILS bootstrap fallback ` +
        `(is_admin missing=${rpcMissing}, admin_users missing=${tableMissing}).`
    );
    return { user: user as AdminSuccess["user"] };
  }

  return { error: "Not authorized", status: 403 };
}
