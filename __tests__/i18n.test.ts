import { t, translations, locales } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

describe("i18n", () => {
  it("should have translations for all locales", () => {
    locales.forEach((locale) => {
      expect(translations[locale]).toBeDefined();
      expect(typeof translations[locale]).toBe("object");
    });
  });

  it("should return English translation for en", () => {
    const result = t("en", "nav_home");
    expect(result).toBe("Home");
  });

  it("should return Arabic translation for ar", () => {
    const result = t("ar", "nav_home");
    expect(result).toBe("الرئيسية");
  });

  it("should have same keys for all locales", () => {
    const enKeys = Object.keys(translations.en).sort();
    
    locales.forEach((locale) => {
      const localeKeys = Object.keys(translations[locale]).sort();
      expect(localeKeys).toEqual(enKeys);
    });
  });

  it("should return key if translation not found", () => {
    const result = t("en", "nonexistent_key" as Parameters<typeof t>[1]);
    expect(result).toBe("nonexistent_key");
  });

  it("should have all navigation translations", () => {
    const navKeys: string[] = [
      "nav_home",
      "nav_products",
      "nav_custom_print",
      "nav_gallery",
      "nav_gift_boxes",
      "nav_cart",
      "nav_wishlist",
      "nav_orders",
      "nav_login",
      "nav_register",
      "nav_logout",
    ];

    locales.forEach((locale: Locale) => {
      navKeys.forEach((key) => {
        expect((translations[locale] as Record<string, string>)[key]).toBeDefined();
        expect((translations[locale] as Record<string, string>)[key]).not.toBe("");
      });
    });
  });

  it("should have all product translations", () => {
    const productKeys: string[] = [
      "products_title",
      "products_search",
      "products_filters",
      "product_add_to_cart",
      "product_buy_now",
    ];

    locales.forEach((locale: Locale) => {
      productKeys.forEach((key) => {
        expect((translations[locale] as Record<string, string>)[key]).toBeDefined();
      });
    });
  });

  it("should have all cart translations", () => {
    const cartKeys: string[] = [
      "cart_title",
      "cart_empty",
      "cart_checkout",
      "cart_total",
    ];

    locales.forEach((locale: Locale) => {
      cartKeys.forEach((key) => {
        expect((translations[locale] as Record<string, string>)[key]).toBeDefined();
      });
    });
  });
});
