/**
 * Unit tests — lib/themes/resolve.ts (theme resolution engine):
 *   - precedence: override > highest-priority eligible > default > builtin,
 *   - eligibility (status + window, manual vs scheduled activation),
 *   - recurring annual windows rebuilt in the row's IANA timezone
 *     (including Dec→Jan spanning windows),
 *   - conflict detection with an explicit winner,
 *   - hostile configs degrade to the built-in defaults.
 */

import {
  BUILTIN_THEME,
  isEligible,
  isValidTimeZone,
  resolveTheme,
} from "@/lib/themes/resolve";
import { DEFAULT_THEME_CONFIG } from "@/lib/themes/defaults";
import type { StoreThemeRow, ThemeSettingsRow } from "@/lib/themes/types";

const NOW = new Date("2026-11-10T12:00:00.000Z");

function themeRow(overrides: Partial<StoreThemeRow> = {}): StoreThemeRow {
  return {
    id: "theme-1",
    name: "Test Theme",
    slug: "test-theme",
    description: null,
    category: "custom",
    preview_image: null,
    theme_config: {},
    status: "active",
    priority: 0,
    activation_mode: "manual",
    starts_at: null,
    ends_at: null,
    timezone: "UTC",
    is_recurring: false,
    created_by: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function settingsRow(
  overrides: Partial<ThemeSettingsRow> = {}
): ThemeSettingsRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    default_theme_id: null,
    manual_override_theme_id: null,
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTheme — precedence tiers", () => {
  test("falls back to the built-in default with no themes", () => {
    const out = resolveTheme({ themes: [], settings: null, now: NOW });
    expect(out.source).toBe("builtin");
    expect(out.theme.id).toBeNull();
    expect(out.theme.slug).toBe(BUILTIN_THEME.slug);
    expect(out.theme.config.colors.primary).toBe(
      DEFAULT_THEME_CONFIG.colors.primary
    );
    expect(out.conflicts).toEqual([]);
  });

  test("published manual theme wins over nothing (tier 2)", () => {
    const out = resolveTheme({
      themes: [themeRow()],
      settings: null,
      now: NOW,
    });
    expect(out.source).toBe("scheduled");
    expect(out.theme.id).toBe("theme-1");
  });

  test("draft and archived themes are never eligible", () => {
    for (const status of ["draft", "archived"] as const) {
      const out = resolveTheme({
        themes: [themeRow({ status })],
        settings: null,
        now: NOW,
      });
      expect(out.source).toBe("builtin");
    }
  });

  test("manual override beats the highest-priority scheduled theme", () => {
    const out = resolveTheme({
      themes: [
        themeRow({ id: "a", priority: 100 }),
        themeRow({ id: "b", priority: 1 }),
      ],
      settings: settingsRow({ manual_override_theme_id: "b" }),
      now: NOW,
    });
    expect(out.source).toBe("override");
    expect(out.theme.id).toBe("b");
  });

  test("override to an archived row is ignored (falls through)", () => {
    const out = resolveTheme({
      themes: [
        themeRow({ id: "a", priority: 100 }),
        themeRow({ id: "b", status: "archived" }),
      ],
      settings: settingsRow({ manual_override_theme_id: "b" }),
      now: NOW,
    });
    expect(out.source).toBe("scheduled");
    expect(out.theme.id).toBe("a");
  });

  test("override to a missing id is ignored", () => {
    const out = resolveTheme({
      themes: [themeRow({ id: "a" })],
      settings: settingsRow({ manual_override_theme_id: "ghost" }),
      now: NOW,
    });
    expect(out.source).toBe("scheduled");
    expect(out.theme.id).toBe("a");
  });

  test("highest priority wins; equal priority prefers newest update", () => {
    const out = resolveTheme({
      themes: [
        themeRow({ id: "low", priority: 1, updated_at: "2026-11-01T00:00:00Z" }),
        themeRow({ id: "high", priority: 5, updated_at: "2026-06-01T00:00:00Z" }),
        themeRow({ id: "newest", priority: 5, updated_at: "2026-11-05T00:00:00Z" }),
      ],
      settings: null,
      now: NOW,
    });
    expect(out.theme.id).toBe("newest");
  });

  test("default_theme_id is used when nothing is eligible (tier 3)", () => {
    const out = resolveTheme({
      themes: [
        themeRow({ id: "draft-only", status: "draft" }),
        themeRow({ id: "the-default" }),
      ],
      settings: settingsRow({ default_theme_id: "draft-only" }),
      now: NOW,
    });
    // The default row is eligible anyway (active), so tier 2 picks it;
    // re-run with only an archived default to prove the tier-3 path exists.
    expect(out.source).toBe("scheduled");

    const tier3 = resolveTheme({
      themes: [themeRow({ id: "the-default", status: "archived" })],
      settings: settingsRow({ default_theme_id: "the-default" }),
      now: NOW,
    });
    expect(tier3.source).toBe("builtin");

    const tier3Real = resolveTheme({
      themes: [themeRow({ id: "the-default", status: "draft" })],
      settings: settingsRow({ default_theme_id: "the-default" }),
      now: NOW,
    });
    expect(tier3Real.source).toBe("default");
    expect(tier3Real.theme.id).toBe("the-default");
  });
});

describe("resolveTheme — scheduled windows", () => {
  test("scheduled theme is only eligible inside its window", () => {
    const row = themeRow({
      status: "scheduled",
      activation_mode: "scheduled",
      starts_at: "2026-12-01T00:00:00.000Z",
      ends_at: "2026-12-31T23:59:59.000Z",
    });

    expect(isEligible(row, Date.parse("2026-11-10T12:00:00Z"))).toBe(false);
    expect(isEligible(row, Date.parse("2026-12-15T12:00:00Z"))).toBe(true);
    expect(isEligible(row, Date.parse("2027-01-01T00:00:00Z"))).toBe(false);
    // Window boundaries are inclusive of start.
    expect(isEligible(row, Date.parse("2026-12-01T00:00:00Z"))).toBe(true);
  });

  test("manual activation mode ignores the window entirely", () => {
    const row = themeRow({
      activation_mode: "manual",
      starts_at: "2026-12-01T00:00:00.000Z",
      ends_at: "2026-12-31T23:59:59.000Z",
    });
    expect(isEligible(row, Date.parse("2026-11-10T12:00:00Z"))).toBe(true);
    expect(isEligible(row, Date.parse("2027-06-01T00:00:00Z"))).toBe(true);
  });

  test("scheduled mode without a window stays open once published", () => {
    const row = themeRow({ activation_mode: "scheduled", starts_at: null, ends_at: null });
    expect(isEligible(row, Date.parse("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("resolveTheme — recurring annual windows (IANA timezone)", () => {
  // Dec 15 → Jan 5, stored as absolute instants anchored at Riyadh midnight.
  const ramadanLike = themeRow({
    status: "scheduled",
    activation_mode: "scheduled",
    is_recurring: true,
    timezone: "Asia/Riyadh",
    starts_at: "2026-12-14T21:00:00.000Z", // Dec 15 00:00 +03:00
    ends_at: "2027-01-04T21:00:00.000Z", // Jan 5 00:00 +03:00
  });

  test("open in mid-December", () => {
    expect(isEligible(ramadanLike, Date.parse("2026-12-20T00:00:00Z"))).toBe(true);
  });

  test("still open in early January (window spans New Year)", () => {
    expect(isEligible(ramadanLike, Date.parse("2027-01-02T00:00:00Z"))).toBe(true);
  });

  test("closed in summer", () => {
    expect(isEligible(ramadanLike, Date.parse("2026-06-01T00:00:00Z"))).toBe(false);
  });

  test("re-opens the previous year's instance (early-Jan edge)", () => {
    expect(isEligible(ramadanLike, Date.parse("2025-12-20T00:00:00Z"))).toBe(true);
  });

  test("recurring window respects the row timezone, not the server clock", () => {
    // Window: Jan 1 00:00 → Jan 2 00:00 in New York (UTC-5 in January).
    const ny = themeRow({
      status: "scheduled",
      activation_mode: "scheduled",
      is_recurring: true,
      timezone: "America/New_York",
      starts_at: "2026-01-01T05:00:00.000Z",
      ends_at: "2026-01-02T05:00:00.000Z",
    });
    // 2027-01-01 02:00 UTC = 2026-12-31 21:00 New York → NOT yet open.
    expect(isEligible(ny, Date.parse("2027-01-01T02:00:00Z"))).toBe(false);
    // 2027-01-01 12:00 UTC = 2027-01-01 07:00 New York → open.
    expect(isEligible(ny, Date.parse("2027-01-01T12:00:00Z"))).toBe(true);
  });
});

describe("resolveTheme — conflicts", () => {
  test("two simultaneously live themes are reported with a winner", () => {
    const out = resolveTheme({
      themes: [
        themeRow({ id: "a", name: "A", priority: 1 }),
        themeRow({ id: "b", name: "B", priority: 9 }),
      ],
      settings: null,
      now: NOW,
    });
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].winnerId).toBe("b");
    expect(out.theme.id).toBe("b");
  });

  test("no conflict when windows do not overlap", () => {
    const out = resolveTheme({
      themes: [
        themeRow({
          id: "winter",
          activation_mode: "scheduled",
          status: "scheduled",
          starts_at: "2026-12-01T00:00:00Z",
          ends_at: "2026-12-31T23:59:59Z",
        }),
        themeRow({
          id: "summer",
          activation_mode: "scheduled",
          status: "scheduled",
          starts_at: "2026-06-01T00:00:00Z",
          ends_at: "2026-06-30T23:59:59Z",
        }),
      ],
      settings: null,
      now: NOW,
    });
    expect(out.conflicts).toEqual([]);
  });
});

describe("resolveTheme — config safety", () => {
  test("a hostile theme_config degrades to the built-in defaults", () => {
    const out = resolveTheme({
      themes: [
        themeRow({
          theme_config: {
            colors: { primary: "</style><script>alert(1)</script>" },
            evilSection: { payload: true },
          },
        }),
      ],
      settings: null,
      now: NOW,
    });
    expect(out.source).toBe("scheduled");
    expect(out.theme.config.colors.primary).toBe(
      DEFAULT_THEME_CONFIG.colors.primary
    );
    expect(out.theme.config).toEqual(DEFAULT_THEME_CONFIG);
  });

  test("a valid config survives resolution", () => {
    const out = resolveTheme({
      themes: [
        themeRow({
          theme_config: { colors: { primary: "#00FF00" } },
        }),
      ],
      settings: null,
      now: NOW,
    });
    expect(out.theme.config.colors.primary).toBe("#00ff00");
    // Unspecified fields keep their defaults.
    expect(out.theme.config.colors.accent).toBe(
      DEFAULT_THEME_CONFIG.colors.accent
    );
  });
});

describe("isValidTimeZone", () => {
  test.each(["UTC", "Asia/Riyadh", "America/New_York", "Europe/Paris"])(
    "accepts %s",
    (tz) => {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  );

  test.each(["", "Not/AZone", "UTC+3", null, undefined, 42])(
    "rejects %p",
    (tz) => {
      expect(isValidTimeZone(tz as unknown)).toBe(false);
    }
  );
});
