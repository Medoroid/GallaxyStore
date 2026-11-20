import { expect, test, type Page } from "@playwright/test";

type Issue = { kind: string; text: string };

/** Collect runtime/console/HTTP-5xx problems for a page. */
function watch(page: Page): Issue[] {
  const issues: Issue[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") issues.push({ kind: "console", text: m.text() });
  });
  page.on("pageerror", (e) => issues.push({ kind: "pageerror", text: e.message }));
  page.on("response", (r) => {
    if (r.status() >= 500) issues.push({ kind: "http", text: `${r.status()} ${r.url()}` });
  });
  return issues;
}

function expectClean(issues: Issue[]) {
  const message = issues.map((i) => `${i.kind}: ${i.text}`).join("\n");
  expect(issues, message).toEqual([]);
}

test("homepage renders real catalog data without runtime errors", async ({ page }) => {
  const issues = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Print Your");
  await expect(page.getByText(/unable to load products/i)).toHaveCount(0);
  const productLinks = page.locator('a[href^="/product-details/"]');
  await expect(productLinks.first()).toBeVisible({ timeout: 25_000 });
  expect(await productLinks.count()).toBeGreaterThan(0);
  expectClean(issues);
});

test("product detail resolves by id and add-to-cart works", async ({ page }) => {
  const issues = watch(page);
  await page.goto("/products");
  const first = page.locator('a[href^="/product-details/"]').first();
  await expect(first).toBeVisible({ timeout: 25_000 });
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/product-details\/[0-9a-f-]{36}$/i);

  await first.click();
  await expect(page).toHaveURL(/\/product-details\/[0-9a-f-]{36}/i);
  await expect(page.getByText(/product not found/i)).toHaveCount(0);

  const addButton = page.getByRole("button", { name: /add to cart/i }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: /shopping cart/i })).toBeVisible();
  expectClean(issues);
});

test("gift box catalog loads and links use product ids", async ({ page }) => {
  const issues = watch(page);
  await page.goto("/gift-boxes");
  await expect(page.getByText(/gift box/i).first()).toBeVisible();
  const links = page.locator('a[href^="/product-details/"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    expect(href, `gift box link ${i} must use a UUID, not a slug`).toMatch(
      /^\/product-details\/[0-9a-f-]{36}$/i
    );
  }
  expectClean(issues);
});

test("login and register pages render without runtime errors", async ({ page }) => {
  const issues = watch(page);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in|login/i }).first()).toBeVisible();
  await page.goto("/register");
  await expect(page.getByText(/create account|register|sign up/i).first()).toBeVisible();
  expectClean(issues);
});

test("core read APIs return 200 JSON from the local backend", async ({ request }) => {
  for (const path of ["/api/gift-boxes", "/api/search?q="]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.json()).toBeTruthy();
  }
  // Payment methods are intentionally authenticated.
  const guarded = await request.get("/api/payment-methods");
  expect(guarded.status()).toBe(401);
});

test("admin routes gate guests without a redirect loop", async ({ page }) => {
  const issues = watch(page);
  await page.goto("/admin/theme-studio/00000000-0000-4000-8000-000000000000");
  await page.waitForLoadState("networkidle");
  const url = page.url();
  expect(url).toMatch(/\/(login|admin\/theme-studio)/);
  // No client-side "update while rendering" error must be logged.
  expect(issues.filter((i) => i.kind === "pageerror").map((i) => i.text)).toEqual([]);
});
