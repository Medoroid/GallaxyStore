import { defineConfig, devices } from "@playwright/test";

/**
 * PHASE 1 — LOCAL-ONLY E2E SUITE
 * ------------------------------
 * The repository's playwright.config.ts is intentionally production-guarded
 * (read-only, port 3100, production env). This config is separate and runs
 * REAL write flows against the Local Supabase stack validated in Phase 0.
 *
 * Local endpoints: API 127.0.0.1:54121 / DB 127.0.0.1:54322.
 * No production URL or key is referenced here.
 */
export default defineConfig({
  testDir: "./e2e-local",
  timeout: 90_000,
  expect: { timeout: 20_000 },
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
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 420_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54121",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      SUPABASE_SERVICE_ROLE_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_BASE_URL: "http://127.0.0.1:3100",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
