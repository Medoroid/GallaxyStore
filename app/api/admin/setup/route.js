import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

/**
 * Health/readiness probe for the admin bootstrap.
 *
 * Database changes are applied exclusively through versioned migrations in
 * supabase/migrations. This endpoint used to execute raw DDL over an `exec_sql`
 * RPC, which was both a privilege-escalation risk and impossible to audit.
 */
export async function POST(request) {
  try {
    // Body is accepted for backwards compatibility but is no longer used.
    await request.json().catch(() => ({}));

    const { searchParams } = new URL(request.url);
    const setupKey = searchParams.get("key");

    if (!process.env.ADMIN_SETUP_KEY) {
      return Response.json(
        {
          success: false,
          message:
            "Admin setup is disabled. Apply supabase/migrations with the Supabase CLI instead.",
        },
        { status: 410 }
      );
    }
    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return Response.json({ success: false, message: "Invalid setup key" }, { status: 403 });
    }

    const db = getServiceRoleClient();
    const { count, error } = await db
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });

    if (error) {
      logger.error("[Admin Setup] admin_users probe failed:", error.message);
      return Response.json(
        {
          success: false,
          ready: false,
          message:
            "The admin_users table is not available. Apply the versioned migrations before using the admin panel.",
        },
        { status: 503 }
      );
    }

    return Response.json({
      success: true,
      ready: true,
      admin_users: count ?? 0,
      message:
        "Schema is managed by versioned migrations; this endpoint performs no DDL.",
    });
  } catch (error) {
    logger.error("[Admin Setup] probe failed", error);
    return Response.json({ success: false, message: "Admin setup probe failed" }, { status: 500 });
  }
}
