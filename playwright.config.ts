import { defineConfig, devices } from "@playwright/test";

/**
 * Galaxy Store — guest E2E suite (Phase Six).
 *
 * PRODUCTION-WRITE PROTECTION (non-negotiable)
 * --------------------------------------------
 * The repo's .env/.env.local point at the production Supabase project, so this
 * suite runs READ-ONLY against production data. Every path that could write is
 * either avoided by design or actively guarded in e2e/helpers.ts:
 *
 *   - direct browser → PostgREST non-GET requests are aborted,
 *   - /api/cart mutations, product view tracking and /api/contact delivery
 *     are aborted (exposed as counters so tests can assert "never attempted"),
 *   - free-text search, whose server handler fire-and-forgets `log_search`
 *     (INSERT into search_logs), is answered from a local fixture, while
 *     q-empty searches and suggestions reach the real read-only endpoints.
 *
 * Excluded by design (documented in docs/PRODUCTION-REMEDIATION-TRACKER.md):
 * add-to-cart mutations, product-details view tracking, contact valid
 * submission (sends a real email), and authenticated/admin/vendor flows.
 */
const config = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Serial by design: guest flows share one production-backed backend.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    // Build + serve with the repo's default env (.env/.env.local → production
    // Supabase). No env override: reads only, guarded by e2e/helpers.ts.
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

export default config;
