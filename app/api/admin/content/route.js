import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import {
  validateBannerInput,
  validateSectionInput,
  storagePathFromPublicUrl,
  SITE_BANNER_BUCKET,
} from "@/lib/site-content";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLES = { banner: "site_banners", section: "site_sections" };
const ENTITY_TYPES = { banner: "site_banner", section: "site_section" };
const SELECT_COLUMNS =
  "id, page, placement, title, subtitle, body, eyebrow, section_type, image_url, link_url, button_label, config, sort_order, is_active, starts_at, ends_at, created_at, updated_at";

function resolveType(value) {
  const type = String(value || "").trim();
  return type === "banner" || type === "section" ? type : null;
}

function invalidTypeResponse() {
  return Response.json(
    { success: false, message: "type must be 'banner' or 'section'" },
    { status: 400 }
  );
}

/**
 * Both entities share the same lifecycle, so one route serves them:
 * GET (list both), POST (create), PATCH (update / reorder), DELETE.
 * Every write is admin-gated, validated against lib/site-content.ts (the same
 * rules mirrored by the DB CHECK constraints) and recorded in the audit log.
 */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const [bannersResult, sectionsResult] = await Promise.all([
      db
        .from("site_banners")
        .select(SELECT_COLUMNS)
        .order("placement", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      db
        .from("site_sections")
        .select(SELECT_COLUMNS)
        .order("placement", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (bannersResult.error) throw bannersResult.error;
    if (sectionsResult.error) throw sectionsResult.error;

    return Response.json({
      success: true,
      banners: bannersResult.data ?? [],
      sections: sectionsResult.data ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Admin Content GET", "Failed to load site content");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const type = resolveType(body?.type);
    if (!type) return invalidTypeResponse();

    const validation =
      type === "banner"
        ? validateBannerInput(body, { partial: false })
        : validateSectionInput(body, { partial: false });
    if (!validation.ok) {
      return Response.json({ success: false, message: validation.message }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const table = TABLES[type];
    const payload = validation.value;

    const { data: maxRow, error: maxError } = await db
      .from(table)
      .select("sort_order")
      .eq("page", payload.page)
      .eq("placement", payload.placement)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;

    const sortOrder = Number(maxRow?.sort_order ?? 0) + 1;
    const { data, error } = await db
      .from(table)
      .insert({ ...payload, sort_order: sortOrder, created_by: auth.user.id })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: `content.${type}.create`,
      entityType: ENTITY_TYPES[type],
      entityId: data.id,
      details: { page: data.page, placement: data.placement },
    });

    logger.info(`[Admin Content] ${type} created`, {
      id: data.id,
      placement: data.placement,
      by: auth.user.id,
    });
    return Response.json({ success: true, type, item: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Content POST", "Failed to create content");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const db = getServiceRoleClient();

    if (Array.isArray(body?.order)) {
      const type = resolveType(body.type);
      if (!type) return invalidTypeResponse();
      const table = TABLES[type];
      let updated = 0;
      for (const [index, entry] of body.order.entries()) {
        const id = String(entry?.id || "");
        if (!UUID_RE.test(id)) continue;
        const { error } = await db
          .from(table)
          .update({ sort_order: index + 1 })
          .eq("id", id);
        if (error) throw error;
        updated += 1;
      }
      if (updated === 0) {
        return Response.json(
          { success: false, message: "No valid ids provided" },
          { status: 400 }
        );
      }
      return Response.json({ success: true, updated });
    }

    const type = resolveType(body?.type);
    if (!type) return invalidTypeResponse();

    const id = String(body?.id || "");
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid content id" }, { status: 400 });
    }

    const validation =
      type === "banner"
        ? validateBannerInput(body, { partial: true })
        : validateSectionInput(body, { partial: true });
    if (!validation.ok) {
      return Response.json({ success: false, message: validation.message }, { status: 400 });
    }
    const patch = validation.value;
    if (Object.keys(patch).length === 0) {
      return Response.json({ success: false, message: "Nothing to update" }, { status: 400 });
    }

    const table = TABLES[type];
    const { data: existing, error: readError } = await db
      .from(table)
      .select(SELECT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) {
      return Response.json({ success: false, message: "Content not found" }, { status: 404 });
    }

    // Validate the MERGED row with the full rules (same as create), so a
    // partial edit can never leave the row in a state the DB CHECK or the
    // renderer would reject (e.g. image_text without an image).
    const merged = { ...existing, ...patch };
    const fullValidation =
      type === "banner"
        ? validateBannerInput(merged, { partial: false })
        : validateSectionInput(merged, { partial: false });
    if (!fullValidation.ok) {
      return Response.json(
        { success: false, message: fullValidation.message },
        { status: 400 }
      );
    }

    const payload = fullValidation.value;
    const { data, error } = await db
      .from(table)
      .update(payload)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return Response.json({ success: false, message: "Content not found" }, { status: 404 });
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: `content.${type}.update`,
      entityType: ENTITY_TYPES[type],
      entityId: id,
      details: { fields: Object.keys(patch) },
    });

    return Response.json({ success: true, type, item: data });
  } catch (error) {
    return handleApiError(error, "Admin Content PATCH", "Failed to update content");
  }
}

export async function DELETE(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const type = resolveType(searchParams.get("type"));
    if (!type) return invalidTypeResponse();

    const id = searchParams.get("id") || "";
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid content id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const table = TABLES[type];
    const { data: row, error: readError } = await db
      .from(table)
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      return Response.json({ success: false, message: "Content not found" }, { status: 404 });
    }

    const { error: deleteError } = await db.from(table).delete().eq("id", id);
    if (deleteError) throw deleteError;

    // Remove the uploaded image after the row is gone; a failed removal only
    // leaks a file (logged), it never resurrects the deleted content.
    const storagePath = storagePathFromPublicUrl(row.image_url, SITE_BANNER_BUCKET);
    if (storagePath) {
      const { error: removeError } = await db.storage
        .from(SITE_BANNER_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        logger.warn("[Admin Content] storage remove failed:", removeError.message);
      }
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: `content.${type}.delete`,
      entityType: ENTITY_TYPES[type],
      entityId: id,
    });

    return Response.json({ success: true, message: "Content deleted" });
  } catch (error) {
    return handleApiError(error, "Admin Content DELETE", "Failed to delete content");
  }
}
