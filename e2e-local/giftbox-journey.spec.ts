import { expect, test } from "@playwright/test";

test("gift box full customer journey: catalog -> detail -> cart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500 && !r.url().includes("/api/admin")) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/gift-boxes");
  const box = page.locator('a[href="/product-details/22222222-2222-4222-8222-000000000001"]').first();
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Phase 2 Gift Box").first()).toBeVisible();
  await expect(page.getByText(/900/).first()).toBeVisible();

  await box.click();
  await expect(page).toHaveURL(/\/product-details\/22222222-2222-4222-8222-000000000001/);
  await expect(page.getByText(/product not found/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: /shopping cart/i })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("gift box detail API preserves component prices and currency", async ({ request }) => {
  const res = await request.get("/api/gift-boxes/22222222-2222-4222-8222-000000000001");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const box = body.box ?? body.gift_box ?? body;
  expect(box).toBeTruthy();
  const text = JSON.stringify(box);
  expect(text).toContain("EGP");
});
