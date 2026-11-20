import { cloneDefaultThemeConfig } from "./defaults";
import type { ThemeConfig } from "./types";

/**
 * Theme config validation — the security boundary of the Theme Studio.
 *
 * Rules of the road:
 *  - Structured input only: colors, numbers, booleans, whitelisted fonts and
 *    charset-limited shadow strings. There is NO path that accepts raw CSS or
 *    JS from the admin (no `url()`, `expression`, `<`, `>`, `{`, `}`, `;`,
 *    backslashes or quotes in any emitted value).
 *  - Unknown keys are dropped; known keys are merged over the built-in
 *    default, so a partial config can never leave a hole in the design.
 *  - Out-of-range numbers are clamped, invalid values produce field errors.
 *
 * The same function runs server-side (before persisting) and client-side
 * (live preview), so what the admin previews is exactly what gets stored.
 */

export type ValidationResult =
  | { ok: true; config: ThemeConfig }
  | { ok: false; errors: string[] };

/** Fonts that may be requested (all loaded via the Google Fonts stylesheet). */
export const FONT_WHITELIST = [
  "Poppins",
  "Tajawal",
  "Cairo",
  "Inter",
  "Montserrat",
  "Roboto",
  "Rubik",
  "DM Sans",
  "Playfair Display",
  "Orbitron",
] as const;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE =
  /^rgba?\(\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/;
const HSL_RE =
  /^hsla?\(\s*(-?\d{1,3}(?:\.\d+)?)(?:deg)?\s*,\s*(-?\d{1,3}(?:\.\d+)?)%\s*,\s*(-?\d{1,3}(?:\.\d+)?)%\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/;

const SHADOW_FORBIDDEN =
  /url\s*\(|expression|javascript|@import|data:|["'\\<>{};]|\/\*/i;
const SHADOW_ALLOWED = /^[#(),.\d\s%a-z_-]+$/i;

const COLOR_KEYS = [
  "primary",
  "primaryAlt",
  "secondary",
  "accent",
  "background",
  "surface",
  "card",
  "textPrimary",
  "textSecondary",
  "border",
  "link",
  "hover",
  "success",
  "warning",
  "error",
  "saleBg",
  "saleFg",
] as const;

const SHADOW_KEYS = [
  "shadowGlass",
  "shadowNeon",
  "shadowPink",
  "shadowGold",
] as const;

const DECORATION_KEYS = [
  "snowflakes",
  "particles",
  "lanterns",
  "crescent",
  "ribbons",
  "animatedGradient",
  "cornerOrnaments",
] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Accepts #rgb / #rrggbb / #rrggbbaa, rgb()/rgba() and hsl()/hsla() with
 * comma syntax. Returns a normalized, provably-safe string or null.
 */
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;

  if (HEX_RE.test(v)) return v.toLowerCase();

  const rgb = RGB_RE.exec(v);
  if (rgb) {
    const r = clamp(Number(rgb[1]), 0, 255);
    const g = clamp(Number(rgb[2]), 0, 255);
    const b = clamp(Number(rgb[3]), 0, 255);
    if (rgb[4] !== undefined) {
      const a = clamp(Number(rgb[4]), 0, 1);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  const hsl = HSL_RE.exec(v);
  if (hsl) {
    const h = ((Number(hsl[1]) % 360) + 360) % 360;
    const s = clamp(Number(hsl[2]), 0, 100);
    const l = clamp(Number(hsl[3]), 0, 100);
    if (hsl[4] !== undefined) {
      const a = clamp(Number(hsl[4]), 0, 1);
      return `hsla(${h}, ${s}%, ${l}%, ${a})`;
    }
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  return null;
}

/** Charset-limited box-shadow value (no url()/expression/quotes/braces). */
export function sanitizeShadow(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, 300);
  if (!v || SHADOW_FORBIDDEN.test(v) || !SHADOW_ALLOWED.test(v)) return null;
  return v;
}

export function sanitizeFont(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return (FONT_WHITELIST as readonly string[]).includes(v) ? v : null;
}

/** Free text with angle brackets stripped (React escapes anyway; belt+braces). */
export function sanitizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[<>]/g, "").trim().slice(0, max);
}

/** Internal path, hash link, or absolute https URL. Rejects javascript:/data:. */
export function sanitizeUrl(value: unknown, max = 2048): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return "";
  // Raw whitespace/quotes/angle brackets never belong in a stored URL; they
  // are the classic attribute-breakout payloads, so reject instead of encode.
  if (/[\s<>"'\\]/.test(v)) return null;
  if (v.startsWith("#")) return v.slice(0, max);
  if (v.startsWith("/") && !v.startsWith("//")) return v.slice(0, max);
  if (/^https:\/\//i.test(v)) {
    try {
      const url = new URL(v);
      if (url.protocol === "https:") return url.toString().slice(0, max);
    } catch {
      return null;
    }
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numberField(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  errors: string[],
  label: string
): number {
  if (value === undefined) return fallback;
  const n = readNumber(value);
  if (n === null) {
    errors.push(`${label} must be a number`);
    return fallback;
  }
  return clamp(n, min, max);
}

function nullableNumberField(
  value: unknown,
  min: number,
  max: number,
  errors: string[],
  label: string
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = readNumber(value);
  if (n === null) {
    errors.push(`${label} must be a number or null`);
    return null;
  }
  return clamp(n, min, max);
}

function booleanField(
  value: unknown,
  fallback: boolean,
  errors: string[],
  label: string
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    errors.push(`${label} must be a boolean`);
    return fallback;
  }
  return value;
}

function colorField(
  value: unknown,
  fallback: string,
  errors: string[],
  label: string
): string {
  if (value === undefined) return fallback;
  const clean = sanitizeColor(value);
  if (clean === null) {
    errors.push(`${label} must be a hex (#rrggbb), rgb() or hsl() color`);
    return fallback;
  }
  return clean;
}

function textField(
  value: unknown,
  fallback: string,
  max: number,
  errors: string[],
  label: string
): string {
  if (value === undefined) return fallback;
  const clean = sanitizeText(value, max);
  if (clean === null) {
    errors.push(`${label} must be text`);
    return fallback;
  }
  return clean;
}

/**
 * Validate + normalize an arbitrary (possibly hostile) config object into a
 * complete, safe ThemeConfig. Never throws.
 */
export function validateThemeConfig(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Theme config must be an object"] };
  }
  const src = input as Record<string, unknown>;
  const config = cloneDefaultThemeConfig();

  // --- colors -------------------------------------------------------------
  const colors = asRecord(src.colors);
  for (const key of COLOR_KEYS) {
    if (!(key in colors)) continue;
    config.colors[key] = colorField(
      colors[key],
      config.colors[key],
      errors,
      `colors.${key}`
    );
  }
  // link is the text-link color (secondary family); keep them coherent when
  // only one of the pair was edited.
  if ("secondary" in colors && !("link" in colors)) {
    config.colors.link = config.colors.secondary;
  }

  // --- typography ---------------------------------------------------------
  const typo = asRecord(src.typography);
  if ("headingFont" in typo) {
    const font = sanitizeFont(typo.headingFont);
    if (font) config.typography.headingFont = font;
    else errors.push(`typography.headingFont must be one of: ${FONT_WHITELIST.join(", ")}`);
  }
  if ("bodyFont" in typo) {
    const font = sanitizeFont(typo.bodyFont);
    if (font) config.typography.bodyFont = font;
    else errors.push(`typography.bodyFont must be one of: ${FONT_WHITELIST.join(", ")}`);
  }
  config.typography.headingWeight = numberField(
    typo.headingWeight, 100, 900, config.typography.headingWeight, errors,
    "typography.headingWeight"
  );
  config.typography.bodyWeight = numberField(
    typo.bodyWeight, 100, 900, config.typography.bodyWeight, errors,
    "typography.bodyWeight"
  );
  config.typography.baseSize = numberField(
    typo.baseSize, 14, 20, config.typography.baseSize, errors, "typography.baseSize"
  );
  config.typography.letterSpacingHeading = numberField(
    typo.letterSpacingHeading, -0.5, 0.5, config.typography.letterSpacingHeading,
    errors, "typography.letterSpacingHeading"
  );
  config.typography.lineHeightBody = nullableNumberField(
    typo.lineHeightBody, 1, 2.5, errors, "typography.lineHeightBody"
  );
  config.typography.letterSpacingBody = nullableNumberField(
    typo.letterSpacingBody, -0.2, 1, errors, "typography.letterSpacingBody"
  );
  config.typography.h1 = numberField(typo.h1, 1.2, 4, config.typography.h1, errors, "typography.h1");
  config.typography.h2 = numberField(typo.h2, 1, 3, config.typography.h2, errors, "typography.h2");
  config.typography.h3 = numberField(typo.h3, 0.9, 2.5, config.typography.h3, errors, "typography.h3");
  config.typography.h4 = numberField(typo.h4, 0.8, 2, config.typography.h4, errors, "typography.h4");

  // --- components ---------------------------------------------------------
  const comp = asRecord(src.components);
  config.components.radius = numberField(
    comp.radius, 0, 32, config.components.radius, errors, "components.radius"
  );
  config.components.glassBlur = numberField(
    comp.glassBlur, 0, 40, config.components.glassBlur, errors, "components.glassBlur"
  );
  config.components.navBlur = numberField(
    comp.navBlur, 0, 40, config.components.navBlur, errors, "components.navBlur"
  );
  config.components.glassFrom = colorField(
    comp.glassFrom, config.components.glassFrom, errors, "components.glassFrom"
  );
  config.components.glassTo = colorField(
    comp.glassTo, config.components.glassTo, errors, "components.glassTo"
  );
  config.components.glassBorder = colorField(
    comp.glassBorder, config.components.glassBorder, errors, "components.glassBorder"
  );
  config.components.navFrom = colorField(
    comp.navFrom, config.components.navFrom, errors, "components.navFrom"
  );
  config.components.navTo = colorField(
    comp.navTo, config.components.navTo, errors, "components.navTo"
  );
  config.components.navBorder = colorField(
    comp.navBorder, config.components.navBorder, errors, "components.navBorder"
  );
  config.components.ctaGlow = colorField(
    comp.ctaGlow, config.components.ctaGlow, errors, "components.ctaGlow"
  );
  for (const key of SHADOW_KEYS) {
    if (!(key in comp)) continue;
    const clean = sanitizeShadow(comp[key]);
    if (clean === null) {
      errors.push(`components.${key} contains unsupported characters`);
    } else {
      config.components[key] = clean;
    }
  }

  // --- decorations --------------------------------------------------------
  const deco = asRecord(src.decorations);
  config.decorations.enabled = booleanField(
    deco.enabled, config.decorations.enabled, errors, "decorations.enabled"
  );
  if ("density" in deco) {
    const n = readNumber(deco.density);
    if (n === null) errors.push("decorations.density must be 1, 2 or 3");
    else config.decorations.density = clamp(Math.round(n), 1, 3) as 1 | 2 | 3;
  }
  for (const key of DECORATION_KEYS) {
    if (!(key in deco)) continue;
    config.decorations[key] = booleanField(
      deco[key], config.decorations[key], errors, `decorations.${key}`
    );
  }

  // --- assets -------------------------------------------------------------
  const assets = asRecord(src.assets);
  config.assets.bannerEnabled = booleanField(
    assets.bannerEnabled, config.assets.bannerEnabled, errors, "assets.bannerEnabled"
  );
  config.assets.bannerTitle = textField(
    assets.bannerTitle, config.assets.bannerTitle, 120, errors, "assets.bannerTitle"
  );
  config.assets.bannerSubtitle = textField(
    assets.bannerSubtitle, config.assets.bannerSubtitle, 200, errors, "assets.bannerSubtitle"
  );
  config.assets.announcement = textField(
    assets.announcement, config.assets.announcement, 300, errors, "assets.announcement"
  );
  for (const key of [
    "bannerLink",
    "bannerDesktop",
    "bannerMobile",
    "backgroundDesktop",
    "backgroundMobile",
  ] as const) {
    if (!(key in assets)) continue;
    const clean = sanitizeUrl(assets[key]);
    if (clean === null) {
      errors.push(`assets.${key} must be an internal path or https URL`);
    } else {
      config.assets[key] = clean;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config };
}
