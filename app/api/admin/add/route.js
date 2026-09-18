import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
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

    const { email, user_id } = await request.json();

    if (!email && !user_id) {
      return Response.json(
        { success: false, message: "email or user_id is required" },
        { status: 400 }
      );
    }

    const SupabaseAdmin = getServiceRoleClient();
    let targetUserId = user_id;

    if (email && !user_id) {
      const { data: users, error: userError } = await SupabaseAdmin.auth.admin.listUsers();
      if (userError) throw userError;

      const targetUser = users.users.find((u) => u.email === email);
      if (!targetUser) {
        return Response.json(
          { success: false, message: `User with email ${email} not found. Please register first.` },
          { status: 404 }
        );
      }
      targetUserId = targetUser.id;
    }

    // Update profiles.role to 'admin' (used by is_admin() RPC)
    const { error: profileError } = await SupabaseAdmin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", targetUserId);

    if (profileError) throw profileError;

    return Response.json({
      success: true,
      message: `User is now an admin (via profiles.role)`,
    });
  } catch (error) {
    return handleApiError(error, "Add Admin POST", "Failed to add admin");
  }
}
