const NUMBER_FORMAT = "en-US";

/**
 * Format a money amount without ever crashing the render.
 *
 * `Intl.NumberFormat` throws a RangeError for malformed currency codes. Admin
 * forms let users type codes freely, so a half-typed value (e.g. "EG" instead
 * of "EGP") used to take down the whole page via the route error boundary.
 * Valid ISO-like codes render exactly as before; anything else falls back to
 * a plain amount with the code appended so the typo stays visible.
 */
export function formatCurrency(value: number, currency = "USD") {
  const amount = Number(value ?? 0);
  const code = String(currency ?? "")
    .trim()
    .toUpperCase();

  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(NUMBER_FORMAT, {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Not a recognised ISO 4217 code — fall through to the safe form below.
    }
  }

  const plain = new Intl.NumberFormat(NUMBER_FORMAT, {
    maximumFractionDigits: 2,
  }).format(amount);
  return code ? `${plain} ${code}` : plain;
}
