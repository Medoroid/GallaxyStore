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

// POST - Request vendor payout
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

    const { store_id, amount } = await request.json();

    if (!store_id || !amount || amount <= 0) {
      return Response.json(
        { success: false, message: "store_id and positive amount are required" },
        { status: 400 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("request_vendor_payout", {
      p_store_id: store_id,
      p_amount: amount,
    });

    if (error) throw error;
    return Response.json({ success: true, payout: data });
  } catch (error) {
    return handleApiError(error, "Vendor Payout POST", "Failed to request payout");
  }
}

// GET - Fetch vendor payout requests
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

    const { data: store } = await SupabaseClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!store) {
      return Response.json({ success: true, payouts: [] });
    }

    const { data, error } = await SupabaseClient
      .from("vendor_payout_requests")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, payouts: data || [] });
  } catch (error) {
    return handleApiError(error, "Vendor Payouts GET", "Failed to fetch payouts");
  }
}
