import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAudit } from "@/lib/admin-audit";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";
import { resolveTheme } from "@/lib/themes/resolve";
import { invalidateThemeCache } from "@/lib/themes/server";
import {
  invalidFieldsResponse,
  isMissingThemeTables,
  migrationRequiredResponse,
  slugify,
  validateThemeFields,
} from "../_lib/themeAdmin";

const LIST_COLUMNS =
  "id, name, slug, description, category, preview_image, theme_config, status, " +
  "priority, activation_mode, starts_at, ends_at, timezone, is_recurring, " +
  "created_by, created_at, updated_at";

/**
 * GET /api/admin/themes — full theme inventory for the Theme Studio.
 *
 * Returns every row (any status — admins must see drafts too), the singleton
 * settings row (default/override), the conflicts that resolution would
 * report right now, and a preview of which theme the storefront would pick.
 * Bearer-only (verifyAdmin); RLS is bypassed via the service role because
 * theme_settings is intentionally not readable by anon.
 */
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();

    const [themesRes, settingsRes] = await Promise.all([
      db
        .from("store_themes")
        .select(LIST_COLUMNS)
        .order("priority", { ascending: false })
        .order("updated_at", { ascending: false }),
      db.from("theme_settings").select("*").maybeSingle(),
    ]);

    if (themesRes.error) {
      if (isMissingThemeTables(themesRes.error)) return migrationRequiredResponse();
      throw themesRes.error;
    }

    const themes = themesRes.data ?? [];
    const settings = settingsRes.error ? null : settingsRes.data ?? null;

    // Same engine the storefront uses — the studio shows exactly what ships.
    const resolved = resolveTheme({ themes, settings, now: new Date() });

    return Response.json({
      success: true,
      themes,
      settings,
      conflicts: resolved.conflicts,
      resolved: { id: resolved.theme.id, name: resolved.theme.name, source: resolved.source },
    });
  } catch (error) {
    return handleApiError(error, "Admin Themes GET", "Failed to load themes");
  }
}

/**
 * POST /api/admin/themes — create a theme (always starts as a draft unless
 * the caller explicitly asks for another status).
 *
 * The config is validated by the same function the public engine uses, so a
 * stored row can never contain raw CSS/JS. Slug is derived from the name when
 * omitted and must be unique (the DB constraint is the final arbiter).
 */
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const validated = validateThemeFields(body);
    if (!validated.ok) return invalidFieldsResponse(validated.message);

    const value = validated.value;
    if (!value.name) return invalidFieldsResponse("name is required");

    const row = {
      name: value.name,
      slug: value.slug ?? slugify(value.name),
      description: value.description ?? null,
      category: value.category ?? "custom",
      preview_image: value.preview_image ?? null,
      theme_config: value.theme_config ?? {},
      status: value.status ?? "draft",
      priority: value.priority ?? 0,
      activation_mode: value.activation_mode ?? "manual",
      starts_at: value.starts_at ?? null,
      ends_at: value.ends_at ?? null,
      timezone: value.timezone ?? "UTC",
      is_recurring: value.is_recurring ?? false,
      created_by: auth.user.id,
    };

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("store_themes")
      .insert(row)
      .select(LIST_COLUMNS)
      .single();
    if (error) {
      if (isMissingThemeTables(error)) return migrationRequiredResponse();
      if (error.code === "23505") {
        return Response.json(
          { success: false, message: `Slug "${row.slug}" is already used by another theme` },
          { status: 409 }
        );
      }
      throw error;
    }

    // Lifecycle audit: first entry for this theme's history.
    const { error: historyError } = await db.from("theme_schedule_history").insert({
      theme_id: data.id,
      action: "create",
      performed_by: auth.user.id,
    });
    if (historyError) logger.warn("[Admin Themes] history insert failed:", historyError);

    await recordAdminAudit(db, {
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: "theme.create",
      entityType: "store_theme",
      entityId: data.id,
      details: { name: data.name, slug: data.slug, status: data.status },
    });

    invalidateThemeCache();
    logger.info("[Admin Themes] created", { id: data.id, slug: data.slug, by: auth.user.id });

    return Response.json({ success: true, theme: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Themes POST", "Failed to create theme");
  }
}
