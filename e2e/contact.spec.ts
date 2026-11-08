import { expect, test } from "@playwright/test";
import { installWriteGuards } from "./helpers";

test("contact page renders its honest availability state; empty submit never sends", async ({
  page,
}) => {
  const counters = await installWriteGuards(page);

  await page.goto("/contact");

  await expect(page.getByRole("heading", { name: /get in touch/i })).toBeVisible();

  // Scope to the contact form itself — the navbar search form is on every page.
  const contactForm = page.locator("form").filter({
    has: page.getByPlaceholder("you@example.com"),
  });
  if ((await contactForm.count()) > 0) {
    // Form is shown because the owner has configured a support email.
    // Submitting it empty must be stopped by browser validation — the guard
    // counter proves no delivery request was ever attempted.
    await contactForm.locator('button[type="submit"]').click();
    expect(counters.blockedContactSubmits).toBe(0);
  } else {
    // store_settings has no support_email yet → honest unavailable state
    // instead of a form that would silently fail to deliver (B3).
    await expect(page.getByText(/contact form unavailable/i)).toBeVisible();
  }

  expect(counters.blockedRestWrites).toBe(0);
});
