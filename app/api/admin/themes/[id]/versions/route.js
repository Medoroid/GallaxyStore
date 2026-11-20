import { verifyAdmin } from "../../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  isMissingThemeTables,
  migrationRequiredResponse,
  validateThemeFields,
} from "../../../_lib/themeAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns stored in every snapshot (config + schedule + identity). */
const SNAPSHOT_COLUMNS =
  "name, slug, description, category, theme_config, status, priority, " +
  "activation_mode, starts_at, ends_at, timezone, is_recurring";

/**
 * GET  /api/admin/themes/[id]/versions — version history (newest first).
 * POST /api/admin/themes/[id]/versions — body variants:
 *   { note }           → snapshot the theme's CURRENT state (append-only)
 *   { restore: N }     → copy version N back onto the theme (config +
 *                        schedule fields), record `restore_version`
 *
 * Snapshots are how a bad seasonal edit stops being scary: publish creates
 * one, restore brings the store back to any earlier point without touching
 * versions that already exist.
 */

async function loadTheme(db, id) {
  const { data, error } = await db
    .from("store_themes")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingThemeTables(error)) return { missing: true };
    throw error;
  }
  return { row: data };
}

async function nextVersionNumber(db, id) {
  const { data, error } = await db
    .from("theme_versions")
    .select("version")
    .eq("theme_id", id)
    .order("version", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingThemeTables(error)) return { missing: true };
    throw error;
  }
  return { next: (data?.[0]?.version ?? 0) + 1 };
}

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
    const { missing } = await loadTheme(db, id);
    if (missing) return migrationRequiredResponse();

    const { data, error } = await db
      .from("theme_versions")
      .select("id, version, note, created_by, created_at")
      .eq("theme_id", id)
      .order("version", { ascending: false });
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      throw error;
    }

    return Response.json({ success: true, versions: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Admin Theme Versions GET", "Failed to load versions");
  }
}

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, message: "Request body must be an object" }, { status: 400 });
    }

    const isRestore = "restore" in body;
    const hasNote = "note" in body && body.note !== undefined && body.note !== null;

    if (isRestore) {
      const version = Number(body.restore);
      if (!Number.isInteger(version) || version < 1) {
        return Response.json(
          { success: false, message: "restore must be a version number (integer ≥ 1)" },
          { status: 400 }
        );
      }
      if (hasNote && (typeof body.note !== "string" || body.note.length > 300)) {
        return Response.json(
          { success: false, message: "note must be a string ≤ 300 characters" },
          { status: 400 }
        );
      }

      const db = getServiceRoleClient();
      const { row, missing } = await loadTheme(db, id);
      if (missing) return migrationRequiredResponse();
      if (!row) {
        return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
      }

      const { data: versionRow, error: versionError } = await db
        .from("theme_versions")
        .select("id, version, snapshot, note")
        .eq("theme_id", id)
        .eq("version", version)
        .maybeSingle();
      if (versionError) {
        if (isMissingThemeTables(versionError)) return migrationRequiredResponse();
        throw versionError;
      }
      if (!versionRow) {
        return Response.json(
          { success: false, message: `Version ${version} not found for this theme` },
          { status: 404 }
        );
      }

      const snapshot = versionRow.snapshot ?? {};
      // Only whitelisted columns are restored (never id/status/history).
      const validated = validateThemeFields({
        name: snapshot.name,
        description: snapshot.description ?? null,
        category: snapshot.category,
        theme_config: snapshot.theme_config ?? {},
        priority: snapshot.priority,
        activation_mode: snapshot.activation_mode,
        starts_at: snapshot.starts_at ?? null,
        ends_at: snapshot.ends_at ?? null,
        timezone: snapshot.timezone,
        is_recurring: snapshot.is_recurring,
      });
      if (!validated.ok) {
        return Response.json(
          { success: false, message: `Stored snapshot is invalid: ${validated.message}` },
          { status: 409 }
        );
      }

      const { data: updated, error: updateError } = await db
        .from("store_themes")
        .update({ ...validated.value, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (updateError) {
        if (isMissingThemeTables(updateError)) return migrationRequiredResponse();
        throw updateError;
      }

      const { error: historyError } = await db.from("theme_schedule_history").insert({
        theme_id: id,
        action: "restore_version",
        previous_theme_id: null,
        performed_by: auth.user.id,
      });
      if (historyError) logger.warn("[Theme Versions] history insert failed:", historyError);

      // The restore itself becomes a new snapshot so it can be undone too.
      const { next, missing: nextMissing } = await nextVersionNumber(db, id);
      if (nextMissing) return migrationRequiredResponse();
      const { error: snapshotError } = await db.from("theme_versions").insert({
        theme_id: id,
        version: next,
        snapshot: { ...validated.value, restored_from: versionRow.version },
        note: hasNote && typeof body.note === "string" ? body.note : `Restored v${versionRow.version}`,
        created_by: auth.user.id,
      });
      if (snapshotError) {
        if (isMissingThemeTables(snapshotError)) return migrationRequiredResponse();
        throw snapshotError;
      }

      await recordAdminAudit(db, {
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        action: "theme.restore_version",
        entityType: "store_theme",
        entityId: id,
        details: { restored_from: versionRow.version, new_version: next },
      });
      invalidateThemeCache();

      logger.info("[Theme Versions] restored", { id, from: versionRow.version, by: auth.user.id });
      return Response.json({ success: true, theme: updated, restored_from: versionRow.version });
    }

    // Plain snapshot of the current state.
    if (hasNote && (typeof body.note !== "string" || body.note.length > 300)) {
      return Response.json(
        { success: false, message: "note must be a string ≤ 300 characters" },
        { status: 400 }
      );
    }

    const db = getServiceRoleClient();
    const { row, missing } = await loadTheme(db, id);
    if (missing) return migrationRequiredResponse();
    if (!row) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const { next, missing: nextMissing } = await nextVersionNumber(db, id);
    if (nextMissing) return migrationRequiredResponse();

    const { data, error } = await db
      .from("theme_versions")
      .insert({
        theme_id: id,
        version: next,
        snapshot: row,
        note: hasNote && typeof body.note === "string" ? body.note : null,
        created_by: auth.user.id,
      })
      .select("id, version, note, created_by, created_at")
      .single();
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      if (error.code === "23505") {
        // Two snapshots raced for the same number — tell the admin to retry.
        return Response.json(
          { success: false, message: "Version number conflict — try again" },
          { status: 409 }
        );
      }
      throw error;
    }

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.snapshot",
      entityType: "store_theme",
      entityId: id,
      details: { version: next, note: data.note },
    });

    logger.info("[Theme Versions] snapshot created", { id, version: next });
    return Response.json({ success: true, version: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Theme Versions POST", "Failed to write version");
  }
}
