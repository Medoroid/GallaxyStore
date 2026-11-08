/**
 * B4 unit tests — public store settings normalization.
 *
 * `store_settings` is the single admin-editable source for storefront
 * identity. These tests prove that missing/invalid values degrade to null
 * (so pages hide the element) instead of leaking placeholders or garbage
 * into the UI.
 */

import { normalizePublicSettings, EMPTY_PUBLIC_SETTINGS } from "@/lib/storeSettings";

describe("normalizePublicSettings", () => {
  test("null/undefined rows produce the empty settings shape", () => {
    expect(normalizePublicSettings(null)).toEqual(EMPTY_PUBLIC_SETTINGS);
    expect(normalizePublicSettings(undefined)).toEqual(EMPTY_PUBLIC_SETTINGS);
    expect(normalizePublicSettings([])).toEqual(EMPTY_PUBLIC_SETTINGS);
  });

  test("string settings are trimmed; blank strings become null", () => {
    const settings = normalizePublicSettings([
      { key: "store_name", value: "  Galaxy Store  " },
      { key: "support_email", value: "   " },
      { key: "support_phone", value: "+20 100 000 0000" },
      { key: "announcement", value: "Free shipping this week" },
    ]);

    expect(settings.store_name).toBe("Galaxy Store");
    expect(settings.support_email).toBeNull();
    expect(settings.support_phone).toBe("+20 100 000 0000");
    expect(settings.announcement).toBe("Free shipping this week");
  });

  test("non-string values never leak into the UI", () => {
    const settings = normalizePublicSettings([
      { key: "store_name", value: 12345 },
      { key: "address", value: { city: "Cairo" } },
      { key: "announcement", value: null },
    ]);

    expect(settings.store_name).toBeNull();
    expect(settings.address).toBeNull();
    expect(settings.announcement).toBeNull();
  });

  test("currency is uppercased and must be a 3-letter code", () => {
    expect(normalizePublicSettings([{ key: "currency", value: "egp" }]).currency).toBe("EGP");
    expect(normalizePublicSettings([{ key: "currency", value: "eg" }]).currency).toBeNull();
    expect(normalizePublicSettings([{ key: "currency", value: "1234" }]).currency).toBeNull();
    expect(normalizePublicSettings([{ key: "currency", value: 42 }]).currency).toBeNull();
  });

  test("numeric settings accept finite non-negative numbers (and numeric strings)", () => {
    const settings = normalizePublicSettings([
      { key: "free_shipping_threshold", value: 75 },
      { key: "default_shipping_fee", value: "9.99" },
    ]);

    expect(settings.free_shipping_threshold).toBe(75);
    expect(settings.default_shipping_fee).toBeCloseTo(9.99);
  });

  test("negative or invalid numbers become null instead of corrupting totals", () => {
    const settings = normalizePublicSettings([
      { key: "free_shipping_threshold", value: -10 },
      { key: "default_shipping_fee", value: "not-a-number" },
    ]);

    expect(settings.free_shipping_threshold).toBeNull();
    expect(settings.default_shipping_fee).toBeNull();
  });

  test("unknown or private keys are never exposed to the storefront", () => {
    const settings = normalizePublicSettings([
      { key: "external_wallet", value: { account_number: "SECRET-123" } },
      { key: "some_admin_key", value: "private" },
      { key: "store_name", value: "Real Store" },
    ]);

    expect(settings).not.toHaveProperty("external_wallet");
    expect(settings).not.toHaveProperty("some_admin_key");
    expect((settings as Record<string, unknown>).account_number).toBeUndefined();
    expect(settings.store_name).toBe("Real Store");
  });
});
