import { verifyAdmin } from "../../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  isMissingThemeTables,
  migrationRequiredResponse,
  slugify,
} from "../../../_lib/themeAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything a copy inherits; id/created_* are deliberately excluded. */
const COPY_COLUMNS =
  "name, slug, description, category, preview_image, theme_config, status, " +
  "priority, activation_mode, starts_at, ends_at, timezone, is_recurring";

const NAME_MAX = 100; // store_themes_name_check

/**
 * POST /api/admin/themes/[id]/duplicate — clone a theme into a NEW DRAFT.
 *
 * The copy is always a draft (never eligible for resolution, so duplicating
 * can never change the live storefront), keeps the source's config, schedule,
 * priority and category so the admin reviews an identical base, and gets a
 * fresh name/slug. A slug collision (duplicating the same theme twice) is
 * retried once with a random suffix, then reported as an honest 409.
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

    const db = getServiceRoleClient();

    const { data: source, error: sourceError } = await db
      .from("store_themes")
      .select(COPY_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (sourceError) {
      if (isMissingThemeTables(sourceError)) return migrationRequiredResponse();
      throw sourceError;
    }
    if (!source) {
      return Response.json({ success: false, message: "Theme not found" }, { status: 404 });
    }

    const suffix = " (copy)";
    const name = `${String(source.name || "Theme").slice(0, NAME_MAX - suffix.length)}${suffix}`;
    const baseSlug = slugify(name);

    const buildRow = (slug) => ({
      name,
      slug,
      description: source.description ?? null,
      category: source.category ?? "custom",
      preview_image: source.preview_image ?? null,
      theme_config: source.theme_config ?? {},
      status: "draft", // a copy never goes live on its own
      priority: source.priority ?? 0,
      activation_mode: source.activation_mode ?? "manual",
      starts_at: source.starts_at ?? null,
      ends_at: source.ends_at ?? null,
      timezone: source.timezone ?? "UTC",
      is_recurring: source.is_recurring ?? false,
      created_by: auth.user.id,
    });

    let { data, error: insertError } = await db
      .from("store_themes")
      .insert(buildRow(baseSlug))
      .select("*")
      .single();

    if (insertError && insertError.code === "23505") {
      // Second copy of the same theme — make room instead of failing.
      const retrySlug = `${baseSlug.slice(0, 53)}-${Math.random().toString(36).slice(2, 8)}`;
      ({ data, error: insertError } = await db
        .from("store_themes")
        .insert(buildRow(retrySlug))
        .select("*")
        .single());
    }

    if (insertError) {
      if (isMissingThemeTables(insertError)) return migrationRequiredResponse();
      if (insertError.code === "23505") {
        return Response.json(
          { success: false, message: `Slug "${baseSlug}" is already used by another theme` },
          { status: 409 }
        );
      }
      throw insertError;
    }

    // First lifecycle entry for the new row (same as a fresh create).
    const { error: historyError } = await db.from("theme_schedule_history").insert({
      theme_id: data.id,
      action: "create",
      performed_by: auth.user.id,
    });
    if (historyError) logger.warn("[Theme Duplicate] history insert failed:", historyError);

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.duplicate",
      entityType: "store_theme",
      entityId: data.id,
      details: { source_id: id, name: data.name, slug: data.slug },
    });

    invalidateThemeCache();
    logger.info("[Theme Duplicate] created draft copy", {
      source_id: id,
      id: data.id,
      slug: data.slug,
      by: auth.user.id,
    });

    return Response.json({ success: true, theme: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Theme Duplicate", "Failed to duplicate theme");
  }
}
