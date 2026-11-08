import { expect, test } from "@playwright/test";
import { installWriteGuards } from "./helpers";

test("gift boxes page renders the themed request UI (render only)", async ({ page }) => {
  const counters = await installWriteGuards(page);

  await page.goto("/gift-boxes");

  await expect(page.getByRole("heading", { name: /themed gift boxes/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /need a fully custom box/i })).toBeVisible();

  // The request form is filled and submitted only by a signed-in flow —
  // this render-only visit must not create any request row.
  expect(counters.blockedRestWrites).toBe(0);
});

test("custom print page shows the guest sign-in banner (C4)", async ({ page }) => {
  const counters = await installWriteGuards(page);

  await page.goto("/custom-print");

  // C4: amber banner warns guests before they start a request that would 401.
  await expect(page.getByText(/Guest sign-in required/i).first()).toBeVisible();

  expect(counters.blockedRestWrites).toBe(0);
  expect(counters.blockedCartMutations).toBe(0);
});

test("FAQ page renders in English", async ({ page }) => {
  const counters = await installWriteGuards(page);

  await page.goto("/faq");

  await expect(page.getByRole("heading", { name: /frequently asked questions/i })).toBeVisible();

  expect(counters.blockedRestWrites).toBe(0);
});

test("shipping policy shows honest, server-driven labels (B2)", async ({ page }) => {
  const counters = await installWriteGuards(page);

  await page.goto("/shipping");

  await expect(page.getByRole("heading", { name: /shipping policy/i })).toBeVisible();
  // B2 — no hardcoded promises: fees are recalculated server-side, windows
  // come from the published methods.
  await expect(page.getByText(/recalculated on the server/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /international shipping/i })).toBeVisible();

  expect(counters.blockedRestWrites).toBe(0);
});

test("unknown route shows the English 404 page (C6)", async ({ page }) => {
  const counters = await installWriteGuards(page);

  await page.goto("/this-page-does-not-exist-e2e");

  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");

  expect(counters.blockedRestWrites).toBe(0);
});
