import { verifyAdmin } from "../../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  isMissingThemeTables,
  migrationRequiredResponse,
} from "../../../_lib/themeAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SNAPSHOT_COLUMNS =
  "name, slug, description, category, theme_config, status, priority, " +
  "activation_mode, starts_at, ends_at, timezone, is_recurring";

/**
 * POST /api/admin/themes/[id]/publish — one deliberate "make this live".
 *
 * Publish does three things atomically (best effort — each step is logged):
 *   1. snapshot the current state into theme_versions (so it can be undone),
 *   2. move the theme to its live status:
 *        scheduled mode with a window → `scheduled` (eligible when open)
 *        otherwise                    → `active`   (live immediately),
 *   3. record `publish` in theme_schedule_history + the admin audit log.
 *
 * The resolution engine picks the winner afterwards (override > priority >
 * default > built-in) — publishing never bypasses that order, it only makes
 * the theme eligible.
 */

export async function POST(request, { params }) {
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
    const note =
      body && typeof body === "object" && typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 300)
        : null;

    const db = getServiceRoleClient();

    const { data: theme, error: themeError } = await db
      .from("store_themes")
      .select(SNAPSHOT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (themeError) {
      if (isMissingThemeTables(themeError)) return migrationRequiredResponse();
      throw themeError;
    }
    if (!theme) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const targetStatus =
      theme.activation_mode === "scheduled" && theme.starts_at ? "scheduled" : "active";

    // 1. Snapshot first: if anything below fails, nothing changed at all.
    const { data: last, error: lastError } = await db
      .from("theme_versions")
      .select("version")
      .eq("theme_id", id)
      .order("version", { ascending: false })
      .limit(1);
    if (lastError) {
      if (isMissingThemeTables(lastError)) return migrationRequiredResponse();
      throw lastError;
    }
    const nextVersion = (last?.[0]?.version ?? 0) + 1;

    const { error: snapshotError } = await db.from("theme_versions").insert({
      theme_id: id,
      version: nextVersion,
      snapshot: theme,
      note: note ?? `Published (${targetStatus})`,
      created_by: auth.user.id,
    });
    if (snapshotError) {
      if (isMissingThemeTables(snapshotError)) return migrationRequiredResponse();
      if (snapshotError.code === "23505") {
        return Response.json(
          { success: false, message: "Version number conflict — try again" },
          { status: 409 }
        );
      }
      throw snapshotError;
    }

    // 2. Move to the live status.
    const { data: updated, error: updateError } = await db
      .from("store_themes")
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) {
      if (isMissingThemeTables(updateError)) return migrationRequiredResponse();
      throw updateError;
    }

    // 3. Lifecycle history + audit.
    const { error: historyError } = await db.from("theme_schedule_history").insert({
      theme_id: id,
      action: "publish",
      previous_theme_id: null,
      performed_by: auth.user.id,
    });
    if (historyError) logger.warn("[Theme Publish] history insert failed:", historyError);

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.publish",
      entityType: "store_theme",
      entityId: id,
      details: {
        name: theme.name,
        from: theme.status,
        to: targetStatus,
        version: nextVersion,
      },
    });

    invalidateThemeCache();
    logger.info("[Theme Publish] published", {
      id,
      to: targetStatus,
      version: nextVersion,
      by: auth.user.id,
    });

    return Response.json({
      success: true,
      theme: updated,
      version: nextVersion,
      note: note ?? `Published (${targetStatus})`,
    });
  } catch (error) {
    return handleApiError(error, "Admin Theme Publish", "Failed to publish theme");
  }
}
