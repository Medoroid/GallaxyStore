/**
 * @jest-environment node
 *
 * Pure unit tests for lib/gift-box.ts — the shared domain logic used by the
 * admin API, the public API, the checkout preview and (by mirroring) the SQL.
 * These lock the rules that must never drift:
 *   - validation: self-reference / nesting / duplicates / bounds / item cap
 *   - money math: real prices only, never fabricated savings (mixed currency)
 *   - stock math: component_qty × box_qty aggregation across cart lines
 *   - public link rule: published + visible + not deleted
 */

import {
  MAX_COMPONENT_QUANTITY,
  MAX_GIFT_BOX_ITEMS,
  NULL_VARIANT_KEY,
  componentKey,
  computeContentsValue,
  componentStockIssues,
  isPubliclyAccessible,
  requiredComponentStock,
  validateCompositionInput,
  type GiftBoxContentLine,
} from "@/lib/gift-box";

const BOX = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const VARIANT_A = "cccccccc-0000-4000-8000-000000000003";
const VARIANT_B = "dddddddd-0000-4000-8000-000000000004";

describe("componentKey", () => {
  it("normalises a null variant to the shared zero-uuid stand-in", () => {
    expect(componentKey(BOX, null)).toBe(`${BOX}::${NULL_VARIANT_KEY}`);
    expect(componentKey(BOX, undefined)).toBe(componentKey(BOX, null));
  });

  it("keeps distinct variants distinct", () => {
    expect(componentKey(BOX, VARIANT_A)).not.toBe(componentKey(BOX, VARIANT_B));
  });
});

describe("validateCompositionInput", () => {
  const base = { product_id: OTHER, quantity: 1 };

  it("requires a product id", () => {
    expect(validateCompositionInput(BOX, { quantity: 1 }, []).ok).toBe(false);
    expect(validateCompositionInput(BOX, { product_id: " ", quantity: 1 }, []).message).toBe(
      "product_id is required"
    );
  });

  it("rejects a box containing itself", () => {
    const result = validateCompositionInput(BOX, { product_id: BOX, quantity: 1 }, []);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("cannot contain itself");
  });

  it("rejects nesting (component is itself a gift box)", () => {
    const result = validateCompositionInput(BOX, base, [], {
      boxProductIds: new Set([OTHER]),
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("nested");
  });

  it.each([0, -3, 1.5, MAX_COMPONENT_QUANTITY + 1, "abc"])(
    "rejects out-of-bounds quantity %s",
    (quantity) => {
      expect(validateCompositionInput(BOX, { product_id: OTHER, quantity }, []).ok).toBe(false);
    }
  );

  it.each([1, MAX_COMPONENT_QUANTITY])("accepts boundary quantity %s", (quantity) => {
    expect(validateCompositionInput(BOX, { product_id: OTHER, quantity }, []).ok).toBe(true);
  });

  it("accepts quantity as a numeric string (form input)", () => {
    expect(validateCompositionInput(BOX, { product_id: OTHER, quantity: "3" }, []).ok).toBe(true);
  });

  it("rejects duplicates for the same product+variant pair", () => {
    const existing = [{ product_id: OTHER, variant_id: VARIANT_A }];
    const result = validateCompositionInput(
      BOX,
      { product_id: OTHER, variant_id: VARIANT_A, quantity: 1 },
      existing
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already in the gift box");
  });

  it("treats two null-variant entries of one product as duplicates (mirrors the SQL index)", () => {
    const existing = [{ product_id: OTHER, variant_id: null }];
    expect(validateCompositionInput(BOX, { product_id: OTHER, variant_id: null, quantity: 1 }, existing).ok).toBe(
      false
    );
    // …but a different variant of the same product is allowed.
    expect(
      validateCompositionInput(BOX, { product_id: OTHER, variant_id: VARIANT_B, quantity: 1 }, existing).ok
    ).toBe(true);
  });

  it("rejects notes over 500 characters and negative display_order", () => {
    expect(
      validateCompositionInput(BOX, { product_id: OTHER, quantity: 1, note: "x".repeat(501) }, []).ok
    ).toBe(false);
    expect(
      validateCompositionInput(BOX, { product_id: OTHER, quantity: 1, display_order: -1 }, []).ok
    ).toBe(false);
    expect(
      validateCompositionInput(BOX, { product_id: OTHER, quantity: 1, display_order: 0 }, []).ok
    ).toBe(true);
  });

  it("caps the box at MAX_GIFT_BOX_ITEMS (and allows edits when full)", () => {
    const full = Array.from({ length: MAX_GIFT_BOX_ITEMS }, (_, index) => ({
      product_id: `eeeeeeee-0000-4000-8000-${String(index).padStart(12, "0")}`,
      variant_id: null,
    }));
    expect(validateCompositionInput(BOX, base, full).ok).toBe(false);
    // Editing an existing item while the box is full must still pass.
    expect(
      validateCompositionInput(BOX, base, full, { excludeItemId: full[0].product_id }).ok
    ).toBe(true);
  });

  it("isBoxCreation: rejects promoting a product that is already a component", () => {
    const result = validateCompositionInput(
      OTHER,
      {},
      [{ product_id: OTHER, variant_id: null }],
      { isBoxCreation: true }
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already a component");
  });

  it("isBoxCreation: accepts a fresh product id", () => {
    expect(validateCompositionInput(BOX, {}, [], { isBoxCreation: true }).ok).toBe(true);
  });
});

describe("computeContentsValue", () => {
  const line = (overrides: Partial<GiftBoxContentLine>): GiftBoxContentLine => ({
    product_id: OTHER,
    variant_id: null,
    product_name: "Item",
    quantity: 1,
    unit_price: 10,
    currency: "USD",
    ...overrides,
  });

  it("sums qty × price and derives savings from the real box price", () => {
    const result = computeContentsValue(
      [line({ quantity: 2, unit_price: 10 }), line({ quantity: 1, unit_price: 5 })],
      20,
      "USD"
    );
    expect(result).toEqual({ contents_value: 25, savings: 5, comparable: true });
  });

  it("never reports negative savings", () => {
    const result = computeContentsValue([line({ unit_price: 8 })], 50, "USD");
    expect(result.contents_value).toBe(8);
    expect(result.savings).toBe(0);
    expect(result.comparable).toBe(true);
  });

  it("ignores inactive components", () => {
    const result = computeContentsValue(
      [line({ unit_price: 10 }), line({ unit_price: 999, is_active: false })],
      5,
      "USD"
    );
    expect(result.contents_value).toBe(10);
  });

  it("returns nulls (comparable:false) for mixed currencies — never fabricated savings", () => {
    const result = computeContentsValue(
      [line({ currency: "USD" }), line({ currency: "EUR" })],
      10,
      "USD"
    );
    expect(result).toEqual({ contents_value: null, savings: null, comparable: false });
  });

  it("returns nulls when the box currency is missing", () => {
    expect(computeContentsValue([line({})], 10, "")).toEqual({
      contents_value: null,
      savings: null,
      comparable: false,
    });
  });

  it("returns nulls for an empty composition or a non-finite box price", () => {
    expect(computeContentsValue([], 10, "USD").contents_value).toBeNull();
    expect(computeContentsValue([line({})], Number.NaN, "USD").comparable).toBe(false);
  });

  it("returns nulls for invalid line prices/quantities instead of coercing them", () => {
    expect(
      computeContentsValue([line({ unit_price: Number.NaN })], 10, "USD").comparable
    ).toBe(false);
    expect(computeContentsValue([line({ quantity: 0 })], 10, "USD").comparable).toBe(false);
  });

  it("rounds to 2 decimal places", () => {
    const result = computeContentsValue([line({ quantity: 3, unit_price: 0.1 })], 0, "USD");
    expect(result.contents_value).toBe(0.3);
  });

  it("treats case-insensitive currency codes as equal", () => {
    const result = computeContentsValue([line({ currency: "usd" })], 5, "USD");
    expect(result.comparable).toBe(true);
    expect(result.contents_value).toBe(10);
  });
});

describe("requiredComponentStock", () => {
  const line = (overrides: Partial<GiftBoxContentLine>): GiftBoxContentLine => ({
    product_id: OTHER,
    variant_id: VARIANT_A,
    product_name: "Item",
    quantity: 1,
    unit_price: 10,
    ...overrides,
  });

  it("multiplies component quantity by box quantity", () => {
    const result = requiredComponentStock([line({ quantity: 3 })], 4);
    expect(result).toEqual([{ variant_id: VARIANT_A, required_qty: 12 }]);
  });

  it("aggregates repeated components across lines", () => {
    const result = requiredComponentStock(
      [line({ quantity: 1 }), line({ variant_id: VARIANT_B, quantity: 2 })],
      2
    );
    expect(result).toEqual([
      { variant_id: VARIANT_A, required_qty: 2 },
      { variant_id: VARIANT_B, required_qty: 4 },
    ]);
  });

  it("skips inactive components and components without a variant", () => {
    expect(
      requiredComponentStock([line({ is_active: false }), line({ variant_id: null })], 5)
    ).toEqual([]);
  });

  it("returns nothing for a non-positive box quantity", () => {
    expect(requiredComponentStock([line({})], 0)).toEqual([]);
    expect(requiredComponentStock([line({})], Number.NaN)).toEqual([]);
  });
});

describe("componentStockIssues", () => {
  const lookup = {
    available: new Map<string, number>([
      [VARIANT_A, 5],
      [VARIANT_B, 100],
    ]),
    names: new Map<string, string>([[VARIANT_A, "Blue Mug"]]),
    componentsByBoxProduct: new Map<string, GiftBoxContentLine[]>([
      [
        BOX,
        [
          {
            product_id: OTHER,
            variant_id: VARIANT_A,
            product_name: "Fallback Name",
            quantity: 2,
            unit_price: 10,
          },
          {
            product_id: OTHER,
            variant_id: null,
            product_name: "No Variant Item",
            quantity: 1,
            unit_price: 5,
          },
        ],
      ],
    ]),
    productByVariant: new Map<string, string>([["box-variant-1", BOX]]),
  };

  const cartLine = (overrides: Partial<{ cart_item_id: string; quantity: number }> = {}) => ({
    cart_item_id: "ci-1",
    variant_id: "box-variant-1",
    product_name: "Deluxe Box",
    quantity: 1,
    ...overrides,
  });

  it("stays silent when every component has enough stock", () => {
    expect(componentStockIssues([cartLine()], lookup)).toEqual([]);
  });

  it("reports an insufficient component with box→component naming and the cart line id", () => {
    const issues = componentStockIssues([cartLine({ quantity: 4 })], lookup);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      cart_item_id: "ci-1",
      product_name: "Deluxe Box → Blue Mug",
      requested: 8,
      available: 5,
    });
  });

  it("aggregates requirements across multiple cart lines of the same box", () => {
    const issues = componentStockIssues(
      [cartLine({ cart_item_id: "ci-1", quantity: 1 }), cartLine({ cart_item_id: "ci-2", quantity: 2 })],
      lookup
    );
    // 2 × (1 + 2) = 6 required vs 5 available.
    expect(issues).toHaveLength(1);
    expect(issues[0].requested).toBe(6);
    expect(issues[0].cart_item_id).toBe("ci-1");
  });

  it("treats an unknown stock entry as unavailable (available: 0)", () => {
    const sparse = {
      ...lookup,
      available: new Map<string, number>(),
    };
    const issues = componentStockIssues([cartLine()], sparse);
    expect(issues).toHaveLength(1);
    expect(issues[0].available).toBe(0);
  });

  it("clamps negative available stock to 0", () => {
    const negative = {
      ...lookup,
      available: new Map<string, number>([[VARIANT_A, -7]]),
    };
    const issues = componentStockIssues([cartLine()], negative);
    expect(issues[0].available).toBe(0);
  });

  it("ignores cart lines that are not gift boxes", () => {
    const issues = componentStockIssues(
      [{ cart_item_id: "ci-9", variant_id: "regular-variant", product_name: "Tee", quantity: 3 }],
      lookup
    );
    expect(issues).toEqual([]);
  });

  it("skips inactive component lines", () => {
    const inactiveLookup = {
      ...lookup,
      componentsByBoxProduct: new Map<string, GiftBoxContentLine[]>([
        [
          BOX,
          [
            {
              product_id: OTHER,
              variant_id: VARIANT_A,
              product_name: "Blue Mug",
              quantity: 5,
              unit_price: 10,
              is_active: false,
            },
          ],
        ],
      ]),
    };
    expect(componentStockIssues([cartLine()], inactiveLookup)).toEqual([]);
  });
});

describe("isPubliclyAccessible", () => {
  it("allows only published + visible + not soft-deleted products", () => {
    expect(
      isPubliclyAccessible({ status: "published", visibility: "visible", deleted_at: null })
    ).toBe(true);
    expect(
      isPubliclyAccessible({ status: "draft", visibility: "visible", deleted_at: null })
    ).toBe(false);
    expect(
      isPubliclyAccessible({ status: "published", visibility: "hidden", deleted_at: null })
    ).toBe(false);
    expect(
      isPubliclyAccessible({
        status: "published",
        visibility: "visible",
        deleted_at: "2026-01-01T00:00:00Z",
      })
    ).toBe(false);
    expect(isPubliclyAccessible({})).toBe(false);
  });
});
