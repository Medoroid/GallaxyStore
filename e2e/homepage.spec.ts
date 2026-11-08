import { expect, test } from "@playwright/test";
import { installWriteGuards } from "./helpers";

test("homepage renders hero, navigation and real featured products (read-only)", async ({
  page,
}) => {
  const counters = await installWriteGuards(page);

  await page.goto("/");

  // English UI (B1) + stable metadata
  await expect(page).toHaveTitle(/Custom Prints & Gaming Gear/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Print Your");
  await expect(page.getByRole("link", { name: /shop now/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /design your own/i })).toBeVisible();

  // Featured products section: real data from the catalog, no error state
  await expect(page.getByRole("heading", { name: /featured products/i })).toBeVisible();
  await expect(page.getByText(/unable to load products/i)).toHaveCount(0);
  await expect(page.locator('a[href^="/product-details/"]').first()).toBeVisible({
    timeout: 20_000,
  });

  // A homepage visit must never write to the database
  expect(counters.blockedRestWrites).toBe(0);
  expect(counters.blockedViewTracking).toBe(0);
  expect(counters.blockedCartMutations).toBe(0);
});
