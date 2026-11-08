# Production Remediation Tracker — Galaxy Store

> Master prompt: fix all issues from `docs/TESTING-REPORT-AR-2026-10-29.md` (A1–D4), prove with tests, prepare — but never apply — production DB changes.
>
> Statuses: `Not Fixed` · `Partially Fixed` · `Already Fixed` · `No Longer Applicable` · `Requires External Config` · `Blocked — Requires Approval` → final: `FIXED` / `PARTIALLY FIXED` / `NOT FIXED` / `BLOCKED` / `REQUIRES MANUAL ACTION` / `NOT APPLICABLE`.
>
> Baseline: `docs/PRODUCTION-REMEDIATION-BASELINE.md` (tsc ✅, lint ✅ 0/22, tests ✅ 275, build ✅, audit 44 vulns).

Legend for columns: **Verified** = current-state check done before touching code.

---

## Phase Zero — Discovery ✅ DONE (2026-11-01)

- [x] Read all project config/source areas; versions recorded.
- [x] Baseline checks: tsc / lint / test / build / audit — all recorded in baseline doc.
- [x] Verified corrupted generated files (`.next/dev/types`) were the only tsc failure cause.
- [x] Verified `axios`/`zod` unused in source (D1 removal candidates).
- [x] Verified current state of every reported issue (see table).

---

## Phase One — Critical (A1–A4)

| ID | Issue | Verified current state | Status | Files |
|---|---|---|---|---|
| A1 | Next.js 16.2.9 in advisory range (Proxy bypass w/ Turbopack, Server Actions DoS) | `npm ls next` = 16.2.9; fix target 16.4.3 confirmed via dist-tags | **FIXED** — next 16.2.9→16.4.3; proxy role-checks `/vendor`+`/returns`; all 14 admin + 6 vendor routes verify server-side; `__tests__/proxy-authorization.test.ts` 24/24 + middleware integration guest/role tests | `package.json`, `proxy.ts`, tests |
| A2 | Gift Boxes mockup (fake `gift-*` ids, Unsplash, "Simulate API call") | Confirmed lines 9–41 in `app/gift-boxes/page.tsx` | **FIXED** — real products grid (DB UUIDs) + POST `/api/gift-box` (auth-first, validated, CHECK-fallback, honest 201/400/401/429) + guest banner; local migration `20261101_add_gift_box_product_type.sql` prepared; `gift-box-request-contract.test.ts` 15/15 | `app/gift-boxes/page.tsx`, `app/api/gift-box/route.js`, `supabase/migrations/20261101_*.sql`, tests |
| A3 | 23/29 product images → missing storage objects; 10 external hotlinks; published test products | DB snapshot confirmed | **FIXED** (customer-facing) — `SafeImage` fallback on all customer surfaces, single local placeholder, HTTP probe results + actions in `docs/PRODUCT-DATA-INTEGRITY-REPORT.md`, guarded cleanup SQL prepared (NOT applied); admin surfaces intentionally show true broken state | image components, `docs/PRODUCT-DATA-INTEGRITY-REPORT.md`, `supabase/manual-review/01,02` |
| A4 | Logger silences `warn`/`info` in production | `lib/logger.ts:4` confirmed `if (production && level !== "error") return` | **FIXED** — structured single-line JSON, prod level `warn` (errors+warnings kept, `LOG_LEVEL` override), recursive secret/PII redaction, `logger.withContext({requestId,route,operation,errorCode})`; `logger-structured.test.ts` green | `lib/logger.ts` |

## Phase Two — Business Logic (B1–B6)

| ID | Issue | Verified current state | Status | Files |
|---|---|---|---|---|
| B1 | Arabic strings in cart/not-found/error under `lang="en"` | `app/cart/page.tsx`, `app/not-found.tsx` (Arabic) confirmed | **FIXED** — cart/not-found/error/product-details UI text in English; Arabic kept only as product data (NAMED_COLOR_HEX keys); `ar-EG` date locale → `en-GB` | cart, not-found, error, product-details |
| B2 | Fake cart shipping `subtotal > 500 ? 0 : 49` | `app/cart/page.tsx:167` confirmed | **FIXED** — cart shows "Shipping — calculated at checkout"; total labeled "Estimated Total (excludes shipping)"; server already revalidates fee in `checkout()` against `get_shipping_options` | `app/cart/page.tsx`, `app/api/shipping/route.js` |
| B3 | Mixed currencies (18 USD / 3 EGP) | DB snapshot confirmed | **FIXED (code) / PREPARED (data)** — `lib/cartTotals.ts` per-currency subtotals, mixed-cart block, `estimatedOrderTotal` null for mixed carts; central `lib/formatCurrency.ts`; cleanup SQL `manual-review/03_currency_cleanup.sql` awaits owner rate + approval | currency utility + guards; cleanup SQL prepared only |
| B4 | Empty `store_settings`; fake phone `+1 (555)`; fake "4.9 / 12k+ reviews"; USA shipping zones; `$4.99` on shipping page | Confirmed: `contact/page.tsx:36`, `page.tsx:69`, `about/page.tsx:9`, `shipping/page.tsx:29` | **FIXED (code) / PREPARED (data)** — settings-driven contact/footer/metadata/announcement (`lib/storeSettings.ts`); real `/api/contact` delivery via Resend (honest 503 when unconfigured); homepage reviews render only from approved rows; About counts real products/zones; shipping page reads live zones/rates; FAQ fake fees removed; gallery stock padding removed; `manual-review/04_shipping_zones_egypt.sql` (EG local zone, default→International) awaits fee edit + approval; `store-identity-honesty.test.ts` guards | contact/shipping/about/homepage/footer/layout + `lib/storeSettings.ts` + `app/api/contact/route.js` |
| B5 | Rate limiting falls back to in-memory silently in prod | `lib/rate-limit.ts` supports Upstash+memory fallback, no explicit prod gate | **FIXED** — `REQUIRE_DISTRIBUTED_RATE_LIMIT` gate in `lib/rate-limit.ts`: when enabled, missing Upstash rejects (`backend:"unavailable"`, one-time `logger.error`) and unreachable Redis overrides `fail_open` → fail closed for ALL routes; gate off keeps legacy memory fallback; `UPSTASH_REDIS_REST_URL/TOKEN`, `REQUIRE_DISTRIBUTED_RATE_LIMIT`, `TRUST_PROXY` documented in `.env.example`; `rate-limit.test.ts` 24/24 green | `lib/rate-limit.ts`, `.env.example`, `__tests__/rate-limit.test.ts` |
| B6 | `p_weight_grams: 0` in shipping API; country NAME vs ISO-code zone mismatch ("Egypt" never matched `['EG']` → everyone got the default/US zone) | `app/api/shipping/route.js`, `app/api/orders/route.js`, `app/api/checkout/preview/route.js` all hardcoded `p_weight_grams: 0`; checkout `<select>` sends "Egypt" while `shipping_zones.countries` holds "EG" | **FIXED (code) / BLOCKED-REQUIRES APPROVAL (DB rollout)** — shared `lib/shippingWeight.ts` (same rule: variant→product weight, NULL→0, cap 200 000 g) + `lib/shippingCountry.ts` (name→ISO map) wired into all three quote surfaces; checkout page sends item ids; country normalisation applied unconditionally (fixes Egypt/SA/AE/KW mispricing today, fees still equal zone base_fees so live `checkout()` accepts them); weight-aware fees gated behind `SHIPPING_CALCULATE_WEIGHT` (default off) until `manual-review/05_checkout_weight_shipping_fee.sql` (checkout() validates fee via `get_shipping_options(country,subtotal,weight)`) is approved+applied — rollout order in `docs/STORE-SETTINGS-CHECKLIST.md` §6; tests `shipping-weight.test.ts` + `shipping-quote-contract.test.ts` (57/57) | `lib/shippingWeight.ts`, `lib/shippingCountry.ts`, `app/api/shipping/route.js`, `app/api/checkout/preview/route.js`, `app/api/orders/route.js`, `app/checkout/page.tsx`, `supabase/manual-review/05_checkout_weight_shipping_fee.sql`, `.env.example` |

## Phase Three — Medium (C1–C6)

| ID | Issue | Verified current state | Status | Files |
|---|---|---|---|---|
| C1 | Reset-password shows "Invalid or expired" to every visitor without session | Confirmed at fix time: no session ⇒ immediate error for anyone opening the URL | **FIXED** — `linkState` machine (`checking`/`ready`/`missing`/`invalid`): token markers in URL (`?code=`, `#access_token=`, `#error=`, `?error=`) required before "Invalid or expired" is ever shown; tokenless visitors get a friendly "request a reset link" panel → `/forgot-password`; form only renders for a real recovery session; submit disabled until ready | `app/reset-password/page.tsx`, `__tests__/reset-password-guest.test.tsx` (6/6) |
| C2 | "All 0 products" flash | Counter at `app/products/page.tsx` rendered `result?.total ?? 0` before first response | **FIXED** — counter shows `Loading products…` while `loading && !result`; real count kept during refreshes (old result not cleared); verified by test | `app/products/page.tsx`, `__tests__/products-counter-loading.test.tsx` (2/2) |
| C3 | `/api/custom-print` validates fields before auth → 400 not 401 | `route.js`: rate-limit → content-type → 400s → late `optionalUserId` confirmed | **FIXED** — `authenticatedUserId` runs immediately after rate-limit (429 still first): missing/invalid/expired Bearer → 401 `{code:"auth_required"}` + `WWW-Authenticate: Bearer` before content-type/field checks; no storage upload or insert on 401; authenticated flow keeps original 400 order | `app/api/custom-print/route.js`, `__tests__/custom-print-auth-contract.test.ts` (8/8) |
| C4 | Custom-print form has no guest login warning | No guest warning in page; submit sent without token for guests | **FIXED** — amber "Guest sign-in required" banner at top of form for `!user` with Sign In → `/login`; `handleSubmit` fetches the token first and fails fast with an inline message (form stays filled) instead of uploading a file that would 401; Authorization header always sent | `app/custom-print/page.tsx` |
| C5 | Missing `/api/products`, `/api/stores` | **Zero references in source** to either path | **No Longer Applicable** (no consumer — will not create fake APIs) | — |
| C6 | not-found/error pages: Arabic + inconsistent | Both `app/not-found.tsx` and `app/error.tsx` reviewed: English, consistent glass styling, generic prod error + digest id, console-only details | **Already Fixed** (English conversion landed with Phase One/B1 work; no further change needed) | `app/not-found.tsx`, `app/error.tsx` |

Phase Three verification gate: `npx tsc --noEmit` ✅ · `npm run lint` 0 errors / 22 warnings (baseline) ✅ · `npm test` **456/456, 44 suites** ✅ · `npm run build` exit 0 ✅

## Phase Four — Low (D1–D4)

| ID | Issue | Verified current state | Status | Files |
|---|---|---|---|---|
| D1 | npm audit: 44 vulns (2 crit, 7 high, 32 mod, 3 low) | Baseline 44 → after A1 41 → after `npm audit fix` (non-force) **35**; `npm audit --omit=dev` → **0**; remaining 35 all dev-only (eslint/jest toolchain, 3 unique advisories: minimatch/Glob/deepmerge), only `isSemVerMajor` "fixes" offered | **FIXED (production tree)** — critical 2→0, high 7→0, prod-tree 0; runtime patched: axios 1.21.0, follow-redirects 1.16.2, zod 4.6.7, source-map-js 1.2.2, handlebars cleared, brace-expansion cleared; gate re-run clean (tsc ✅ lint 0/22 ✅ tests 456 ✅ build ✅); full analysis in `docs/DEPENDENCY-SECURITY-REPORT.md` | `package-lock.json`, `docs/DEPENDENCY-SECURITY-REPORT.md` |
| D2 | package version 0.1.0 | Confirmed at 0.1.0 | **FIXED** — bumped to `1.0.0` in `package.json` (inert: `private:true`, no runtime consumer) | `package.json` |
| D3 | Repo temp files (`dev-server*.log`, `homepage.png`, `build-baseline.log`, `Modelfile`); `.gitignore` gaps | Present; `.gitignore` had no log/screenshot entries | **FIXED** — 14 scratch files deleted (dev-server*.log, build-*.log, upgrade-next*, homepage.png, gallery-page.png, Modelfile, test-output*.txt, text.txt, lint-warnings-current.txt); `.gitignore` gained `*.log`, `/*.png`, `/Modelfile`, `test-output*.txt`, `text.txt`, `lint-warnings-current.txt`; baseline doc references to `build-baseline.log` updated to avoid dangling links; no code/doc content depended on the deleted files (grep verified) | `.gitignore`, root temp files, `docs/PRODUCTION-REMEDIATION-BASELINE.md` |
| D4 | Arabic UTF-8 integrity vs PowerShell display | Files verified UTF-8; mojibake is console-only artifact | **Already Fixed / No action on file content** | — |

## Phase Five — Database & Data Integrity (read-only)

- [x] Full schema/RLS/functions/triggers/storage policy review → `docs/DATABASE-INTEGRITY-REPORT.md` — ✅ **Done 2026-11-01** (read-only via Supabase MCP as `supabase_read_only_user`): 83/83 tables RLS-on, 2 zero-policy tables locked, **132/132 FKs 0 orphans**, 130+ triggers reviewed, 10 storage buckets verified (`custom-print-designs` private + zero policies = service-role only ✓), 3 most sensitive anon-callable RPCs spot-checked → internal `is_admin()`/ownership guards ✓; **core finding: all 41 views are owner-rights (postgres/BYPASSRLS) → table RLS does not apply**; exposure matrix: 5+1 anon-exposed unguarded sensitive views (order/shipment/wishlist/notification), 9 unguarded vendor views (authed cross-tenant), 2 unguarded cart views (app-used) — everything else guarded or public-by-design
- [x] Diagnostic + guarded cleanup/hardening SQL → `supabase/manual-review/` — ✅ **01–06 prepared**; **new** `06_harden_view_exposure.sql` (REVOKE unused sensitive views + `owns_store()` guards for 9 vendor views + `security_invoker` for 2 cart views; pre-flight greps, post-apply verification, full commented rollback) — **BLOCKED-REQUIRES APPROVAL** (nothing applied)
- [ ] DR schema snapshot — **Blocked: `supabase db dump --linked` needs human approval**

## Phase Six — Testing & Regression

- [x] Unit tests (currency, shipping, weight, cart totals, gift-box validation, rate limiting, logger redaction) — ✅ covered by the `npm test` gate (**456/456, 44 suites**, unchanged baseline): `cart-totals`, `checkout-calculations`, `shipping-weight`, `shipping-quote-contract`, `orders-shipping-contract`, `gift-box-request-contract`, `rate-limit` (+ rate-limit blocks in `custom-print-auth-contract`/`contact-api-contract`), `logger-structured` (secret redaction), `store-settings`, `store-identity-honesty`, `i18n`, `products-counter-loading`, `reset-password-guest`, `custom-print-auth-contract`, `cartStore`
- [ ] Integration tests (products/images, cart sync, gift-box requests, shipping API, custom-print auth, reset-password, store settings, unauthorized requests) — **BLOCKED — no test project available**: the 6 suites exist (`gate2-rpc-execution`, `gate4-cart-e2e`, `gate5-security-negative`, `rpc-integration`, `middleware-auth`, `api-routes`, all `*.integration.test.ts`) and are hard-gated by `test/integration-env.ts` to a dedicated non-production project. A local Supabase stack is impossible (repo migration chain cannot rebuild the schema — see `docs/DATABASE-INTEGRITY-REPORT.md` §7: `profiles` creator archived, `supabase start` fails), and creating a staging project / `db dump --linked` both require owner approval → **requires external config/approval**
- [x] Playwright guest E2E (homepage, products, search/filters/sort, cart, gift-boxes, custom-print, contact, FAQ, 404, reset-password, shipping display) — ✅ **13/13 passed, exit 0 (2026-11-04)** via `npm run test:e2e` (`playwright.config.ts` + `e2e/*.spec.ts`, chromium, serial, `next build && next start -p 3100` against production-backed reads). **Production-write protection enforced in `e2e/helpers.ts`:** direct browser→PostgREST non-GET blocked, `/api/cart` mutations + product view-tracking + `/api/contact` delivery aborted (counters asserted = 0), free-text search answered from a local fixture because the real handler `log_search`-INSERTs (q-empty search/facets/suggestions hit the real read-only endpoints). Excluded by design: add-to-cart, product-details view (track INSERT), contact valid submit (real email) — covered instead by the blocked integration suites above. Also added: `.gitignore` (`test-results/`, `playwright-report/`, `blob-report/`), Jest exclusion of `e2e/`, `test:e2e` script
- [ ] Authenticated/Admin/Vendor E2E — **Blocked: no test accounts, production writes forbidden**

## Phase Seven — Final Checks & Report

- [x] tsc / lint / test / build / audit re-run vs baseline — ✅ **2026-11-04, no regressions**: `npx tsc --noEmit` exit 0 · `npm run lint` 0 errors / 22 warnings (identical to baseline) · `npm test` **456/456, 44 suites** (baseline 275 → +181 new tests) · `npm run build` exit 0 · `npm audit` 35 (3 low, 32 moderate — dev-only, exit 1 as expected) vs baseline 44 (2 crit, 7 high) · `npm audit --omit=dev` **0 vulnerabilities, exit 0**
- [x] `docs/FINAL-PRODUCTION-READINESS-REPORT.md` — ✅ written (scope/method, A1–D4 final status table, Phase Five DB evidence, gate table baseline-vs-final, E2E evidence, deliverables inventory, 11 approval-gated/blocked items with rollout order, residual observations, deployment guidance, evidence-based verdict — no "100% ready" claim)
- [x] Arabic final response — ✅ 9-section Arabic report delivered in chat (executive summary / A1–D4 statuses / database / tests & evidence / security / deliverables / approval-gated & blocked / residual risks / next steps)

---

## Decisions Log

1. **next upgrade target = 16.4.3** (`latest` dist-tag; 16.4.4 does not exist). React 19.2.4 stays.
2. **No production writes at any point** — cleanup SQL prepared under `supabase/manual-review/` with review guards.
3. **C5**: no `/api/products` / `/api/stores` — no consumer exists (per master prompt: don't create fake APIs).
4. **B5**: implement explicit production rate-limit gate (`REQUIRE_DISTRIBUTED_RATE_LIMIT`) instead of silently trusting memory fallback; dev keeps memory fallback.
5. **A2**: gift-box requests reuse existing `custom_print_requests` (add `gift_box` product type only if contract-compatible) OR fail-closed local migration — decided after contract review.
