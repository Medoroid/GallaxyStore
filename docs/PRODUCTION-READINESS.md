# Gallaxy Store — Production Readiness Checklist

> Baseline audit: [`CURRENT-STATE-AR.md`](../CURRENT-STATE-AR.md) (preserved unchanged).
> Target environment: `https://httywgkwfqvrbuwuzutu.supabase.co` (project `galaxy-store`).
> Last updated: 2026-10-23.

Status legend: **DONE** (code implemented + locally verified), **UNAPPLIED** (SQL in
repository, not executed on the live database), **MANUAL** (needs account access or
business data), **UNVERIFIED** (cannot be proven here), **DISABLED** (intentionally
returns a safe explicit response).

## A. Supabase / Database

| # | Item | Severity | Status | Evidence / notes |
|---|---|---|---|---|
| A1 | `payment_receipts` table + constraints + indexes | P0 | DONE | Migration `20261023`; unique `(provider, transfer_reference)` partial index for pending/approved. |
| A2 | Legacy `submit_vodafone_cash_receipt` RPC | P0 | DONE (live) / guard UNAPPLIED | Ownership/path/reference/duplicate checks; writes payment + receipt. The live function does **not** know about `orders.payment_method`; A22 closes that gap. |
| A3 | Legacy `verify_vodafone_cash_payment` RPC | P0 | DONE | `is_admin()` guard; approves/rejects receipt + payment + order atomically. |
| A4 | `payment-receipts` private bucket + policies | P0 | DONE | Private 5 MB bucket; owner insert/select/delete, admin select. |
| A5 | `gallery-images` public bucket + admin writes | P1 | DONE | Public read; admin insert/update/delete. |
| A6 | Admin dashboard views return real data | P0 | DONE | Service-role views; counts were verified previously against the live project. |
| A7 | Correct admin view columns | P0 | DONE | Views re-created with canonical columns; APIs use base tables where safer. |
| A8 | MV refresh strategy | P1 | DONE | Concurrent refresh with fallback; restricted to service role. |
| A9 | Single-currency carts + order currency | P0 | DONE | `add_to_cart` and `checkout` reject mixed currencies. |
| A10 | Trusted payment confirmation | P0 | DONE + ACL pending | `confirm_order_payment(..., p_currency)`; amount/currency/reference verified. Live ACL still had default `PUBLIC` execute; A23 removes it. |
| A11 | `orders.shipping_method_id` + owner setter | P1 | DONE | Column, index, backfill, `set_order_shipping_method`. |
| A12 | `store_settings` table | P1 | DONE | Public-read policy for public rows; admin writes via server API. |
| A13 | Custom print table + private bucket | P1 | DONE | Migration `20261024`. |
| A14 | Refund/return hardening | P1 | DONE | Migration `20261025`. |
| A15 | Admin audit trail | P2 | DONE | Migration `20261026`; RLS on; UI at `/admin/audit`. |
| A16 | Migration history `20261023`–`20261026` | P1 | DONE | Recorded as applied before this payment refactor. |
| A17 | Full schema reproducible from committed migrations | P1 | PARTIAL | Live DB has historical migrations not all present in the repo. Snapshot generation needs Docker, unavailable here. |
| A18 | `external_wallet` enum + `orders.payment_method` | P0 | **UNAPPLIED** | In `20261028_payment_methods_external_wallet.sql`; live read-only inspection confirms the enum/column do not exist yet. |
| A19 | Hardened `pay_with_cod` + `initiate_external_wallet_payment` | P0 | **UNAPPLIED** | Validates owner, pending order, amount/currency from the order, and idempotent retry. An **older** live `pay_with_cod` exists but lacks these checks. |
| A20 | `submit_external_wallet_receipt` + `verify_external_wallet_payment` | P0 | **UNAPPLIED** | Owner/path checks, duplicate reference guard, admin-only decision, atomic receipt+payment+order update. |
| A21 | `mark_cod_collected(p_payment_id)` | P0 | **UNAPPLIED** | Admin-only, idempotent, order-before-payment locking, duplicate-settlement guard, records collector/time and updates the order. An **older** live function exists; it does not persist the method, and although the RPC itself only updates the payment, the live `sync_order_payment_status()` trigger flips a pending order to `paid` when the COD amount reaches the total. |
| A22 | Legacy Vodafone cross-method guard | P0 | **UNAPPLIED** | `guard_vodafone_receipt_method` trigger rejects a Vodafone receipt when the order uses `cod`/`external_wallet`, has a conflicting new-method payment, or the receipt row does not belong to the real order owner / exact `<user>/<order>/` path. Protects direct RPC calls too. |
| A23 | Payment RPC EXECUTE hardening | P0 | **UNAPPLIED** | `20261028` revokes default `PUBLIC` (and `anon`) from all new/legacy payment RPCs, grants `authenticated`/`service_role`, and makes `confirm_order_payment` `service_role`-only. |
| A24 | Zero-total (fully discounted) order completion | P0 | **UNAPPLIED** | `20261029` adds `complete_zero_total_order()`: owner-checked, idempotent, refuses a positive total, marks a pending zero-total order `paid` with no payment row (`payments.amount > 0` forbids a 0-amount payment). `/api/orders` and `POST /api/orders/[id]/payment` call it; the UI renders “Free order”. |
| A25 | `set_order_shipping_method()` anonymous-caller fix | P0 | **UNAPPLIED** | Live function has a default `PUBLIC` grant and its `v_owner <> auth.uid()` check is NULL (passes) for anon. `20261029` rejects missing auth and revokes `PUBLIC`/`anon`. |

> **Deployment gate:** do not deploy the current checkout/payment code as the final
> payment flow before A18–A25 are applied. External-wallet checkout fails without A18/A20;
> COD currently falls back to the older live RPC, which does not persist
> `orders.payment_method`; without A22 the legacy Vodafone RPC can still be called directly
> against a new COD/wallet order; without A23 `confirm_order_payment` remains callable by
> `anon` through the default `PUBLIC` grant; without A24 a fully discounted order is left
> pending forever; without A25 an anonymous caller can change any order’s shipping method.

## B. Storefront

| # | Item | Severity | Status | Evidence |
|---|---|---|---|---|
| B1 | Price uses `base_price`, not `discountPercentage` | P0 | DONE | `lib/products.ts`, `ProductCard.tsx`. |
| B2 | Shared EGP/USD formatter | P0 | DONE | `formatCurrency` used across storefront/admin. |
| B3 | Product image URL includes bucket | P0 | DONE | `productImageUrl()` normalises paths; card falls back on error. |
| B4 | Discount only when compare-at is higher | P1 | DONE | `validCompareAtPrice()`. |
| B5 | Search: URL state, suggestions, facets | P1 | DONE | `/api/search` + `/products` server pagination/facets. |
| B6 | Order tracking with verified email | P0 | DONE | `/api/orders/track`: order ref + account email, generic 404, strict IP limit. |
| B7 | `/stores` + `/stores/[slug]` | P2 | DONE | Approved stores, published products, server-rendered metadata. |
| B8 | Product-view tracking | P2 | DONE | `POST /api/products/[id]/track` + `track_product_view`. |
| B9 | Custom print safe workflow | P1 | DONE | Persisted request + private artwork + admin quote/status + customer email. |
| B10 | Public gallery uses Storage | P1 | DONE | `/api/gallery` resolves public URLs; admin uploads to `gallery-images`. |
| B11 | Checkout offers only COD + external wallet | P0 | DONE (code) | `/api/orders` rejects all other methods; depends on A18–A22. |
| B12 | Wallet instructions use private server settings | P0 | DONE (code) | `/api/payment-methods` returns display-only fields; no public settings row. |
| B13 | Legacy Vodafone order pages still render | P1 | DONE (code) | Provider-aware receipt viewer/uploader keeps the legacy endpoint. |

## C. Admin

| # | Item | Severity | Status | Evidence |
|---|---|---|---|---|
| C1 | Dashboard stats accurate + error states | P0 | DONE | Service-role stats, per-currency collected revenue, visible errors. |
| C2 | Vendor listing / moderation | P0 | DONE | Approved/suspended/rejected transitions. |
| C3 | Product CRUD + images | P0 | DONE | `/api/admin/products` + `/images`; MIME/size checks, cleanup. |
| C4 | Users/roles guards | P1 | DONE | Blocks self-demotion, last admin, `super_admin` changes. |
| C5 | Settings persisted | P1 | DONE | Validated upsert into `store_settings`. |
| C6 | Reviews UI fields | P1 | DONE | Uses `reviewer_name` / `body`. |
| C7 | Gallery management | P1 | DONE | Upload/edit/feature/delete/reorder. |
| C8 | Setup endpoint without `exec_sql` | P2 | DONE | Read-only probe; requires `ADMIN_SETUP_KEY`, otherwise 410. |
| C9 | Refund semantics | P1 | DONE | Pending-first, over-refund guard, service-role completion. |
| C10 | Custom print admin workflow | P1 | DONE | Signed artwork URLs, status, quote, notes, customer email. |
| C11 | Audit log | P2 | DONE | Role/store/order/refund/return/payout actions recorded. |
| C12 | COD cash-collection action | P0 | DONE (code) | Separate admin action; no receipt approval for COD; audited. |
| C13 | Generic wallet receipt review | P0 | DONE (code) | Server picks provider; approves/rejects; rejected evidence retained. |
| C14 | Wallet settings form | P1 | DONE (code) | Administrator can enable/provider/account/instructions; stored privately. |

## D. Payments / Email

| # | Item | Severity | Status | Evidence |
|---|---|---|---|---|
| D1 | New Stripe checkout sessions | P0 | **DISABLED** | `/api/checkout` returns `410` with no session. |
| D2 | Legacy Stripe webhook settlement | P0 | **DISABLED** | Returns `200 {received:true, ignored:true, settled:false}`; does not mutate payments. |
| D3 | Stripe success-page settlement | P0 | **DISABLED** | `/api/checkout/verify` returns `410`. |
| D4 | Legacy Vodafone Cash end-to-end | P0 | DONE (live) / guard UNAPPLIED | Existing RPC, private bucket, signed URLs, admin verify. Historical orders preserved; A22 prevents cross-method reuse. |
| D5 | Paymob | P1 | **DISABLED** | Not offered; webhook returns `410`. |
| D6 | Confirmation email from persisted items | P0 | DONE | `/api/orders` reloads `order_items`; HTML escaping; skips honestly when Resend is missing. |
| D7 | Checkout email collected/validated | P0 | DONE | Required + validated; prefilled from session. |
| D8 | `.env.example` safe + payment copy | P1 | DONE | Stripe/Paymob marked disabled; legacy Vodafone number documented. |
| D9 | COD collection flow | P0 | DONE (code) / **UNAPPLIED** DB | Pending payment at checkout; hardened `mark_cod_collected` only after cash is collected and also marks the order paid. |
| D10 | Generic external-wallet flow | P0 | DONE (code) / **UNAPPLIED** DB | Server-validated pending payment, private receipt, admin decision, controlled resubmit. |

## E. Security / Tests

| # | Item | Severity | Status | Evidence |
|---|---|---|---|---|
| E1 | Unit tests isolated from live DB | P0 | DONE | `npm test` runs 14 unit/contract suites; integration tests require a separate project. |
| E2 | RLS/Storage negative probes | P1 | DONE | Previous anon probes: receipts/refunds/custom-print return `[]`; writes/RPCs denied. |
| E3 | Payment contract tests | P0 | DONE | COD initiation, admin decisions, external wallet receipt validation, settings, disabled gateways, legacy cross-method rejection mapping. |
| E4 | Rate limiting | P1 | PARTIAL | Checkout, receipt upload, tracking, search, custom print; in-memory per instance. |
| E5 | No secret in client bundle | P0 | DONE | Service-role/provider keys absent from `.next/static` (previous scan). |
| E6 | `tsc`, lint, build, jest green | P0 | DONE | `tsc` pass; lint 0 errors / 22 warnings; 154 tests pass across 14 suites; build pass (latest run after final edits). |
| E7 | Refund/return RPC authorization | P1 | DONE | Admin-only transitions; finance RPCs service-role only. |
| E8 | Production server smoke test | P0 | **UNVERIFIED** | Previous build smoke test predates the COD/wallet flow. New flow needs staging/production smoke after migration. |

## F. External configuration still required

| Variable / task | Status |
|---|---|
| Wallet provider/account details | **MANUAL** — enter in Admin → Settings → Wallet transfers after migration. |
| `RESEND_API_KEY`, verified `EMAIL_FROM` | MANUAL / BLOCKED (missing); email is skipped and logged. |
| `NEXT_PUBLIC_BASE_URL` | MANUAL — needed for metadata/links, not for card checkout (card is disabled). |
| `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` | OPTIONAL — legacy historical orders only. |
| `ADMIN_SETUP_KEY` | OPTIONAL — setup probe is 410 when unset. |
| Stripe / Paymob credentials | **NOT REQUIRED** — both are intentionally disabled. |
| Redis/Upstash | UNVERIFIED — needed for multi-instance rate limiting. |

## G. Go-live gate

1. Review and apply `20261028_payment_methods_external_wallet.sql` and
   `20261029_order_payment_completion.sql` with explicit approval; test them on a disposable
   project first, including anon/non-admin RPC negative probes, the `confirm_order_payment`
   service-role-only check, a zero-total order, and the `set_order_shipping_method` anon
   rejection.
2. Configure the wallet account details in Admin → Settings.
3. Run one real COD order and one real external-wallet receipt end-to-end, including
   reject → resubmit → approve and a double-click/idempotency retry.
4. Confirm Resend delivery for confirmation/status/rejection emails.
5. Deploy only after the migrations and smoke tests pass.
6. Optional: generate a schema baseline (needs Docker) and move rate limits to Redis.

**Current verdict:** code and local verification are complete, but the database
migration is unapplied. External-wallet checkout is not deployable, and COD lacks the
hardened order-status update, until A18–A22 are applied and tested.
