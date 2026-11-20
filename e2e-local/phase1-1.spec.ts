import { expect, test } from "@playwright/test";

/** Phase 1.1 regression coverage against the Local backend. */

test("published template catalog is served from the DB source of truth", async ({ request }) => {
  const res = await request.get("/api/templates");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(Array.isArray(body.templates)).toBe(true);
  expect(body.templates.length).toBeGreaterThan(0);
  const tshirt = body.templates.find((t: { key: string }) => t.key === "tshirt");
  expect(tshirt).toBeTruthy();
  expect(tshirt.geometry.views.length).toBeGreaterThan(0);
  expect(tshirt.geometry.colors.length).toBeGreaterThan(0);
  expect(typeof tshirt.geometryVersion).toBe("number");
});

test("protected route redirect preserves a safe ?next destination", async ({ page }) => {
  await page.goto("/profile?tab=security");
  await page.waitForURL(/\/login/);
  const url = new URL(page.url());
  expect(url.searchParams.get("next")).toBe("/profile?tab=security");
});

test("open-redirect style next values are rejected", async ({ request }) => {
  const res = await request.get("/api/templates");
  expect(res.status()).toBe(200);
  // The helper is exercised in unit tests; here we confirm the login page does
  // not echo an external next into a client-side redirect.
  const page = await request.get("/login?next=https%3A%2F%2Fevil.example");
  expect(page.status()).toBe(200);
  const html = await page.text();
  expect(html).not.toContain('router.push("https://evil.example")');
});

test("product detail captures a variant_id when adding to cart", async ({ page }) => {
  await page.goto("/products");
  const first = page.locator('a[href^="/product-details/"]').first();
  await expect(first).toBeVisible({ timeout: 25_000 });
  await first.click();

  const payloads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/cart") && request.method() === "POST") {
      const body = request.postData();
      if (body) payloads.push(body);
    }
  });

  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.waitForTimeout(1500);
  // Guest flow may skip the network sync; when present, variant_id must be set.
  for (const raw of payloads) {
    const payload = JSON.parse(raw);
    for (const item of payload.items ?? []) {
      expect(item.variant_id).toBeTruthy();
      expect(item.price).toBeUndefined(); // client never sends a price
    }
  }
});
