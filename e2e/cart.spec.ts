import { expect, test } from "@playwright/test";
import { installWriteGuards } from "./helpers";

test("guest cart page renders the empty state without any cart API call", async ({
  page,
}) => {
  const counters = await installWriteGuards(page);

  await page.goto("/cart");

  // Guest with a fresh session: local (localStorage) cart only — empty state.
  await expect(page.locator("body")).toContainText(/your cart is\s*empty/i);

  // No cart mutation was even attempted, and no direct DB write happened.
  // (Add-to-cart itself is excluded from E2E by production-write protection;
  // covered by __tests__/gate4-cart-e2e.integration.test.ts against a
  // dedicated test project.)
  expect(counters.blockedCartMutations).toBe(0);
  expect(counters.blockedRestWrites).toBe(0);
});
