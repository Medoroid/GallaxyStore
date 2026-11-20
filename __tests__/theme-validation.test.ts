/**
 * Unit tests — lib/themes/validate.ts (the Theme Studio security boundary):
 *   - hostile payloads are rejected (no CSS/JS injection is expressible),
 *   - unknown keys are dropped and partial configs merge over defaults,
 *   - numbers are clamped, fonts are whitelisted, URLs are scheme-checked.
 */

import {
  FONT_WHITELIST,
  sanitizeColor,
  sanitizeFont,
  sanitizeShadow,
  sanitizeText,
  sanitizeUrl,
  validateThemeConfig,
} from "@/lib/themes/validate";
import { cloneDefaultThemeConfig, DEFAULT_THEME_CONFIG } from "@/lib/themes/defaults";

describe("validateThemeConfig — happy paths", () => {
  test("the default config passes unchanged", () => {
    const result = validateThemeConfig(cloneDefaultThemeConfig());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config).toEqual(DEFAULT_THEME_CONFIG);
  });

  test("an empty object yields the complete defaults", () => {
    const result = validateThemeConfig({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config).toEqual(DEFAULT_THEME_CONFIG);
  });

  test("a partial config merges over the defaults", () => {
    const result = validateThemeConfig({ colors: { primary: "#00FF00" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.colors.primary).toBe("#00ff00");
      expect(result.config.colors.accent).toBe(
        DEFAULT_THEME_CONFIG.colors.accent
      );
      expect(result.config.typography).toEqual(DEFAULT_THEME_CONFIG.typography);
    }
  });

  test("editing only secondary carries the link color along", () => {
    const result = validateThemeConfig({ colors: { secondary: "#22c55e" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.colors.secondary).toBe("#22c55e");
      expect(result.config.colors.link).toBe("#22c55e");
    }
  });

  test("accepts rgb(), rgba(), hsl() and 8-digit hex colors", () => {
    const result = validateThemeConfig({
      colors: {
        primary: "rgb(255, 0, 0)",
        secondary: "rgba(0, 255, 0, 0.5)",
        accent: "hsl(40, 90%, 60%)",
        background: "#11223344",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.colors.primary).toBe("rgb(255, 0, 0)");
      expect(result.config.colors.secondary).toBe("rgba(0, 255, 0, 0.5)");
      expect(result.config.colors.accent).toBe("hsl(40, 90%, 60%)");
      expect(result.config.colors.background).toBe("#11223344");
    }
  });
});

describe("validateThemeConfig — rejection & normalization", () => {
  test("rejects non-object configs", () => {
    for (const bad of [null, "nope", 42, ["array"]]) {
      expect(validateThemeConfig(bad).ok).toBe(false);
    }
  });

  test.each([
    ["colors.primary", { colors: { primary: "</style><script>alert(1)</script>" } }],
    ["colors.primary (css breakout)", { colors: { primary: "#fff; }" } }],
    ["colors.primary (expression)", { colors: { primary: "expression(alert(1))" } }],
    [
      "components.shadowGlass (brace breakout)",
      { components: { shadowGlass: "} body{display:none}" } },
    ],
    [
      "components.shadowNeon (url())",
      { components: { shadowNeon: "0 0 5px url(https://evil.test/x.png)" } },
    ],
    [
      "components.shadowPink (quote)",
      { components: { shadowPink: "0 0 5px red'); }" } },
    ],
    ["typography.headingFont (not whitelisted)", { typography: { headingFont: "Comic Sans MS" } }],
    ["typography.headingFont (injection)", { typography: { headingFont: "Poppins';} *{color:red" } }],
    ["assets.bannerLink (javascript:)", { assets: { bannerLink: "javascript:alert(1)" } }],
    ["assets.bannerLink (protocol-relative)", { assets: { bannerLink: "//evil.test/x" } }],
    ["assets.backgroundDesktop (data:)", { assets: { backgroundDesktop: "data:text/html,<script>x</script>" } }],
    ["components.radius (NaN)", { components: { radius: "abc" } }],
    ["decorations.enabled (string)", { decorations: { enabled: "yes" } }],
    ["decorations.density (out of type)", { decorations: { density: "lots" } }],
  ])("rejects %s", (_label, payload) => {
    const result = validateThemeConfig(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  test("out-of-range numbers are clamped, not rejected", () => {
    const result = validateThemeConfig({
      components: { radius: 9999, glassBlur: -10, navBlur: 400 },
      typography: { baseSize: 100, headingWeight: 40, h1: 99 },
      decorations: { density: 42 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.components.radius).toBe(32);
      expect(result.config.components.glassBlur).toBe(0);
      expect(result.config.components.navBlur).toBe(40);
      expect(result.config.typography.baseSize).toBe(20);
      expect(result.config.typography.headingWeight).toBe(100);
      expect(result.config.typography.h1).toBe(4);
      expect(result.config.decorations.density).toBe(3);
    }
  });

  test("numeric strings are accepted (form state is stringly typed)", () => {
    const result = validateThemeConfig({ components: { radius: "24" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.components.radius).toBe(24);
  });

  test("nullable typography fields may stay null or take a value", () => {
    const nulled = validateThemeConfig({
      typography: { lineHeightBody: null, letterSpacingBody: null },
    });
    expect(nulled.ok).toBe(true);
    if (nulled.ok) {
      expect(nulled.config.typography.lineHeightBody).toBeNull();
    }

    const set = validateThemeConfig({
      typography: { lineHeightBody: 1.6, letterSpacingBody: 0.1 },
    });
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect(set.config.typography.lineHeightBody).toBe(1.6);
      expect(set.config.typography.letterSpacingBody).toBe(0.1);
    }
  });

  test("unknown keys are dropped (no smuggled sections)", () => {
    const result = validateThemeConfig({
      colors: { primary: "#123456", evil: "#000000" },
      scripts: { payload: "alert(1)" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).not.toHaveProperty("scripts");
      expect(result.config.colors).not.toHaveProperty("evil");
    }
  });

  test("angle brackets are stripped from display text", () => {
    const result = validateThemeConfig({
      assets: { bannerTitle: "<img src=x onerror=alert(1)>Sale" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.assets.bannerTitle).not.toContain("<");
      expect(result.config.assets.bannerTitle).not.toContain(">");
      expect(result.config.assets.bannerTitle).toContain("Sale");
    }
  });
});

describe("sanitizeColor", () => {
  test.each([
    "#fff",
    "#FF4FD8",
    "#11223344",
    "rgb(1, 2, 3)",
    "rgba(1, 2, 3, 0.5)",
    "hsl(210, 50%, 40%)",
    "hsla(210, 50%, 40%, 0.25)",
  ])("accepts %s", (value) => {
    expect(sanitizeColor(value)).not.toBeNull();
  });

  test.each([
    "oklch(0.5 0.1 300)", // outside the accepted formats
    "red; background: black",
    "url(evil)",
    "#zzzzzz",
    "",
    "  ",
    42,
    null,
    undefined,
    { toString: () => "#fff" },
  ])("rejects %p", (value) => {
    expect(sanitizeColor(value)).toBeNull();
  });

  test("clamps rgb channels and alpha", () => {
    expect(sanitizeColor("rgb(300, -20, 10)")).toBe("rgb(255, 0, 10)");
    expect(sanitizeColor("rgba(0, 0, 0, 4)")).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("sanitizeShadow", () => {
  test("accepts ordinary shadow values", () => {
    expect(sanitizeShadow("0 8px 32px rgba(0, 0, 0, 0.45)")).not.toBeNull();
    expect(
      sanitizeShadow("0 0 24px color-mix(in srgb, #FF4FD8 55%, transparent)")
    ).not.toBeNull();
    expect(sanitizeShadow("inset 0 1px 0 rgba(255, 255, 255, 0.08)")).not.toBeNull();
  });

  test.each([
    "0 0 5px url(evil)",
    "expression(alert(1))",
    "0 0 5px red; }",
    '0 0 5px red")',
    "0 0 5px <script>",
    "0 0 5px \\65",
    "",
    12,
  ])("rejects %p", (value) => {
    expect(sanitizeShadow(value)).toBeNull();
  });
});

describe("sanitizeFont / sanitizeText / sanitizeUrl", () => {
  test("fonts must be on the whitelist", () => {
    expect(sanitizeFont("Poppins")).toBe("Poppins");
    expect(sanitizeFont("DM Sans")).toBe("DM Sans");
    expect(sanitizeFont("Comic Sans MS")).toBeNull();
    expect(sanitizeFont("Poppins';} *{")).toBeNull();
    expect(FONT_WHITELIST).toContain("Tajawal");
  });

  test("text strips angle brackets and enforces a max length", () => {
    // "<b>hi</b>" loses only the angle brackets: "bhi/b" (the slash is text).
    expect(sanitizeText("<b>hi</b>", 50)).toBe("bhi/b");
    expect(sanitizeText("x".repeat(100), 10)).toHaveLength(10);
    expect(sanitizeText(42, 10)).toBeNull();
  });

  test("urls allow internal paths, hashes and https only", () => {
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl("#top")).toBe("#top");
    expect(sanitizeUrl("/products")).toBe("/products");
    expect(sanitizeUrl("https://cdn.test/bg.png")).toBe("https://cdn.test/bg.png");
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>x</script>",
    "//evil.test/x",
    "ftp://evil.test/x",
    "file:///etc/passwd",
    "https://evil.test/\"> <script>",
  ])("rejects %p", (value) => {
    expect(sanitizeUrl(value)).toBeNull();
  });
});
