import { revalidatePath } from "next/cache";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { BUILTIN_THEME, resolveTheme } from "./resolve";
import { cloneDefaultThemeConfig } from "./defaults";
import type { ResolvedThemeResult, StoreThemeRow, ThemeSettingsRow } from "./types";

/**
 * Server-side theme resolution with a short-lived in-memory cache.
 *
 * Design notes:
 *  - Reads use the SERVICE ROLE client: theme_settings (default/override ids)
 *    is intentionally not exposed to anon, and resolution must never depend on
 *    the caller's identity. RLS still guards the public storefront tables as
 *    defense in depth (store_themes: active/scheduled only).
 *  - 30 s TTL: seasonal activation drift is bounded to half a minute for the
 *    API; mutations additionally purge the root layout's ISR cache (see
 *    invalidateThemeCache) so a publish is visible on the next visit instead
 *    of waiting out `revalidate = 300`.
 *  - Everything degrades to the built-in default: missing env, missing tables
 *    (migration not applied yet), malformed rows — the storefront keeps
 *    rendering the current design with zero overrides. Failures are cached for
 *    the same TTL so an un-migrated database is not hammered per request.
 */

const TTL_MS = 30_000;

let cache: { at: number; value: ResolvedThemeResult } | null = null;

/**
 * Call after any admin mutation so the next read sees fresh rows.
 *
 * Also purges the root layout's ISR cache: the layout renders the theme style
 * tag with `revalidate = 300`, so without this a publish could keep serving
 * the previous design for up to five minutes. `revalidatePath` only works
 * inside Next's request store — every caller is a route handler, which is
 * exactly where Next guarantees that store (see next/dist/docs revalidatePath).
 */
export function invalidateThemeCache(): void {
  cache = null;
  revalidatePath("/", "layout");
}

function builtinResult(): ResolvedThemeResult {
  // Fresh copy per call: callers may hand `config` to the preview bridge.
  return {
    theme: { ...BUILTIN_THEME, config: cloneDefaultThemeConfig() },
    resolvedAt: new Date().toISOString(),
  };
}

async function load(): Promise<ResolvedThemeResult> {
  try {
    const db = getServiceRoleClient();

    const [themesRes, settingsRes] = await Promise.all([
      db.from("store_themes").select("*"),
      db.from("theme_settings").select("*").maybeSingle(),
    ]);

    if (themesRes.error) throw themesRes.error;

    // Settings are optional: without them we still honor scheduled themes
    // (tier 2); the default/override tiers simply fall through.
    let settings: ThemeSettingsRow | null = null;
    if (settingsRes.error) {
      logger.warn(
        "[themes] theme_settings unavailable; using scheduled-theme resolution only",
        settingsRes.error
      );
    } else {
      settings = (settingsRes.data as ThemeSettingsRow | null) ?? null;
    }

    const themes = (themesRes.data ?? []) as StoreThemeRow[];
    const resolved = resolveTheme({ themes, settings, now: new Date() });
    return { theme: resolved.theme, resolvedAt: new Date().toISOString() };
  } catch (error) {
    logger.warn(
      "[themes] resolution failed — falling back to built-in default " +
        "(is 20261110100000_theme_management.sql applied?)",
      error
    );
    return builtinResult();
  }
}

/** Resolved theme for the current request (cached ≤30 s per server instance). */
export async function getResolvedTheme(): Promise<ResolvedThemeResult> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  const value = await load();
  cache = { at: now, value };
  return value;
}
