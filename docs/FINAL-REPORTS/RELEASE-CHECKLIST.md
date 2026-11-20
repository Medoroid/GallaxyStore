# Release Checklist (run only after human approval)

## 1. Before touching any environment

- [ ] Read `docs/DATABASE-MIGRATION-PLAN.md` end to end.
- [ ] Confirm a restorable DB backup exists; record its timestamp.
- [ ] Confirm no uncommitted WIP from other owners will be committed by mistake (`git status --porcelain`).
- [ ] Verify all required env var **names** exist in production (never print values): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `BACKEND_URL`, `NEXT_PUBLIC_VODAFONE_CASH_NUMBER`.

## 2. Staging database

- [ ] Apply bundle `supabase/manual-apply/20261112_pending_bundle.sql` (sections 1–8) and run its 4 verification queries.
- [ ] Local chain now validated from scratch: `npx supabase db reset` with `20260000000000_authoritative_baseline.sql` + `20260000000002_authoritative_rls_and_grants.sql` (local/staging only; never apply these baselines to production).
- [ ] Apply `20261116130000_custom_print_studio.sql`.
- [ ] Apply `20261117140000_gift_box_bundles.sql`.
- [ ] Apply `20261117150000_fix_cancel_order_double_restock.sql`.
- [ ] Apply `20261117160000_vendor_payout_method.sql`.
- [ ] Apply `20261117170000_harden_financial_rls.sql`.
- [ ] Run every verification query from the migration plan; capture output.
- [ ] Prove anonymous `confirm_order_payment` call fails (403/permission denied).
- [ ] Prove cancel on a disposable order returns stock once (not twice), and a second cancel fails.
- [ ] Prove two vendors see only their own rows in all 19 `vendor_*` views.

## 3. Application verification

- [ ] `npx tsc --noEmit`, `npm run lint` (0 errors in tracked code), `npm test`, `npm run build`.
- [ ] `npm run test:integration` against staging credentials: all 6 suites pass.
- [ ] Read-only E2E subset passes; then authenticated journeys: register → cart → coupon → COD order → track → cancel → stock check.
- [ ] Admin: create/publish product with colours+sizes+compare-at; create gift box; moderate review; approve payout.
- [ ] Vendor: see own orders only; create shipment; request payout with `paypal` and verify stored method.
- [ ] Creator: upload artwork (real bytes), save version, publish, add to cart.

## 4. Security sign-off

- [ ] Supabase advisor: no `anon_security_definer_function_executable` on payment functions.
- [ ] Upload tests reject renamed EXE/SVG and accept real images.
- [ ] Rate limits active on contact, reviews, payouts, checkout, receipt, product tracking.
- [ ] Webhooks still disabled; no card-provider code enabled without keys and signature verification.
- [ ] No secrets in logs, tests, or generated artifacts.

## 5. Deploy (human action)

- [ ] Commit only reviewed files (WIP excluded).
- [ ] Push to `main` → Vercel auto-deploy.
- [ ] Post-deploy smoke: homepage, /products, /api/shipping?country=EG, admin login, vendor login.
- [ ] Monitor structured logs and error rate for 30 minutes.

## 6. Rollback

- [ ] Code: revert the release commit (Vercel redeploy previous SHA).
- [ ] DB: restore the staging/production backup recorded in step 0, or replay the per-object rollback snippets in the migration plan.
- [ ] Never "fix" a failed deploy by regranting EXECUTE on `confirm_order_payment` to anon/PUBLIC.

## Final verification evidence (local isolated stack, 2026-11-18)
- `npx supabase db reset`: 48/48 migrations + seed, 0 errors; 91 tables, 227 policies, 19/19 vendor views with `security_invoker=true`.
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors (48 pre-existing warnings).
- `npm test -- --runInBand`: 96 suites / 1476 tests passed.
- `powershell -File scripts/run-integration-local.ps1`: 126/126 (three consecutive runs + final run).
- `powershell -File scripts/run-e2e-local.ps1`: 15/15 full Playwright suite (includes custom-print upload) against local Supabase.
- `npx next build`: compiled successfully, 122 static pages.
- `npm audit --omit=dev`: 0 vulnerabilities; dev-only advisories accepted with documented rationale.

Production remains untouched: no DDL/DML, no commit/push/deploy. Apply the runbook only after human approval.
