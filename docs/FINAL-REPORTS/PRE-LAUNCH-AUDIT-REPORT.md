# Galaxy Store — Pre-Launch Audit Report

**Date:** 2026-11-17 · **Branch:** `main` · **Baseline HEAD:** `9bb3e6fd092b945a2c19f63537b82a42ffdae84c` (`fix(security): upgrade Next.js to 16.4.6`) · **Vercel site:** `https://gallaxy-store.vercel.app` · **Supabase ref:** `httywgkwfqvrbuwuzutu`

> Safety: no `git commit`, push, deploy, `db push`, migration application, DDL/DML, or production write was performed. Read-only production inspection was used only where necessary. All new SQL is local and **unapplied**.

## 1. Architecture summary

- Next.js 16.4.6 App Router; 57 pages, 3 layouts, 86 route handlers, 0 Server Actions.
- Frontend is almost entirely client components calling JSON API routes with a Bearer token (`~167` `fetch()` call sites). The API layer centralizes auth and uses Supabase service-role or user-scoped clients.
- `proxy.ts` gates page shells (`/admin`, `/vendor`, `/checkout`, `/orders`, `/wishlist`, `/profile`, `/returns`, `/studio`, `/creator`); every API route re-verifies.
- Auth: Supabase Auth (password + Google). Admin role resolved via `is_admin()` RPC → `admin_users` → `ADMIN_EMAILS` allow-list. Vendor store ownership resolved from `owner_id`.
- Data: Supabase Postgres (76 public tables, 321 indexes, 180 functions, 165 `SECURITY DEFINER`), 10 storage buckets (7 public, 3 private), RPC-driven cart/checkout/payment/order business logic, 19 `vendor_*` views.
- External: Resend (email), Stripe/Paymob (both deliberately disabled), Upstash Redis (rate limits), Vercel (auto deploy on push).
- No webhook currently mutates state; no cron jobs exist.

## 2. Discovery totals

| Item | Count |
|---|---|
| Route handler files / exported operations | **86 / 143** |
| GET operations | **59** |
| Mutation operations | **84** (POST 52, PATCH 19, DELETE 13) |
| Unauthenticated operations (public by design or disabled stub) | 22 route files |
| Server Actions | 0 |
| Client data call sites | ~167 fetch, 60 `.from()`, 3 `.rpc()`, 5 `.storage` |
| Automated test files | 89 unit/contract + 7 E2E specs (15 tests) |

Full inventory: **`docs/API-ENDPOINT-INVENTORY.md`**.

## 3. What was tested and how

- **Static/behavioral:** source tracing of every route's auth, validation, DB effects and tests; read-only Supabase catalog inspection (RLS, policies, ACLs, functions, buckets, triggers, drift).
- **Automated:** `tsc`, ESLint, Jest (unit + contract), Playwright read-only guest E2E subset, production build in an isolated `distDir`, `npm audit`.
- **Live read-only GET probes** against the local dev server (same project env): `/api/search` → 200 (21 products), `/api/gallery` → 200 (5 images), `/api/theme` → 200, `/api/reviews` → 200, `/api/shipping` → 200 (0 options for `country=EG`), `/api/gift-boxes` → 500 before fix → 200 `schema_pending:true` after fix.
- **Not performed:** writes to production Supabase, valid contact-form submissions (real email), authenticated/admin/vendor mutations against production, integration tests requiring a staging DB.

## 4. Bugs found and fixed (2026-11-17)

| # | Severity | Location | Root cause → fix |
|---|---|---|---|
| 1 | P0 | `lib/gift-box.ts:88` | Missing `}` in an options type → `tsc`/ESLint parse failure. Added the brace (untracked WIP file, rest untouched). |
| 2 | P0 | DB `confirm_order_payment(...)` | `SECURITY DEFINER`, no caller check, ACL `=X/postgres` → anonymous PostgREST caller could mark any pending order paid. Local migration + bundle section revokes `public/anon/authenticated`, keeps `service_role`. **Unapplied.** |
| 3 | P1 | DB `sync_product_available_colors(uuid)` + 2 trigger functions | Publicly executable colour rewrite. Same revocation SQL. **Unapplied.** |
| 4 | P1 | `/api/admin/custom-print` GET | Built a fresh headerless `Request`, so `verifyAdmin` always returned 401. Now forwards the caller's request. |
| 5 | P1 | `/api/notifications` POST | `request.json()` called twice for `register_push`/`unregister_push` → always failed. Body is parsed once. |
| 6 | P1 | `/api/email` POST | No explicit owner/admin check; any authenticated caller could ask the server to email an order's customer. Now requires `order.user_id === user.id` or `is_admin()`. |
| 7 | P1 | `/api/gift-boxes`, `/api/gift-boxes/[id]` | Only handled `42P01`/`PGRST202`; live PostgREST returns `PGRST205` for the missing `gift_boxes` table → 500. Added `PGRST205`; verified 200 + `schema_pending:true`. |
| 8 | P2 | `admin/vendors`, `admin/creators` | `action in OBJ` accepts prototype keys → `Object.hasOwn`. |
| 9 | P2 | `/api/shipping` | `parseFloat("abc")` → `NaN` passed to RPC. Strict numeric + non-negative validation. |
| 10 | P2 | recommendations / recently-viewed | Unclamped `limit` → clamp 1–24. |
| 11 | P2 | `/api/reviews/[id]/reply` | No UUID validation → 400 for malformed review/parent ids. |
| 12 | P2 | Upload routes (admin product images, gallery, custom-print design) | Trust client `file.type` without magic-byte sniffing. **Not fixed** — see TODO P2. |

Regression tests added: `__tests__/prelaunch-api-fixes.test.ts` (6 tests) covering email ownership (deny/owner/admin), single body parse for both push actions, and auth-header forwarding. Earlier in this deploy chain, `__tests__/admin-products-contract.test.ts` (9 tests) covers archived view/restore/`published_at`.

## 5. Security findings

**Confirmed high (DB, unapplied fix):**
- `public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)` — SECURITY DEFINER, `search_path=public`, no `auth.uid()`/`is_admin()`/`owns_order()`; ACL includes `=X/postgres`. Supabase advisor `anon_security_definer_function_executable` agrees. The app never calls it, so revoking is safe. Local migrations `20261023/20261028/20261030` already intended this revoke but live ACL disagrees.
- `sync_product_available_colors(uuid)` and the two `trg_sync_colors_*` functions — publicly executable, can rewrite product colours. Revocation prepared.

**Other database observations:**
- All 76 public tables have RLS enabled; no permissive `USING true` write policies found. Two tables have RLS but zero policies (`_seed_report`, `admin_audit_log` — default deny, service-role writes).
- 19 `public.vendor_*` views are `security_definer` (advisor ERROR): they run with creator rights. Remediation requires `security_invoker=true` or grant changes — not done.
- 38 SECURITY DEFINER functions remain anon-executable and 85 authenticated-executable (mostly intentional guest-cart/search flows with token guards); a full least-privilege review is outstanding.
- `vendor_earnings` / `vendor_payout_requests` SELECT policies are named `*_owner_or_admin` but only check `owns_store(...)` and use `roles={public}` — potential admin-visibility bug.
- Storage: no cross-user overwrite policy found; private bucket `custom-print-designs` has 0 policies (service-role only).
- Leaked Password Protection is disabled in Auth config (WARN).

**Application-level:**
- No admin mutation relies on frontend hiding; all call `verifyAdmin`. `verifyAdmin` falls back to static `ADMIN_EMAILS` and swallows DB errors.
- `ReceiptUploader` uploads into a user-prefixed private path **before** the server validates order ownership (Storage RLS constrains the path; server later re-checks).
- `app/profile/page.tsx` writes `profiles.full_name` directly from the browser with no server validation and swallows errors.
- Public write side effects are rate-limited except `products/[id]/track` (view-count pollution possible).
- Webhooks are disabled stubs, so signature verification is currently moot; must be revisited before enabling card payments.
- No secrets, tokens or customer data were printed in this audit.

## 6. Database / migration findings

Live drift (all **required but unapplied**): `products.available_sizes`; colour-sync guard; theme tables (`store_themes`, `theme_assets`, `theme_settings`, `theme_versions`, …) + `theme-assets` bucket; `site_banners`/`site_sections` + `site-banners` bucket; creator-studio tables; `design_versions.editor_state`; `design_file_format` enum values; `gift_box` product-type check; `admin_product_performance` phantom-row fix; custom-print studio tables/bucket; gift-box bundle tables/functions.

The prepared bundle `supabase/manual-apply/20261112_pending_bundle.sql` covers the first 7 items; the newly appended section 8 covers the P0/P1 revokes. Local migrations `20261116…` (custom print studio) and `20261117…` (gift box bundles) are **not in the bundle** and still need applying separately.

Consequence observed live: the first storefront products SELECT includes `available_sizes` and fails with HTTP 400; the code retries without the column and the page eventually renders (48 product links in a read-only browser probe). Admin `/api/admin/products` GET fails until the column exists.

## 7. Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Pass** after fixing `lib/gift-box.ts` (failed before: TS1131) |
| `npm run lint` | **1 error / 47 warnings** — the single error is React Compiler "memoization could not be preserved" in **untracked WIP** `app/admin/gift-boxes/page.tsx:442`; not introduced by this audit and not in HEAD |
| `npm test` | **84 suites / 1315 tests passed** |
| `npm run test:integration` | **Blocked by design**: refuses to run without `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY`; no isolated DB available. Not pointed at production. |
| Playwright (read-only subset, 6 specs) | **6 passed / 7 failed**. Failures: homepage/products counters and featured cards not appearing within 20 s (the first products query returns 400 until `available_sizes` is applied, then a slower fallback succeeds — a direct probe saw 48 product links after 12 s); custom-print/reset-password/product-filter expectations also mismatch the current WIP UI text. `custom-print-studio.spec.ts` was excluded (uploads could write). |
| Production build (isolated `distDir`) | **Pass** (`✓ Compiled successfully`, 120 static pages generated, exit 0) with warnings about the missing `store_themes` table falling back to defaults |
| `npm audit` | **24 moderate, 0 high, 0 critical** — dev-only tooling (Jest 30, typescript-eslint, babel, glob); no production dependency with high/critical advisory |
| Live read-only GET probes | 5/6 healthy; `gift-boxes` 500 fixed to 200 `schema_pending` |

## 8. Remaining blockers and launch readiness

**P0 (block launch):**
1. Apply the prepared SQL bundle (incl. new P0 revoke section) and the two later migrations identified above; the storefront currently pays a failed query on every product read and admin product pages fail outright.
2. Fix the 19 `vendor_*` security-definer views / revoke unsafe anon function grants **before** exposing admin/vendor surfaces publicly.

**P1 (before public launch):** E2E suite is not green; payout `method` is collected but silently dropped (no DB column, no RPC parameter) and there is no admin payout approval UI; upload MIME sniffing; need staging DB to run integration and authenticated E2E flows.

**Final assessment: NOT READY.** Core customer flows (search, catalog rendering via fallback, theme fallback, reviews, gallery, read-only tracking) and all 1315 unit/contract tests pass, but a confirmed anonymous payment-confirmation escalation remains unapplied, required schema is missing, and end-to-end verification is incomplete. Status must be re-evaluated after the SQL bundle is applied and the P0 security items are verified in the live database.

## 9. Git state

- **Before:** `main` @ `9bb3e6f`; porcelain entries = **173** (11 deleted `.playwright-mcp` logs, 57 modified, 105 untracked — pre-existing WIP).
- **After:** no commits made; same branch/HEAD; WIP preserved. All audit edits are uncommitted and listed in `docs/PRE-LAUNCH-TODO.md`.
- Temporary build/E2E artifacts (`.next-audit*`, `.next-e2e`, `playwright.readonly.config.ts`, `debug-homepage.mjs`, `test-results`) were removed; `next.config.ts` and `tsconfig.json` were restored to their pre-audit content.
