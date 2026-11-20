# Security Findings — 2026-11-17

Evidence-based summary. No secrets or customer data included.

## P0 — release blockers (fix prepared, NOT applied)

### 1. Anonymous payment confirmation
- **Object:** `public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)`
- **Evidence:** `prosecdef=true`, `proconfig={search_path=public}`, `proacl={=X/postgres,postgres=X/postgres,service_role=X/postgres}`. Body validates provider/amount/currency/reference uniqueness only; no `auth.uid()`, `is_admin()` or `owns_order()`. Supabase advisor `anon_security_definer_function_executable` agrees.
- **Exploit path:** unauthenticated `POST /rest/v1/rpc/confirm_order_payment` with a known order UUID and its exact total inserts a `succeeded` payment and marks the order `paid`.
- **Mitigating fact:** no app/server/webhook code calls this RPC. All real flows use `complete_zero_total_order`, `pay_with_cod`, `initiate_external_wallet_payment`. Webhooks are disabled stubs.
- **Fix:** revoke `public/anon/authenticated`, keep `service_role` (`20261117130000…`, bundle §8). **Status: BLOCKED until applied and re-queried on staging.**

### 2. Public colour rewrite
- `sync_product_available_colors(uuid)` and `trg_sync_colors_from_variant[_options]()` carry `=X/postgres` + explicit anon/authenticated grants. Direct call rewrites any product's colours. Same revocation fixes it. Trigger firing is unaffected (function EXECUTE is checked at trigger creation, not at fire time).

### 3. Inventory corruption on cancel
- Live `cancel_order()` increments variant stock inline and again through `trg_restock_on_order_cancel` → **2× quantity** returned. Fix migration makes the trigger the single authority. **Status: BLOCKED (no staging runtime test).**

## P1 — fixed in code; database parts prepared

| Finding | Fix | Evidence |
|---|---|---|
| `verifyAdmin` downgraded to `ADMIN_EMAILS` on DB error | Fail-closed rewrite; bootstrap only when both checks are genuinely absent | 6 tests in `__tests__/verify-admin-fail-closed.test.ts` |
| Six upload routes trusted `file.type` | `lib/image-upload-validation.ts` byte-sniffing; renamed EXE/SVG rejected; MIME from bytes | 6 security tests + updated fixtures; 30 targeted tests passed |
| `/api/email` allowed emailing any order | Owner-or-admin check | 3 tests |
| Push notification actions read body twice | Single parse | 2 tests |
| Admin custom-print GET always 401 | Forwards caller request | 1 test |
| `/api/gift-boxes` 500 on missing tables | PGRST205 handled | Live 500 → 200 `schema_pending` |
| Vendor payout method dropped | Route validation + RPC migration + admin decision UI | 30 targeted tests; runtime blocked |
| Financial RLS policies `TO public` | Migration narrows to `authenticated` | Catalog evidence; apply pending |
| `verify_vodafone_cash_payment` PUBLIC grant | Revoke PUBLIC (admin check already inside) | `pg_get_functiondef` evidence |
| Receipt upload before ownership check | Owner-scoped GET before Storage write | 44 payment UI tests |

## Accepted risks (documented, with compensating controls)

- **19 `vendor_*` SECURITY DEFINER views:** all 19 definitions enforce `owns_store(auth.uid())` directly or via `vendor_order_items`, and grants are limited to `authenticated`/`service_role`. Setting `security_invoker=true` would apply RLS on `orders`/`profiles` to vendors and break dashboards. Left unchanged; needs a dedicated view rewrite + staging test if the advisor ERROR must be cleared.
- **Payout "paid":** `mark_vendor_payout_paid` only flips local ledger state; no provider integration. Not exposed in UI; admins are told approval is not money movement.
- **Audit log best-effort:** `recordAdminAudit` is outside RPC transactions; not proof of every decision.
- **WIP lint error:** an earlier full run reported one React Compiler error in untracked `app/admin/gift-boxes/page.tsx:442`; the final unified run reports 0 errors (46 pre-existing warnings).

## Still blocked by environment

- Integration suites require a dedicated Supabase test project; no credentials → 6 suites cannot run.
- No security test can prove the post-migration ACL on staging yet; all DB-side fixes remain unverified at runtime.
- E2E: 6 passed / 7 failed on the read-only guest subset; failures are migration/copy related, not new application regressions.
