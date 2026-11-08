/**
 * B6 — package-weight rules shared by every shipping quote surface.
 *
 * The SAME rule is used by:
 *   - GET  /api/shipping          (checkout address step quote)
 *   - POST /api/checkout/preview  (confirmation-screen breakdown)
 *   - POST /api/orders            (authoritative fee derivation)
 *   - supabase/manual-review/05_checkout_weight_shipping_fee.sql
 *     (the checkout() RPC fee validation — keep the SQL CASE in sync with
 *     this file's country map if destination handling ever changes)
 *
 * Rule: item grams = (variant.weight_grams ?? product.weight_grams ?? 0)
 *       order grams = min(sum over items, MAX_ORDER_WEIGHT_GRAMS)
 *
 * - Weights are ALWAYS read server-side from the database. The client only
 *   supplies item ids and quantities, never a weight value.
 * - NULL weights contribute 0 (most products do not have a weight yet —
 *   per-kg fees only apply once the owner fills `weight_grams` in).
 * - Decimals are rounded to whole grams; negatives and non-finite values
 *   are treated as 0.
 *
 * Weight-aware quotes are gated behind `SHIPPING_CALCULATE_WEIGHT` because
 * the live checkout() RPC currently validates the fee against
 * `shipping_rates.base_fee` only. Enable the flag only AFTER applying
 * manual-review/05_checkout_weight_shipping_fee.sql (see
 * docs/STORE-SETTINGS-CHECKLIST.md §6).
 */

export const MAX_SHIPPING_ITEMS = 100;
export const MAX_ITEM_QUANTITY = 999;
/** 200 kg — sane ceiling so a tampered cart cannot inflate the fee query. */
export const MAX_ORDER_WEIGHT_GRAMS = 200_000;

export type ShippingItemInput = {
  variant_id?: string | null;
  product_id?: string | null;
  quantity: number;
};

export type WeightedItem = {
  quantity: number;
  variantWeightGrams?: number | null;
  productWeightGrams?: number | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * B6 rollout gate. Truthy values: "true" | "1" | "yes" (case-insensitive).
 * Unset/anything else keeps the legacy behaviour (weight = 0), which is the
 * only fee the pre-migration checkout() RPC accepts.
 */
export function isShippingWeightEnabled(): boolean {
  const value = process.env.SHIPPING_CALCULATE_WEIGHT?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/** Coerce any weight-like value to non-negative whole grams. */
export function parseWeightGrams(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.round(numeric);
}

/** Weight of a single line: variant weight wins, else product weight, else 0. */
export function itemWeightGrams(item: WeightedItem): number {
  const grams = parseWeightGrams(item.variantWeightGrams ?? item.productWeightGrams ?? 0);
  if (grams === 0) return 0;
  const quantity =
    Number.isInteger(item.quantity) && item.quantity >= 1
      ? Math.min(item.quantity, MAX_ITEM_QUANTITY)
      : 1;
  return grams * quantity;
}

/** Total package weight in grams, capped at MAX_ORDER_WEIGHT_GRAMS. */
export function computeOrderWeightGrams(items: WeightedItem[]): number {
  const total = items.reduce((sum, item) => sum + itemWeightGrams(item), 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(total, MAX_ORDER_WEIGHT_GRAMS);
}

/**
 * Parse the optional `items` query parameter of GET /api/shipping.
 *
 * - missing/empty            -> []   (legacy callers keep weight 0)
 * - not JSON / not an array  -> null (structural error -> route returns 400)
 * - individual malformed entries are DROPPED: the quote endpoint only needs
 *   a best-effort display weight, and the authoritative fee is re-derived
 *   server-side from the real cart in /api/orders.
 */
export function parseShippingItemsParam(raw: string | null | undefined): ShippingItemInput[] | null {
  if (raw == null || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length > MAX_SHIPPING_ITEMS) return null;

  const items: ShippingItemInput[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const variantId =
      typeof candidate.variant_id === "string" && UUID_RE.test(candidate.variant_id)
        ? candidate.variant_id
        : null;
    const productId =
      typeof candidate.product_id === "string" && UUID_RE.test(candidate.product_id)
        ? candidate.product_id
        : null;
    if (!variantId && !productId) continue;
    const quantity = Number(candidate.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) continue;
    items.push({ variant_id: variantId, product_id: productId, quantity });
  }
  return items;
}

type WeightRow = {
  id: string;
  weight_grams: number | null;
  product_id?: string | null;
};

/**
 * Minimal structural view of the supabase client so this module stays
 * unit-testable with a plain mock (the real client satisfies it at runtime;
 * the API routes are JavaScript and are not type-checked against it).
 */
export type WeightLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => PromiseLike<{
        data: WeightRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Resolve item ids to a total package weight using the shared rule.
 * Throws when a lookup fails — callers surface an honest 5xx instead of
 * silently quoting a weight-0 (cheaper) fee.
 */
export async function fetchWeightGramsForItems(
  client: WeightLookupClient,
  items: ShippingItemInput[]
): Promise<number> {
  if (items.length === 0) return 0;

  const variantIds = [
    ...new Set(items.map((item) => item.variant_id).filter((id): id is string => Boolean(id))),
  ];
  const directProductIds = [
    ...new Set(items.map((item) => item.product_id).filter((id): id is string => Boolean(id))),
  ];

  const variantsRes = variantIds.length
    ? await client.from("product_variants").select("id, weight_grams, product_id").in("id", variantIds)
    : null;
  if (variantsRes?.error) {
    throw new Error(`variant weight lookup failed: ${variantsRes.error.message}`);
  }

  const variantById = new Map<string, { weight: number | null; productId: string | null }>();
  for (const row of variantsRes?.data ?? []) {
    variantById.set(row.id, { weight: row.weight_grams, productId: row.product_id ?? null });
  }

  const productIds = new Set(directProductIds);
  for (const variantId of variantIds) {
    const productId = variantById.get(variantId)?.productId;
    if (productId) productIds.add(productId);
  }

  const productsRes = productIds.size
    ? await client.from("products").select("id, weight_grams").in("id", [...productIds])
    : null;
  if (productsRes?.error) {
    throw new Error(`product weight lookup failed: ${productsRes.error.message}`);
  }

  const productWeightById = new Map<string, number | null>();
  for (const row of productsRes?.data ?? []) {
    productWeightById.set(row.id, row.weight_grams);
  }

  const weighted: WeightedItem[] = items.map((item) => {
    const variant = item.variant_id ? variantById.get(item.variant_id) : undefined;
    const productId = item.product_id ?? variant?.productId ?? null;
    return {
      quantity: item.quantity,
      variantWeightGrams: variant?.weight ?? null,
      productWeightGrams: productId ? (productWeightById.get(productId) ?? null) : null,
    };
  });

  return computeOrderWeightGrams(weighted);
}
