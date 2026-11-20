import type {
  ThemeAssets,
  ThemeColors,
  ThemeComponents,
  ThemeConfig,
  ThemeDecorations,
  ThemeTypography,
} from "./types";
import { cloneDefaultThemeConfig } from "./defaults";

/**
 * Seasonal presets — starting points, not cages.
 *
 * Each preset is a partial config merged over the built-in default (same
 * merge rule as validateThemeConfig), so a preset can never leave a hole in
 * the design: change three colors and the rest of the store stays intact.
 * The Theme Studio's "New from preset" flow clones the result into a normal
 * draft theme the admin can then edit freely.
 *
 * Decoration defaults are off in the base theme; a preset opts in explicitly
 * (and the storefront still respects prefers-reduced-motion).
 */

/** Sections are partial: a preset only states what it changes. */
export type ThemePresetConfig = {
  colors?: Partial<ThemeColors>;
  typography?: Partial<ThemeTypography>;
  components?: Partial<ThemeComponents>;
  decorations?: Partial<ThemeDecorations>;
  assets?: Partial<ThemeAssets>;
};

export type ThemePreset = {
  id: string;
  name: string;
  category: string;
  description: string;
  config: ThemePresetConfig;
};

function preset(
  id: string,
  name: string,
  category: string,
  description: string,
  config: ThemePresetConfig
): ThemePreset {
  return { id, name, category, description, config };
}

export const THEME_PRESETS: ThemePreset[] = [
  preset(
    "ramadan",
    "Ramadan",
    "religious",
    "Deep midnight blues with lantern gold and a calm crescent mood.",
    {
      colors: {
        primary: "#38bdf8",
        primaryAlt: "#0ea5e9",
        secondary: "#fbbf24",
        accent: "#f59e0b",
        background: "#050b1a",
        surface: "#0a1226",
        card: "#0f1a33",
        textPrimary: "#f8fafc",
        textSecondary: "#a5b4c8",
        border: "rgba(248, 250, 252, 0.12)",
        link: "#fbbf24",
        hover: "#fcd34d",
        saleBg: "#f59e0b",
        saleFg: "#050b1a",
      },
      components: {
        navFrom: "rgba(14, 116, 144, 0.7)",
        navTo: "rgba(245, 158, 11, 0.55)",
        navBorder: "rgba(251, 191, 36, 0.45)",
        ctaGlow: "rgba(251, 191, 36, 0.3)",
        shadowGold: "0 0 24px color-mix(in srgb, var(--gold) 45%, transparent)",
      },
      decorations: {
        enabled: true,
        density: 1,
        snowflakes: false,
        particles: false,
        lanterns: true,
        crescent: true,
        ribbons: false,
        animatedGradient: false,
        cornerOrnaments: true,
      },
      assets: {
        announcement: "رمضان كريم — تعاون رائع يزين الشهر الفضيل",
      },
    }
  ),
  preset(
    "eid-al-fitr",
    "Eid al-Fitr",
    "religious",
    "Festive emerald and gold with ribbons and a bright celebration feel.",
    {
      colors: {
        primary: "#10b981",
        primaryAlt: "#059669",
        secondary: "#f472b6",
        accent: "#fbbf24",
        background: "#04120c",
        surface: "#081a12",
        card: "#0c231a",
        textPrimary: "#f7fef9",
        textSecondary: "#a7c4b5",
        link: "#34d399",
        hover: "#34d399",
        saleBg: "#fbbf24",
        saleFg: "#04120c",
      },
      components: {
        navFrom: "rgba(5, 150, 105, 0.7)",
        navTo: "rgba(244, 114, 182, 0.5)",
        navBorder: "rgba(251, 191, 36, 0.5)",
        ctaGlow: "rgba(52, 211, 153, 0.3)",
      },
      decorations: {
        enabled: true,
        density: 2,
        snowflakes: false,
        particles: true,
        lanterns: false,
        crescent: false,
        ribbons: true,
        animatedGradient: false,
        cornerOrnaments: true,
      },
      assets: {
        announcement: "عيد مبارك — عروض فطرية مميزة لفترة محدودة",
      },
    }
  ),
  preset(
    "eid-al-adha",
    "Eid al-Adha",
    "religious",
    "Warm sand and terracotta tones with understated ornaments.",
    {
      colors: {
        primary: "#d97706",
        primaryAlt: "#b45309",
        secondary: "#f472b6",
        accent: "#fcd34d",
        background: "#140d04",
        surface: "#1c1307",
        card: "#241a0b",
        textPrimary: "#fdf8ef",
        textSecondary: "#c9b8a0",
        link: "#fbbf24",
        hover: "#fcd34d",
        saleBg: "#fcd34d",
        saleFg: "#140d04",
      },
      components: {
        navFrom: "rgba(180, 83, 9, 0.7)",
        navTo: "rgba(217, 119, 6, 0.55)",
        navBorder: "rgba(252, 211, 77, 0.4)",
        ctaGlow: "rgba(252, 211, 77, 0.25)",
      },
      decorations: {
        enabled: true,
        density: 1,
        snowflakes: false,
        particles: true,
        lanterns: false,
        crescent: true,
        ribbons: false,
        animatedGradient: false,
        cornerOrnaments: true,
      },
      assets: {
        announcement: "عيد أضحى مبارك — خصومات العيد بدأت",
      },
    }
  ),
  preset(
    "christmas",
    "Christmas",
    "western",
    "Classic forest green, warm red and snow-white accents.",
    {
      colors: {
        primary: "#22c55e",
        primaryAlt: "#15803d",
        secondary: "#ef4444",
        accent: "#fbbf24",
        background: "#0a140d",
        surface: "#0f1d13",
        card: "#14261a",
        textPrimary: "#f7faf8",
        textSecondary: "#a9c2b2",
        link: "#4ade80",
        hover: "#4ade80",
        saleBg: "#ef4444",
        saleFg: "#ffffff",
      },
      components: {
        navFrom: "rgba(21, 128, 61, 0.75)",
        navTo: "rgba(239, 68, 68, 0.55)",
        navBorder: "rgba(251, 191, 36, 0.4)",
        ctaGlow: "rgba(74, 222, 128, 0.3)",
      },
      decorations: {
        enabled: true,
        density: 2,
        snowflakes: true,
        particles: false,
        lanterns: false,
        crescent: false,
        ribbons: false,
        animatedGradient: false,
        cornerOrnaments: true,
      },
      assets: {
        announcement: " Merry Christmas — holiday deals under the tree",
      },
    }
  ),
  preset(
    "valentine",
    "Valentine's Day",
    "western",
    "Romantic rose pinks over a soft dark plum shell.",
    {
      colors: {
        primary: "#f472b6",
        primaryAlt: "#db2777",
        secondary: "#fb7185",
        accent: "#fda4af",
        background: "#17070f",
        surface: "#1f0a14",
        card: "#2a0f1c",
        textPrimary: "#fff5f7",
        textSecondary: "#d4a8b5",
        link: "#fda4af",
        hover: "#fda4af",
        saleBg: "#fb7185",
        saleFg: "#17070f",
      },
      components: {
        navFrom: "rgba(219, 39, 119, 0.7)",
        navTo: "rgba(251, 113, 133, 0.55)",
        navBorder: "rgba(253, 164, 175, 0.45)",
        ctaGlow: "rgba(251, 113, 133, 0.3)",
        shadowPink:
          "0 0 24px color-mix(in srgb, var(--brand) 55%, transparent), 0 0 60px color-mix(in srgb, var(--brand) 25%, transparent)",
      },
      decorations: {
        enabled: true,
        density: 1,
        snowflakes: false,
        particles: true,
        lanterns: false,
        crescent: false,
        ribbons: true,
        animatedGradient: false,
        cornerOrnaments: false,
      },
      assets: {
        announcement: " Valentine's special — gifts with love, deals with heart",
      },
    }
  ),
  preset(
    "halloween",
    "Halloween",
    "western",
    "Pumpkin orange on near-black with a haunted glow.",
    {
      colors: {
        primary: "#f97316",
        primaryAlt: "#c2410c",
        secondary: "#a855f7",
        accent: "#fbbf24",
        background: "#0d0714",
        surface: "#150b20",
        card: "#1c1029",
        textPrimary: "#fdf7ff",
        textSecondary: "#b7a6c9",
        link: "#c084fc",
        hover: "#fb923c",
        saleBg: "#f97316",
        saleFg: "#0d0714",
      },
      components: {
        navFrom: "rgba(194, 65, 12, 0.75)",
        navTo: "rgba(168, 85, 247, 0.55)",
        navBorder: "rgba(251, 191, 36, 0.35)",
        ctaGlow: "rgba(249, 115, 22, 0.3)",
      },
      decorations: {
        enabled: true,
        density: 2,
        snowflakes: false,
        particles: true,
        lanterns: true,
        crescent: false,
        ribbons: false,
        animatedGradient: true,
        cornerOrnaments: true,
      },
      assets: {
        announcement: "🎃 Halloween frights — scary-good deals inside",
      },
    }
  ),
  preset(
    "black-friday",
    "Black Friday",
    "commercial",
    "High-contrast gold on black — built to shout discounts.",
    {
      colors: {
        primary: "#fbbf24",
        primaryAlt: "#d97706",
        secondary: "#f472b6",
        accent: "#fde68a",
        background: "#050505",
        surface: "#0d0d0d",
        card: "#141414",
        textPrimary: "#ffffff",
        textSecondary: "#b3b3b3",
        border: "rgba(255, 255, 255, 0.14)",
        link: "#fbbf24",
        hover: "#fde68a",
        success: "#22c55e",
        warning: "#f59e0b",
        error: "#ef4444",
        saleBg: "#fbbf24",
        saleFg: "#050505",
      },
      components: {
        radius: 10,
        navFrom: "rgba(217, 119, 6, 0.8)",
        navTo: "rgba(5, 5, 5, 0.9)",
        navBorder: "rgba(251, 191, 36, 0.55)",
        ctaGlow: "rgba(251, 191, 36, 0.35)",
        shadowGold:
          "0 0 24px color-mix(in srgb, var(--gold) 55%, transparent), 0 0 60px color-mix(in srgb, var(--gold) 25%, transparent)",
      },
      decorations: {
        enabled: true,
        density: 3,
        snowflakes: false,
        particles: true,
        lanterns: false,
        crescent: false,
        ribbons: false,
        animatedGradient: true,
        cornerOrnaments: false,
      },
      assets: {
        announcement: "BLACK FRIDAY — up to 50% off, today only",
      },
    }
  ),
  preset(
    "new-year",
    "New Year",
    "western",
    "Champagne gold and midnight blue with a fireworks sparkle.",
    {
      colors: {
        primary: "#38bdf8",
        primaryAlt: "#0284c7",
        secondary: "#fbbf24",
        accent: "#fde68a",
        background: "#030712",
        surface: "#0a1020",
        card: "#0f172a",
        textPrimary: "#f8fafc",
        textSecondary: "#9fb2c8",
        link: "#fde68a",
        hover: "#fde68a",
        saleBg: "#fde68a",
        saleFg: "#030712",
      },
      components: {
        navFrom: "rgba(2, 132, 199, 0.7)",
        navTo: "rgba(251, 191, 36, 0.55)",
        navBorder: "rgba(253, 230, 138, 0.45)",
        ctaGlow: "rgba(253, 230, 138, 0.3)",
      },
      decorations: {
        enabled: true,
        density: 2,
        snowflakes: true,
        particles: true,
        lanterns: false,
        crescent: false,
        ribbons: false,
        animatedGradient: true,
        cornerOrnaments: false,
      },
      assets: {
        announcement: "Happy New Year — start the year with a treat",
      },
    }
  ),
];

/**
 * Merge a preset over the default config (deep for the top-level sections
 * the preset actually provides) and return a complete, valid ThemeConfig.
 */
export function presetToConfig(presetConfig: ThemePresetConfig): ThemeConfig {
  const base = cloneDefaultThemeConfig();
  return {
    ...base,
    ...presetConfig,
    colors: { ...base.colors, ...(presetConfig.colors ?? {}) },
    typography: { ...base.typography, ...(presetConfig.typography ?? {}) },
    components: { ...base.components, ...(presetConfig.components ?? {}) },
    decorations: { ...base.decorations, ...(presetConfig.decorations ?? {}) },
    assets: { ...base.assets, ...(presetConfig.assets ?? {}) },
  };
}
