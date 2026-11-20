import type { ThemeConfig } from "./types";

/**
 * Theme config -> CSS custom properties.
 *
 * This is the ONLY place theme data becomes CSS. Values arriving here have
 * already passed validateThemeConfig (charset-limited colors/shadows,
 * whitelisted fonts, finite numbers), so the emitted block can never break
 * out of `:root { … }` — no `;`, `{` or `}` can appear inside a value.
 *
 * The variable set covers every token that app/globals.css defines for the
 * storefront, which is what lets a seasonal theme re-skin the whole store
 * (background, gradients, glass, nav, CTA glows, typography, statuses)
 * without touching a single component.
 */

function quoteFont(name: string): string {
  // Fonts are whitelist-validated; quotes/backslashes are stripped anyway.
  return `'${name.replace(/['\\]/g, "")}'`;
}

export function themeToVariableMap(config: ThemeConfig): Record<string, string> {
  const c = config.colors;
  const t = config.typography;
  const s = config.components;
  const map: Record<string, string> = {};

  const set = (name: string, value: string) => {
    map[name] = value;
  };

  // --- palette ------------------------------------------------------------
  // primary: neon purple family (buttons, rings, glows)
  set("--primary", c.primary);
  set("--neon", c.primary);
  set("--ring", c.primary);
  set("--sidebar-primary", c.primary);
  set("--chart-1", c.primary);

  // primaryAlt: deep purple used by gradient-neon / auth glows
  set("--brand-deep", c.primaryAlt);
  set("--brand-2", c.primaryAlt);

  // secondary: the brand pink (CTA gradients, badges, glows)
  set("--brand", c.secondary);
  set("--pink-glow", c.secondary);
  set("--chart-2", c.secondary);
  set("--brand-ring", `color-mix(in srgb, ${c.secondary} 40%, transparent)`);
  set("--brand-glow-mid", `color-mix(in srgb, ${c.secondary} 60%, transparent)`);
  set("--brand-glow-strong", `color-mix(in srgb, ${c.secondary} 80%, transparent)`);

  // link: the text-link color (secondary semantic used by text-secondary)
  set("--secondary", c.link);

  // accent: gold family (sale accents, charts)
  set("--accent", c.accent);
  set("--gold", c.accent);
  set("--chart-3", c.accent);

  // backgrounds / surfaces / cards
  set("--background", c.background);
  set("--bg-deep", c.background);
  set("--bg-panel", c.surface);
  set("--bg-select", c.surface);
  set("--bg-card-btn", c.surface);
  set("--popover", c.surface);
  set("--sidebar", c.surface);
  set("--sidebar-accent", c.surface);
  set("--muted", c.surface);
  set("--card", c.card);
  set("--bg-elevated", c.card);
  set("--bg-elevated-2", c.card);

  // text
  set("--foreground", c.textPrimary);
  set("--card-foreground", c.textPrimary);
  set("--popover-foreground", c.textPrimary);
  set("--primary-foreground", c.textPrimary);
  set("--sidebar-foreground", c.textPrimary);
  set("--sidebar-primary-foreground", c.textPrimary);
  set("--muted-foreground", c.textSecondary);
  set("--secondary-foreground", c.background);
  set("--accent-foreground", c.background);

  // borders
  set("--border", c.border);
  set("--input", c.border);
  set("--sidebar-border", c.border);

  // brand extras
  set("--brand-hover", c.hover);
  set("--success", c.success);
  set("--warning", c.warning);
  set("--error", c.error);
  set("--destructive", c.error);
  set("--sale-bg", c.saleBg);
  set("--sale-fg", c.saleFg);
  set("--brand-glow", s.ctaGlow);

  // galaxy gradient mid/end derived from the palette
  set("--galaxy-mid", `color-mix(in srgb, ${c.primaryAlt} 20%, ${c.background})`);
  set("--galaxy-end", `color-mix(in srgb, ${c.primaryAlt} 45%, ${c.background})`);

  // --- typography ---------------------------------------------------------
  set("--font-heading", quoteFont(t.headingFont));
  set("--font-body", quoteFont(t.bodyFont));
  set("--font-sans", `${quoteFont(t.bodyFont)}, ${quoteFont(t.headingFont)}, system-ui, sans-serif`);
  set("--font-weight-heading", String(t.headingWeight));
  set("--font-weight-body", String(t.bodyWeight));
  set("--font-size-base", `${t.baseSize}px`);
  set("--letter-spacing-heading", `${t.letterSpacingHeading}em`);
  if (t.lineHeightBody !== null) set("--line-height-body", String(t.lineHeightBody));
  if (t.letterSpacingBody !== null) set("--letter-spacing-body", `${t.letterSpacingBody}em`);
  set("--h1-size", `${t.h1}em`);
  set("--h2-size", `${t.h2}em`);
  set("--h3-size", `${t.h3}em`);
  set("--h4-size", `${t.h4}em`);

  // --- components ---------------------------------------------------------
  set("--radius", `${s.radius}px`);
  set("--glass-blur", `${s.glassBlur}px`);
  set("--glass-from", s.glassFrom);
  set("--glass-to", s.glassTo);
  set("--glass-border", s.glassBorder);
  set("--nav-from", s.navFrom);
  set("--nav-to", s.navTo);
  set("--nav-border", s.navBorder);
  set("--nav-blur", `${s.navBlur}px`);
  set("--shadow-glass", s.shadowGlass);
  set("--shadow-neon", s.shadowNeon);
  set("--shadow-pink", s.shadowPink);
  set("--shadow-gold", s.shadowGold);

  return map;
}

/** Variable declarations only (`--a: x;--b: y`), for tests and diffing. */
export function themeToCssVariables(config: ThemeConfig): string {
  const map = themeToVariableMap(config);
  return Object.entries(map)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

/** A complete `:root { … }` block for the server-rendered <style> tag. */
export function themeToCss(config: ThemeConfig): string {
  return `:root{${themeToCssVariables(config)}}`;
}
