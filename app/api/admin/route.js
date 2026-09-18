import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./_lib/verifyAdmin";
import { logger } from "@/lib/logger";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error, is_admin: false },
        { status: auth.status }
      );
    }

    return Response.json({
      success: true,
      is_admin: true,
      role: "admin",
      user_id: auth.user.id,
      email: auth.user.email,
    });
  } catch (error) {
    logger.error("[Admin Check Error]", error);
    return Response.json(
      { success: false, message: "Failed to check admin status", is_admin: false },
      { status: 500 }
    );
  }
}
