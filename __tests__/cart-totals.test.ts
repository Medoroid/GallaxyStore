/**
 * B3 tests — cart currency math must NEVER mix currencies in one sum.
 */

import {
  subtotalsByCurrency,
  isMixedCurrency,
  estimatedOrderTotal,
  roundMoney,
  FALLBACK_CURRENCY,
} from "@/lib/cartTotals";

const usd = (price: number, quantity = 1) => ({ price, quantity, currency: "USD" });
const egp = (price: number, quantity = 1) => ({ price, quantity, currency: "EGP" });

describe("subtotalsByCurrency", () => {
  test("single currency: one grouped subtotal", () => {
    const result = subtotalsByCurrency([usd(10, 2), usd(5), usd(0.5)]);
    expect(result).toEqual([{ currency: "USD", subtotal: 25.5 }]);
  });

  test("mixed currencies: separate subtotals, never summed together", () => {
    const result = subtotalsByCurrency([usd(100), egp(250), usd(50), egp(50)]);
    expect(result).toEqual([
      { currency: "EGP", subtotal: 300 },
      { currency: "USD", subtotal: 150 },
    ]);
  });

  test("missing currency falls back to USD", () => {
    const result = subtotalsByCurrency([{ price: 10, quantity: 1 }]);
    expect(result).toEqual([{ currency: FALLBACK_CURRENCY, subtotal: 10 }]);
  });

  test("currency codes are normalized to uppercase", () => {
    const result = subtotalsByCurrency([
      { price: 10, quantity: 1, currency: "usd" },
      { price: 5, quantity: 1, currency: "USD" },
    ]);
    expect(result).toEqual([{ currency: "USD", subtotal: 15 }]);
  });

  test("rounds to 2 decimals without float noise", () => {
    const result = subtotalsByCurrency([usd(0.1), usd(0.2)]);
    expect(result[0].subtotal).toBe(0.3);
  });

  test("invalid price/quantity treated as 0 (no NaN spreads)", () => {
    const result = subtotalsByCurrency([
      { price: Number.NaN, quantity: 2, currency: "USD" },
      usd(10),
    ]);
    expect(result).toEqual([{ currency: "USD", subtotal: 10 }]);
  });

  test("empty cart -> no rows", () => {
    expect(subtotalsByCurrency([])).toEqual([]);
  });
});

describe("isMixedCurrency", () => {
  test("single currency cart is not mixed", () => {
    expect(isMixedCurrency([usd(1), usd(2)])).toBe(false);
  });

  test("two currencies is mixed", () => {
    expect(isMixedCurrency([usd(1), egp(2)])).toBe(true);
  });

  test("undefined currency counts as USD, not a second currency", () => {
    expect(
      isMixedCurrency([{ price: 1, quantity: 1 }, usd(2)])
    ).toBe(false);
  });
});

describe("estimatedOrderTotal", () => {
  test("returns subtotal for a single-currency cart", () => {
    expect(estimatedOrderTotal([usd(20, 2), usd(10)])).toEqual({
      currency: "USD",
      subtotal: 50,
    });
  });

  test("returns null for mixed currencies (UI must not guess a total)", () => {
    expect(estimatedOrderTotal([usd(10), egp(10)])).toBeNull();
  });

  test("returns null for an empty cart", () => {
    expect(estimatedOrderTotal([])).toBeNull();
  });
});

describe("roundMoney", () => {
  test("keeps 2 decimals", () => {
    expect(roundMoney(19.999)).toBe(20);
    expect(roundMoney(1.005)).toBeCloseTo(1.01, 2);
    expect(roundMoney(0)).toBe(0);
  });
});
