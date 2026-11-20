/**
 * Unit tests — lib/themes/css.ts (config → CSS custom properties):
 *   - the default config reproduces the storefront's design tokens,
 *   - validated configs emit only well-formed declarations (the injection
 *     contract: css.ts is fed exclusively by validateThemeConfig),
 *   - derived tokens (glows, gradients) follow the palette,
 *   - nullable typography fields are skipped rather than emitted as null.
 */

import { themeToCss, themeToCssVariables, themeToVariableMap } from "@/lib/themes/css";
import { DEFAULT_THEME_CONFIG, cloneDefaultThemeConfig } from "@/lib/themes/defaults";
import { validateThemeConfig } from "@/lib/themes/validate";
import type { ThemeConfig } from "@/lib/themes/types";

function validated(overrides: unknown): ThemeConfig {
  const result = validateThemeConfig(overrides);
  if (!result.ok) throw new Error(`unexpected validation failure: ${result.errors.join(", ")}`);
  return result.config;
}

describe("themeToVariableMap — default config", () => {
  const map = themeToVariableMap(cloneDefaultThemeConfig());

  test("covers the core storefront tokens", () => {
    for (const token of [
      "--primary",
      "--brand",
      "--brand-2",
      "--brand-deep",
      "--brand-hover",
      "--brand-ring",
      "--brand-glow",
      "--background",
      "--bg-deep",
      "--bg-panel",
      "--bg-elevated",
      "--bg-elevated-2",
      "--bg-card-btn",
      "--bg-select",
      "--foreground",
      "--muted-foreground",
      "--border",
      "--secondary",
      "--accent",
      "--gold",
      "--success",
      "--warning",
      "--error",
      "--destructive",
      "--sale-bg",
      "--sale-fg",
      "--glass-from",
      "--glass-to",
      "--glass-border",
      "--glass-blur",
      "--nav-from",
      "--nav-to",
      "--nav-border",
      "--nav-blur",
      "--radius",
      "--font-heading",
      "--font-body",
      "--font-weight-heading",
      "--font-weight-body",
      "--font-size-base",
      "--letter-spacing-heading",
      "--h1-size",
      "--h2-size",
      "--h3-size",
      "--h4-size",
      "--shadow-glass",
      "--shadow-neon",
      "--shadow-pink",
      "--shadow-gold",
      "--galaxy-mid",
      "--galaxy-end",
    ]) {
      expect(map).toHaveProperty(token);
    }
  });

  test("reproduces the current design values", () => {
    expect(map["--primary"]).toBe("#9835fd");
    expect(map["--brand"]).toBe("#ff4fd8");
    expect(map["--brand-deep"]).toBe("#8a2be2");
    expect(map["--radius"]).toBe("16px");
    expect(map["--font-size-base"]).toBe("16px");
    expect(map["--font-heading"]).toBe("'Poppins'");
    expect(map["--h1-size"]).toBe("2em");
    expect(map["--letter-spacing-heading"]).toBe("-0.02em");
  });

  test("nullable typography fields are omitted, not emitted as null", () => {
    expect(map).not.toHaveProperty("--line-height-body");
    expect(map).not.toHaveProperty("--letter-spacing-body");

    const withValues = themeToVariableMap(
      validated({ typography: { lineHeightBody: 1.5, letterSpacingBody: 0.05 } })
    );
    expect(withValues["--line-height-body"]).toBe("1.5");
    expect(withValues["--letter-spacing-body"]).toBe("0.05em");
  });
});

describe("themeToVariableMap — derived tokens", () => {
  const map = themeToVariableMap(
    validated({
      colors: { secondary: "#00FF00", primaryAlt: "#0000FF", background: "#101010" },
      components: { ctaGlow: "rgba(0, 255, 0, 0.4)" },
    })
  );

  test("glows and rings derive from the palette via color-mix", () => {
    expect(map["--brand-ring"]).toBe(
      "color-mix(in srgb, #00ff00 40%, transparent)"
    );
    expect(map["--brand-glow-mid"]).toBe(
      "color-mix(in srgb, #00ff00 60%, transparent)"
    );
    expect(map["--brand-glow-strong"]).toBe(
      "color-mix(in srgb, #00ff00 80%, transparent)"
    );
    expect(map["--brand-glow"]).toBe("rgba(0, 255, 0, 0.4)");
  });

  test("galaxy gradient stops derive from primaryAlt over background", () => {
    expect(map["--galaxy-mid"]).toBe(
      "color-mix(in srgb, #0000ff 20%, #101010)"
    );
    expect(map["--galaxy-end"]).toBe(
      "color-mix(in srgb, #0000ff 45%, #101010)"
    );
  });

  test("secondary (CTA) and link (text) colors are independently mapped", () => {
    const split = themeToVariableMap(
      validated({ colors: { secondary: "#111111", link: "#222222" } })
    );
    expect(split["--brand"]).toBe("#111111");
    expect(split["--secondary"]).toBe("#222222");
  });
});

describe("themeToCss — emission safety", () => {
  test("produces a single :root block", () => {
    const css = themeToCss(cloneDefaultThemeConfig());
    expect(css.startsWith(":root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css).not.toMatch(/</); // no markup can ever appear in output
  });

  test("never emits undefined / NaN / [object Object]", () => {
    const css = themeToCss(cloneDefaultThemeConfig());
    expect(css).not.toContain("undefined");
    expect(css).not.toContain("NaN");
    expect(css).not.toContain("[object");
  });

  test("malicious configs cannot reach the emitter", () => {
    // The contract: css.ts only ever receives validateThemeConfig output.
    const hostile = [
      { colors: { primary: "</style><script>alert(1)</script>" } },
      { components: { shadowGlass: "} body{display:none}" } },
      { typography: { headingFont: "x';} *{color:red" } },
    ];
    for (const payload of hostile) {
      const result = validateThemeConfig(payload);
      expect(result.ok).toBe(false); // rejected upstream — never emitted
    }
  });

  test("variable list is deterministic and comma-free inside values", () => {
    const config = cloneDefaultThemeConfig();
    const first = themeToCssVariables(config);
    const second = themeToCssVariables(config);
    expect(first).toBe(second);

    const map = themeToVariableMap(config);
    for (const [name, value] of Object.entries(map)) {
      expect(name).toMatch(/^--[a-z0-9-]+$/);
      expect(value).not.toContain(";"); // values cannot break the declaration
      expect(value).not.toContain("}");
      expect(value).not.toContain("{");
    }
  });
});

describe("themeToVariableMap — custom values round-trip", () => {
  test("clamped, validated values land in the map", () => {
    const map = themeToVariableMap(
      validated({
        colors: { primary: "#ABCDEF", background: "#000000" },
        typography: {
          headingFont: "Orbitron",
          bodyFont: "Tajawal",
          baseSize: 18,
          h1: 2.5,
        },
        components: { radius: 24, glassBlur: 30 },
        decorations: { enabled: true, snowflakes: true, density: 3 },
      })
    );

    expect(map["--primary"]).toBe("#abcdef");
    expect(map["--font-heading"]).toBe("'Orbitron'");
    expect(map["--font-body"]).toBe("'Tajawal'");
    expect(map["--font-size-base"]).toBe("18px");
    expect(map["--h1-size"]).toBe("2.5em");
    expect(map["--radius"]).toBe("24px");
    expect(map["--glass-blur"]).toBe("30px");
  });

  test("cloneDefaultThemeConfig returns an independent copy", () => {
    const a = cloneDefaultThemeConfig();
    a.colors.primary = "#000000";
    expect(DEFAULT_THEME_CONFIG.colors.primary).toBe("#9835fd");
  });
});
