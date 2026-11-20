# Galaxy Store — Production Readiness Final Report

Date: 2026-11-18 · Branch `main`, HEAD `9bb3e6f` · No commit, push, deploy, or production write was performed.

## A. Executive summary

| Item | Result |
|---|---|
| Final verdict | **NOT READY** |
| Reason | The P0 database fixes are proven on an isolated local Supabase/Postgres (46 migrations, 126/126 integration tests, RLS parity) but **not applied to the linked production project**; the production ACL still allows anonymous `confirm_order_payment`. Production DDL/deploy require explicit human approval. |
| Fixed & verified on local Staging | Payment ACL revocation, single restock on cancellation, full RLS parity (227 policies), 19 vendor views converted to `security_invoker` with vendor-scoped order policies, payout method persistence + admin decisions |
| Fixed & verified in code/tests | Admin fail-closed auth, upload magic-byte checks, email ownership, notification body, admin custom-print GET, gift-box schema fallback, product tracking limits + fail-closed rate limit + token format, receipt upload ownership check, protected profile API, auth-before-validation on review routes |
| Green automated checks | TypeScript, ESLint, **1476 unit/contract tests**, production build, **15/15 full E2E on isolated local env**, **126/126 integration tests** |
| Known limitations | Production migrations still unapplied, dev-only dependency advisories (no upstream fix for high advisory), missing production storage objects, no payout provider integration |

## B. Todo list summary

17 tasks in `docs/PRODUCTION-READINESS-TRACKER.md` + `docs/PRODUCTION-READINESS-PROGRESS.md`:
- MIG-01…MIG-06: completed (authoritative schema recovered, baseline installed, 45-file chain boots cleanly from scratch, production runbook written).
- QA-01/QA-02/QA-04: completed (failure analysis, isolated test runner, auth-before-validation fixes).
- QA-03 (RLS parity from the production catalog) and QA-05 (three reproducible runs) in progress.
- DEP-01…DEP-05: completed as analysis with accepted dev-only risk (no safe upstream fix for the high advisory).
- No task left unattended; production DDL/deploy remain human-gated.

## C. Security findings

### confirm_order_payment (P0)
- Live catalog: `SECURITY DEFINER`, `search_path=public`, ACL `{=X/postgres,postgres=X/postgres,service_role=X/postgres}`, no caller check in body. App code never calls it.
- Fix: `supabase/migrations/20261117130000_revoke_public_security_definer_execute.sql` (also bundle §8).
- **Verification on local Staging** (script `supabase/manual-review/06_local_staging_p0_verification.sql`, real Postgres via `docker exec … psql -v ON_ERROR_STOP=1`):
  - `LOCAL_STAGING_P0_ALL_CHECKS_PASSED`
  - `has_function_privilege('anon', …) = f`
  - `SET ROLE anon; SELECT public.confirm_order_payment(...)` → `ERROR: permission denied for function confirm_order_payment`
- Production apply still pending (human approval required).

### Other functions / RLS / vendor isolation
- `sync_product_available_colors` + two trigger functions: PUBLIC/anon/authenticated revoked in the same migration; verified on local Staging.
- `verify_vodafone_cash_payment`: staging test found an explicit `anon` grant beyond PUBLIC; migration `20261117170000` was corrected to revoke `public, anon, authenticated`. Staging assertion `anon_cannot_verify_payment = t`.
- 10 financial policies narrowed to `authenticated` (`20261117170000`); staging `ALTER POLICY` output captured for all 10.
- All 19 `vendor_*` views were catalog-inspected. They are recreated locally from production definitions and converted to `security_invoker=true` by `20261118120000_fix_vendor_views_security_invoker.sql`; `20261118130000_vendor_order_rls.sql` adds vendor-scoped SELECT policies on `orders`/`order_items` so invoker-mode views still show a vendor's own store orders. Two-vendor/two-store probe: each vendor saw exactly its own store's order (buyer was an unrelated customer), zero cross-store rows, anon denied.
- API security: `verifyAdmin` fail-closed (6 tests), upload byte sniffing (6 tests), owner/admin email check (3 tests), profile API contract (5 tests), single body read for push actions, admin custom-print GET auth, UUID/limit validation, auth-before-validation on review vote/report.

## D. Database findings

- Migrations applied on local Staging: after recovering the authoritative baseline, all 45 migrations (baseline + 44 historical/corrective) apply cleanly with `npx supabase db reset`; seed loads; local schema has 91 tables / 68 functions / 17 views / 44 triggers / 33 policies (before RLS parity restoration). Earlier replay of 49 files yielded 16 PASS / 26 FAIL because foundational migrations were absent — this is now fixed at the root via the catalog-derived baseline and renamed/guarded migrations.
- Inventory: live `cancel_order()` incremented stock inline **and** via `trg_restock_on_order_cancel`; migration `20261117150000` makes the trigger the single authority. Staging runtime: stock 8 → cancel qty 2 → **10** (not 12); repeated cancel rejected, stock unchanged. Concurrency is guarded by `SELECT … FOR UPDATE` + trigger `WHEN` clause; no true parallel session test was possible, so this specific aspect remains documented, not claimed as tested.
- Order/payment state: all other RPCs inspected; no third restock site found; refunds/returns do not restock.
- Indexes: four exact duplicate pairs confirmed via `pg_indexes`; corrective migration `20261118100000_drop_duplicate_indexes.sql` prepared with rollback, **not applied** (needs production approval + EXPLAIN comparison).
- Schema drift vs production: `available_sizes`, theme/site-content/creator/custom-print/gift-box schemas and admin view fix remain unapplied in production.

## E. Vendor payout

- Method was collected by the UI but dropped by the API/RPC. Route now validates `bank_transfer|paypal|wallet|other` and forwards `p_method` with a compatibility fallback until the migration is applied.
- Migration `20261117160000_vendor_payout_method.sql`: adds `payout_method`, drops/recreates 3-arg RPC with `pg_advisory_xact_lock` per store, re-grants `authenticated/service_role`, copies method into `vendor_payouts` on approval.
- Admin GET now returns `payoutRequests`; admin UI has Approve/Reject with notes/reason, 409 on double decision, audit details include payout id/amount/store.
- Staging runtime: `paypal` stored on request, copied to ledger, second approval rejected.
- Approval is explicitly **not disbursement**: both admin and vendor UIs state funds are not transferred automatically; no "mark paid" action exposed.

## F. Testing results

| Check | Command / environment | Passed | Failed | Skipped / notes |
|---|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ | 0 | — |
| ESLint | `npm run lint` | ✅ 0 errors, 46 warnings | 0 | warnings are pre-existing hook-style notices |
| Unit/contract | `npm test -- --runInBand` | 96 suites / 1476 tests | 0 | — |
| Integration | `powershell -File scripts/run-integration-local.ps1` | **126/126** (3 consecutive runs earlier + final run) | 0 | Production URL hard-blocked |
| E2E (full) | `powershell -File scripts/run-e2e-local.ps1` (all 7 specs, local Supabase env) | **15/15** | 0 | Includes custom-print upload flow; no production writes |
| P0 SQL staging | `supabase/manual-review/06_local_staging_p0_verification.sql` + 4 migrations via psql | all assertions | 0 | real local Postgres 17 |
| Vendor isolation | local 2-vendor/2-store rollback probe on real `vendor_order_items` | ISOLATION_PASS | 0 | anon denied; no cross-store rows; buyer sees own orders |
| Build | `npx next build` (isolated distDir, configs restored) | ✅ 122 static pages | 0 | — |
| Migration chain | `npx supabase db reset` with migrations+seed enabled | 48/48 migrations, 91 tables, 227 policies, 19/19 vendor views invoker | 0 | baseline + RLS parity + vendor views + final grants |

## G. Dependency audit

- Before: 44 high / 9 moderate / 0 critical. `npm audit --omit=dev` → **0** vulnerabilities in runtime dependencies.
- `npm audit fix` was attempted once and reverted because totals worsened (50 high / 4 moderate); lockfile restored from HEAD + `npm ci`.
- Only 3 distinct upstream advisories exist: `picomatch` ReDoS (high, **no fixed version published** — latest 4.0.7 is vulnerable), `glob` traversal (moderate, fix requires 13→14 major), `minimatch` DoS (moderate, fix requires 10→11 major). All are dev/test-only.
- Full per-package inventory: `docs/DEPENDENCY-SECURITY-INVENTORY.md`; remediation decision: `docs/DEPENDENCY-REMEDIATION-REPORT.md`.
- Status: ACCEPTED_RISK for this release; re-evaluate when upstream publishes a patched picomatch.
- `npm audit fix` was attempted: result became 50 high / 4 moderate (worse); lockfile restored from HEAD and `npm ci` re-run after stopping file-locking servers. Final state back to 44 high / 9 moderate.
- Remaining advisories are dev/test tooling (Jest 30, jest-environment-jsdom, ts-jest, eslint-config-next chain). Fixes require major downgrades — rejected without compatibility study. Accepted risk, documented.

## H. Remaining blockers

| Blocker | Root cause | What was done | Needed to close |
|---|---|---|---|
| Production ACL still open | Corrective migration not applied to production | Prepared + proven on local Staging (46-migration chain) | Human approval + apply bundle §8 and ordered migrations to production, re-query ACL |
| Schema drift (production) | Local migrations were incomplete/out of order | Catalog-derived baseline + RLS parity + corrected order; local reset 46/46 | Apply the runbook to production after approval |
| Authenticated/vendor E2E | No remote staging app; full local stack used instead | Full local staging runs 126/126 integration incl. auth/vendor/RLS | Optional remote staging for deployment-specific checks |
| Payout provider | No external disbursement integration | Approval/disbursement separated in UI and docs | Provider integration + legal/ops decision |
| Storage images | Production objects return `NoSuchKey` (HTTP 400 from Storage) | Confirmed `onError` fallback renders placeholder | Restore/upload assets or fix paths (production write, needs owner) |
| Vendor views advisor ERROR | Resolved locally: 19/19 views now `security_invoker=true`, isolation probe passed | Dedicated view rewrite is already in the migration set; production application still human-gated |
| Dev-only dependency advisories | picomatch has no upstream fix; glob/minimatch need major upgrades | Inventory + accepted-risk report; runtime audit = 0 |

## I. Changed files (uncommitted)

- Tests: `__tests__/image-upload-validation.test.ts`, `__tests__/verify-admin-fail-closed.test.ts`, `__tests__/profile-api-contract.test.ts` (new); `prelaunch-api-fixes`, `vendor-payout-contract`, `product-image-upload-rollback`, `admin-content-images-contract`, `payment-ui`, `api-routes.integration`, `products.spec.ts`, `content-pages.spec.ts`, `google-auth-contract` (updated).
- Libraries/API: `lib/image-upload-validation.ts` (new), `app/api/profile/route.js` (new), `app/api/admin/_lib/verifyAdmin.ts`, 6 upload routes, `vendor/payout`, `admin/vendors` (GET+POST), `products/[id]/track`, `email`, `notifications`, `gift-boxes`, `admin/custom-print`, `shipping`, `reviews/[id]/reply` + vote/report (auth-first), `auth/google-status` (TS fix).
- UI: `app/admin/vendors/page.tsx`, `app/vendor/earnings/page.tsx`, `app/profile/page.tsx`, `app/components/payment/ReceiptUploader.tsx`, earlier product/gallery/reviews/prints fixes, `lib/gift-box.ts`.
- SQL: `20261117130000`…`20261118100000`, `20260000000000` baseline, `20260000000002` RLS parity, `20261118110000` final grants, `20261118115000` vendor views, `20261118120000` invoker fix, `20261118130000` vendor order RLS, bundle §8, `supabase/manual-review/06…`, `07…`.
- Scripts: `scripts/run-integration-local.ps1`, `scripts/run-e2e-local.ps1`.
- Docs: all reports in `docs/` mirrored into `docs/FINAL-REPORTS/`.

## J. Final verdict

**NOT READY.** All code-side, schema-recovery, and locally testable security/integrity work is complete and evidenced: 48 migrations bootstrap cleanly, 227 production RLS policies are restored locally, all 19 vendor views use `security_invoker` with vendor-scoped order policies and pass a two-vendor isolation probe, P0 SQL checks pass, integration tests are 126/126 in three consecutive runs (+ final run), full E2E is 15/15 on an isolated local stack, and unit/type/lint/build gates are green. The remaining blocker is operational, not analytical: the production database still carries the anonymous payment-confirmation grant and the unapplied schema changes. Deployment and production DDL require explicit human approval and are documented in `docs/PRODUCTION-DATABASE-MIGRATION-RUNBOOK.md`. No claim of production readiness is made.
