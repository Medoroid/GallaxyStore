# Production Readiness — Progress Handoff (2026-11-18)

## Environment facts (verified)
- Branch `main`, HEAD `9bb3e6f`; no commits/pushes/deploys made. Working tree has pre-existing WIP (231 status entries at start of session).
- Production ref `httywgkwfqvrbuwuzutu` — **read-only only**. No writes performed.
- Docker Desktop was started from `C:\Users\medo\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`; `docker info` → server 29.7.2.
- Supabase CLI v2.117.0 (`npx --no-install supabase`), `supabase/config.toml` linked to production ref but `supabase start` uses LOCAL containers only.
- Local stack: API `http://127.0.0.1:54121`, DB container `supabase_db_Gallaxy_Store`, Studio `54123`. Local keys are standard demo keys — never copy them into docs/tests.
- `supabase start` initially failed: migration `20260907_create_admin_users_secure.sql` references `public.profiles` before it exists. Temporarily set `[db.migrations] enabled=false` and `[db.seed] enabled=false` in config, ran `supabase start`, then restored config from `%TEMP%\galaxy-config-backup.toml`. Config is restored (verified `enabled=true`).

## Completed tasks
1. **INIT-01** — Git/branch/HEAD/reports/CLI/Docker inspected; production vs local clearly separated.
2. **ENV-01** — local isolated Supabase stack running (real Postgres 17 + PostgREST + Auth).
3. **SEC-01 — VERIFIED on local Postgres.** Script `supabase/manual-review/06_local_staging_p0_verification.sql` (+ temp concatenation of the 4 corrective migrations) run via `docker exec -i supabase_db_Gallaxy_Store psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres`. Result: `LOCAL_STAGING_P0_ALL_CHECKS_PASSED`; `has_function_privilege('anon', ..., 'EXECUTE') = f`; actual `SET ROLE anon; SELECT public.confirm_order_payment(...)` → `ERROR: permission denied for function confirm_order_payment`.
4. **PAY-01 — code complete.** Vendor payout method validated + forwarded with 2-arg fallback; migration `20261117160000_vendor_payout_method.sql` (now `CREATE OR REPLACE` after DROP for idempotency); admin payout decision table in `app/admin/vendors/page.tsx`; explicit "approval ≠ money transferred" notice in admin prompt and `app/vendor/earnings/page.tsx`. Staging runtime: payout method persisted as `paypal`, copied to `vendor_payouts`, double approval rejected (inside the P0 script).
5. **INV-01 — runtime single-restock proven** in the P0 script: stock 8 → cancel qty 2 → 10 (not 12), repeated cancel rejected and stock unchanged. Concurrency case still to be documented explicitly; relies on `SELECT ... FOR UPDATE` + trigger WHEN guard (same design as live).

## Current blockers / latest error
- After `supabase db reset`, replaying all local migrations in filename order: **16 PASS / 26 FAIL**. Root cause: foundational migrations (products, product_variants, payments, shipping methods, refunds, creator/user_designs, etc.) are missing from the local migration set; non-timestamped base files (`create_*_tables.sql`) must be applied first, then timestamped ones. Full application schema **cannot** be bootstrapped from this repo alone.
- Integration tests with local env (`SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY` parsed from `supabase status -o json`, production URL hard-blocked by `test/integration-env.ts`): **7 suites, 126 tests → 42 passed / 84 failed**. Failures are missing-schema errors (e.g. `seed component product failed`), not proven application bugs.
- `supabase/manual-review/07_vendor_isolation_staging.sql` last run failed at its final SELECT because `public.verify_vodafone_cash_payment` does not exist in the current partial local schema. The isolation DO block itself did run before that SELECT? **Unknown — rerun after fixing the SELECT with a `to_regprocedure()` guard.**

## Exact commands worth repeating
```powershell
# concat P0 script + 4 migrations (PowerShell; double-quoted here-string so $(...) expands)
$src = Get-Content -LiteralPath 'supabase/manual-review/06_local_staging_p0_verification.sql' -Raw
$out = $src -replace '(?m)^\\i (supabase/migrations/\S+\.sql)\s*$', ''
# insert file contents of 20261117130000 / 1500000 / 1600000 / 1700000 before '-- POST-FIX ASSERTIONS'
Set-Content -LiteralPath "$env:TEMP\galaxy-staging-p0.sql" -Value $out -NoNewline -Encoding UTF8
Get-Content -LiteralPath "$env:TEMP\galaxy-staging-p0.sql" -Raw | docker exec -i supabase_db_Gallaxy_Store psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres
```
Integration env was set with `npx supabase status -o json | ConvertFrom-Json` → `$env:SUPABASE_TEST_URL`, `$env:SUPABASE_TEST_ANON_KEY`, `$env:TEST_SITE_URL='http://localhost:3000'`, then `npm run test:integration`.

## Next tasks (in order)
1. Fix `07_vendor_isolation_staging.sql` final SELECT with `to_regprocedure()` guard; rerun; mark SEC-03 / SEC-06-07 accordingly.
2. INV-01: add explicit concurrent-cancel reasoning/test note; mark VERIFIED.
3. MIG-01: document corrected migration order + missing foundational migrations evidence; mark BLOCKED (cannot fully bootstrap staging).
4. QA-01: results captured above (42/126); mark BLOCKED with exact cause.
5. QA-02: rerun read-only E2E subset against dev server (earlier: 6 passed/7 failed); clean-build E2E blocked by partial schema.
6. DEP-01: `npm audit --json` → 44 high + 9 moderate, all dev/test tooling; evaluate `npm audit fix --dry-run`, apply only safe compatible updates, rerun tsc/lint/tests/build.
7. DB-01: duplicate-index catalog review, no drops without query plans.
8. EML-01: document audit best-effort rationale.
9. FIN-01: run unified verification and write `docs/PRODUCTION-READINESS-FINAL-REPORT.md`.

## Never do
- No production DDL/DML, no production service-role key in tests, no push/deploy, no committing WIP.
- Do not label anything VERIFIED without captured output proving it.

## FINAL STATE (2026-11-18, end of run)
- All 15 Todo tasks processed and marked completed; no unattended task.
- Local Supabase Staging was used for P0 SQL verification and vendor-isolation testing; outputs: `LOCAL_STAGING_P0_ALL_CHECKS_PASSED`, `anon_can_call_payment = f`, `SET ROLE anon` → permission denied, `LOCAL_STAGING_VENDOR_ISOLATION_PASSED`.
- `verify_vodafone_cash_payment` revoke migration was corrected after staging exposed explicit anon/authenticated grants; re-verified.
- Clean-build read-only E2E: **13 passed / 0 failed** after fixing stale selectors/copy in `e2e/products.spec.ts` and `e2e/content-pages.spec.ts`.
- Integration: 42/126 pass with local Staging env; failures are missing foundational schema, not application regressions.
- `npm audit fix` was tried and reverted (made counts worse); `npm ci` restored after stopping file-locking servers; runtime deps audit = 0 vulnerabilities.
- Final unified checks: tsc 0 errors, lint 0 errors/46 warnings, 94 suites/1464 tests pass, production build OK (121 static pages).
- Final verdict: **NOT READY** — production DB fixes still unapplied, full schema cannot be bootstrapped locally, human approval required for production DDL/deploy. See `docs/PRODUCTION-READINESS-FINAL-REPORT.md`.
- Local Supabase stack was left running (Docker + `supabase_db_Gallaxy_Store`) for follow-up verification; shut it down with `npx supabase stop` if no longer needed. Dev server on port 3000 is running again.


## CONTINUATION SESSION (2026-11-18, migration recovery in progress)
- Produced authoritative schema from production Catalog (read-only): `supabase/manual-apply/00_authoritative_baseline.sql` (133KB) and `docs/DATABASE-MIGRATION-RECOVERY-REPORT.md`. Extracted 13 enums, 76 tables (75 included), 812 columns, 397 constraints, 134 indexes, 11 foundational views, 31 foundational functions, 32 triggers, 10 buckets.
- Installed baseline as the earliest migration `supabase/migrations/20260000000000_authoritative_baseline.sql`.
- Fixed historical migration-chain defects found by bootstrap:
  - 8-digit duplicate version prefixes renamed to unique 14-digit versions (18 files); updated `__tests__/payment-migration-guards.test.ts` references.
  - guarded duplicate `cart_items_cart_variant_color_size_unique` constraint in two cart migrations.
  - `DROP VIEW IF EXISTS cart_items_detailed` before `CREATE OR REPLACE` in three cart migrations (column set changes).
  - removed invalid `ALTER TABLE <view> ENABLE ROW LEVEL SECURITY` / `CREATE POLICY ON VIEW` from `20260910000002_fix_checkout_security.sql`.
  - replaced invalid `role IN ('admin','superadmin')` on enum `app_role` with `role = 'admin'` in `20260916000001_fix_broken_endpoints.sql` (enum has customer/vendor/admin only).
  - `DROP FUNCTION` before redefining return types of `submit_vodafone_cash_receipt` and `verify_vodafone_cash_payment`.
  - restored missing functions into baseline: `owns_design`, `owns_product`, `set_design_version_number`, `trg_sync_colors_from_variant[_options]`.
  - made `20261117170000_harden_financial_rls.sql` skip policies that do not exist.
- `npx supabase db reset` now completes from scratch with migrations+seed enabled: 44 migrations applied; local schema 91 tables / 68 functions / 17 views / 44 triggers / 33 policies.
- P0 re-verified on the rebuilt local DB: `available_sizes=t`, `payout_method=t`, anon/auth cannot execute `confirm_order_payment`, anon cannot execute `verify_vodafone_cash_payment`, `cancel_order` no longer restocks inline, trigger restocks.
- Integration tests with local env improved from 42/126 to **83/126**; remaining failures analysed: 13 missing cart/analytics RPCs (restoration in progress), API-route tests hitting a server bound to production env (new runner `scripts/run-integration-local.ps1` starts a dedicated Next server on :3102 with local Supabase env), cascade fixtures (`cartAId = 'null'`) and gift-box seed (`No suitable key or wrong key type`).
- Dependencies: fresh `npm audit` = 44 high / 9 moderate, all dev-only; `npm audit --omit=dev` = 0. Only three distinct advisories (picomatch ReDoS with no upstream fix, glob/minimatch need major upgrades). Inventory in `docs/DEPENDENCY-SECURITY-INVENTORY.md`, rationale in `docs/DEPENDENCY-REMEDIATION-REPORT.md`.
- Next action: after the missing RPCs are restored, re-run `npm run test:integration` via `scripts/run-integration-local.ps1`, fix remaining genuine fixture/app bugs, then write runbook + final reports.

### Continuation: integration remediation round 2
- `scripts/run-integration-local.ps1` fixed: parses `supabase status -o env` with quote stripping, starts a dedicated Next server on localhost:3102 with local Supabase env (stops :3000 during the run and restarts it afterwards), writes raw Jest output, kills child listeners on cleanup.
- `test/integration-env.ts`: production hard-block now compares against the hardcoded production URL and `.env.local` value instead of `process.env.NEXT_PUBLIC_SUPABASE_URL` (which the local runner intentionally overrides).
- API auth-before-validation fixed in `app/api/reviews/[id]/vote/route.js` and `.../report/route.js` (unauthenticated callers now get 401 instead of 400).
- Updated stale integration assertions to the real API contract: `/api/search` returns `id` (not `product_id`) and suggestions `{id,name,category}`; disabled webhooks return 200 ignored (Stripe) / 410 (Paymob) with explicit settled/received checks.
- Seed: added deterministic Arabic product `قميص جالاكسي` + variant; Arabic storefront test now searches `%جالاكسي%`.
- Result after these fixes (before RLS restoration): **114/126** passing; 12 failures remain (RLS/grants on views and storefront data, plus a few API assertions).

### Continuation: RLS parity restoration
- `supabase/migrations/20260000000002_authoritative_rls_and_grants.sql` generated from the production catalog (read-only) with all guarded RLS policies and explicit view grants (84KB). This closes the local/staging gap where anon could read `cart_items_detailed`/`cart_totals`.
- Local reset is being re-run by the schema team; after it completes, integration tests will be re-run three times for reproducibility.

### Continuation: final quality gate (pre-integration rerun)
- `npx tsc --noEmit`: 0 errors.
- `npm test -- --runInBand`: 94 suites / 1464 tests passed after all migration renames and route/test changes.
- Production `next build`: compiled successfully, 121 static pages generated (isolated distDir, configs restored).
- `npm audit --omit=dev`: 0 vulnerabilities; `npm audit`: 44 high / 9 moderate dev-only, all attributable to three advisories (picomatch has no upstream fix; glob/minimatch need major upgrades) — accepted risk documented.

## FINAL HANDOFF (2026-11-18)
- Local Supabase rebuild: `npx supabase db reset` → 46 migrations, 91 tables, 227 policies, RLS enabled on 91/91 tables, anon denied SELECT on cart views, seed loaded.
- Production catalog parity: 13 missing RPCs and 206 RLS policies + 7 owns_* helpers + view ACLs restored locally from read-only `pg_get_functiondef`/`pg_policies` extraction.
- Integration tests: `scripts/run-integration-local.ps1` → 126/126 in three consecutive runs (7 suites), no skips/mocks/deleted tests.
- Final gates: tsc 0 errors; lint 0 errors/46 warnings; unit 94 suites/1464 tests pass; E2E read-only 13/13; production build OK (121 pages); runtime dependency audit 0 (dev-only advisories accepted).
- Remaining: production application of migrations + human approval; no production DDL/DML executed by the agent; no commit/push/deploy.
- Local Supabase stack left running for follow-up verification (`npx supabase stop` to shut down).

## FINAL HANDOFF — Phase: vendor views + code hardening (2026-11-18)
- Created `20261118120000_fix_vendor_views_security_invoker.sql`; local vendor views were missing, so `20261118115000_authoritative_vendor_views.sql` recreated all 19 from production catalog (read-only) first. Local reset: 48 migrations, 19/19 views with `security_invoker=true`.
- `security_invoker` alone made vendors see only orders they personally bought; added `20261118130000_vendor_order_rls.sql` with vendor-scoped SELECT policies on orders/order_items. Rollback probe with two vendors and an unrelated buyer: VENDOR_A 1 row own store / 0 other; VENDOR_B 1/0; buyer sees own 2 orders; anon denied → ISOLATION_PASS.
- Product tracking: rate limit changed to `fail_closed`; guest `session_token` must be a UUID (real clients use crypto.randomUUID).
- Profile: new `app/api/profile/route.js` with JWT identity, server-side validation, auth metadata + profiles upsert, and honest errors; `app/profile/page.tsx` now calls it. Contract tests added (5).
- Fixed two TypeScript errors in concurrent WIP (`google-auth-contract.test.ts`, `auth/google-status/route.ts`) without altering behavior.
- Final gates: tsc 0; lint 0 errors/48 warnings; unit 96 suites/1476 tests; integration 126/126 (3x + final); full E2E 15/15 on local stack; build 122 pages; runtime audit 0.
- Verdict remains NOT READY solely because production migrations/ACL fixes are not applied (human approval required).
