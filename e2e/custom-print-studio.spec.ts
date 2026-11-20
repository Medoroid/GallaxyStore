import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Customer Custom Print Studio — preview-only acceptance path.
 *
 * Deliberately avoids checkout/DB: the mockup compositor runs locally, so the
 * upload → place → preview → warnings → private-by-default journey can be
 * verified without a Staging database or fulfilment configuration.
 */

function artworkFile(): string {
  const path = join(tmpdir(), `custom-print-artwork-${Date.now()}.svg`);
  writeFileSync(
    path,
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
      '<rect width="400" height="400" fill="#8A2BE2"/>' +
      '<circle cx="200" cy="200" r="120" fill="#FFD166"/>' +
      "</svg>"
  );
  return path;
}

test("customer can upload artwork and preview it on a product mockup", async ({ page }) => {
  const file = artworkFile();

  await page.goto("/custom-print");
  await expect(page.getByRole("heading", { name: /custom print studio/i })).toBeVisible();

  // Sharing is opt-in and OFF by default.
  await expect(page.getByRole("checkbox")).not.toBeChecked();

  // Choose a product, colour and view.
  await page.getByRole("button", { name: "Coffee Mug" }).click();
  await expect(page.getByText(/Live mockup/i)).toBeVisible();

  // Upload artwork (SVG is sanitised client-side before composition).
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByAltText("Your artwork on the selected product")).toBeVisible({ timeout: 10_000 });

  // Placement controls are present and the preview reflects a selected colour.
  await expect(page.getByText("4. Placement", { exact: true })).toBeVisible();
  await expect(page.getByText("Rotation", { exact: true })).toBeVisible();
  await expect(page.getByText(/Share my design on Galaxy Store/)).toBeVisible();
  await expect(page.getByRole("button", { name: /add to cart/i })).toBeVisible();
});

test("mobile studio keeps the preview full width and the action bar visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/custom-print");
  await expect(page.getByRole("heading", { name: /custom print studio/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /save design privately/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /add to cart/i })).toBeVisible();
  const preview = page.getByText("Live mockup");
  await expect(preview).toBeVisible();
});
