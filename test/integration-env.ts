import * as fs from "fs";
import * as path from "path";

/**
 * Safety gate for integration tests.
 *
 * These tests sign up users, create carts and call mutating RPCs. They are only
 * allowed to run against a project dedicated to testing. Point them at a local
 * Supabase stack (`supabase start`) or a separate staging project:
 *
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321
 *   SUPABASE_TEST_ANON_KEY=<local anon key>
 *
 * The production URL is hard-blocked even if someone configures it by mistake.
 */

function readEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = readEnvFile(path.resolve(__dirname, "..", ".env.local"));

const testUrl = (process.env.SUPABASE_TEST_URL || fileEnv.SUPABASE_TEST_URL || "").trim();
const testAnonKey = (
  process.env.SUPABASE_TEST_ANON_KEY ||
  fileEnv.SUPABASE_TEST_ANON_KEY ||
  ""
).trim();

if (!testUrl || !testAnonKey) {
  throw new Error(
    "Integration tests refused to run: SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY are required.\n" +
      "Start a local Supabase project (`supabase start`) and export both variables, or point them at a dedicated staging project."
  );
}

const normalize = (value: string) => value.replace(/\/+$/, "").toLowerCase();
const forbidden = new Set(
  [
    "https://httywgkwfqvrbuwuzutu.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    fileEnv.NEXT_PUBLIC_SUPABASE_URL,
  ]
    .filter(Boolean)
    .map((value) => normalize(value as string))
);

if (forbidden.has(normalize(testUrl))) {
  throw new Error(
    `Integration tests refused to run: ${testUrl} is the production Supabase project. ` +
      "Configure a separate test project."
  );
}

// Test files read NEXT_PUBLIC_* directly; point them at the test project before
// their top-level code executes.
process.env.NEXT_PUBLIC_SUPABASE_URL = testUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = testAnonKey;

// Server-level tests (api-routes, middleware-auth) use this base URL.
if (!process.env.NEXT_PUBLIC_SITE_URL) {
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.TEST_SITE_URL || fileEnv.TEST_SITE_URL || "http://localhost:3000";
}
