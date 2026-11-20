import type { Config } from "jest";

// Default test run: unit/component tests only. Integration tests talk to a
// real Supabase project and a running Next server, so they are excluded here
// and must be run explicitly with `npm run test:integration` against a
// dedicated test project.
const config: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "\\.integration\\.test\\.[jt]sx?$",
    // Playwright E2E suite — run with `npm run test:e2e`, never under Jest.
    "<rootDir>/e2e/",
    // Phase 1 Local E2E suite — run with playwright.local.config.ts, never Jest.
    "<rootDir>/e2e-local/",
    "<rootDir>/playwright.config\\.ts$",
  ],
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!(@supabase|@tanstack)/)"],
};

export default config;
