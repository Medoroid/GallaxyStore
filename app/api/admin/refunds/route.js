import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyAdmin } from "../_lib/verifyAdmin";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Client bound to the admin's own JWT — required for RPCs that check is_admin()
function getUserClient(request) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// Finance actions (mark_refund_completed/failed) are revoked from authenticated
// users and granted only to service_role, so they must run on this client.
function getFinanceClient() {
  return getServiceRoleClient();
}

function badRequest(message) {
  return Response.json({ success: false, message }, { status: 400 });
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseAmount(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
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

    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    // Audit writes are best-effort; finance changes must not fail because the
    // service-role key is missing.
    const audit = async (entry) => {
      try {
        await recordAdminAudit(getFinanceClient(), {
          actorId: auth.user.id,
          actorEmail: auth.user.email ?? null,
          ...entry,
        });
      } catch (error) {
        logger.warn("[Admin Refunds] audit skipped:", error.message);
      }
    };

    const {
      action,
      order_id,
      amount,
      reason,
      return_id,
      payment_id,
      refund_id,
      payment_reference,
      new_status,
      resolution_note,
    } = body || {};

    if (action === "issue_refund") {
      if (!isUuid(order_id)) return badRequest("A valid order_id is required");
      if (return_id && !isUuid(return_id)) return badRequest("Invalid return_id");
      if (payment_id && !isUuid(payment_id)) return badRequest("Invalid payment_id");

      const parsedAmount = parseAmount(amount);
      if (parsedAmount === null) {
        return badRequest("Refund amount must be a positive number");
      }
      if (typeof reason !== "string" || reason.trim().length < 3) {
        return badRequest("A refund reason of at least 3 characters is required");
      }

      // issue_refund() stays executable by authenticated admins and re-checks
      // is_admin() itself, so the caller's JWT is the correct identity here.
      const { data, error } = await getUserClient(request).rpc("issue_refund", {
        p_order_id: order_id,
        p_amount: parsedAmount,
        p_reason: reason.trim(),
        p_return_id: return_id || null,
        p_payment_id: payment_id || null,
      });

      if (error) {
        logger.error("[Admin Refunds] issue_refund failed:", error.message);
        return badRequest(error.message || "Failed to issue refund");
      }

      await audit({
        action: "refund.created",
        entityType: "refund",
        entityId: data?.id,
        details: { order_id, amount: parsedAmount, reason: reason.trim() },
      });

      return Response.json({ success: true, refund: data });
    }

    if (action === "mark_completed") {
      if (!isUuid(refund_id)) return badRequest("A valid refund_id is required");
      if (
        payment_reference != null &&
        (typeof payment_reference !== "string" || payment_reference.length > 200)
      ) {
        return badRequest("Invalid payment_reference");
      }

      const { data, error } = await getFinanceClient().rpc("mark_refund_completed", {
        p_refund_id: refund_id,
        p_payment_reference: payment_reference?.trim() || null,
      });

      if (error) {
        logger.error("[Admin Refunds] mark_refund_completed failed:", error.message);
        return badRequest(error.message || "Failed to complete refund");
      }

      await audit({
        action: "refund.completed",
        entityType: "refund",
        entityId: refund_id,
        details: { payment_reference: payment_reference?.trim() || null },
      });

      return Response.json({ success: true, result: data });
    }

    if (action === "mark_failed") {
      if (!isUuid(refund_id)) return badRequest("A valid refund_id is required");

      const { data, error } = await getFinanceClient().rpc("mark_refund_failed", {
        p_refund_id: refund_id,
        p_reason: typeof reason === "string" ? reason.trim() || null : null,
      });

      if (error) {
        logger.error("[Admin Refunds] mark_refund_failed failed:", error.message);
        return badRequest(error.message || "Failed to mark refund failed");
      }

      await audit({
        action: "refund.failed",
        entityType: "refund",
        entityId: refund_id,
        details: { reason: reason?.trim() || null },
      });

      return Response.json({ success: true, result: data });
    }

    if (action === "update_return_status") {
      if (!isUuid(return_id)) return badRequest("A valid return_id is required");
      if (typeof new_status !== "string" || !new_status) {
        return badRequest("new_status is required");
      }

      const allowed = ["requested", "approved", "rejected", "item_received", "completed"];
      if (!allowed.includes(new_status)) {
        return badRequest("Invalid return status");
      }

      // update_return_status() re-checks is_admin(), so keep the caller JWT.
      const { data, error } = await getUserClient(request).rpc("update_return_status", {
        p_return_id: return_id,
        p_new_status: new_status,
        p_resolution_note: resolution_note?.trim() || null,
      });

      if (error) {
        logger.error("[Admin Refunds] update_return_status failed:", error.message);
        return badRequest(error.message || "Failed to update return");
      }

      await audit({
        action: "return.status_changed",
        entityType: "return",
        entityId: return_id,
        details: { status: new_status, note: resolution_note?.trim() || null },
      });

      return Response.json({ success: true, result: data });
    }

    return badRequest("Invalid action");
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

    let client;
    let scoped = false;
    try {
      client = getServiceRoleClient();
    } catch (error) {
      logger.warn(
        "[Admin Refunds] SUPABASE_SERVICE_ROLE_KEY missing, using admin JWT:",
        error.message
      );
      client = getUserClient(request);
      scoped = true;
    }

    if (scoped) {
      const { data: isAdmin, error: adminError } = await client.rpc("is_admin");
      if (adminError || isAdmin !== true) {
        return Response.json(
          {
            success: false,
            message:
              "Cannot load refunds: SUPABASE_SERVICE_ROLE_KEY is not set and this account is not an admin in the database.",
          },
          { status: 403 }
        );
      }
    }

    const { data, error } = await client
      .from("refunds")
      .select("*, orders!inner(id, order_number, total, currency, status)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ success: true, refunds: data || [] });
  } catch (error) {
    return handleApiError(error, "Admin Refunds GET", "Failed to fetch refunds");
  }
}
