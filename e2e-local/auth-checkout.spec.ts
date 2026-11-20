import { expect, test } from "@playwright/test";

/**
 * Authenticated flows against the REAL Local Supabase backend.
 * Creates a throwaway user in the local database — never Production.
 */
test("sign up, sign in and reach checkout with a real cart", async ({ page }) => {
  const stamp = Date.now();
  const email = `phase1-${stamp}@example.com`;
  const password = "TestPass123!";
  const issues: string[] = [];
  page.on("pageerror", (e) => issues.push(e.message));
  page.on("console", (m) => {
    // Generic resource errors are duplicated by the response listener below.
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
      issues.push(m.text());
    }
  });
  page.on("response", (r) => {
    // 403 on /api/admin is the expected non-admin probe for a customer.
    if (r.status() >= 400 && !(r.status() === 403 && r.url().includes("/api/admin"))) {
      issues.push(`${r.status()} ${r.url()}`);
      if (r.status() >= 500) {
        r.text().then((t) => issues.push(`  body: ${t.slice(0, 200)}`)).catch(() => {});
      }
    }
  });

  // --- register -------------------------------------------------------------
  await page.goto("/register");
  await page.getByPlaceholder("First Name").fill("Phase");
  await page.getByPlaceholder("Last Name").fill("One");
  await page.getByPlaceholder("Age").fill("2000-01-01");
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Username").fill(`phase1_${stamp}`);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /sign up|create account|register/i }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

  // --- sign in --------------------------------------------------------------
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /sign in|login/i }).first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  // --- real cart -> checkout ------------------------------------------------
  await page.goto("/products");
  const firstProduct = page.locator('a[href^="/product-details/"]').first();
  await expect(firstProduct).toBeVisible({ timeout: 25_000 });
  await firstProduct.click();
  await page.getByRole("button", { name: /add to cart/i }).first().click();

  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByText(/loading/i)).toHaveCount(0, { timeout: 25_000 });
  expect(issues, issues.join("\n")).toEqual([]);
});
