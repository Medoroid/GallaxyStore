import { expect, test } from "@playwright/test";
import { installWriteGuards } from "./helpers";

test("reset-password without a token shows the friendly missing panel (C1)", async ({
  page,
}) => {
  const counters = await installWriteGuards(page);

  await page.goto("/reset-password");

  // C1: no token → explanatory panel with a recovery path, not a raw error.
  await expect(
    page.getByText(/this page only opens from the secure password reset link/i)
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /request a reset link/i })).toHaveAttribute(
    "href",
    "/forgot-password"
  );

  // The password form must not render without a valid session.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  expect(counters.blockedRestWrites).toBe(0);
});

test("reset-password with a bogus token shows the friendly invalid panel (C1)", async ({
  page,
}) => {
  const counters = await installWriteGuards(page);

  await page.goto("/reset-password?code=bogus-e2e-token");

  // C1: token present but unusable → clear message + recovery link.
  await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: /request a new link/i })).toHaveAttribute(
    "href",
    "/forgot-password"
  );

  // No password form for an unusable link.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  expect(counters.blockedRestWrites).toBe(0);
});
