import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUEUE_STATUSES = new Set([
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "archived",
  "all",
]);
const TARGETS = new Set(["product", "gallery"]);
const DECISIONS = new Set(["approve", "reject"]);

/** Per-source queue cap; the merged list is capped again below. */
const QUEUE_LIMIT = 100;

const PRODUCT_QUEUE_SELECT = [
  "id",
  "design_id",
  "creator_profile_id",
  "product_id",
  "status",
  "rejection_reason",
  "submitted_at",
  "reviewed_at",
  "fulfillment_mode",
  "stock_buffer",
  "selected_colors",
  "selected_sizes",
  "mockups",
  "created_at",
  "template:creator_product_templates(id, template_key, name, name_ar)",
  "creator:creator_profiles(id, username, display_name, avatar_url)",
  "product:products(id, name, base_price, currency, status, visibility)",
].join(", ");

const GALLERY_QUEUE_SELECT = [
  "id",
  "design_id",
  "creator_profile_id",
  "product_id",
  "title",
  "description",
  "preview_path",
  "tags",
  "visibility",
  "status",
  "rejection_reason",
  "submitted_at",
  "reviewed_at",
  "published_at",
  "created_at",
  "creator:creator_profiles(id, username, display_name, avatar_url)",
  "product:products(id, name, base_price, currency, status, visibility)",
].join(", ");

const REVIEW_MESSAGES = {
  invalid_target: "Unknown submission type.",
  invalid_decision: "Decision must be approve or reject.",
  reason_required: "A reason is required to reject.",
  not_found: "Submission not found.",
  invalid_status: "This submission is not awaiting review.",
  product_missing: "The linked store product is missing.",
};

const REVIEW_STATUS = {
  invalid_target: 400,
  invalid_decision: 400,
  reason_required: 400,
  not_found: 404,
  invalid_status: 409,
  product_missing: 409,
};

/** Creator management toggles: action → column, audit action, human label. */
const CREATOR_TOGGLES = {
  feature: { field: "is_featured", audit: "creator.featured_toggled" },
  permissions: { field: "can_publish", audit: "creator.publish_permission_toggled" },
  archive: { field: "is_active", audit: "creator.active_toggled" },
};

function badRequest(code, message) {
  return Response.json({ success: false, code, message }, { status: 400 });
}

/**
 * The review function ships in the phase-7 migration on top of the core one —
 * detect that specific miss FIRST and answer with the exact next step.
 */
function reviewFunctionsMissing(error) {
  if (!error || typeof error !== "object") return false;
  const message = String(error.message || "");
  const code = String(error.code || "");
  return (
    code === "42883" ||
    message.includes("Could not find the function") ||
    (code === "PGRST202" && message.includes("admin_review_creator_submission")) ||
    (message.includes("admin_review_creator_submission") && message.includes("does not exist"))
  );
}

function reviewFunctionsResponse() {
  return Response.json(
    {
      success: false,
      code: "MIGRATION_REQUIRED",
      message:
        "Review functions are missing in this environment. Apply supabase/migrations/20261110170000_creator_studio_publish_functions.sql first.",
      context: "admin.creators.review",
    },
    { status: 503 }
  );
}

/** Map a `review:*` RPC failure (or a missing-function miss) to the house shape. */
function reviewErrorResponse(error) {
  if (reviewFunctionsMissing(error)) return reviewFunctionsResponse();

  const match = String(error?.message || "").match(/review:([a-z_]+)/);
  if (match) {
    const code = match[1];
    return Response.json(
      {
        success: false,
        code,
        message: REVIEW_MESSAGES[code] ?? "Review failed.",
      },
      { status: REVIEW_STATUS[code] ?? 400 }
    );
  }

  if (isMissingRelation(error)) return migrationRequiredResponse("admin.creators");
  throw error;
}

/** Surface a query failure: honest 503 for pending migrations, else rethrow. */
function guardResult(result) {
  if (result.error) {
    if (isMissingRelation(result.error)) {
      return migrationRequiredResponse("admin.creators");
    }
    throw result.error;
  }
  return null;
}

function submissionTimestamp(row) {
  const value = row?.submitted_at ?? row?.created_at;
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * GET /api/admin/creators — creator management + submission queue.
 *
 * The queue is the UNION of both submission tables (plan §4): product rows
 * (with their generated mockups for review) and gallery rows, merged and
 * ordered by submission time. Per-creator stats come from the same two
 * status scans that feed the pending badges — no extra roundtrips. Reads use
 * the service role because the studio tables are SELECT-only under RLS for
 * clients; the route still sits behind verifyAdmin.
 */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending_review";
    if (!QUEUE_STATUSES.has(status)) {
      return badRequest("invalid_status", "Unknown queue status.");
    }

    const db = getServiceRoleClient();

    const queueQuery = (table, select) => {
      let query = db.from(table).select(select).is("deleted_at", null);
      if (status !== "all") query = query.eq("status", status);
      return query
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(QUEUE_LIMIT);
    };

    const [profiles, productStats, galleryStats, productQueue, galleryQueue] =
      await Promise.all([
        db
          .from("creator_profiles")
          .select(
            "id, user_id, username, display_name, avatar_url, bio, is_featured, is_active, can_publish, created_at, updated_at"
          )
          .order("created_at", { ascending: false }),
        db.from("creator_design_products").select("creator_profile_id, status").is("deleted_at", null),
        db.from("creator_gallery_items").select("creator_profile_id, status").is("deleted_at", null),
        queueQuery("creator_design_products", PRODUCT_QUEUE_SELECT),
        queueQuery("creator_gallery_items", GALLERY_QUEUE_SELECT),
      ]);

    for (const result of [profiles, productStats, galleryStats, productQueue, galleryQueue]) {
      const response = guardResult(result);
      if (response) return response;
    }

    // Per-creator stats (also the pending badge counts) from the two scans.
    const stats = new Map();
    const statsFor = (profileId) => {
      if (!profileId) return null;
      let entry = stats.get(profileId);
      if (!entry) {
        entry = { products: 0, products_pending: 0, gallery: 0, gallery_pending: 0 };
        stats.set(profileId, entry);
      }
      return entry;
    };
    for (const row of productStats.data ?? []) {
      const entry = statsFor(row.creator_profile_id);
      if (!entry) continue;
      entry.products += 1;
      if (row.status === "pending_review") entry.products_pending += 1;
    }
    for (const row of galleryStats.data ?? []) {
      const entry = statsFor(row.creator_profile_id);
      if (!entry) continue;
      entry.gallery += 1;
      if (row.status === "pending_review") entry.gallery_pending += 1;
    }

    const creators = (profiles.data ?? []).map((profile) => ({
      ...profile,
      stats: stats.get(profile.id) ?? {
        products: 0,
        products_pending: 0,
        gallery: 0,
        gallery_pending: 0,
      },
    }));

    const counts = { products_pending: 0, gallery_pending: 0 };
    for (const entry of stats.values()) {
      counts.products_pending += entry.products_pending;
      counts.gallery_pending += entry.gallery_pending;
    }

    const queue = [
      ...(productQueue.data ?? []).map((row) => ({ kind: "product", ...row })),
      ...(galleryQueue.data ?? []).map((row) => ({ kind: "gallery", ...row })),
    ]
      .sort((a, b) => submissionTimestamp(b) - submissionTimestamp(a))
      .slice(0, QUEUE_LIMIT);

    return Response.json({
      success: true,
      creators,
      queue,
      counts: { ...counts, creators: creators.length, queue: queue.length },
      status,
    });
  } catch (error) {
    return handleApiError(error, "Admin Creators GET", "Failed to load creator management data");
  }
}

/**
 * One pending submission through the transactional review RPC (phase 7).
 * The RPC writes admin_audit_log itself with the actor parameters — the
 * route never writes approval state directly and never double-audits.
 */
async function reviewSubmission(auth, body) {
  const { target, id, decision, reason } = body;

  if (!TARGETS.has(target)) return badRequest("invalid_target", "Unknown submission type.");
  if (!DECISIONS.has(decision)) {
    return badRequest("invalid_decision", "Decision must be approve or reject.");
  }
  if (!UUID_RE.test(String(id ?? ""))) return badRequest("invalid_id", "Submission id is required.");

  const cleanReason = reason == null ? null : String(reason).trim();
  if (decision === "reject" && !cleanReason) {
    return badRequest("reason_required", "A reason is required to reject.");
  }
  if (cleanReason && cleanReason.length > 1000) {
    return badRequest("invalid_reason", "The reason must be 1000 characters or fewer.");
  }

  const db = getServiceRoleClient();
  const { data, error } = await db.rpc("admin_review_creator_submission", {
    p_target: target,
    p_id: id,
    p_decision: decision,
    p_reason: cleanReason,
    p_actor_id: auth.user.id,
    p_actor_email: auth.user.email ?? null,
  });
  if (error) return reviewErrorResponse(error);

  logger.info("[Admin Creators] submission reviewed", {
    target,
    id,
    decision,
    by: auth.user.id,
  });

  return Response.json({ success: true, ...(data ?? {}) });
}

/** Feature / publish-permission / archive toggles on one creator profile. */
async function toggleCreatorFlag(auth, body, action) {
  const config = CREATOR_TOGGLES[action];
  const { creator_id: creatorId, value } = body;

  if (!UUID_RE.test(String(creatorId ?? ""))) {
    return badRequest("invalid_id", "Creator id is required.");
  }
  if (typeof value !== "boolean") {
    return badRequest("invalid_value", "value must be a boolean.");
  }

  const db = getServiceRoleClient();
  const { data: existing, error } = await db
    .from("creator_profiles")
    .select("id, username, is_featured, can_publish, is_active")
    .eq("id", creatorId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.creators");
    throw error;
  }
  if (!existing) {
    return Response.json(
      { success: false, code: "not_found", message: "Creator not found." },
      { status: 404 }
    );
  }

  const current = existing[config.field];
  if (current === value) {
    return Response.json({ success: true, unchanged: true, [config.field]: value });
  }

  const { error: updateError } = await db
    .from("creator_profiles")
    .update({ [config.field]: value, updated_at: new Date().toISOString() })
    .eq("id", creatorId);
  if (updateError) {
    if (isMissingRelation(updateError)) return migrationRequiredResponse("admin.creators");
    throw updateError;
  }

  logger.info("[Admin Creators] profile flag changed", {
    creatorId,
    field: config.field,
    from: current,
    to: value,
    by: auth.user.id,
  });

  await recordAdminAudit(db, {
    actorId: auth.user.id,
    actorEmail: auth.user.email ?? null,
    action: config.audit,
    entityType: "creator_profile",
    entityId: creatorId,
    details: { field: config.field, from: current, to: value, username: existing.username },
  });

  return Response.json({ success: true, [config.field]: value });
}

/**
 * Withdraw (archive) a submission — the admin-side escape hatch Phase 6
 * pointed at (`product_linked` 409): the linked store product is hidden
 * FIRST so an archived submission can never leave a visible listing behind.
 */
async function archiveSubmission(auth, body) {
  const { target, id } = body;

  if (!TARGETS.has(target)) return badRequest("invalid_target", "Unknown submission type.");
  if (!UUID_RE.test(String(id ?? ""))) return badRequest("invalid_id", "Submission id is required.");

  const table = target === "product" ? "creator_design_products" : "creator_gallery_items";
  const db = getServiceRoleClient();

  const { data: row, error } = await db
    .from(table)
    .select("id, status, product_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return migrationRequiredResponse("admin.creators");
    throw error;
  }
  if (!row) {
    return Response.json(
      { success: false, code: "not_found", message: "Submission not found." },
      { status: 404 }
    );
  }
  if (row.status === "archived") {
    return Response.json({ success: true, unchanged: true, status: "archived" });
  }

  const now = new Date().toISOString();

  if (target === "product" && row.product_id) {
    const { error: hideError } = await db
      .from("products")
      .update({ status: "draft", visibility: "hidden", updated_at: now })
      .eq("id", row.product_id)
      .is("deleted_at", null);
    if (hideError) {
      if (isMissingRelation(hideError)) return migrationRequiredResponse("admin.creators");
      throw hideError;
    }
  }

  const { error: archiveError } = await db
    .from(table)
    .update({ status: "archived", updated_at: now })
    .eq("id", id);
  if (archiveError) {
    if (isMissingRelation(archiveError)) return migrationRequiredResponse("admin.creators");
    throw archiveError;
  }

  logger.info("[Admin Creators] submission archived", {
    target,
    id,
    from: row.status,
    by: auth.user.id,
  });

  await recordAdminAudit(db, {
    actorId: auth.user.id,
    actorEmail: auth.user.email ?? null,
    action: "creator_submission_archived",
    entityType: target === "product" ? "creator_design_product" : "creator_gallery_item",
    entityId: id,
    details: { from: row.status, product_id: row.product_id ?? null },
  });

  return Response.json({ success: true, status: "archived" });
}

/**
 * PATCH /api/admin/creators — allow-listed actions only:
 *   review             → admin_review_creator_submission RPC (actor params;
 *                        creators can never reach this route — verifyAdmin)
 *   feature|permissions|archive → creator_profiles boolean columns + audit
 *   archive_submission → withdraw a submission (product hidden first) + audit
 * Approval columns are NEVER writable directly from a body field.
 */
export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("invalid_body", "Invalid request body.");
    }

    const action = body?.action;
    if (action === "review") return reviewSubmission(auth, body);
    if (Object.hasOwn(CREATOR_TOGGLES, action)) return toggleCreatorFlag(auth, body, action);
    if (action === "archive_submission") return archiveSubmission(auth, body);

    return badRequest("unknown_action", "Unknown action.");
  } catch (error) {
    return handleApiError(error, "Admin Creators PATCH", "Could not apply the change");
  }
}
