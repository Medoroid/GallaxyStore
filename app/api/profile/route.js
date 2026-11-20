import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";

const MAX_NAME_LENGTH = 100;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * POST /api/profile — update the caller's own display name.
 * Identity always comes from the verified JWT; client-supplied ids are ignored.
 */
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ success: false, message: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : null;
    if (fullName === null) {
      return Response.json({ success: false, message: "full_name is required" }, { status: 400 });
    }
    if (fullName.length > MAX_NAME_LENGTH || CONTROL_CHARS.test(fullName)) {
      return Response.json({ success: false, message: "Invalid display name" }, { status: 400 });
    }

    // Auth metadata belongs to the caller's token, so the user client is safe.
    const { error: metadataError } = await userClient.auth.updateUser({
      data: { full_name: fullName },
    });
    if (metadataError) throw metadataError;

    const db = getServiceRoleClient();
    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        { id: user.id, full_name: fullName, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    if (profileError) {
      // Do not claim success when the canonical profile row was not updated.
      return Response.json(
        { success: false, message: "Could not save your profile. Please try again." },
        { status: 500 }
      );
    }

    return Response.json({ success: true, full_name: fullName });
  } catch (error) {
    return handleApiError(error, "Profile POST", "Could not update profile");
  }
}
