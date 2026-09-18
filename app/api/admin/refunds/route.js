import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
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

    const token = request.headers.get("authorization").replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);

    const { action, order_id, amount, reason, return_id, payment_id, refund_id, payment_reference, new_status, resolution_note } = await request.json();

    if (action === "issue_refund") {
      const { data, error } = await SupabaseClient.rpc("issue_refund", {
        p_order_id: order_id,
        p_amount: amount,
        p_reason: reason,
        p_return_id: return_id || null,
        p_payment_id: payment_id || null,
      });
      if (error) throw error;
      return Response.json({ success: true, refund: data });
    }

    if (action === "mark_completed") {
      const { data, error } = await SupabaseClient.rpc("mark_refund_completed", {
        p_refund_id: refund_id,
        p_payment_reference: payment_reference || null,
      });
      if (error) throw error;
      return Response.json({ success: true, result: data });
    }

    if (action === "mark_failed") {
      const { data, error } = await SupabaseClient.rpc("mark_refund_failed", {
        p_refund_id: refund_id,
        p_reason: reason || null,
      });
      if (error) throw error;
      return Response.json({ success: true, result: data });
    }

    if (action === "update_return_status") {
      const { data, error } = await SupabaseClient.rpc("update_return_status", {
        p_return_id: return_id,
        p_new_status: new_status,
        p_resolution_note: resolution_note || null,
      });
      if (error) throw error;
      return Response.json({ success: true, result: data });
    }

    return Response.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error, "Admin Refunds POST", "Failed to process refund");
  }
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const token = request.headers.get("authorization").replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);

    const { data, error } = await SupabaseClient
      .from("refunds")
      .select("*, orders!inner(id, total, status)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, refunds: data || [] });
  } catch (error) {
    return handleApiError(error, "Admin Refunds GET", "Failed to fetch refunds");
  }
}
