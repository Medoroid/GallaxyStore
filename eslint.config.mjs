import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Tests deliberately use loose mocks and inline components.
  {
    files: ["**/__tests__/**/*", "test/**/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/display-name": "off",
    },
  },
  // Data-fetching effects intentionally flip a loading flag / clear an error
  // before awaiting. The React compiler flags this as a cascading render, but
  // these screens are not migrated to React Query yet; keep it visible as a
  // warning instead of breaking `npm run lint`.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
