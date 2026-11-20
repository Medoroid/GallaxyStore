/**
 * Theme Management System — shared types.
 *
 * The config shape is intentionally structured (no free-form CSS/JS): every
 * value is a validated scalar (color string, number, boolean, whitelisted
 * font name) that lib/themes/css.ts turns into CSS custom properties. This is
 * what makes admin-authored themes safe to publish to every visitor.
 */

export type ThemeStatus = "draft" | "scheduled" | "active" | "archived";
export type ActivationMode = "manual" | "scheduled";

export type ThemeColors = {
  primary: string;
  primaryAlt: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  link: string;
  hover: string;
  success: string;
  warning: string;
  error: string;
  saleBg: string;
  saleFg: string;
};

export type ThemeTypography = {
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  /** Base body size in px (14–20). */
  baseSize: number;
  /** Heading letter spacing in em (-0.5 … 0.5). */
  letterSpacingHeading: number;
  /** Body line height, unitless (null = browser default "normal"). */
  lineHeightBody: number | null;
  /** Body letter spacing in em (null = "normal"). */
  letterSpacingBody: number | null;
  /** h1–h4 base sizes in em (applies to headings without an explicit text-* size). */
  h1: number;
  h2: number;
  h3: number;
  h4: number;
};

export type ThemeComponents = {
  /** Global radius in px — drives the whole Tailwind radius scale (--radius). */
  radius: number;
  /** Glass panel blur in px. */
  glassBlur: number;
  glassFrom: string;
  glassTo: string;
  glassBorder: string;
  navFrom: string;
  navTo: string;
  navBorder: string;
  navBlur: number;
  /** Hover glow color used by CTA shadow tokens. */
  ctaGlow: string;
  shadowGlass: string;
  shadowNeon: string;
  shadowPink: string;
  shadowGold: string;
};

export type ThemeDecorationEffect =
  | "snowflakes"
  | "particles"
  | "lanterns"
  | "crescent"
  | "ribbons"
  | "animatedGradient"
  | "cornerOrnaments";

export type ThemeDecorations = {
  enabled: boolean;
  /** 1 = subtle, 2 = normal, 3 = dense (capped element counts). */
  density: 1 | 2 | 3;
  snowflakes: boolean;
  particles: boolean;
  lanterns: boolean;
  crescent: boolean;
  ribbons: boolean;
  animatedGradient: boolean;
  cornerOrnaments: boolean;
};

export type ThemeAssets = {
  bannerEnabled: boolean;
  bannerTitle: string;
  bannerSubtitle: string;
  /** Internal path (/products) or hash (#) or absolute https URL. */
  bannerLink: string;
  bannerDesktop: string;
  bannerMobile: string;
  backgroundDesktop: string;
  backgroundMobile: string;
  /** Seasonal announcement shown in the existing AnnouncementBar. */
  announcement: string;
};

export type ThemeConfig = {
  colors: ThemeColors;
  typography: ThemeTypography;
  components: ThemeComponents;
  decorations: ThemeDecorations;
  assets: ThemeAssets;
};

/** A store_themes row as read from the database. */
export type StoreThemeRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  preview_image: string | null;
  theme_config: Record<string, unknown>;
  status: ThemeStatus;
  priority: number;
  activation_mode: ActivationMode;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  is_recurring: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The single theme_settings row. */
export type ThemeSettingsRow = {
  id: string;
  default_theme_id: string | null;
  manual_override_theme_id: string | null;
  updated_at: string;
};

export type ResolvedThemeSource =
  | "override"
  | "scheduled"
  | "default"
  | "builtin";

/** What the storefront actually renders. */
export type ResolvedTheme = {
  id: string | null;
  name: string;
  slug: string;
  category: string;
  preview_image: string | null;
  config: ThemeConfig;
  source: ResolvedThemeSource;
};

export type ResolvedThemeResult = {
  theme: ResolvedTheme;
  /** Set when a scheduled/manual override decides the result. */
  resolvedAt: string;
};

/** Two eligible themes whose activation windows overlap. */
export type ThemeConflict = {
  a: { id: string; name: string; priority: number };
  b: { id: string; name: string; priority: number };
  /** Which one wins the overlap (highest priority, then newest). */
  winnerId: string;
};
