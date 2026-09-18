import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// GET - Get recently viewed products
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const authHeader = request.headers.get("authorization");
    let session_token = null;
    let user = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: authUser } } = await SupabaseClient.auth.getUser(token);
      user = authUser;
    }

    if (!user) {
      session_token = searchParams.get("session_token") || null;
    }

    const limit = parseInt(searchParams.get("limit") || "12", 10);

    const { data, error } = await SupabaseClient.rpc("get_recently_viewed", {
      p_session_token: session_token,
      p_limit: limit,
    });

    if (error) throw error;
    return Response.json({ success: true, products: data || [] });
  } catch (error) {
    logger.error("[Recently Viewed Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch recently viewed" },
      { status: 500 }
    );
  }
}
