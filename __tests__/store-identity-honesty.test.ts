/**
 * B4 regression guards — store identity & honest claims.
 *
 * The 2026-10-29 testing report found fabricated storefront data: a fake
 * phone number, a "4.9 / 12k+ reviews" claim, invented About stats, a
 * hardcoded $4.99/$500 shipping policy, dead social links and a gallery
 * padded with Unsplash stock photos. These tests fail the build if any of
 * those fabrications are reintroduced, and assert the settings-driven
 * replacements stay wired up.
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("no fabricated claims (report B4)", () => {
  test("homepage: no fake review counts, ratings or reviewers", () => {
    const home = read("app/page.tsx");
    expect(home).not.toContain("12k+");
    expect(home).not.toContain("4.9 /");
    expect(home).not.toContain("48h dispatch");
    expect(home).not.toContain("Layla M."); // the invented review authors
    expect(home).not.toContain("Karim A.");
    // Featured/category/review content must be data-driven, not seed arrays.
    expect(home).toContain("fetchCategoriesWithCounts");
    expect(home).toContain("fetchApprovedReviews");
    expect(home).toContain('eq("status", "approved")');
  });

  test("about page: no invented product/customer/country/rating stats", () => {
    const about = read("app/about/page.tsx");
    expect(about).not.toContain("4.9★");
    expect(about).not.toContain("10K+");
    expect(about).not.toContain('value: "500+"');
    expect(about).not.toContain("24/7");
    // Real counters instead:
    expect(about).toContain("getRealStats");
    expect(about).toContain('from("products")');
  });

  test("shipping page: no hardcoded fees, thresholds or delivery windows", () => {
    const shipping = read("app/shipping/page.tsx");
    expect(shipping).not.toContain("$4.99");
    expect(shipping).not.toContain("$500");
    expect(shipping).not.toContain("50 countries");
    expect(shipping).not.toContain("Domestic (USA)");
    expect(shipping).not.toContain("5-7 business days");
    // Live configuration instead:
    expect(shipping).toContain("shipping_zones");
    expect(shipping).toContain("shipping_rates");
    expect(shipping).toContain("shipping_methods");
  });

  test("contact page: no invented phone number or hardcoded inbox", () => {
    const contact = read("app/contact/page.tsx");
    expect(contact).not.toContain("555");
    expect(contact).not.toContain("123-4567");
    expect(contact).not.toContain("support@galaxystore.com");
    expect(contact).toContain("getPublicStoreSettings");
  });

  test("contact form delivers through the API instead of a fake local success", () => {
    const form = read("app/contact/contact-form.tsx");
    expect(form).toContain('fetch("/api/contact"');
    expect(form).not.toContain("setTimeout"); // the old simulated submission
    const api = read("app/api/contact/route.js");
    expect(api).toContain("sendContactMessage");
    expect(api).toContain("fail_closed");
    expect(api).toContain("503");
  });

  test("footer: no dead social links — icons render only from settings", () => {
    const footer = read("app/components/Footer.tsx");
    expect(footer).not.toContain('href: "#"');
    expect(footer).toContain("getPublicStoreSettings");
    expect(footer).toContain("instagram_url");
  });

  test("gallery: no stock-photo padding from the seed data file", () => {
    const gallery = read("app/gallery/page.tsx");
    expect(gallery).not.toContain("@/data/products");
    expect(gallery).not.toContain("unsplash");
    expect(gallery).toContain("gallery");
  });

  test("legal pages: no hardcoded support/privacy mailboxes", () => {
    expect(read("app/returns/page.tsx")).not.toContain("mailto:support@galaxystore.com");
    expect(read("app/privacy/page.tsx")).not.toContain("privacy@galaxystore.com");
    expect(read("app/privacy/page.tsx")).toContain("getPublicStoreSettings");
  });

  test("FAQ: no hardcoded shipping fees, thresholds or country counts", () => {
    const faq = read("app/faq/page.tsx");
    expect(faq).not.toContain("$49 extra");
    expect(faq).not.toContain("over $500");
    expect(faq).not.toContain("50 countries");
    expect(faq).toContain("at checkout");
  });

  test("admin settings default store name is spelled correctly", () => {
    expect(read("app/admin/settings/page.tsx")).not.toContain("Gallaxy");
  });

  test("site metadata reads the store name from settings", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("generateMetadata");
    expect(layout).toContain("getPublicStoreSettings");
    expect(layout).toContain("AnnouncementBar");
  });
});

describe("Egypt shipping zone migration (prepared, local only)", () => {
  const migrationPath = "supabase/manual-review/04_shipping_zones_egypt.sql";

  test("exists with a fee guard that refuses unconfigured rates", () => {
    const sql = read(migrationPath);
    expect(sql).toContain("FEES NOT SET");
    expect(sql).toContain("Egypt Local");
    // EG must be unique across zones and the default must move off US-domestic.
    expect(sql).toContain("array_remove(countries, 'EG')");
    expect(sql).toContain("is_default = (id = v_intl_zone_id)");
    // Preview before mutation, verify after.
    expect(sql).toContain("STEP 1 — PREVIEW");
    expect(sql).toContain("STEP 3 — VERIFY");
    expect(sql).toContain("get_shipping_options('EG'");
  });

  test("no migration file is auto-applied (manual-review stays out of supabase/migrations)", () => {
    const appliedDir = path.join(root, "supabase", "migrations");
    const files = fs.readdirSync(appliedDir);
    expect(files).not.toContain("04_shipping_zones_egypt.sql");
  });
});
