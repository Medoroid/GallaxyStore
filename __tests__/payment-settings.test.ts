/**
 * @jest-environment node
 */

import {
  isExternalWalletConfigured,
  normalizeExternalWalletSettings,
  publicExternalWalletSettings,
} from "@/lib/payment-settings";

const COMPLETE = {
  enabled: true,
  provider_name: "Vodafone Cash",
  account_name: "Gallaxy Store",
  account_number: "01012345678",
  instructions: "Send as a personal transfer",
};

describe("external wallet settings", () => {
  test("normalizes whitespace and accepts a complete enabled configuration", () => {
    const normalized = normalizeExternalWalletSettings(
      {
        ...COMPLETE,
        provider_name: "  Vodafone Cash  ",
        account_name: " Gallaxy Store ",
      },
      true
    );

    expect(normalized).toEqual(COMPLETE);
    expect(isExternalWalletConfigured(normalized)).toBe(true);
  });

  test("rejects an enabled configuration with missing account details", () => {
    expect(() =>
      normalizeExternalWalletSettings({ ...COMPLETE, account_number: " " }, true)
    ).toThrow(/account number is required/i);
    expect(() =>
      normalizeExternalWalletSettings({ ...COMPLETE, provider_name: "" }, true)
    ).toThrow(/provider name is required/i);
  });

  test("rejects unsupported characters in the account number", () => {
    expect(() =>
      normalizeExternalWalletSettings({ ...COMPLETE, account_number: "<script>" }, true)
    ).toThrow(/unsupported characters/i);
  });

  test("a malformed stored row disables the method instead of breaking checkout", () => {
    expect(normalizeExternalWalletSettings({ enabled: true })).toMatchObject({
      enabled: true,
      provider_name: "",
      account_number: "",
    });
    expect(isExternalWalletConfigured({ enabled: true })).toBe(false);
  });

  test("public shape never includes private flags and hides incomplete settings", () => {
    const publicSettings = publicExternalWalletSettings(COMPLETE);
    expect(publicSettings).toEqual(COMPLETE);
    expect(publicSettings).not.toHaveProperty("is_public");
    expect(publicSettings).not.toHaveProperty("updated_by");

    expect(publicExternalWalletSettings({ enabled: false, provider_name: "Hidden" })).toEqual({
      enabled: false,
      provider_name: "",
      account_name: "",
      account_number: "",
      instructions: "",
    });
  });
});
