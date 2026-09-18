import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { data: vendors, error } = await SupabaseClient
      .from("stores")
      .select(`
        id,
        name,
        slug,
        status,
        created_at,
        owner_id,
        profiles:owner_id (full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, vendors: vendors || [] });
  } catch (error) {
    return handleApiError(error, "Admin Vendors GET", "Failed to fetch vendors");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { action, store_id, payout_request_id, reason, notes } = await request.json();

    if (action === "approve_store") {
      const { error } = await SupabaseClient
        .from("stores")
        .update({ status: "active" })
        .eq("id", store_id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "reject_store") {
      const { error } = await SupabaseClient
        .from("stores")
        .update({ status: "rejected" })
        .eq("id", store_id);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action === "approve_payout") {
      const { data, error } = await SupabaseClient.rpc("approve_vendor_payout_request", {
        p_request_id: payout_request_id,
        p_notes: notes || null,
      });
      if (error) throw error;
      return Response.json({ success: true, result: data });
    }

    if (action === "reject_payout") {
      const { data, error } = await SupabaseClient.rpc("reject_vendor_payout_request", {
        p_request_id: payout_request_id,
        p_reason: reason || "Rejected by admin",
      });
      if (error) throw error;
      return Response.json({ success: true, result: data });
    }

    return Response.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error, "Admin Vendors POST", "Failed to perform action");
  }
}
