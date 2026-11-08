/**
 * @jest-environment node
 *
 * B6 unit tests — shared package-weight + destination rules:
 *   - SHIPPING_CALCULATE_WEIGHT flag parsing (rollout gate)
 *   - weight coercion: rounding, NULL/negative/non-finite -> 0
 *   - variant weight wins, product weight fallback, quantity multiplication
 *   - order weight cap (MAX_ORDER_WEIGHT_GRAMS)
 *   - `items` query param parsing: structural errors vs lenient entry drops
 *   - country name -> ISO code normalisation (lib/shippingCountry.ts)
 *   - fetchWeightGramsForItems(): DB assembly, error propagation
 *
 * These rules are shared by /api/shipping, /api/checkout/preview,
 * /api/orders and supabase/manual-review/05_checkout_weight_shipping_fee.sql.
 */

import {
  MAX_ITEM_QUANTITY,
  MAX_ORDER_WEIGHT_GRAMS,
  MAX_SHIPPING_ITEMS,
  computeOrderWeightGrams,
  fetchWeightGramsForItems,
  isShippingWeightEnabled,
  itemWeightGrams,
  parseShippingItemsParam,
  parseWeightGrams,
  type WeightLookupClient,
} from "@/lib/shippingWeight";
import { normaliseCountryCode } from "@/lib/shippingCountry";

const VARIANT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_A = "22222222-2222-4222-8222-222222222222";
const PRODUCT_B = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  delete process.env.SHIPPING_CALCULATE_WEIGHT;
});

afterAll(() => {
  delete process.env.SHIPPING_CALCULATE_WEIGHT;
});

describe("isShippingWeightEnabled (rollout gate)", () => {
  test.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["0", false],
    ["no", false],
    ["banana", false],
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["  true  ", true],
  ])("SHIPPING_CALCULATE_WEIGHT=%j -> %s", (value, expected) => {
    if (value === undefined) delete process.env.SHIPPING_CALCULATE_WEIGHT;
    else process.env.SHIPPING_CALCULATE_WEIGHT = value;

    expect(isShippingWeightEnabled()).toBe(expected);
  });
});

describe("parseWeightGrams", () => {
  test("null/undefined/NaN/Infinity/non-number -> 0", () => {
    expect(parseWeightGrams(null)).toBe(0);
    expect(parseWeightGrams(undefined)).toBe(0);
    expect(parseWeightGrams(Number.NaN)).toBe(0);
    expect(parseWeightGrams(Number.POSITIVE_INFINITY)).toBe(0);
    expect(parseWeightGrams({})).toBe(0);
    expect(parseWeightGrams(true)).toBe(0);
  });

  test("zero and negatives -> 0", () => {
    expect(parseWeightGrams(0)).toBe(0);
    expect(parseWeightGrams(-5)).toBe(0);
    expect(parseWeightGrams("-5")).toBe(0);
  });

  test("decimals are rounded to whole grams", () => {
    expect(parseWeightGrams(12.4)).toBe(12);
    expect(parseWeightGrams(12.5)).toBe(13);
    expect(parseWeightGrams("1500.6")).toBe(1501);
  });

  test("numeric strings are accepted", () => {
    expect(parseWeightGrams("850")).toBe(850);
  });
});

describe("itemWeightGrams", () => {
  test("variant weight wins over product weight", () => {
    expect(
      itemWeightGrams({ quantity: 1, variantWeightGrams: 300, productWeightGrams: 900 })
    ).toBe(300);
  });

  test("NULL variant weight falls back to product weight", () => {
    expect(
      itemWeightGrams({ quantity: 1, variantWeightGrams: null, productWeightGrams: 900 })
    ).toBe(900);
  });

  test("both NULL -> 0", () => {
    expect(itemWeightGrams({ quantity: 3, variantWeightGrams: null, productWeightGrams: null })).toBe(0);
    expect(itemWeightGrams({ quantity: 3 })).toBe(0);
  });

  test("multiplies by quantity", () => {
    expect(itemWeightGrams({ quantity: 4, variantWeightGrams: 250 })).toBe(1000);
  });

  test("invalid quantity falls back to 1", () => {
    expect(itemWeightGrams({ quantity: 0, variantWeightGrams: 100 })).toBe(100);
    expect(itemWeightGrams({ quantity: -2, variantWeightGrams: 100 })).toBe(100);
  });

  test("quantity is capped at MAX_ITEM_QUANTITY", () => {
    expect(itemWeightGrams({ quantity: 10_000, variantWeightGrams: 10 })).toBe(
      MAX_ITEM_QUANTITY * 10
    );
  });

  test("negative variant weight clamps to 0 (matches SQL greatest(coalesce(...),0) — no product fallback)", () => {
    expect(
      itemWeightGrams({ quantity: 1, variantWeightGrams: -50, productWeightGrams: 700 })
    ).toBe(0);
  });
});

describe("computeOrderWeightGrams", () => {
  test("empty cart -> 0", () => {
    expect(computeOrderWeightGrams([])).toBe(0);
  });

  test("sums line weights", () => {
    expect(
      computeOrderWeightGrams([
        { quantity: 2, variantWeightGrams: 500 },
        { quantity: 1, variantWeightGrams: 250 },
        { quantity: 3, productWeightGrams: 100 },
      ])
    ).toBe(1000 + 250 + 300);
  });

  test("caps at MAX_ORDER_WEIGHT_GRAMS", () => {
    // Single line already over the cap.
    expect(
      computeOrderWeightGrams([{ quantity: MAX_ITEM_QUANTITY, variantWeightGrams: 1000 }])
    ).toBe(MAX_ORDER_WEIGHT_GRAMS);

    // Sum of two lines over the cap is capped, not summed.
    expect(
      computeOrderWeightGrams([
        { quantity: MAX_ITEM_QUANTITY, variantWeightGrams: 1000 },
        { quantity: MAX_ITEM_QUANTITY, variantWeightGrams: 1000 },
      ])
    ).toBe(MAX_ORDER_WEIGHT_GRAMS);

    // Under the cap the real sum survives.
    expect(
      computeOrderWeightGrams([{ quantity: 10, variantWeightGrams: 1000 }])
    ).toBe(10_000);
  });

  test("all-NULL weights -> 0", () => {
    expect(
      computeOrderWeightGrams([
        { quantity: 2, variantWeightGrams: null, productWeightGrams: null },
        { quantity: 1, variantWeightGrams: null },
      ])
    ).toBe(0);
  });
});

describe("parseShippingItemsParam", () => {
  test("missing or empty -> [] (legacy callers keep weight 0)", () => {
    expect(parseShippingItemsParam(null)).toEqual([]);
    expect(parseShippingItemsParam(undefined)).toEqual([]);
    expect(parseShippingItemsParam("")).toEqual([]);
  });

  test("structural errors -> null (route responds 400)", () => {
    expect(parseShippingItemsParam("not json")).toBeNull();
    expect(parseShippingItemsParam('{"variant_id":"x"}')).toBeNull();
    expect(parseShippingItemsParam('"a string"')).toBeNull();
    expect(parseShippingItemsParam("42")).toBeNull();

    const tooMany = JSON.stringify(
      Array.from({ length: MAX_SHIPPING_ITEMS + 1 }, (_, i) => ({
        variant_id: VARIANT_A,
        quantity: 1,
        id: i,
      }))
    );
    expect(parseShippingItemsParam(tooMany)).toBeNull();
  });

  test("malformed entries are dropped, valid ones kept", () => {
    const raw = JSON.stringify([
      { variant_id: VARIANT_A, product_id: PRODUCT_A, quantity: 2 },
      { variant_id: "not-a-uuid", quantity: 1 }, // dropped: no valid id
      { quantity: 1 }, // dropped: no id at all
      { variant_id: PRODUCT_B, quantity: 0 }, // dropped: quantity < 1
      { variant_id: PRODUCT_B, quantity: 2.5 }, // dropped: non-integer
      { product_id: PRODUCT_A, quantity: 3 }, // kept: product-only item
      "garbage entry", // dropped
      null, // dropped
    ]);

    expect(parseShippingItemsParam(raw)).toEqual([
      { variant_id: VARIANT_A, product_id: PRODUCT_A, quantity: 2 },
      { variant_id: null, product_id: PRODUCT_A, quantity: 3 },
    ]);
  });

  test("quantity above MAX_ITEM_QUANTITY is dropped", () => {
    const raw = JSON.stringify([{ variant_id: VARIANT_A, quantity: 100_000 }]);
    expect(parseShippingItemsParam(raw)).toEqual([]);
  });
});

describe("normaliseCountryCode (zone lookup)", () => {
  test("checkout form names map to ISO codes", () => {
    expect(normaliseCountryCode("Egypt")).toBe("EG");
    expect(normaliseCountryCode("Saudi Arabia")).toBe("SA");
    expect(normaliseCountryCode("UAE")).toBe("AE");
    expect(normaliseCountryCode("United Arab Emirates")).toBe("AE");
    expect(normaliseCountryCode("Kuwait")).toBe("KW");
  });

  test("2-letter codes are uppercased", () => {
    expect(normaliseCountryCode("eg")).toBe("EG");
    expect(normaliseCountryCode("US")).toBe("US");
    expect(normaliseCountryCode(" ca ")).toBe("CA");
  });

  test("other known names map too", () => {
    expect(normaliseCountryCode("Canada")).toBe("CA");
    expect(normaliseCountryCode("United Kingdom")).toBe("GB");
    expect(normaliseCountryCode("uk")).toBe("GB");
    expect(normaliseCountryCode("USA")).toBe("US");
  });

  test("unknown labels pass through unchanged (default zone applies)", () => {
    expect(normaliseCountryCode("Other")).toBe("Other");
    expect(normaliseCountryCode("France")).toBe("France");
  });

  test("empty/invalid input -> \"\"", () => {
    expect(normaliseCountryCode("")).toBe("");
    expect(normaliseCountryCode("   ")).toBe("");
    expect(normaliseCountryCode(null)).toBe("");
    expect(normaliseCountryCode(undefined)).toBe("");
    expect(normaliseCountryCode(123)).toBe("");
  });
});

describe("fetchWeightGramsForItems (DB assembly)", () => {
  type QueryResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };

  function makeClient(
    rows: Record<string, Array<Record<string, unknown>>>,
    errors: Record<string, string> = {}
  ): WeightLookupClient {
    return {
      from: (table: string) => ({
        select: () => ({
          in: () =>
            Promise.resolve({
              data: errors[table] ? null : (rows[table] ?? []),
              error: errors[table] ? { message: errors[table] } : null,
            } as QueryResult),
        }),
      }),
    } as unknown as WeightLookupClient;
  }

  test("empty items -> 0 without touching the DB", async () => {
    const from = jest.fn();
    const client = { from } as unknown as WeightLookupClient;

    expect(await fetchWeightGramsForItems(client, [])).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  test("variant weight x quantity", async () => {
    const client = makeClient({
      product_variants: [{ id: VARIANT_A, weight_grams: 500, product_id: PRODUCT_A }],
      products: [],
    });

    expect(
      await fetchWeightGramsForItems(client, [{ variant_id: VARIANT_A, quantity: 3 }])
    ).toBe(1500);
  });

  test("NULL variant weight falls back to the product weight", async () => {
    const client = makeClient({
      product_variants: [{ id: VARIANT_A, weight_grams: null, product_id: PRODUCT_A }],
      products: [{ id: PRODUCT_A, weight_grams: 800 }],
    });

    expect(
      await fetchWeightGramsForItems(client, [{ variant_id: VARIANT_A, quantity: 1 }])
    ).toBe(800);
  });

  test("product-only items are looked up directly", async () => {
    const client = makeClient({
      product_variants: [],
      products: [{ id: PRODUCT_A, weight_grams: 250 }],
    });

    expect(
      await fetchWeightGramsForItems(client, [{ product_id: PRODUCT_A, quantity: 2 }])
    ).toBe(500);
  });

  test("mixed items combine variant, fallback and NULL weights", async () => {
    const client = makeClient({
      product_variants: [
        { id: VARIANT_A, weight_grams: 400, product_id: PRODUCT_A },
        { id: PRODUCT_B, weight_grams: null, product_id: PRODUCT_B },
      ],
      products: [
        { id: PRODUCT_A, weight_grams: 9999 },
        { id: PRODUCT_B, weight_grams: 100 },
      ],
    });

    const total = await fetchWeightGramsForItems(client, [
      { variant_id: VARIANT_A, quantity: 2 }, // 400 * 2 = 800 (variant wins)
      { variant_id: PRODUCT_B, quantity: 1 }, // NULL variant -> 100 (product)
      { product_id: PRODUCT_A, quantity: 1, variant_id: null }, // product-only: 9999
    ]);
    expect(total).toBe(800 + 100 + 9999);
  });

  test("variant lookup failure throws (routes respond 503)", async () => {
    const client = makeClient({}, { product_variants: "permission denied" });

    await expect(
      fetchWeightGramsForItems(client, [{ variant_id: VARIANT_A, quantity: 1 }])
    ).rejects.toThrow(/variant weight lookup failed/);
  });

  test("product lookup failure throws", async () => {
    const client = makeClient(
      { product_variants: [{ id: VARIANT_A, weight_grams: null, product_id: PRODUCT_A }] },
      { products: "connection reset" }
    );

    await expect(
      fetchWeightGramsForItems(client, [{ variant_id: VARIANT_A, quantity: 1 }])
    ).rejects.toThrow(/product weight lookup failed/);
  });

  test("results are capped at MAX_ORDER_WEIGHT_GRAMS", async () => {
    const client = makeClient({
      product_variants: [{ id: VARIANT_A, weight_grams: 100_000, product_id: PRODUCT_A }],
      products: [],
    });

    expect(
      await fetchWeightGramsForItems(client, [{ variant_id: VARIANT_A, quantity: 10 }])
    ).toBe(MAX_ORDER_WEIGHT_GRAMS);
  });
});
