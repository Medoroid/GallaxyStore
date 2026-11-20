import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";
import {
  isMissingRelation,
  migrationRequiredResponse,
  requireUser,
} from "@/lib/creator/api";
import { migrationGuard } from "@/lib/design-studio/server";
import {
  GALLERY_ROW_SELECT,
  normalizeGalleryRow,
  validatePublishInput,
} from "@/lib/design-studio/publish-input";
import { PRODUCT_ROW_SELECT, normalizeProductRow } from "@/lib/design-studio/product-input";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getPublicStoreSettings } from "@/lib/storeSettings";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public-read previews bucket (plan D7: originals stay in design-uploads). */
const PREVIEW_BUCKET = "design-previews";

const VALIDATION_MESSAGES = {
  invalid_body: "Invalid request body.",
  invalid_target: "Choose what to publish.",
  invalid_product_id: "Select a product configuration to publish.",
  invalid_name: "Product name must be 1-200 characters.",
  invalid_price: "Enter a valid price.",
  invalid_description: "Description is too long.",
  invalid_category: "That category is not available.",
  invalid_title: "Title must be 2-120 characters.",
  invalid_tags: "Tags must be up to 30 items of up to 40 characters each.",
  invalid_visibility: "Visibility must be public or unlisted.",
  invalid_preview_path: "That preview does not belong to this design.",
  no_mockups: "Generate at least one product preview first.",
  already_submitted: "Already submitted — waiting for review.",
  already_published: "Already approved and live.",
  invalid_status: "This item's current status doesn't allow publishing.",
  publish_disabled: "Publishing is disabled for your creator profile.",
  design_archived: "This design is archived and cannot be published.",
};

const STATUS_BY_CODE = {
  invalid_target: 400,
  invalid_product_id: 400,
  invalid_name: 400,
  invalid_price: 400,
  invalid_description: 400,
  invalid_category: 400,
  invalid_title: 400,
  invalid_tags: 400,
  invalid_visibility: 400,
  invalid_preview_path: 400,
  no_mockups: 409,
  already_submitted: 409,
  already_published: 409,
  invalid_status: 409,
  design_archived: 409,
  publish_disabled: 403,
};

function validationResponse(result) {
  return Response.json(
    {
      success: false,
      code: result.code,
      field: result.field,
      message: VALIDATION_MESSAGES[result.code] ?? "Invalid request.",
    },
    { status: 400 }
  );
}

function errorResponse(code, status, fallback) {
  return Response.json(
    { success: false, code, message: VALIDATION_MESSAGES[code] ?? fallback },
    { status }
  );
}

/** Owner-scoped existence check with the CALLER's JWT — proves ownership. */
async function loadOwnedDesign(auth, id) {
  const { data, error } = await auth.client
    .from("user_designs")
    .select("id, title, status")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The publish functions live in their own migration on top of the core one —
 * detect that specific miss FIRST (before isMissingRelation, which would
 * blame the core file) and answer with the exact next step.
 */
function publishFunctionsMissing(error) {
  if (!error || typeof error !== "object") return false;
  const message = String(error.message || "");
  const code = String(error.code || "");
  return (
    code === "42883" ||
    message.includes("Could not find the function") ||
    (code === "PGRST202" && message.includes("creator_publish_product")) ||
    (message.includes("creator_publish_product") && message.includes("does not exist"))
  );
}

function publishFunctionsResponse() {
  return Response.json(
    {
      success: false,
      code: "MIGRATION_REQUIRED",
      message:
        "Publishing functions are missing in this environment. Apply supabase/migrations/20261110170000_creator_studio_publish_functions.sql first.",
      context: "designs.publish",
    },
    { status: 503 }
  );
}

/** Map a `publish:*` RPC failure (or a house code) to the standard shape. */
function rpcErrorResponse(error) {
  if (publishFunctionsMissing(error)) return publishFunctionsResponse();

  const match = String(error?.message || "").match(/publish:([a-z_]+)/);
  if (match) {
    let code = match[1];
    if (code === "design_product_not_found") code = "not_found";
    const status = STATUS_BY_CODE[code] ?? (isMappedErrorCode(code) ? 409 : 400);
    return Response.json(
      {
        success: false,
        code,
        message: VALIDATION_MESSAGES[code] ?? "Publishing failed.",
      },
      { status }
    );
  }

  if (isMissingRelation(error)) return migrationRequiredResponse("designs.publish");
  throw error;
}

/**
 * Build the public image URLs for a product publish from the row's stored
 * mockups: only records in THIS design's preview namespace, deduped, capped
 * at MAX_PRODUCT_IMAGES (12). A store listing never ships without a real
 * generated preview.
 */
function mockupImageUrls(row, designId) {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PREVIEW_BUCKET}`;
  const seen = new Set();
  const images = [];
  const records = Array.isArray(row?.mockups) ? row.mockups : [];
  for (const record of records) {
    const path = record && typeof record.path === "string" ? record.path : "";
    if (!path.startsWith(`mockups/${designId}/`) || seen.has(path)) continue;
    seen.add(path);
    images.push(`${base}/${path}`);
    if (images.length >= 12) break;
  }
  return images;
}

/** First usable cover path from the design's generated mockups, or null. */
async function derivePreviewPath(admin, designId) {
  const { data, error } = await admin
    .from("creator_design_products")
    .select("mockups, created_at")
    .eq("design_id", designId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  for (const row of Array.isArray(data) ? data : []) {
    const images = mockupImageUrls(row, designId);
    if (images.length > 0) {
      return images[0].split(`/storage/v1/object/public/${PREVIEW_BUCKET}/`)[1] ?? null;
    }
  }
  return null;
}

/**
 * POST /api/designs/[id]/publish — creator submission (Phase 7).
 *
 * Two targets, one entry point (plan §2):
 *  A. product — a real store listing. Creates/updates the linked product as a
 *     HIDDEN DRAFT via the service-role RPC `creator_publish_product` and
 *     moves the configuration row to pending_review. Nothing is publicly
 *     purchasable until the admin approval RPC flips it.
 *  B. gallery — a creator-gallery item submitted for review without selling.
 *
 * Order: rate → auth → uuid → migration guard → body → PURE validation →
 * owner design → archived gate → profile (can_publish) → target branch.
 * Approval state, ownership, fulfillment and the store columns are never
 * accepted from the client; currency comes from store settings.
 */
export async function POST(request, { params }) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`design-publish:${ip}`, {
      maxRequests: 30,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(String(id))) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }

    // Core studio tables — honest 503 BEFORE reading the body.
    const guard = await migrationGuard(auth.client, "designs.publish");
    if (guard.missing) return guard.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse("invalid_body", 400, "Invalid request body.");
    }

    // validatePublishInput answers { ok, value } — the payload below is the
    // validated `value` (target-branch fields, never the envelope).
    const validated = validatePublishInput(body, { designId: id });
    if (!validated.ok) return validationResponse(validated);
    const value = validated.value;

    const design = await loadOwnedDesign(auth, id);
    if (!design) {
      return Response.json(
        { success: false, code: "not_found", message: "Design not found." },
        { status: 404 }
      );
    }
    if (design.status === "archived") {
      return errorResponse("design_archived", 409, "This design is archived.");
    }

    // Persona is public by design; we only read our own profile id from it.
    const { data: profile, error: profileError } = await auth.client
      .from("creator_profiles")
      .select("id, can_publish")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (profileError) {
      if (isMissingRelation(profileError)) {
        return migrationRequiredResponse("designs.publish");
      }
      throw profileError;
    }
    if (!profile) {
      return Response.json(
        {
          success: false,
          code: "creator_profile_required",
          message: "Create your creator profile to publish.",
        },
        { status: 403 }
      );
    }
    if (!profile.can_publish) {
      return errorResponse("publish_disabled", 403, "Publishing is disabled for your profile.");
    }

    const admin = getServiceRoleClient();

    // ----- target A: store product -----------------------------------------
    if (value.target === "product") {
      const { data: row, error: rowError } = await auth.client
        .from("creator_design_products")
        .select(PRODUCT_ROW_SELECT)
        .eq("id", value.designProductId)
        .eq("design_id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (rowError) {
        if (isMissingRelation(rowError)) return migrationRequiredResponse("designs.publish");
        throw rowError;
      }
      if (!row) {
        return Response.json(
          { success: false, code: "not_found", message: "Product configuration not found." },
          { status: 404 }
        );
      }

      if (row.status === "pending_review") {
        return errorResponse("already_submitted", 409, "Already submitted for review.");
      }
      if (row.status === "approved") {
        return errorResponse("already_published", 409, "Already approved and live.");
      }
      if (row.status !== "draft" && row.status !== "rejected") {
        return errorResponse("invalid_status", 409, "This row cannot be published.");
      }

      const images = mockupImageUrls(row, id);
      if (images.length === 0) {
        return errorResponse("no_mockups", 409, "Generate at least one product preview first.");
      }

      if (value.categoryId) {
        const { data: category, error: categoryError } = await admin
          .from("categories")
          .select("id")
          .eq("id", value.categoryId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();
        if (categoryError) throw categoryError;
        if (!category) {
          return errorResponse("invalid_category", 400, "That category is not available.");
        }
      }

      // Store-wide currency (store settings), never client-supplied.
      const settings = await getPublicStoreSettings();
      const currencyRaw = String(settings.currency || "EGP").trim().toUpperCase();
      const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "EGP";

      const name = String(value.name ?? design.title ?? "").trim();
      if (!name || name.length > 200) {
        return errorResponse("invalid_name", 400, "Product name must be 1-200 characters.");
      }

      const payload = {
        name,
        base_price: value.basePrice,
        compare_at_price: value.compareAtPrice,
        description: value.description,
        short_description: value.shortDescription,
        category_id: value.categoryId,
        currency,
        images,
      };

      const isFirstPublish = row.product_id == null;
      let productId = null;
      let rpcError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await admin.rpc("creator_publish_product", {
          p_design_product_id: value.designProductId,
          p_payload: payload,
        });
        rpcError = result.error;
        if (!rpcError) {
          productId = result.data;
          break;
        }
        // One retry only for a slug/unique race — anything else maps below.
        if (rpcError.code !== "23505") break;
      }
      if (rpcError) return rpcErrorResponse(rpcError);

      // Fresh row for the response (status moved to pending_review).
      const { data: fresh, error: freshError } = await auth.client
        .from("creator_design_products")
        .select(PRODUCT_ROW_SELECT)
        .eq("id", value.designProductId)
        .eq("design_id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (freshError) {
        if (isMissingRelation(freshError)) return migrationRequiredResponse("designs.publish");
        throw freshError;
      }

      return Response.json(
        {
          success: true,
          target: "product",
          product_id: productId,
          ...(fresh ? { product: normalizeProductRow(fresh) } : {}),
        },
        { status: isFirstPublish ? 201 : 200 }
      );
    }

    // ----- target B: creator gallery ---------------------------------------
    const { data: existing, error: existingError } = await auth.client
      .from("creator_gallery_items")
      .select(GALLERY_ROW_SELECT)
      .eq("design_id", id)
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) {
      if (isMissingRelation(existingError)) return migrationRequiredResponse("designs.publish");
      throw existingError;
    }

    const galleryTitle = String(value.title ?? design.title ?? "").trim();
    if (galleryTitle.length < 2 || galleryTitle.length > 120) {
      return errorResponse("invalid_title", 400, "Title must be 2-120 characters.");
    }

    if (existing) {
      if (existing.status === "pending_review") {
        // Idempotent: a second submit returns the submission that is already
        // in the queue, untouched.
        return Response.json({
          success: true,
          target: "gallery",
          created: false,
          gallery: normalizeGalleryRow(existing),
        });
      }
      if (existing.status === "approved") {
        return errorResponse("already_published", 409, "Already approved and published.");
      }
      if (existing.status === "archived") {
        return errorResponse("invalid_status", 409, "This gallery item cannot be published.");
      }

      // draft / rejected → resubmit: update the SAME item (single statement,
      // no RPC needed). Cover: new path wins, else keep the stored one.
      let previewPath = value.previewPath;
      if (!previewPath && !existing.preview_path) {
        previewPath = await derivePreviewPath(admin, id);
      } else if (!previewPath) {
        previewPath = existing.preview_path;
      }

      const { data: updated, error: updateError } = await admin
        .from("creator_gallery_items")
        .update({
          title: galleryTitle,
          description: value.description,
          tags: value.tags,
          visibility: value.visibility,
          preview_path: previewPath,
          status: "pending_review",
          rejection_reason: null,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select(GALLERY_ROW_SELECT)
        .maybeSingle();
      if (updateError) {
        if (isMissingRelation(updateError)) return migrationRequiredResponse("designs.publish");
        throw updateError;
      }

      return Response.json({
        success: true,
        target: "gallery",
        created: false,
        gallery: normalizeGalleryRow(updated ?? existing),
      });
    }

    // First gallery submission → insert (service role; owner RLS is
    // SELECT-only). 23505 (unique index race) → return the winner.
    let previewPath = value.previewPath;
    if (!previewPath) {
      previewPath = await derivePreviewPath(admin, id);
    }

    const { data: inserted, error: insertError } = await admin
      .from("creator_gallery_items")
      .insert({
        design_id: id,
        owner_id: auth.user.id,
        creator_profile_id: profile.id,
        title: galleryTitle,
        description: value.description,
        preview_path: previewPath,
        tags: value.tags,
        visibility: value.visibility,
        status: "pending_review",
        submitted_at: new Date().toISOString(),
      })
      .select(GALLERY_ROW_SELECT)
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raced, error: raceReadError } = await admin
          .from("creator_gallery_items")
          .select(GALLERY_ROW_SELECT)
          .eq("design_id", id)
          .eq("owner_id", auth.user.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (raceReadError) {
          if (isMissingRelation(raceReadError)) return migrationRequiredResponse("designs.publish");
          throw raceReadError;
        }
        if (raced) {
          return Response.json({
            success: true,
            target: "gallery",
            created: false,
            gallery: normalizeGalleryRow(raced),
          });
        }
      }
      if (isMissingRelation(insertError)) return migrationRequiredResponse("designs.publish");
      throw insertError;
    }

    return Response.json(
      {
        success: true,
        target: "gallery",
        created: true,
        gallery: normalizeGalleryRow(inserted),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Design publish POST", "Could not submit for publishing.");
  }
}
