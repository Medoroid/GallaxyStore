import { verifyAdmin } from "../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { getResolvedTheme, invalidateThemeCache } from "@/lib/themes/server";
import {
  invalidFieldsResponse,
  isMissingThemeTables,
  migrationRequiredResponse,
  validateThemeFields,
} from "../../_lib/themeAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_COLUMNS =
  "id, name, slug, description, category, preview_image, theme_config, status, " +
  "priority, activation_mode, starts_at, ends_at, timezone, is_recurring, " +
  "created_by, created_at, updated_at";

/** Lifecycle action recorded in theme_schedule_history for a status change. */
function statusAction(from, to) {
  if (to === "active") return "activate";
  if (to === "archived") return "archive";
  if (to === "scheduled") return "schedule";
  if (from === "active") return "deactivate";
  return "update";
}

async function loadTheme(db, id) {
  const { data, error } = await db
    .from("store_themes")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingThemeTables(error)) return { missing: true };
    throw error;
  }
  return { row: data };
}

/**
 * GET /api/admin/themes/[id] — one theme with its version history summary.
 * Returns `versions` (latest first, capped at 20) so the editor can show
 * "last saved" without a second round-trip; full restore lives in the
 * versions endpoint (Phase 8).
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid theme id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { row, missing } = await loadTheme(db, id);
    if (missing) return migrationRequiredResponse();
    if (!row) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const { data: versions, error: versionsError } = await db
      .from("theme_versions")
      .select("id, version, note, created_by, created_at")
      .eq("theme_id", id)
      .order("version", { ascending: false })
      .limit(20);
    if (versionsError && !isMissingThemeTables(versionsError)) throw versionsError;

    const { data: history, error: historyError } = await db
      .from("theme_schedule_history")
      .select("id, action, previous_theme_id, performed_by, performed_at")
      .eq("theme_id", id)
      .order("performed_at", { ascending: false })
      .limit(20);
    if (historyError && !isMissingThemeTables(historyError)) throw historyError;

    return Response.json({
      success: true,
      theme: row,
      versions: versions ?? [],
      history: history ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Admin Theme GET", "Failed to load theme");
  }
}

/**
 * PATCH /api/admin/themes/[id] — partial update, including scheduling.
 *
 * Every provided field is validated server-side; status transitions are
 * recorded in theme_schedule_history so the studio's timeline is honest.
 * Config changes go through validateThemeConfig (no raw CSS/JS ever lands).
 */
export async function PATCH(request, { params }) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid theme id" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validated = validateThemeFields(body);
    if (!validated.ok) return invalidFieldsResponse(validated.message);

    const updates = validated.value;
    if (Object.keys(updates).length === 0) {
      return Response.json({ success: false, message: "No fields to update" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { row, missing } = await loadTheme(db, id);
    if (missing) return migrationRequiredResponse();
    if (!row) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    // Window check against the stored row when only one side is provided.
    const startsAt = "starts_at" in updates ? updates.starts_at : row.starts_at;
    const endsAt = "ends_at" in updates ? updates.ends_at : row.ends_at;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      return invalidFieldsResponse("ends_at must be after starts_at");
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from("store_themes")
      .update(updates)
      .eq("id", id)
      .select(LIST_COLUMNS)
      .single();
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      if (error.code === "23505") {
        return Response.json(
          { success: false, message: "Slug is already used by another theme" },
          { status: 409 }
        );
      }
      throw error;
    }

    const statusChanged = updates.status && updates.status !== row.status;
    const scheduleChanged =
      (updates.starts_at !== undefined && updates.starts_at !== row.starts_at) ||
      (updates.ends_at !== undefined && updates.ends_at !== row.ends_at) ||
      (updates.activation_mode !== undefined && updates.activation_mode !== row.activation_mode) ||
      (updates.timezone !== undefined && updates.timezone !== row.timezone);

    if (statusChanged || scheduleChanged) {
      const { error: historyError } = await db.from("theme_schedule_history").insert({
        theme_id: id,
        action: statusChanged ? statusAction(row.status, data.status) : "schedule",
        previous_theme_id: null,
        performed_by: auth.user.id,
      });
      if (historyError) logger.warn("[Admin Theme] history insert failed:", historyError);
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: statusChanged ? `theme.${data.status}` : "theme.update",
      entityType: "store_theme",
      entityId: id,
      details: {
        changed: Object.keys(updates),
        status: { from: row.status, to: data.status },
      },
    });

    invalidateThemeCache();
    logger.info("[Admin Themes] updated", {
      id,
      changed: Object.keys(updates),
      by: auth.user.id,
    });

    return Response.json({ success: true, theme: data });
  } catch (error) {
    return handleApiError(error, "Admin Theme PATCH", "Failed to update theme");
  }
}

/**
 * DELETE /api/admin/themes/[id] — hard delete (versions/assets cascade).
 *
 * Refuses while the theme would change the live storefront without an
 * explicit preceding step: the current manual override, the configured
 * default (the FK would silently null it), and the theme the resolver would
 * render right now all answer 409 with the step to take first. Archived
 * and draft themes delete freely.
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid theme id" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { row, missing } = await loadTheme(db, id);
    if (missing) return migrationRequiredResponse();
    if (!row) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const { data: settings, error: settingsError } = await db
      .from("theme_settings")
      .select("manual_override_theme_id, default_theme_id")
      .maybeSingle();
    if (settingsError && !isMissingThemeTables(settingsError)) throw settingsError;

    if (settings?.manual_override_theme_id === id) {
      return Response.json(
        {
          success: false,
          message:
            "This theme is the current manual override. Clear the override in Settings before deleting it.",
        },
        { status: 409 }
      );
    }

    if (settings?.default_theme_id === id) {
      return Response.json(
        {
          success: false,
          message:
            "This theme is the current default. Set another default in Settings before deleting it.",
        },
        { status: 409 }
      );
    }

    // The resolver's current winner: deleting it would silently swap the
    // live design for whatever comes next in the resolution order.
    const resolved = await getResolvedTheme();
    if (resolved?.theme?.id === id) {
      return Response.json(
        {
          success: false,
          message:
            "This theme is live on the storefront right now. Unpublish it (or switch the override/default) before deleting it.",
        },
        { status: 409 }
      );
    }

    const { error } = await db.from("store_themes").delete().eq("id", id);
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      throw error;
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.delete",
      entityType: "store_theme",
      entityId: id,
      details: { name: row.name, slug: row.slug, status: row.status },
    });

    invalidateThemeCache();
    logger.info("[Admin Themes] deleted", { id, slug: row.slug, by: auth.user.id });

    return Response.json({ success: true, deleted: id });
  } catch (error) {
    return handleApiError(error, "Admin Theme DELETE", "Failed to delete theme");
  }
}
