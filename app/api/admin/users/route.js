import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const ALLOWED_ROLES = new Set(["customer", "vendor", "admin"]);

async function listAllAuthUsers(db) {
  const users = [];
  let page = 1;
  const perPage = 1000;

  // Bounded loop: 20 pages = 20k users, far beyond this store's scale.
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...(data?.users ?? []));
    if (!data?.users || data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const [profilesResult, adminUsersResult, authUsers] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, role, created_at, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      db.from("admin_users").select("user_id, role, created_at"),
      listAllAuthUsers(db),
    ]);

    if (profilesResult.error) throw profilesResult.error;

    const authById = new Map(authUsers.map((user) => [user.id, user]));
    const adminRoleById = new Map(
      (adminUsersResult.data ?? []).map((row) => [row.user_id, row.role])
    );

    const users = (profilesResult.data ?? []).map((profile) => {
      const authUser = authById.get(profile.id);
      return {
        id: profile.id,
        full_name: profile.full_name || authUser?.user_metadata?.full_name || "Unnamed user",
        email: authUser?.email ?? null,
        role: profile.role || "customer",
        admin_role: adminRoleById.get(profile.id) ?? null,
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        email_confirmed_at: authUser?.email_confirmed_at ?? null,
        banned_until: authUser?.banned_until ?? null,
      };
    });

    return Response.json({
      success: true,
      users,
      current_user_id: auth.user.id,
      current_user_email: auth.user.email ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Admin Users GET", "Failed to fetch users");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.user_id === "string" ? body.user_id : "";
    const role = String(body?.role || "");

    if (!userId) {
      return Response.json({ success: false, message: "user_id is required" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return Response.json(
        { success: false, message: "Role must be customer, vendor or admin" },
        { status: 400 }
      );
    }

    const db = getServiceRoleClient();

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, role, deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.deleted_at) {
      return Response.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const { data: adminRow } = await db
      .from("admin_users")
      .select("user_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (adminRow?.role === "super_admin" && role !== "admin") {
      return Response.json(
        { success: false, message: "The super administrator role cannot be removed here" },
        { status: 400 }
      );
    }

    // Guard against locking the store out of its own admin panel.
    if (role !== "admin") {
      if (userId === auth.user.id) {
        return Response.json(
          { success: false, message: "You cannot remove your own admin access" },
          { status: 400 }
        );
      }
      const { count } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .is("deleted_at", null);
      if ((count ?? 0) <= 1) {
        return Response.json(
          { success: false, message: "At least one administrator must remain" },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await db
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (updateError) throw updateError;

    if (role === "admin") {
      if (!adminRow) {
        const { error: insertError } = await db.from("admin_users").insert({
          user_id: userId,
          role: "admin",
        });
        // A missing admin_users row is not fatal: is_admin() reads profiles.role.
        if (insertError) {
          logger.warn("[Admin Users] admin_users insert failed:", insertError.message);
        }
      }
    } else if (adminRow && adminRow.role !== "super_admin") {
      const { error: deleteError } = await db
        .from("admin_users")
        .delete()
        .eq("user_id", userId);
      if (deleteError) {
        logger.warn("[Admin Users] admin_users delete failed:", deleteError.message);
      }
    }

    logger.info("[Admin Users] role changed", {
      targetUserId: userId,
      role,
      by: auth.user.id,
    });

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      details: { from: profile.role, to: role },
    });

    return Response.json({ success: true, role });
  } catch (error) {
    return handleApiError(error, "Admin Users PATCH", "Failed to update user role");
  }
}
