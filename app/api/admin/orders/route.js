import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const SupabaseClient = getServiceRoleClient();

    const { data: orders, error } = await SupabaseClient
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, orders: orders ?? [] });
  } catch (error) {
    return handleApiError(error, "Admin Orders GET", "Failed to fetch orders");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const SupabaseClient = getServiceRoleClient();
    const { order_id, status, note } = await request.json();

    if (!order_id || !status) {
      return Response.json(
        { success: false, message: "order_id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "paid", "processing", "printing", "shipped", "delivered", "cancelled", "refunded", "partially_refunded"];
    if (!validStatuses.includes(status)) {
      return Response.json(
        { success: false, message: "Invalid status" },
        { status: 400 }
      );
    }

    const { data: order, error } = await SupabaseClient
      .rpc("update_order_status", {
        p_order_id: order_id,
        p_new_status: status,
        p_note: note || null,
      });

    if (error) {
      logger.error("Failed to update order", error);
      return Response.json(
        { success: false, message: "Failed to update order" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, order_id, status });
  } catch (error) {
    return handleApiError(error, "Admin Orders PATCH", "Failed to update order");
  }
}
