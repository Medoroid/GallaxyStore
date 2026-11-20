import { defineConfig, devices } from "@playwright/test";

/**
 * PHASE 2 — STAGING E2E CONFIG (prepared, NOT executed here).
 * Reads staging values from the environment. Refuses production URLs.
 * Do not use this config against Local and call it Staging.
 */
const stagingUrl = process.env.STAGING_APP_URL ?? "";
const stagingSupabase = process.env.SUPABASE_TEST_URL ?? "";
const productionRef = "httywgkwfqvrbuwuzutu";

if (!stagingUrl || !stagingSupabase) {
  throw new Error("STAGING_APP_URL and SUPABASE_TEST_URL are required for staging E2E.");
}
for (const value of [stagingUrl, stagingSupabase]) {
  if (value.includes(productionRef)) {
    throw new Error("Refusing to run staging E2E against the production project.");
  }
}

export default defineConfig({
  testDir: "./e2e-staging",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-staging", open: "never" }]],
  use: {
    baseURL: stagingUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
