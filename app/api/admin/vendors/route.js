import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const STORE_ACTIONS = {
  approve_store: "approved",
  reject_store: "rejected",
  suspend_store: "suspended",
  reinstate_store: "approved",
};

function isAlreadyDecided(error) {
  if (!error) return false;
  return /not found or not pending|already (approved|rejected|reviewed)/i.test(
    String(error.message || "")
  );
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const { data: stores, error } = await db
      .from("stores")
      .select("id, name, slug, status, created_at, owner_id, description, logo_url")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // profiles has no email column; emails live in auth.users.
    const ownerIds = [...new Set((stores ?? []).map((store) => store.owner_id).filter(Boolean))];
    const owners = new Map();
    await Promise.all(
      ownerIds.map(async (ownerId) => {
        const { data } = await db.auth.admin.getUserById(ownerId);
        if (data?.user) {
          owners.set(ownerId, {
            full_name:
              data.user.user_metadata?.full_name ||
              data.user.user_metadata?.name ||
              null,
            email: data.user.email ?? null,
          });
        }
      })
    );

    const vendors = (stores ?? []).map((store) => ({
      ...store,
      owner: owners.get(store.owner_id) ?? null,
    }));

    // Payout decisions are made here, not only through the (dead) API branches.
    // `select("*")` intentionally tolerates the payout_method column that is
    // added by migration 20261117160000.
    const { data: payoutRequests, error: payoutError } = await db
      .from("vendor_payout_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (payoutError && !["42P01", "PGRST205"].includes(String(payoutError.code))) {
      throw payoutError;
    }

    return Response.json({ success: true, vendors, payoutRequests: payoutRequests ?? [] });
  } catch (error) {
    return handleApiError(error, "Admin Vendors GET", "Failed to fetch vendors");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const body = await request.json().catch(() => ({}));
    const { action, store_id, payout_request_id, reason, notes } = body || {};

    if (Object.hasOwn(STORE_ACTIONS, action)) {
      if (!store_id) {
        return Response.json({ success: false, message: "store_id is required" }, { status: 400 });
      }

      const { data: store, error: storeError } = await db
        .from("stores")
        .select("id, status")
        .eq("id", store_id)
        .maybeSingle();

      if (storeError) throw storeError;
      if (!store) {
        return Response.json({ success: false, message: "Store not found" }, { status: 404 });
      }

      const nextStatus = STORE_ACTIONS[action];
      if (store.status === nextStatus) {
        return Response.json({ success: true, status: nextStatus, unchanged: true });
      }

      const { error } = await db
        .from("stores")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", store_id);

      if (error) throw error;

      logger.info("[Admin Vendors] store status changed", {
        storeId: store_id,
        from: store.status,
        to: nextStatus,
        by: auth.user.id,
      });

      await recordAdminAudit(db, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "store.status_changed",
        entityType: "store",
        entityId: store_id,
        details: { from: store.status, to: nextStatus, reason: reason || null },
      });

      return Response.json({ success: true, status: nextStatus });
    }

    if (action === "approve_payout") {
      if (!payout_request_id) {
        return Response.json(
          { success: false, message: "payout_request_id is required" },
          { status: 400 }
        );
      }
      const { data, error } = await db.rpc("approve_vendor_payout_request", {
        p_request_id: payout_request_id,
        p_notes: notes || null,
      });
      if (error) {
        if (isAlreadyDecided(error)) {
          return Response.json(
            { success: false, message: "This payout request was already decided", unchanged: true },
            { status: 409 }
          );
        }
        throw error;
      }

      await recordAdminAudit(db, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "payout.approved",
        entityType: "payout_request",
        entityId: payout_request_id,
        details: {
          notes: notes || null,
          payout_id: data?.id ?? null,
          amount: data?.amount ?? null,
          store_id: data?.store_id ?? null,
        },
      });

      return Response.json({ success: true, result: data });
    }

    if (action === "reject_payout") {
      if (!payout_request_id) {
        return Response.json(
          { success: false, message: "payout_request_id is required" },
          { status: 400 }
        );
      }
      const { data, error } = await db.rpc("reject_vendor_payout_request", {
        p_request_id: payout_request_id,
        p_reason: reason || "Rejected by admin",
      });
      if (error) {
        if (isAlreadyDecided(error)) {
          return Response.json(
            { success: false, message: "This payout request was already decided", unchanged: true },
            { status: 409 }
          );
        }
        throw error;
      }

      await recordAdminAudit(db, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "payout.rejected",
        entityType: "payout_request",
        entityId: payout_request_id,
        details: { reason: reason || "Rejected by admin" },
      });

      return Response.json({ success: true, result: data });
    }

    return Response.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error, "Admin Vendors POST", "Failed to perform action");
  }
}
