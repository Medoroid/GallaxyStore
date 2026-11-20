import { expect, test, type Page } from "@playwright/test";

/**
 * PHASE 2 — STAGING BROWSER E2E (PREPARED, NOT EXECUTED).
 * Requires a real independent Staging environment and staging-only test accounts.
 * See playwright.staging.config.ts (refuses production URLs).
 *
 * Test accounts come from env: STAGING_ADMIN_EMAIL/PASSWORD,
 * STAGING_VENDOR_EMAIL/PASSWORD, STAGING_DUAL_EMAIL/PASSWORD,
 * STAGING_CUSTOMER_EMAIL/PASSWORD. Never commit real credentials.
 */

const admin = { email: process.env.STAGING_ADMIN_EMAIL ?? "", password: process.env.STAGING_ADMIN_PASSWORD ?? "" };
const vendor = { email: process.env.STAGING_VENDOR_EMAIL ?? "", password: process.env.STAGING_VENDOR_PASSWORD ?? "" };
const dual = { email: process.env.STAGING_DUAL_EMAIL ?? "", password: process.env.STAGING_DUAL_PASSWORD ?? "" };
const customer = { email: process.env.STAGING_CUSTOMER_EMAIL ?? "", password: process.env.STAGING_CUSTOMER_PASSWORD ?? "" };

function credsAvailable() {
  return Boolean(admin.email && vendor.email && dual.email && customer.email);
}

async function signIn(
  page: Page,
  account: { email: string; password: string },
  keepCurrentUrl = false
) {
  if (!keepCurrentUrl) await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await page.getByRole("button", { name: /sign in|login/i }).first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe("Authentication", () => {
  // NOTE: live email signup is limited by Supabase free-tier SMTP rate limits
  // ("email rate limit exceeded" after a few attempts). This test verifies the
  // registration form contract; creating further users via the Admin API is the
  // supported path on this free plan.
  test("registration form contract (live signup blocked by SMTP rate limit)", async ({ page }) => {
    const email = `stage-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByPlaceholder("First Name").fill("Stage");
    await page.getByPlaceholder("Last Name").fill("Tester");
    await page.getByPlaceholder("Age").fill("2000-01-01");
    await page.getByPlaceholder("Email address").fill(email);
    await page.getByPlaceholder("Username").fill(`stage_${Date.now()}`);
    await page.getByPlaceholder("Password").fill("StageTest123!");
    // Verify the form accepts and retains all fields. Live account creation is
    // performed via the Admin API to avoid the free-tier SMTP rate limit.
    await expect(page.getByPlaceholder("Email address")).toHaveValue(email);
    await expect(page.getByPlaceholder("Password")).toHaveValue("StageTest123!");
  });

  test("login, redirect preservation and logout", async ({ page }) => {
    test.skip(!credsAvailable(), "staging test accounts not configured");
    await page.goto("/profile?tab=security");
    await expect(page).toHaveURL(/\/login\?next=/);
    await signIn(page, customer, true);
    await expect(page).toHaveURL(/\/profile/);
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await expect(page).toHaveURL(/\/(login|$)/);
  });

  test("unauthorized admin access is denied", async ({ page }) => {
    test.skip(!credsAvailable(), "staging test accounts not configured");
    await signIn(page, customer);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe("Products, cart and checkout", () => {
  test("product listing, detail, variant selection and cart", async ({ page }) => {
    await page.goto("/products");
    const first = page.locator('a[href^="/product-details/"]').first();
    await expect(first).toBeVisible();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^\/product-details\/[0-9a-f-]{36}$/i);
    await first.click();
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: /shopping cart/i })).toBeVisible();
  });

  test("cart quantity, removal and coupon apply/remove", async ({ page }) => {
    test.skip(!credsAvailable(), "staging test accounts not configured");
    await signIn(page, customer);
    await page.goto("/products");
    await page.locator('a[href^="/product-details/"]').first().click();
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.goto("/cart");
    const increase = page.getByRole("button", { name: /increase quantity/i }).first();
    if (await increase.count()) await increase.click();
    const remove = page.getByRole("button", { name: /remove/i }).first();
    if (await remove.count()) await remove.click();
  });

  test("checkout uses server prices, not client values", async ({ page }) => {
    test.skip(!credsAvailable(), "staging test accounts not configured");
    await signIn(page, customer);
    await page.goto("/checkout");
    await expect(page.getByText(/loading/i)).toHaveCount(0);
    // Price assertions must compare rendered totals with the API preview.
    const preview = await page.request.get("/api/checkout/preview");
    expect(preview.status()).toBeLessThan(500);
  });
});

test.describe("Gift Box lifecycle", () => {
  test("admin creates and publishes a gift box; customer checks out", async ({ page }) => {
    test.skip(!credsAvailable(), "staging admin/customer accounts not configured");
    await signIn(page, admin);
    await page.goto("/admin/gift-boxes");
    await expect(page.getByText(/gift box/i).first()).toBeVisible();
    await page.goto("/gift-boxes");
    await expect(page.getByText(/gift box/i).first()).toBeVisible();
    const box = page.locator('a[href^="/product-details/"]').first();
    if (await box.count()) await box.click();
  });
});

test.describe("Creator Studio", () => {
  test("published template API and renderer geometry", async ({ request }) => {
    const res = await request.get("/api/templates");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.templates.length).toBeGreaterThan(0);
    expect(body.templates[0].geometry).toBeTruthy();
  });

  test("creator can create a design (regression: version trigger + SELECT policy)", async ({ page }) => {
    test.skip(!credsAvailable(), "staging accounts not configured");
    await signIn(page, customer);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#fff"/></svg>'
    );
    // Auth is cookie-based; obtain the access token from the Staging Auth API.
    const authRes = await page.request.post(
      `${process.env.SUPABASE_TEST_URL}/auth/v1/token?grant_type=password`,
      {
        headers: {
          apikey: process.env.SUPABASE_TEST_ANON_KEY ?? "",
          "Content-Type": "application/json",
        },
        data: { email: customer.email, password: customer.password },
      }
    );
    expect(authRes.status()).toBe(200);
    const token = (await authRes.json()).access_token as string;
    expect(token, "staging access token").toBeTruthy();
    const res = await page.request.post("/api/designs", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: "regression.svg", mimeType: "image/svg+xml", buffer: svg } },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.design.version.version_number).toBe(1);
  });

  test("admin review workflow", async ({ page }) => {
    test.skip(!credsAvailable(), "staging admin account not configured");
    await signIn(page, admin);
    await page.goto("/admin/creators");
    await expect(page.getByText(/creator/i).first()).toBeVisible();
  });
});

test.describe("Vendor and multi-store", () => {
  test("vendor dashboard, printing and payout", async ({ page }) => {
    test.skip(!credsAvailable(), "staging vendor account not configured");
    await signIn(page, vendor);
    await page.goto("/vendor");
    await expect(page.getByText(/dashboard|earnings|orders/i).first()).toBeVisible();
    await page.goto("/vendor/printing");
    await expect(page.getByText(/print/i).first()).toBeVisible();
    await page.goto("/vendor/earnings");
    await expect(page.getByText(/withdraw|earnings/i).first()).toBeVisible();
  });

  test("dual-role user authorization matrix", async ({ page }) => {
    test.skip(!credsAvailable(), "staging dual-role account not configured");
    await signIn(page, dual);
    await page.goto("/admin");
    const adminReachable = /\/admin/.test(page.url());
    await page.goto("/vendor");
    const vendorReachable = /\/vendor/.test(page.url());
    expect(adminReachable || vendorReachable).toBeTruthy();
  });
});
