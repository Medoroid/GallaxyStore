import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const requestedUserId = typeof body?.user_id === "string" ? body.user_id.trim() : "";

    if (!email && !requestedUserId) {
      return Response.json(
        { success: false, message: "email or user_id is required" },
        { status: 400 }
      );
    }

    const SupabaseAdmin = getServiceRoleClient();
    let targetUserId = requestedUserId;

    if (email && !targetUserId) {
      const { data: users, error: userError } = await SupabaseAdmin.auth.admin.listUsers();
      if (userError) throw userError;

      const normalizedEmail = email.toLowerCase();
      const targetUser = users.users.find(
        (u) => (u.email || "").toLowerCase() === normalizedEmail
      );
      if (!targetUser) {
        return Response.json(
          { success: false, message: `User with email ${email} not found. Please register first.` },
          { status: 404 }
        );
      }
      targetUserId = targetUser.id;
    }

    const { data: profile, error: profileLookupError } = await SupabaseAdmin
      .from("profiles")
      .select("id, role, deleted_at")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileLookupError) throw profileLookupError;
    if (!profile || profile.deleted_at) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (profile.role !== "admin") {
      const { error: profileError } = await SupabaseAdmin
        .from("profiles")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("id", targetUserId);

      if (profileError) throw profileError;

      const { error: adminRowError } = await SupabaseAdmin
        .from("admin_users")
        .insert({ user_id: targetUserId, role: "admin" });
      // profiles.role is authoritative for is_admin(); a duplicate row is harmless.
      if (adminRowError && adminRowError.code !== "23505") {
        logger.warn("[Admin Add] admin_users insert failed:", adminRowError.message);
      }

      await recordAdminAudit(SupabaseAdmin, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "user.role_changed",
        entityType: "user",
        entityId: targetUserId,
        details: { from: profile.role, to: "admin", source: "admin/add" },
      });
    }

    return Response.json({
      success: true,
      message: "User is now an admin (via profiles.role)",
    });
  } catch (error) {
    return handleApiError(error, "Add Admin POST", "Failed to add admin");
  }
}
