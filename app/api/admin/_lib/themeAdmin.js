import { validateThemeConfig } from "@/lib/themes/validate";
import { isValidTimeZone } from "@/lib/themes/resolve";

/**
 * Shared validation + error helpers for the admin Theme Studio routes.
 *
 * Everything the admin sends is re-validated here (server-side boundary):
 * the client-side Theme Editor runs the exact same validateThemeConfig so
 * preview and storage can never disagree, but the API never trusts it.
 */

export const THEME_STATUSES = ["draft", "scheduled", "active", "archived"];
export const ACTIVATION_MODES = ["manual", "scheduled"];

const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const CATEGORY_RE = /^[a-z0-9_-]{1,40}$/;
const PRIORITY_MIN = -1000;
const PRIORITY_MAX = 1000;

function fail(message) {
  return { ok: false, message };
}

function ok(value) {
  return { ok: true, value };
}

/** URL-friendly slug from a theme name ("Eid al-Fitr 2026" → "eid-al-fitr-2026"). */
export function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "theme";
}

function parseDate(value, field) {
  if (value === null || value === undefined || value === "") return ok(null);
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return fail(`${field} must be a valid ISO date`);
  }
  return ok(new Date(value).toISOString());
}

/**
 * Validate a single theme field (or the whole create payload).
 * `body` is the raw request JSON; only provided keys are validated so PATCH
 * can pass a partial object. Unknown keys are ignored.
 */
export function validateThemeFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Request body must be an object");
  }

  const value = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
      return fail("name must be 1-100 characters");
    }
    value.name = name;
  }

  if ("slug" in body && body.slug !== undefined && body.slug !== null) {
    const slug = String(body.slug).trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return fail("slug must be 1-60 lowercase letters, numbers or hyphens");
    }
    value.slug = slug;
  }

  if ("description" in body) {
    if (body.description === null) {
      value.description = null;
    } else {
      const description =
        typeof body.description === "string" ? body.description.trim() : "";
      if (description.length > 500) return fail("description must be ≤ 500 characters");
      value.description = description || null;
    }
  }

  if ("category" in body && body.category !== undefined && body.category !== null) {
    const category = String(body.category).trim().toLowerCase();
    if (!CATEGORY_RE.test(category)) {
      return fail("category must be 1-40 lowercase letters, numbers, _ or -");
    }
    value.category = category;
  }

  if ("preview_image" in body) {
    if (body.preview_image === null || body.preview_image === "") {
      value.preview_image = null;
    } else if (typeof body.preview_image !== "string" || body.preview_image.length > 2048) {
      return fail("preview_image must be a string ≤ 2048 characters");
    } else {
      value.preview_image = body.preview_image;
    }
  }

  if ("status" in body && body.status !== undefined && body.status !== null) {
    if (!THEME_STATUSES.includes(body.status)) {
      return fail(`status must be one of: ${THEME_STATUSES.join(", ")}`);
    }
    value.status = body.status;
  }

  if ("priority" in body && body.priority !== undefined && body.priority !== null) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
      return fail(`priority must be an integer between ${PRIORITY_MIN} and ${PRIORITY_MAX}`);
    }
    value.priority = priority;
  }

  if (
    "activation_mode" in body &&
    body.activation_mode !== undefined &&
    body.activation_mode !== null
  ) {
    if (!ACTIVATION_MODES.includes(body.activation_mode)) {
      return fail(`activation_mode must be one of: ${ACTIVATION_MODES.join(", ")}`);
    }
    value.activation_mode = body.activation_mode;
  }

  if ("starts_at" in body) {
    const parsed = parseDate(body.starts_at, "starts_at");
    if (!parsed.ok) return parsed;
    value.starts_at = parsed.value;
  }

  if ("ends_at" in body) {
    const parsed = parseDate(body.ends_at, "ends_at");
    if (!parsed.ok) return parsed;
    value.ends_at = parsed.value;
  }

  if ("timezone" in body && body.timezone !== undefined && body.timezone !== null) {
    if (!isValidTimeZone(body.timezone)) {
      return fail("timezone must be a valid IANA zone (e.g. Africa/Cairo, UTC)");
    }
    value.timezone = String(body.timezone);
  }

  if ("is_recurring" in body && body.is_recurring !== undefined && body.is_recurring !== null) {
    if (typeof body.is_recurring !== "boolean") return fail("is_recurring must be a boolean");
    value.is_recurring = body.is_recurring;
  }

  if ("theme_config" in body && body.theme_config !== undefined) {
    const result = validateThemeConfig(body.theme_config);
    if (!result.ok) return fail(`theme_config: ${result.errors.join("; ")}`);
    value.theme_config = result.config;
  }

  // Cross-field window check (DB has the same constraint as defense in depth).
  const starts = "starts_at" in value ? value.starts_at : undefined;
  const ends = "ends_at" in value ? value.ends_at : undefined;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) {
    return fail("ends_at must be after starts_at");
  }

  return ok(value);
}

/**
 * Supabase error for "the theme migration has not been applied yet".
 * Both the SQLSTATE (42P01) and PostgREST's relation-not-found code are
 * accepted so the studio can show its honest "upgrade required" state.
 */
export function isMissingThemeTables(error) {
  if (!error || typeof error !== "object") return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes('does not exist') ||
    message.includes('Could not find the table')
  );
}

/** 503 response telling the operator exactly which migration to apply. */
export function migrationRequiredResponse() {
  return Response.json(
    {
      success: false,
      code: "THEME_MIGRATION_REQUIRED",
      message:
        "Theme tables are not installed yet. Apply supabase/migrations/20261110100000_theme_management.sql to enable the Theme Studio.",
    },
    { status: 503 }
  );
}

/**400 response for a validation failure from validateThemeFields(). */
export function invalidFieldsResponse(message) {
  return Response.json({ success: false, message }, { status: 400 });
}
