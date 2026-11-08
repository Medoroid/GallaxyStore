import type { Config } from "jest";

// Integration tests. They create users/carts and call RPCs, so they must never
// run against production. test/integration-env.ts refuses to start unless a
// separate test project is configured.
const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["<rootDir>/__tests__/**/*.integration.test.[jt]s?(x)"],
  setupFiles: ["<rootDir>/test/integration-env.ts"],
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!(@supabase|@tanstack)/)"],
  // Shared auth users/carts may collide; keep the live-DB tests serial.
  maxWorkers: 1,
};

export default config;
