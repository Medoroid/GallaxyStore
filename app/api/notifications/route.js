import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET - Fetch user notifications
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { data, error } = await SupabaseClient
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return Response.json({ success: true, notifications: data || [] });
  } catch (error) {
    return handleApiError(error, "Notifications GET", "Failed to fetch notifications");
  }
}

// POST - Mark notification(s) as read or update preferences
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { action, notification_id, category, preferences } = await request.json();

    if (action === "mark_read") {
      const { error } = await SupabaseClient.rpc("mark_notification_read", {
        p_notification_id: notification_id,
      });
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "mark_all_read") {
      const { error } = await SupabaseClient.rpc("mark_all_notifications_read");
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "update_preferences") {
      const { error } = await SupabaseClient.rpc("update_notification_preferences", {
        p_category: category,
        p_email_enabled: preferences?.email_enabled ?? null,
        p_push_enabled: preferences?.push_enabled ?? null,
        p_in_app_enabled: preferences?.in_app_enabled ?? null,
        p_sms_enabled: preferences?.sms_enabled ?? null,
      });
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "register_push") {
      const { platform, push_token, device_name } = await request.json();
      const { error } = await SupabaseClient.rpc("register_push_device", {
        p_platform: platform,
        p_push_token: push_token,
        p_device_name: device_name || null,
      });
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "unregister_push") {
      const { push_token } = await request.json();
      const { error } = await SupabaseClient.rpc("unregister_push_device", {
        p_push_token: push_token,
      });
      if (error) throw error;
      return Response.json({ success: true });
    }

    return Response.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error, "Notifications POST", "Failed to update notifications");
  }
}
