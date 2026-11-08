import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const STATUSES = new Set([
  "new",
  "reviewing",
  "quoted",
  "accepted",
  "in_production",
  "completed",
  "cancelled",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("custom_print_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const requests = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: signed, error: signedError } = await db.storage
          .from("custom-print-designs")
          .createSignedUrl(row.design_path, 3600);

        if (signedError) {
          logger.warn("[Admin Custom Prints] signed URL failed:", signedError.message);
        }

        return { ...row, design_url: signed?.signedUrl ?? null };
      })
    );

    return Response.json({ success: true, requests });
  } catch (error) {
    return handleApiError(error, "Admin Custom Prints GET", "Failed to fetch custom print requests");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid request id" }, { status: 400 });
    }

    const payload = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!STATUSES.has(status)) {
        return Response.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      payload.status = status;
    }

    if (body.quoted_amount !== undefined && body.quoted_amount !== null && body.quoted_amount !== "") {
      const amount = Number(body.quoted_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return Response.json({ success: false, message: "Invalid quote amount" }, { status: 400 });
      }
      payload.quoted_amount = Number(amount.toFixed(2));
    } else if (body.quoted_amount === null || body.quoted_amount === "") {
      payload.quoted_amount = null;
    }

    if (typeof body.currency === "string") {
      const currency = body.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return Response.json({ success: false, message: "Invalid currency" }, { status: 400 });
      }
      payload.currency = currency;
    }

    if (typeof body.admin_notes === "string") {
      payload.admin_notes = body.admin_notes.trim().slice(0, 2000) || null;
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("custom_print_requests")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ success: false, message: "Request not found" }, { status: 404 });
    }

    if (payload.status && ["reviewing", "quoted", "accepted", "completed", "cancelled"].includes(payload.status)) {
      const { sendCustomPrintUpdate } = await import("@/lib/email");
      await sendCustomPrintUpdate({
        requestNumber: data.request_number,
        customerName: data.customer_name,
        customerEmail: data.customer_email,
        status: payload.status,
        quotedAmount: data.quoted_amount,
        currency: data.currency,
        adminNotes: data.admin_notes,
      }).catch((emailError) =>
        logger.warn("[Admin Custom Prints] email failed:", emailError?.message)
      );
    }

    return Response.json({ success: true, request: data });
  } catch (error) {
    return handleApiError(error, "Admin Custom Prints PATCH", "Failed to update custom print request");
  }
}
