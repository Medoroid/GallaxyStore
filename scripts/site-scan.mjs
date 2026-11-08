/**
 * Full-site runtime scan — read-only.
 *
 * Crawls every public/admin/vendor page and key GET APIs against a locally
 * started production build, capturing:
 *   - HTTP status per URL
 *   - browser console errors
 *   - uncaught page errors
 *   - failed network requests (classified)
 *
 * PRODUCTION-WRITE PROTECTION: every non-GET browser request is aborted and
 * reported, so the scan can never INSERT/POST anything (cart, tracking,
 * contact, search logs, ...).
 *
 * Usage:  node scripts/site-scan.mjs [baseURL]
 * Default baseURL: http://127.0.0.1:3200
 */
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://127.0.0.1:3200").replace(/\/$/, "");

const PAGES = [
  // Public
  "/", "/products", "/cart", "/wishlist", "/gift-boxes", "/custom-print",
  "/contact", "/faq", "/shipping", "/about", "/terms", "/track-order",
  "/stores", "/login", "/register", "/forgot-password", "/reset-password",
  "/checkout", "/this-page-does-not-exist-404",
  // Admin (guest expectations: redirect to /login)
  "/admin", "/admin/orders", "/admin/products", "/admin/custom-prints",
  "/admin/reviews", "/admin/refunds", "/admin/vendors", "/admin/gallery",
  "/admin/content", "/admin/users", "/admin/audit", "/admin/settings",
  // Vendor (guest expectations: redirect to /login)
  "/vendor", "/vendor/orders", "/vendor/products", "/vendor/earnings",
  "/vendor/printing", "/vendor/shipments",
];

// GET-only API probes. No token -> admin routes must answer 401 (never 500).
// NOTE: /api/search with a non-empty q would INSERT into log_search, so it is
// intentionally NOT probed here.
const APIS = [
  "/api/admin",
  "/api/admin/stats",
  "/api/admin/orders",
  "/api/admin/users",
  "/api/admin/settings",
  "/api/admin/audit",
  "/api/admin/custom-prints",
  "/api/admin/refunds",
  "/api/admin/vendors",
  "/api/admin/content",
  "/api/gallery",
  "/api/store-settings",
  "/api/search?q=",
  "/api/shipping?country=EG&subtotal=100",
];

const blockedWrites = [];

const browser = await chromium.launch();
const context = await browser.newContext();

// Read-only guard: allow GET/HEAD, abort everything else and record it.
await context.route("**/*", async (route) => {
  const req = route.request();
  const method = req.method();
  if (method === "GET" || method === "HEAD") return route.continue();
  blockedWrites.push(`${method} ${req.url()}`);
  return route.abort();
});

const results = [];

async function visitPage(path) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));
  page.on("requestfailed", (req) => {
    failed.push(`${req.method()} ${req.url().replace(BASE, "")} :: ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) failed.push(`HTTP ${res.status()} ${res.url().replace(BASE, "")}`);
  });

  let status = 0;
  let finalUrl = "";
  try {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = res?.status() ?? 0;
    finalUrl = page.url().replace(BASE, "") || "/";
    // Give client effects (auth redirects, data fetches) a moment to run.
    await page.waitForTimeout(1500);
  } catch (err) {
    pageErrors.push(`NAVIGATION: ${String(err).slice(0, 200)}`);
  }

  results.push({ kind: "page", path, status, finalUrl, consoleErrors, pageErrors, failed });
  await page.close();
}

async function visitApi(path) {
  const page = await context.newPage();
  let status = 0;
  let body = "";
  try {
    const res = await page.goto(BASE + path, { timeout: 20000 });
    status = res?.status() ?? 0;
    body = (await res?.text().catch(() => "")) || "";
  } catch (err) {
    body = String(err).slice(0, 200);
  }
  results.push({
    kind: "api",
    path,
    status,
    bodyPreview: body.slice(0, 160).replace(/\s+/g, " "),
  });
  await page.close();
}

for (const p of PAGES) await visitPage(p);
for (const a of APIS) await visitApi(a);

await browser.close();

// ---- Report ----
const consoleErrorPages = results.filter((r) => r.kind === "page" && r.consoleErrors.length);
const pageErrorPages = results.filter((r) => r.kind === "page" && r.pageErrors.length);
const navFailures = results.filter(
  (r) => r.kind === "page" && (r.status >= 500 || r.status === 0)
);

console.log("=== PAGE STATUSES ===");
for (const r of results.filter((x) => x.kind === "page")) {
  const redirect = r.finalUrl !== r.path ? ` -> ${r.finalUrl}` : "";
  console.log(`${String(r.status).padStart(3)} ${r.path}${redirect}`);
}

console.log("\n=== API STATUSES (guest) ===");
for (const r of results.filter((x) => x.kind === "api")) {
  console.log(`${String(r.status).padStart(3)} ${r.path}  ${r.bodyPreview}`);
}

console.log("\n=== CONSOLE ERRORS BY PAGE ===");
for (const r of consoleErrorPages) {
  console.log(`--- ${r.path}`);
  for (const e of [...new Set(r.consoleErrors)]) console.log(`    ${e}`);
}

console.log("\n=== UNCAUGHT PAGE ERRORS ===");
for (const r of pageErrorPages) {
  console.log(`--- ${r.path}`);
  for (const e of [...new Set(r.pageErrors)]) console.log(`    ${e}`);
}

console.log("\n=== 5xx / NAVIGATION FAILURES ===");
if (!navFailures.length) console.log("(none)");
for (const r of navFailures) console.log(`${r.status} ${r.path}`);

console.log("\n=== FAILED REQUESTS (>=5xx or network) BY PAGE ===");
for (const r of results.filter((x) => x.kind === "page" && x.failed.length)) {
  console.log(`--- ${r.path}`);
  for (const f of [...new Set(r.failed)].slice(0, 8)) console.log(`    ${f}`);
}

console.log("\n=== BLOCKED WRITE ATTEMPTS (must be 0 in a read-only scan) ===");
console.log(blockedWrites.length ? blockedWrites.join("\n") : "(none)");
