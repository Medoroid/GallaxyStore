import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

// POST - Track a product view
export async function POST(request, { params }) {
  try {
    const { id: product_id } = await params;

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
      // Guest: get session_token from body or generate one
      const body = await request.json().catch(() => ({}));
      session_token = body.session_token || randomUUID();
    }

    const { error } = await SupabaseClient.rpc("track_product_view", {
      p_product_id: product_id,
      p_session_token: session_token,
    });

    if (error) throw error;
    return Response.json({ success: true, session_token });
  } catch (error) {
    logger.error("[Track Product View Error]", error);
    return Response.json(
      { success: false, message: "Failed to track view" },
      { status: 500 }
    );
  }
}
