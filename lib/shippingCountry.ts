/**
 * B6/B4 — destination normalisation for shipping zone lookups.
 *
 * The checkout address form stores human-readable country names ("Egypt"),
 * but `shipping_zones.countries` holds ISO-3166-1 alpha-2 codes ("EG").
 * The zone RPC matches `p_country = any(countries)` and falls back to the
 * default zone when nothing matches — so without this mapping every
 * customer silently received the DEFAULT zone's rates (previously the
 * US-domestic zone) regardless of where they live.
 *
 * Keep this map in sync with the CASE block in
 * supabase/manual-review/05_checkout_weight_shipping_fee.sql (the checkout
 * RPC validates the fee with the same destination the routes quote with).
 */

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  egypt: "EG",
  "saudi arabia": "SA",
  uae: "AE",
  "united arab emirates": "AE",
  kuwait: "KW",
  qatar: "QA",
  bahrain: "BH",
  oman: "OM",
  jordan: "JO",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  canada: "CA",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
};

/**
 * Normalise a country value to the form the zone lookup expects:
 * - 2-letter codes are uppercased ("eg" -> "EG")
 * - known country names map to their ISO code ("Egypt" -> "EG")
 * - anything else is returned trimmed and unchanged (the RPC then falls
 *   back to the default zone, which is the correct rest-of-world behaviour)
 * - empty/invalid input -> "" (callers treat it as missing)
 */
export function normaliseCountryCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Name map FIRST (so aliases like "uk" -> "GB" win over the raw code
  // branch), then 2-letter codes uppercased, else unchanged. The SQL mirror
  // in manual-review/05 uses the same order.
  const mapped = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}
