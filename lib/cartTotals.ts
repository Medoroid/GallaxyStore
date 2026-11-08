/**
 * Cart currency math (B3 remediation).
 *
 * Prices arrive from many sources (DB rows in USD, legacy rows in EGP), so a
 * cart CAN legally contain more than one currency today. Summing across
 * currencies produces nonsense totals, so:
 *   - `subtotalsByCurrency` groups line totals per currency (never mixes);
 *   - `isMixedCurrency` lets the UI switch to a per-currency breakdown with an
 *     honest "final total at checkout" message instead of a fake sum;
 *   - `estimatedOrderTotal` only returns a single number when the cart is NOT
 *     mixed (returns null otherwise — callers must not guess).
 *
 * All values are rounded the same way as `formatCurrency` (2 decimals).
 */

export type CurrencyLine = Pick<
  { price: number; quantity: number; currency?: string | undefined },
  "price" | "quantity" | "currency"
>;

export type CurrencySubtotal = { currency: string; subtotal: number };

export const FALLBACK_CURRENCY = "USD";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Group cart line totals per currency. Never sums across currencies. */
export function subtotalsByCurrency(items: CurrencyLine[]): CurrencySubtotal[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const currency = (item.currency ?? FALLBACK_CURRENCY).toUpperCase();
    const line = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    map.set(currency, roundMoney((map.get(currency) ?? 0) + line));
  }
  return [...map.entries()]
    .map(([currency, subtotal]) => ({ currency, subtotal }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function isMixedCurrency(items: CurrencyLine[]): boolean {
  return subtotalsByCurrency(items).length > 1;
}

/**
 * Single-number subtotal ONLY when every line shares one currency.
 * Mixed carts return null — the UI must show per-currency subtotals instead.
 */
export function estimatedOrderTotal(items: CurrencyLine[]): {
  currency: string;
  subtotal: number;
} | null {
  const subtotals = subtotalsByCurrency(items);
  if (subtotals.length !== 1) return null;
  return subtotals[0];
}
