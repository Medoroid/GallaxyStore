/**
 * Unit tests — lib/site-content.ts (shared banner/section rules):
 *   - banner/section payload validation mirrors the DB CHECK constraints,
 *   - schedule window rules (create + partial update merge),
 *   - active-window filtering and zone ordering used by the storefront,
 *   - storage path extraction for image cleanup on delete.
 */

import {
  BANNER_PLACEMENTS,
  SECTION_PLACEMENTS,
  SECTION_TYPES,
  isWithinActiveWindow,
  normalizeCardsConfig,
  selectForZone,
  storagePathFromPublicUrl,
  validateBannerInput,
  validateSectionInput,
} from "@/lib/site-content";

const VALID_BANNER = {
  page: "home",
  placement: "after_hero",
  title: "Mid-season sale",
  subtitle: "20% off selected prints",
  image_url: "https://example.com/banner.jpg",
  link_url: "/products",
  button_label: "Shop now",
  is_active: true,
  starts_at: "2026-11-01T00:00:00.000Z",
  ends_at: "2026-11-30T23:59:59.000Z",
};

describe("validateBannerInput (full create)", () => {
  test("accepts a valid banner", () => {
    const result = validateBannerInput(VALID_BANNER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.placement).toBe("after_hero");
      expect(result.value.page).toBe("home");
    }
  });

  test("rejects a missing placement", () => {
    const result = validateBannerInput({ ...VALID_BANNER, placement: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/placement/i);
  });

  test.each(BANNER_PLACEMENTS)("accepts placement %s", (placement) => {
    const result = validateBannerInput({ ...VALID_BANNER, placement });
    expect(result.ok).toBe(true);
  });

  test("rejects an unknown placement", () => {
    const result = validateBannerInput({ ...VALID_BANNER, placement: "footer" });
    expect(result.ok).toBe(false);
  });

  test("rejects a page outside the identifier pattern", () => {
    const result = validateBannerInput({ ...VALID_BANNER, page: "Home Page!" });
    expect(result.ok).toBe(false);
  });

  test("rejects a banner with neither title nor image", () => {
    const result = validateBannerInput({
      ...VALID_BANNER,
      title: "",
      image_url: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/title or an image/i);
  });

  test("rejects an oversized title", () => {
    const result = validateBannerInput({ ...VALID_BANNER, title: "x".repeat(161) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/160/);
  });

  test("rejects a non-http(s) link", () => {
    const result = validateBannerInput({ ...VALID_BANNER, link_url: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
  });

  test("accepts a site-relative link", () => {
    const result = validateBannerInput({ ...VALID_BANNER, link_url: "/gift-boxes" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.link_url).toBe("/gift-boxes");
  });

  test("rejects an inverted schedule window", () => {
    const result = validateBannerInput({
      ...VALID_BANNER,
      starts_at: "2026-11-30T00:00:00.000Z",
      ends_at: "2026-11-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/end date/i);
  });

  test("rejects an unparseable date", () => {
    const result = validateBannerInput({ ...VALID_BANNER, ends_at: "next tuesday" });
    expect(result.ok).toBe(false);
  });
});

describe("validateBannerInput (partial update)", () => {
  test("only validates provided keys", () => {
    const result = validateBannerInput({ is_active: false }, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ is_active: false });
    }
  });

  test("still rejects an invalid provided value", () => {
    const result = validateBannerInput(
      { placement: "nowhere" },
      { partial: true }
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a non-object payload", () => {
    expect(validateBannerInput("nope", { partial: true }).ok).toBe(false);
    expect(validateBannerInput(null).ok).toBe(false);
  });
});

describe("validateSectionInput", () => {
  const VALID_SECTION = {
    page: "home",
    placement: "mid_page",
    section_type: "rich_text",
    eyebrow: "Explore",
    title: "Why choose us",
    body: "Real products, real reviews.",
    is_active: true,
  };

  test("accepts a valid rich text section", () => {
    const result = validateSectionInput(VALID_SECTION);
    expect(result.ok).toBe(true);
  });

  test.each(SECTION_TYPES)("accepts type %s with its requirements", (type) => {
    const base = { ...VALID_SECTION, section_type: type };
    const payload =
      type === "rich_text"
        ? base
        : type === "image_text"
          ? { ...base, image_url: "https://example.com/x.jpg" }
          : type === "cards"
            ? { ...base, config: { cards: [{ title: "Fast shipping" }] } }
            : base;
    expect(validateSectionInput(payload).ok).toBe(true);
  });

  test.each(SECTION_PLACEMENTS)("accepts placement %s", (placement) => {
    expect(validateSectionInput({ ...VALID_SECTION, placement }).ok).toBe(true);
  });

  test("rejects an unknown section type", () => {
    const result = validateSectionInput({ ...VALID_SECTION, section_type: "carousel" });
    expect(result.ok).toBe(false);
  });

  test("requires a title", () => {
    const result = validateSectionInput({ ...VALID_SECTION, title: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/title/i);
  });

  test("image_text requires an image", () => {
    const result = validateSectionInput({
      ...VALID_SECTION,
      section_type: "image_text",
      image_url: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/image/i);
  });

  test("cards requires at least one card", () => {
    const result = validateSectionInput({
      ...VALID_SECTION,
      section_type: "cards",
      config: { cards: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least one card/i);
  });

  test("rejects a card without a title", () => {
    const result = validateSectionInput({
      ...VALID_SECTION,
      section_type: "cards",
      config: { cards: [{ title: "   ", body: "x" }] },
    });
    expect(result.ok).toBe(false);
  });
});

describe("normalizeCardsConfig", () => {
  test("normalizes a valid card list", () => {
    const result = normalizeCardsConfig({
      cards: [{ title: " Fast shipping ", body: " 2-4 days ", link_url: "/shipping" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cards).toEqual([
        {
          title: "Fast shipping",
          body: "2-4 days",
          link_url: "/shipping",
          image_url: null,
        },
      ]);
    }
  });

  test("treats missing config as empty", () => {
    const result = normalizeCardsConfig(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cards).toEqual([]);
  });

  test("rejects more than 8 cards", () => {
    const cards = Array.from({ length: 9 }, (_, i) => ({ title: `Card ${i}` }));
    const result = normalizeCardsConfig({ cards });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at most 8/);
  });

  test("rejects a non-array cards value", () => {
    expect(normalizeCardsConfig({ cards: "one" }).ok).toBe(false);
  });
});

describe("isWithinActiveWindow", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const base = { is_active: true, starts_at: null, ends_at: null };

  test("active with no schedule is visible", () => {
    expect(isWithinActiveWindow(base, now)).toBe(true);
  });

  test("inactive is never visible", () => {
    expect(isWithinActiveWindow({ ...base, is_active: false }, now)).toBe(false);
  });

  test("future start hides the row", () => {
    expect(
      isWithinActiveWindow({ ...base, starts_at: "2026-11-11T00:00:00.000Z" }, now)
    ).toBe(false);
  });

  test("start exactly now is visible", () => {
    expect(
      isWithinActiveWindow({ ...base, starts_at: "2026-11-10T12:00:00.000Z" }, now)
    ).toBe(true);
  });

  test("expired end hides the row", () => {
    expect(
      isWithinActiveWindow({ ...base, ends_at: "2026-11-10T12:00:00.000Z" }, now)
    ).toBe(false);
  });

  test("open window is visible", () => {
    expect(
      isWithinActiveWindow(
        {
          ...base,
          starts_at: "2026-11-01T00:00:00.000Z",
          ends_at: "2026-11-20T00:00:00.000Z",
        },
        now
      )
    ).toBe(true);
  });
});

describe("selectForZone", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const row = (
    id: string,
    overrides: Partial<{
      page: string;
      placement: string;
      sort_order: number;
      is_active: boolean;
      starts_at: string | null;
      ends_at: string | null;
      created_at: string;
    }> = {}
  ) => ({
    id,
    page: "home",
    placement: "mid_page",
    sort_order: 1,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  });

  test("keeps only the requested page and zone", () => {
    const rows = [
      row("a"),
      row("b", { placement: "top_strip" }),
      row("c", { page: "about" }),
    ];
    expect(selectForZone(rows, "home", "mid_page", now).map((r) => r.id)).toEqual(["a"]);
  });

  test("drops inactive and expired rows", () => {
    const rows = [
      row("a"),
      row("b", { is_active: false }),
      row("c", { ends_at: "2026-11-01T00:00:00.000Z" }),
    ];
    expect(selectForZone(rows, "home", "mid_page", now).map((r) => r.id)).toEqual(["a"]);
  });

  test("sorts by sort_order then creation time", () => {
    const rows = [
      row("third", { sort_order: 3 }),
      row("first-new", { sort_order: 1, created_at: "2026-11-05T00:00:00.000Z" }),
      row("first-old", { sort_order: 1, created_at: "2026-11-02T00:00:00.000Z" }),
    ];
    expect(
      selectForZone(rows, "home", "mid_page", now).map((r) => r.id)
    ).toEqual(["first-old", "first-new", "third"]);
  });

  test("tolerates null/undefined input", () => {
    expect(selectForZone(null, "home", "mid_page", now)).toEqual([]);
    expect(selectForZone(undefined, "home", "mid_page", now)).toEqual([]);
  });
});

describe("storagePathFromPublicUrl", () => {
  test("extracts the object path from a public bucket URL", () => {
    const url =
      "https://proj.supabase.co/storage/v1/object/public/site-banners/site/abc-123.jpg";
    expect(storagePathFromPublicUrl(url)).toBe("site/abc-123.jpg");
  });

  test("returns null for external or site-relative URLs", () => {
    expect(storagePathFromPublicUrl("https://cdn.example.com/x.jpg")).toBeNull();
    expect(storagePathFromPublicUrl("/local/image.png")).toBeNull();
    expect(storagePathFromPublicUrl(null)).toBeNull();
  });

  test("refuses traversal segments", () => {
    const url =
      "https://proj.supabase.co/storage/v1/object/public/site-banners/site/../../secret.jpg";
    expect(storagePathFromPublicUrl(url)).toBeNull();
  });

  test("decodes URL-encoded paths", () => {
    const url =
      "https://proj.supabase.co/storage/v1/object/public/site-banners/site/my%20file.jpg";
    expect(storagePathFromPublicUrl(url)).toBe("site/my file.jpg");
  });
});
