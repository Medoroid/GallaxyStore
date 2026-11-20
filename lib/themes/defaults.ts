import type { ThemeConfig } from "./types";

/**
 * Built-in Galaxy Store default theme.
 *
 * Every value mirrors the design tokens that app/globals.css ships with, so a
 * theme created "from scratch" starts as the store everyone already knows.
 * (When NO theme is active the engine emits no overrides at all and the raw
 * globals.css values render — this object exists for the editor's starting
 * state and as the merge base for partial configs.)
 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  colors: {
    // Hex values are stored lowercase — validateThemeConfig canonicalizes
    // every color to lowercase so emitted CSS stays deterministic.
    primary: "#9835fd",
    primaryAlt: "#8a2be2",
    secondary: "#ff4fd8",
    accent: "#ffd166",
    background: "#120018",
    surface: "#160122",
    card: "#1a0a24",
    textPrimary: "#fafafa",
    textSecondary: "#b8a9c4",
    border: "rgba(251, 250, 252, 0.12)", // matches --border (white @ 12%)
    link: "#ff4fd8",
    hover: "#ff6fe0",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    saleBg: "#ffd166",
    saleFg: "#120018",
  },
  typography: {
    headingFont: "Poppins",
    bodyFont: "Poppins",
    headingWeight: 800,
    bodyWeight: 400,
    baseSize: 16,
    letterSpacingHeading: -0.02,
    lineHeightBody: null,
    letterSpacingBody: null,
    h1: 2,
    h2: 1.5,
    h3: 1.17,
    h4: 1,
  },
  components: {
    radius: 16, // --radius: 1rem
    glassBlur: 20,
    glassFrom: "rgba(255, 255, 255, 0.06)",
    glassTo: "rgba(255, 255, 255, 0.02)",
    glassBorder: "rgba(255, 255, 255, 0.1)",
    navFrom: "rgba(137, 43, 226, 0.659)",
    navTo: "rgba(255, 79, 217, 0.599)",
    navBorder: "rgba(255, 79, 217, 0.49)",
    navBlur: 24,
    ctaGlow: "rgba(255, 79, 216, 0.3)",
    shadowGlass: "0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    shadowNeon:
      "0 0 24px color-mix(in srgb, var(--brand-deep) 55%, transparent), 0 0 60px color-mix(in srgb, var(--brand-deep) 25%, transparent)",
    shadowPink:
      "0 0 24px color-mix(in srgb, var(--brand) 55%, transparent), 0 0 60px color-mix(in srgb, var(--brand) 25%, transparent)",
    shadowGold: "0 0 24px color-mix(in srgb, var(--gold) 45%, transparent)",
  },
  decorations: {
    enabled: false,
    density: 1,
    snowflakes: false,
    particles: false,
    lanterns: false,
    crescent: false,
    ribbons: false,
    animatedGradient: false,
    cornerOrnaments: false,
  },
  assets: {
    bannerEnabled: false,
    bannerTitle: "",
    bannerSubtitle: "",
    bannerLink: "",
    bannerDesktop: "",
    bannerMobile: "",
    backgroundDesktop: "",
    backgroundMobile: "",
    announcement: "",
  },
};

/** Deep clone of the default config (editor starting state / merge base).
 *  JSON clone on purpose: the config is JSONB-shaped by definition and this
 *  works in Node, browsers and jest's jsdom (which lacks structuredClone). */
export function cloneDefaultThemeConfig(): ThemeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_THEME_CONFIG)) as ThemeConfig;
}
