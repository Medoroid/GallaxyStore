import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

/**
 * Verify admin status using database role (primary) with ADMIN_EMAILS fallback.
 */
export async function verifyAdmin(
  request: Request
): Promise<AdminResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { error: "Authorization required", status: 401 };

  const token = authHeader.replace("Bearer ", "");
  const supabase = getClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return { error: "Invalid token", status: 401 };

  // Primary: check via is_admin() RPC (uses profiles.role)
  try {
    const { data: isAdminRpc, error: rpcError } = await supabase.rpc("is_admin");
    if (!rpcError && isAdminRpc === true) {
      return { user: user as AdminSuccess["user"] };
    }
  } catch {
    // RPC might not exist, fall through to fallback
  }

  // Fallback: check admin_users table
  try {
    const { data } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .single();
    if (data) return { user: user as AdminSuccess["user"] };
  } catch {
    // Table might not exist
  }

  // Last resort: ADMIN_EMAILS env var (with warning)
  if (ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    logger.warn(
      `[Admin Auth] User ${user.email} authenticated via ADMIN_EMAILS fallback. ` +
        `Set role='admin' in profiles table for proper RBAC.`
    );
    return { user: user as AdminSuccess["user"] };
  }

  return { error: "Not authorized", status: 403 };
}
