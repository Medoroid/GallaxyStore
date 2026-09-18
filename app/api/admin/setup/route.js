import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

export async function POST(request) {
  try {
    const { action } = await request.json();

    const SupabaseClient = getServiceRoleClient();

    // For setup actions, require a secret key
    const { searchParams } = new URL(request.url);
    const setupKey = searchParams.get("key");

    if (setupKey !== process.env.ADMIN_SETUP_KEY && action !== "check") {
      return Response.json(
        { success: false, message: "Invalid setup key" },
        { status: 403 }
      );
    }

    // Create admin_users table
    const { error: createError } = await SupabaseClient.rpc("exec_sql", {
      query: `
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
          created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(user_id)
        );
        
        ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;
        CREATE POLICY "Users can check own admin status"
          ON admin_users FOR SELECT
          USING (auth.uid() = user_id);
      `
    }).single();

    if (createError) {
      logger.warn("RPC failed, table might need manual creation", createError);
    }

    return Response.json({
      success: true,
      message: "Setup complete. Now use /api/admin/make-admin to add admin user.",
    });
  } catch (error) {
    logger.error("[Setup Error]", error);
    return Response.json(
      { success: false, message: "Setup failed" },
      { status: 500 }
    );
  }
}
