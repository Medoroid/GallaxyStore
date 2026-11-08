import { expect, test } from "@playwright/test";
import { installSearchRouting, installWriteGuards } from "./helpers";

test("product list loads with a real counter and product cards", async ({ page }) => {
  const counters = await installWriteGuards(page);
  await installSearchRouting(page, counters);

  await page.goto("/products");

  await expect(page.getByRole("heading", { name: /all products/i })).toBeVisible();

  // C2: the counter never flashes "0 products" before the first response —
  // wait for the real count, then confirm the loading label is gone.
  await expect(page.getByText(/^\d+ products?$/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/loading products/i)).toHaveCount(0);
  await expect(page.locator('a[href^="/product-details/"]').first()).toBeVisible();

  // q stayed empty: every search request was read-only
  expect(counters.mockedSearches).toBe(0);
  expect(counters.blockedRestWrites).toBe(0);
});

test("filters and sort update the URL using read-only searches", async ({ page }) => {
  const counters = await installWriteGuards(page);
  await installSearchRouting(page, counters);

  await page.goto("/products");
  await expect(page.getByText(/^\d+ products?$/)).toBeVisible({ timeout: 20_000 });

  // Sort (filters closed → the results toolbar select is the only one)
  await page.locator("select").first().selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);

  // Open the filter panel and toggle availability + rating
  // (exact name: "Reset Filters" must not match)
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "In stock only" }).click();
  await expect(page).toHaveURL(/in_stock=true/);
  await page.getByRole("button", { name: "4+" }).click();
  await expect(page).toHaveURL(/min_rating=4/);

  // Price range inputs
  await page.getByPlaceholder("Min").fill("100");
  await page.getByPlaceholder("Max").fill("900");
  await expect(page).toHaveURL(/min_price=100/);
  await expect(page).toHaveURL(/max_price=900/);

  // Reset returns to a clean URL
  await page.getByRole("button", { name: /reset filters/i }).click();
  await expect(page).not.toHaveURL(/in_stock=true/);
  await expect(page).not.toHaveURL(/min_rating=4/);

  // Every request above committed with q empty → served by the real
  // read-only search path; no fixture and no database writes.
  expect(counters.mockedSearches).toBe(0);
  expect(counters.blockedRestWrites).toBe(0);
});

test("free-text search UI works without a production search-log write", async ({ page }) => {
  const counters = await installWriteGuards(page);
  await installSearchRouting(page, counters);

  await page.goto("/products");
  await expect(page.getByText(/^\d+ products?$/)).toBeVisible({ timeout: 20_000 });

  // Typing commits the query after the 300 ms debounce, which would normally
  // fire log_search (INSERT into search_logs) — the routing layer answers
  // that request from the local fixture instead.
  await page.getByLabel("Search products").fill("galaxy");
  await expect(page).toHaveURL(/q=galaxy/);
  await expect(page.getByText(/Fixture result for/)).toBeVisible({ timeout: 20_000 });

  expect(counters.mockedSearches).toBeGreaterThanOrEqual(1);
  // …and no write was even attempted anywhere else on the page.
  expect(counters.blockedRestWrites).toBe(0);
  expect(counters.blockedCartMutations).toBe(0);
  expect(counters.blockedViewTracking).toBe(0);
});
