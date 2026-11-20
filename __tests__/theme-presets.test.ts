/**
 * Unit tests — lib/themes/presets.ts:
 *   - every preset merges into a COMPLETE config that passes the same
 *     validator the API uses (a preset can never ship an invalid theme),
 *   - presets only touch documented sections (no typos leaking through the
 *     spread in presetToConfig),
 *   - partial merge semantics: untouched sections keep the built-in default,
 *   - purity: the shared default config is never mutated.
 */

import { THEME_PRESETS, presetToConfig, type ThemePresetConfig } from "@/lib/themes/presets";
import { validateThemeConfig } from "@/lib/themes/validate";
import { cloneDefaultThemeConfig, DEFAULT_THEME_CONFIG } from "@/lib/themes/defaults";

const ALLOWED_SECTIONS: Array<keyof ThemePresetConfig> = [
  "colors",
  "typography",
  "components",
  "decorations",
  "assets",
];

describe("THEME_PRESETS — catalogue integrity", () => {
  test("ships at least the eight documented presets", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(8);
  });

  test("ids are unique and slug-safe", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  test("every preset has a name, category and description", () => {
    for (const preset of THEME_PRESETS) {
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.category.trim().length).toBeGreaterThan(0);
      expect(preset.description.trim().length).toBeGreaterThan(0);
    }
  });

  test("only documented config sections are used", () => {
    for (const preset of THEME_PRESETS) {
      const sections = Object.keys(preset.config);
      for (const section of sections) {
        expect(ALLOWED_SECTIONS).toContain(section as keyof ThemePresetConfig);
      }
    }
  });
});

describe("presetToConfig — validity", () => {
  test("every preset produces a config that passes validateThemeConfig", () => {
    for (const preset of THEME_PRESETS) {
      const result = validateThemeConfig(presetToConfig(preset.config));
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`${preset.id}: ${result.errors.join(", ")}`);
      }
    }
  });

  test("merged configs are complete (no missing sections)", () => {
    for (const preset of THEME_PRESETS) {
      const config = presetToConfig(preset.config);
      expect(config.colors).toBeDefined();
      expect(config.typography).toBeDefined();
      expect(config.components).toBeDefined();
      expect(config.decorations).toBeDefined();
      expect(config.assets).toBeDefined();
    }
  });

  test("presets that do not opt into decorations leave them disabled", () => {
    for (const preset of THEME_PRESETS) {
      if (preset.config.decorations !== undefined) continue;
      const config = presetToConfig(preset.config);
      expect(config.decorations).toEqual(cloneDefaultThemeConfig().decorations);
      expect(config.decorations.enabled).toBe(false);
    }
  });

  test("declared decoration density stays within the 1..3 cap", () => {
    for (const preset of THEME_PRESETS) {
      const density = preset.config.decorations?.density;
      if (density === undefined) continue;
      expect([1, 2, 3]).toContain(density);
    }
  });
});

describe("presetToConfig — merge semantics", () => {
  test("sections the preset omits keep the built-in default", () => {
    const config = presetToConfig({ colors: { primary: "#ff0000" } });
    expect(config.colors.primary).toBe("#ff0000");
    expect(config.typography).toEqual(cloneDefaultThemeConfig().typography);
    expect(config.components).toEqual(cloneDefaultThemeConfig().components);
    expect(config.assets).toEqual(cloneDefaultThemeConfig().assets);
  });

  test("partial sections merge key-by-key, not replace the section", () => {
    const base = cloneDefaultThemeConfig();
    const config = presetToConfig({ colors: { primary: "#123456" } });
    // Every other color key survives untouched.
    expect(config.colors).toEqual({ ...base.colors, primary: "#123456" });
  });

  test("the shared default config is never mutated", () => {
    const before = JSON.stringify(DEFAULT_THEME_CONFIG);
    presetToConfig({ colors: { primary: "#ff0000" }, decorations: { enabled: true } });
    presetToConfig(THEME_PRESETS[0].config);
    expect(JSON.stringify(DEFAULT_THEME_CONFIG)).toBe(before);
  });

  test("two calls return independent objects", () => {
    const a = presetToConfig({ colors: { primary: "#111111" } });
    const b = presetToConfig({ colors: { primary: "#222222" } });
    a.colors.primary = "#333333";
    expect(b.colors.primary).toBe("#222222");
  });
});
