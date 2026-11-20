import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  isMissingThemeTables,
  migrationRequiredResponse,
} from "../_lib/themeAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fixed singleton row id — see the theme_settings CHECK constraint. */
const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/**
 * GET /api/admin/theme-settings — the resolution controls:
 *   - default_theme_id:        fallback when nothing is scheduled
 *   - manual_override_theme_id: emergency "always this theme" pin
 */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const { data, error } = await db.from("theme_settings").select("*").maybeSingle();
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      throw error;
    }

    return Response.json({
      success: true,
      settings: data ?? { id: SETTINGS_ID, default_theme_id: null, manual_override_theme_id: null },
    });
  } catch (error) {
    return handleApiError(error, "Admin Theme Settings GET", "Failed to load theme settings");
  }
}

/**
 * PATCH /api/admin/theme-settings — set/clear the default theme and the
 * manual override (null clears a pin). Every reference is checked against
 * store_themes so a stale id can never strand the storefront on a missing
 * row (the resolution engine would silently fall back anyway, but the studio
 * should fail loudly instead).
 *
 * `action` in the history follows the migration's allow-list:
 * set_default | restore_default | override | clear_override.
 */
export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, message: "Request body must be an object" }, { status: 400 });
    }

    const hasDefault = "default_theme_id" in body;
    const hasOverride = "manual_override_theme_id" in body;
    if (!hasDefault && !hasOverride) {
      return Response.json(
        { success: false, message: "default_theme_id and/or manual_override_theme_id is required" },
        { status: 400 }
      );
    }

    function refOrNull(value, field) {
      if (value === null || value === undefined) return { ok: true, value: null };
      if (typeof value !== "string" || !UUID_RE.test(value)) {
        return { ok: false, message: `${field} must be a theme id or null` };
      }
      return { ok: true, value };
    }

    const def = hasDefault ? refOrNull(body.default_theme_id, "default_theme_id") : null;
    if (def && !def.ok) {
      return Response.json({ success: false, message: def.message }, { status: 400 });
    }
    const ovr = hasOverride ? refOrNull(body.manual_override_theme_id, "manual_override_theme_id") : null;
    if (ovr && !ovr.ok) {
      return Response.json({ success: false, message: ovr.message }, { status: 400 });
    }

    const db = getServiceRoleClient();

    // Verify referenced themes exist (and are not archived — pinning a
    // retired theme would silently never resolve).
    const referenced = [def?.value, ovr?.value].filter(Boolean);
    if (referenced.length > 0) {
      const { data: rows, error } = await db
        .from("store_themes")
        .select("id, status")
        .in("id", referenced);
      if (error) {
        if (isMissingThemeTables(error)) return migrationRequiredResponse();
        throw error;
      }
      const found = new Map((rows ?? []).map((r) => [r.id, r]));
      for (const id of referenced) {
        const row = found.get(id);
        if (!row) {
          return Response.json(
            { success: false, message: `Theme ${id} does not exist` },
            { status: 404 }
          );
        }
        if (row.status === "archived") {
          return Response.json(
            { success: false, message: "Cannot reference an archived theme" },
            { status: 409 }
          );
        }
      }
    }

    const { data: current, error: currentError } = await db
      .from("theme_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (currentError && !isMissingThemeTables(currentError)) throw currentError;

    const previous = current ?? { default_theme_id: null, manual_override_theme_id: null };

    const patch = { id: SETTINGS_ID, updated_at: new Date().toISOString() };
    if (hasDefault) patch.default_theme_id = def.value;
    if (hasOverride) patch.manual_override_theme_id = ovr.value;

    const { data: settings, error: upsertError } = await db
      .from("theme_settings")
      .upsert(patch, { onConflict: "id" })
      .select("*")
      .single();
    if (upsertError) {
      if (isMissingThemeTables(upsertError)) return migrationRequiredResponse();
      throw upsertError;
    }

    // One history entry per changed reference (allow-listed action names).
    const historyRows = [];
    if (hasDefault && def.value !== previous.default_theme_id) {
      historyRows.push({
        theme_id: def.value,
        action: def.value ? "set_default" : "restore_default",
        previous_theme_id: previous.default_theme_id,
        performed_by: auth.user.id,
      });
    }
    if (hasOverride && ovr.value !== previous.manual_override_theme_id) {
      historyRows.push({
        theme_id: ovr.value,
        action: ovr.value ? "override" : "clear_override",
        previous_theme_id: previous.manual_override_theme_id,
        performed_by: auth.user.id,
      });
    }
    if (historyRows.length > 0) {
      const { error: historyError } = await db.from("theme_schedule_history").insert(historyRows);
      if (historyError) logger.warn("[Theme Settings] history insert failed:", historyError);
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.settings.update",
      entityType: "theme_settings",
      entityId: SETTINGS_ID,
      details: {
        default_theme_id: { from: previous.default_theme_id, to: settings.default_theme_id },
        manual_override_theme_id: {
          from: previous.manual_override_theme_id,
          to: settings.manual_override_theme_id,
        },
      },
    });

    invalidateThemeCache();
    logger.info("[Theme Settings] updated", {
      default: settings.default_theme_id,
      override: settings.manual_override_theme_id,
      by: auth.user.id,
    });

    return Response.json({ success: true, settings });
  } catch (error) {
    return handleApiError(error, "Admin Theme Settings PATCH", "Failed to save theme settings");
  }
}
