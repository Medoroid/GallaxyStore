# Gallaxy Store — Final Production-Readiness Report

> Date: 2026-10-23 · Updated: 2026-10-29 · Project: `galaxy-store` (`httywgkwfqvrbuwuzutu`)
> Baseline: `CURRENT-STATE-AR.md` (unchanged) · Checklist: `docs/PRODUCTION-READINESS.md` · TODO: `docs/TODO.md`

## A. Executive summary

The payment refactor is complete **in application code**: new orders use Cash on Delivery
(COD) or a generic external-wallet transfer, receipts are private and reviewed by an admin,
and new Stripe/Paymob settlement is disabled. Local TypeScript, lint, tests and the
production build pass.

**The database migration is not applied.** The live project is still pre-migration:
`payment_provider` has no `external_wallet` value and `orders` has no `payment_method`
column. Older live `pay_with_cod` / `mark_cod_collected` functions exist; they do not
persist the method, and the older `mark_cod_collected` RPC itself only updates the payment.
However, the live `sync_order_payment_status()` trigger **does** flip a pending order to
`paid` as soon as a succeeded payment reaches the order total, so live COD collection marks
the order paid indirectly. External-wallet checkout calls RPCs that do not exist yet. The
current code is **not deployable as the final payment flow** until
`supabase/migrations/20261028_payment_methods_external_wallet.sql` **and**
`supabase/migrations/20261029_order_payment_completion.sql` are reviewed, approved and
applied. (`20261029` adds zero-total order completion and fixes the anonymous-caller hole in
`set_order_shipping_method`.) The fourth pass adds four more review-only migrations for
checkout coupon/shipping hardening, COD order-status transitions, payment-confirmation
`ON CONFLICT` inference, and the `product-images` bucket; see section J.

The 2026-10-25 fifth pass removed both unsafe zero-total service-role fallbacks, tightened
the zero-total and shipping-method RPCs, blocked a second succeeded payment reference,
made the COD status trigger reproducible, and added static/mocked regression coverage. It
also confirmed that no isolated Staging project was available, so no migration was applied.
See section K for the final order, the 12 Staging scenarios and the unexecuted commands.

No live database mutation, migration push, deployment or real payment was performed in
this work.

## B. What changed

### Checkout and order creation

- `/api/orders` accepts only `cod` and `external_wallet`.
- The server ignores browser-supplied totals, currency, owner and payment status.
- COD creates a **pending** payment through `pay_with_cod`; it is never marked paid at
  checkout.
- External wallet checks the private server setting before creating an order, then creates
  a pending payment through `initiate_external_wallet_payment`.
- Payment setup failures return the created order reference instead of pretending payment
  started; checkout shows that reference to the customer.
- A fully discounted (zero-total) order is completed as `paid` with no payment row, and the
  checkout/order pages render it as a free order.
- `POST /api/orders/[id]/payment` lets the owner resume a payment when the order was created
  but no payment attempt exists; the order page offers COD/wallet (or free completion).
- Order detail and order-list totals use the order's stored currency.

### Receipts and admin review

- `/api/payments/external-wallet` and the legacy `/api/payments/vodafone-cash` share one
  secure pipeline.
- The upload must belong to the signed-in user, under
  `<auth.uid>/<order_id>/`. The shared API enforces that exact prefix; the new
  external-wallet RPC re-checks it and rejects traversal/backslash paths even if the API
  is bypassed. The live legacy RPC only checks the user folder, so the migration's
  `guard_vodafone_receipt_method` trigger enforces the exact owner/order prefix and the
  real payment provider at the table boundary too.
- The server downloads the object through the user's JWT, enforces the 5 MB limit, and
  validates real image magic bytes (JPEG/PNG/GIF/WEBP/HEIC/HEIF/AVIF).
- Invalid objects are removed. Receipt submission only creates/updates a **pending**
  review record.
- Admin approval/rejection is one atomic RPC decision per attempt, records reviewer,
  timestamp and note, and keeps rejected evidence. The API requires an explicit
  `approve` boolean, so a malformed request cannot approve by accident.
- A customer may resubmit after rejection/timed-out review while the order is pending.
- The legacy Vodafone submission path is additionally guarded by a database trigger
  (unapplied until the migration is live): a Vodafone receipt cannot be attached to a
  COD/external-wallet order or to an order with a conflicting new-method payment, even
  when the old RPC is called directly.
- COD collection is separate: an admin must click “Mark cash collected”, which calls
  `mark_cod_collected` and is audited.

### Provider settings and UI

- Wallet details are stored once in the private `store_settings.external_wallet` row.
- `/api/payment-methods` returns only display fields to authenticated users.
- Checkout shows COD + wallet only and disables wallet until complete settings exist.
- Order detail supports new external-wallet orders and historical Vodafone orders.
- Admin orders include wallet review and COD collection panels; admin settings includes
  the wallet form.
- FAQ, privacy and `.env.example` copy no longer claim Stripe card processing is active.

### Disabled gateways

- `/api/checkout` and `/api/checkout/verify` return `410`.
- `/api/stripe/webhook` returns `200 {received:true, ignored:true, settled:false}` so
  legacy endpoints stop retrying without settling anything.
- Paymob remains `410`.
- Historical Stripe/Paymob/Vodafone payments and enum values are untouched.

### Database migration (reviewed, unapplied)

`supabase/migrations/20261028_payment_methods_external_wallet.sql`:

- adds enum value `external_wallet`;
- adds `orders.payment_method` with backfill/check/index;
- replaces the older live `pay_with_cod` with a hardened, idempotent version;
- adds `initiate_external_wallet_payment`;
- adds `submit_external_wallet_receipt`;
- adds `verify_external_wallet_payment`;
- replaces `mark_cod_collected` so it also updates the order status;
- adds `guard_vodafone_receipt_method` so the legacy Vodafone RPC cannot attach a
  receipt to a COD/external-wallet order or a conflicting new-method payment, and so a
  direct RPC call cannot forge the owner/order prefix or provider;
- revokes the default `PUBLIC` grant as well as `anon` from every payment RPC it
  (re)creates, and grants `authenticated, service_role`;
- locks `mark_cod_collected` order-before-payment (matching the other RPCs) and refuses
  to settle a COD payment when another payment already succeeded;
- refuses to approve an external-wallet receipt when another payment already succeeded;
- revokes `PUBLIC`/`anon`/`authenticated` execute from `confirm_order_payment` and keeps
  it `service_role`-only (the live `20261023` grant missed the default `PUBLIC` grant);
- keeps legacy Vodafone RPCs and historical data.

## C. Verification evidence

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass (no output) |
| `npm run lint` | Pass; **0 errors**, 22 `react-hooks/set-state-in-effect` warnings |
| `npm test` | **32 suites / 275 tests pass** (adds the fifth-pass migration guards and fallback-removal contracts) |
| `npm run build` | Pass; Next.js 16.2.9 compiled all routes, including `/api/checkout/preview`, `/api/vendor/products/images` and `/api/vendor/shipments` |
| Apply `20261028_payment_methods_external_wallet.sql` | **NOT RUN** |
| Live DB mutation | **NONE** |
| Deploy / production smoke of new flow | **NOT RUN** |
| `supabase db dump --linked` | Blocked: Docker unavailable |

Read-only live inspection confirmed the pre-migration state:

- `payment_provider` enum values: `stripe`, `paymob`, `cod`, `wallet`, `vodafone_cash`.
- `orders` has no `payment_method` column.
- Older `pay_with_cod` / `mark_cod_collected` functions exist; the new external-wallet
  functions do not.
- The live legacy `submit_vodafone_cash_receipt` has no `orders.payment_method` or
  conflicting-new-method check, and `guard_vodafone_receipt_method` does not exist; the
  migration adds the guard trigger.
- The live legacy `submit_vodafone_cash_receipt` / `verify_vodafone_cash_payment` and
  `confirm_order_payment` still carried the default `PUBLIC` execute grant (the earlier
  `revoke ... from anon, authenticated` did not remove it). `20261028` removes `PUBLIC`.
- `confirm_order_payment` has no owner/admin check and can mark any pending order paid,
  which made the `PUBLIC` grant a real payment bypass; it is now `service_role`-only.
- `payments`/`payment_receipts` constraints and unique indexes match the assumptions used
  by the migration.
- Some read-only CLI retries failed with the temporary-role authentication error; no
  mutation was attempted.

New/updated contract suites cover:

- COD creation as pending, idempotent retry and server-only amounts;
- rejection of Stripe/Paymob/legacy wallet methods before order creation;
- wallet-disabled and wallet-enabled order initiation;
- owner-scoped receipt paths, missing objects, invalid image bytes, oversize uploads;
- duplicate transfer reference and foreign-order errors;
- admin approval, rejection, duplicate decision, COD collection and non-admin denial;
- disabled Stripe webhook/verify behavior;
- private settings normalization and display-only shape;
- legacy Vodafone receipt endpoint and its cross-method rejection mapping.

## D. Security posture

- **Trust boundaries:** ownership, amount, currency, payment method, provider selection,
  receipt status and final paid state are decided server-side. Browser redirects and
  receipt uploads never settle an order.
- **Private files:** receipts stay in the private `payment-receipts` bucket; access is
  owner/admin only and served through short-lived signed URLs.
- **Admin surface:** payment decisions call `is_admin()`-guarded RPCs; the API also checks
  admin status before invoking them. COD collection is a separate action.
- **Audit:** approval, rejection and cash collection are recorded in `admin_audit_log`
  (best effort; a failed audit write does not roll back a committed business action).
- **RPC ACLs:** every payment RPC explicitly revokes the default `PUBLIC` grant; the
  browser-executable ones are granted to `authenticated` and rely on their in-function
  owner/admin checks, while `confirm_order_payment` is `service_role`-only.
- **Secrets:** service-role and provider secrets remain server-only. Card providers are
  disabled rather than half-configured.

## E. Not done / blocked

| Item | Status | Why |
|---|---|---|
| Apply the six new migrations | **Blocked** | No isolated Staging project was proven; requires explicit approval. Live DB must not be mutated by this work. External-wallet checkout fails until then, and COD still uses the older RPC (the live trigger does mark a fully paid pending order `paid`, but the method is not persisted and there is no duplicate-settlement guard). |
| Staging/production COD + wallet test | **Not run** | Needs applied migration + deployed build. |
| Wallet provider/account details | **Manual** | Business data; configure in Admin → Settings. |
| Resend delivery verification | **Manual** | Requires API key/verified sender. |
| Full schema baseline | **Blocked** | Docker unavailable for `supabase db dump`. |
| Distributed rate limiting | **Implemented, live-unverified** | `lib/rate-limit.ts` uses Upstash Redis REST when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set, otherwise a per-instance fallback; sensitive routes fail closed if a configured store is unreachable. No credentials were available for a live test. |

## F. Deployment sequence

1. Review and apply `20261028_payment_methods_external_wallet.sql`,
   `20261029_order_payment_completion.sql` and the four `20261030_*` migrations to a
   disposable/staging project, in timestamp order.
2. Run the SQL contract flows there: COD create → collect; wallet create → receipt →
   reject → resubmit → approve; duplicate and double-click retries; a legacy Vodafone
   order; a zero-total order; a COD shipment → delivered order; and `anon`/non-admin
   negative probes against every payment RPC and `confirm_order_payment`.
3. Apply the reviewed migrations to production with approval.
4. Configure Admin → Settings → Wallet transfers.
5. Deploy the application.
6. Run one real low-value COD order and one real wallet transfer; confirm emails.
7. Keep card checkout disabled until a separate, explicitly scoped gateway project.

## G. Verdict

**Code and local verification: complete for this pass.** **Production deployment: blocked**
on the unapplied migrations, the unproven isolated Staging environment and the manual
wallet/email configuration above. External-wallet checkout is not live, COD still uses the
older RPC, and the 12 Staging scenarios have not run. Do not claim the new payment flow is
live until those steps are completed.

## H. Second pass (2026-10-24)

A follow-up read-only review fixed non-payment defects found across the customer and
vendor surfaces (all local; still no DB mutation):

- Crash/robustness: missing `logger` import in `app/api/admin/route.js`; the vendor
  layout guard accepting 401/403/500 as a valid vendor; the admin product update zeroing
  a variant's stock when `stock_quantity` was omitted.
- Vendor wiring: the stats route now returns `products` and `recent_orders`, and the
  dashboard/products/orders/shipments/printing/earnings pages were aligned to the real
  field names and view columns. Vendor payouts now derive the store from the session
  (the browser cannot pick a store) and surface errors.
- Customer flows: the returns page now loads order items (the list endpoint never
  embedded them); wishlist/cart images resolve to public storage URLs; the wishlist and
  product-card hearts are wired to the real API; order/track status maps and admin
  status options match the real enums.

See `docs/TODO.md` → “Second-pass fixes” for the file-by-file list.

## I. Third pass (2026-10-24)

All changes are local; no database mutation or migration was applied.

### Vendor product editor

- New `app/api/vendor/products/route.js` serves the owner's own products and
  category/brand lookups, and creates/updates/archives products. The store id comes only
  from the authenticated owner; a product belonging to another store returns 404. Partial
  updates merge with the existing row, so a name-only save keeps the description,
  category, price, colors and images. Images and the default variant (price/stock) are
  synchronised.
- `lib/product-admin.ts` now holds the shared validation/variant/image helpers used by
  both the admin and vendor product routes; the admin behavior is unchanged.
- `app/vendor/products/page.tsx` is a real editor with price, category, stock, status,
  visibility, colors, descriptions and image URLs, plus loading/error/success feedback and
  archive confirmation. It no longer redirects to the admin panel.

### Vendor orders

- New `app/api/vendor/orders/route.js` groups `vendor_order_items` for the session store,
  returns line items and currency, and resolves a customer display name through a
  restricted service-role `profiles` lookup limited to customer ids in this store's own
  items. Email, phone and delivery address are not selected or returned.
- `app/vendor/orders/page.tsx` uses the new endpoint, shows the customer name and
  currency, expands item details in place (the old eye link pointed at the customer-only
  order page), filters by status, and links the truck action to `/vendor/shipments`.

### Reviews

- Vote/report endpoints now validate UUIDs and inputs, require auth, check the review
  exists, reject voting/reporting your own review, reject duplicate votes/open reports
  with 409, map RPC errors, and apply rate limits.
- The review list surfaces success/failure for vote, report and delete, prevents duplicate
  actions in the UI, shows vote counts, and disables buttons while pending.

### Server totals and shipping

- `/api/orders` always resolves `get_shipping_options` for the destination. A selected
  method must exist; its fee is used and the body's fee is ignored. If options exist,
  omitting a method is rejected. If the destination has no options, the fee remains 0.
- Checkout no longer invents a 49/0 fallback; it displays the selected server option.
- New contract tests assert an unavailable method is rejected and the checkout RPC
  receives the fee from `shipping_rates`, not the browser.

### Rate limiting

- `lib/rate-limit.ts` keeps the fixed-window in-memory limiter and adds
  `checkRateLimitAsync`, which uses Upstash Redis REST (`/pipeline` INCR + PEXPIRE NX,
  1.5s timeout) when configured. `getClientIp` centralises address extraction.
- Checkout, order payment, wallet, receipt upload, cancel, returns, custom-print and
  tracking fail closed when a configured store is unreachable; search, reviews and vendor
  reads/writes fall back to the local limiter. Without Upstash credentials the local
  limiter is used and a single warning is logged.

### Other

- Vendor earnings now surfaces load errors with retry and formats the completed-payout
  total as currency.
- Vendor printing now surfaces queue errors with retry.

The same production gates apply: the payment migrations and the four `20261030_*` review
migrations remain unapplied, external wallet checkout is not live, and no
staging/production payment smoke test has run.

## J. Fourth pass (2026-10-24)

All changes in this pass are local. No live database write, migration push, deployment or
real payment was performed.

### Fixed functions and reasons

- `lib/checkout-calculations.ts` — `couponValidationError()` and
  `computeCouponDiscount()` used `Number(null)`, which is `0`. An unlimited coupon was
  rejected as exhausted, and an uncapped percentage coupon was capped at zero. Missing
  limits are now distinguished from real zero values. `couponValidationError()` also
  checks `starts_at` and `min_order_amount` with the same null-safe rule.
- `lib/shipments.ts` — `estimateDeliveryDates(null, …)` produced “today” for a missing
  delivery window. Null/empty windows now produce no estimate. Re-sending `delivered`
  keeps the original `delivered_at` and `actual_delivery_date` instead of moving the
  delivery date to today.
- `app/api/checkout/preview/route.js` — a failed tax, gift-wrap or shipping RPC no longer
  becomes a silent zero in the displayed total; the preview returns 503, matching the
  checkout RPC. A failed coupon-usage lookup marks the coupon unverified instead of
  showing a discount that may be rejected.
- `app/api/orders/route.js` — a failed `cart_totals` lookup returns 503 instead of
  calculating shipping from a zero subtotal. The selected shipping method is saved
  before payment starts; if it cannot be saved, the response returns the order reference
  and does not start a payment.
- `app/api/orders/[id]/payment/route.js` — validates the order UUID, checks the
  external-wallet RPC capability before starting a wallet payment, and has the same
  guarded service-role fallback for zero-total orders when
  `complete_zero_total_order()` is missing.
- `app/api/vendor/shipments/route.js` — a pending order can be shipped only when the
  payment rows prove it is COD; a payment lookup failure returns 503. A shipment moves a
  paid or pending-COD order to `processing`, and the aggregate shipped transition accepts
  `paid`, `processing` or `printing`.
- `app/api/vendor/products/route.js` — product writes reject an `images` field; all image
  writes must go through the validated image API.
- `app/api/vendor/products/images/route.js` — deletes the database row before the storage
  object, rollback cleanup logs each independent failure, and `set_primary` restores the
  previous primary image if the target update fails.
- `lib/product-image-upload.ts` — generated storage identifiers are sanitized so a
  caller-supplied identifier cannot inject path segments.
- `app/api/vendor/payout/route.js` — added a fail-closed rate limit to the payout POST.
- Vendor product/image/shipment writes now use `failureMode: "fail_closed"`.

### Review migrations added (all unapplied)

| Migration | Purpose |
|---|---|
| `20261030_checkout_coupon_shipping_hardening.sql` | Recompute/validate the coupon at checkout, check `starts_at`, validate the fee against destination methods. |
| `20261030_order_status_cod_transitions.sql` | Add `pending → processing`, `paid → shipped`, `processing → shipped`. |
| `20261030_confirm_order_payment_partial_index.sql` | Add the matching partial-index predicate to `ON CONFLICT`. |
| `20261030_product_images_bucket.sql` | Reproduce the public `product-images` bucket and owner policies. |

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass; 0 errors, 22 warnings (`react-hooks/set-state-in-effect`) |
| `npm test` | 32 suites / 275 tests pass |
| `npm run build` | Pass; Next.js 16.2.9 |
| Live DB mutation | **None** |
| Apply `20261028` / `20261029` / `20261030_*` | **Not run** (requires approval) |
| Staging COD + wallet + shipment flow | **Not run** |

Local verification means TypeScript, ESLint, Jest and the production build. The Jest
contract tests mock Supabase; they are not proof of live RPC behavior. Live checks were
read-only: `carts` has `currency`, `coupon_id`, `coupon_code`, `discount_amount`; the
`product-images` bucket is public, 10 MB, allows png/jpeg/webp/gif/avif, and its
insert/update/delete policies use `owns_product`. No migration or production row was
changed.

### Open defects / blocked items

- COD order status progression needs `20261030_order_status_cod_transitions.sql`; until
  then the shipment is created but the order status update is best-effort and may not
  reach `processing`/`shipped`.
- Checkout coupon/shipping hardening is only in the review migration; the live RPC still
  trusts `carts.discount_amount`, does not check `starts_at`, and validates the fee too
  loosely for direct callers.
- `confirm_order_payment` can fail until the partial-index migration is applied.
- External wallet remains unavailable until `20261028` is applied and configured.
- Distributed rate limiting remains unverified without Upstash credentials.
- Resend and wallet account details remain manual configuration.
- Full schema dump remains blocked because Docker is unavailable.

### Production status

**Production was not changed.** The live project was inspected read-only only. The
application is locally verified but should not be deployed as the final payment/fulfilment
flow until the listed migrations are reviewed, applied to an isolated staging project,
smoke-tested, and then applied to production with approval.

## K. Fifth pass (2026-10-25) — Staging-readiness audit

### K.1 Scope and connection identity

- **LOCAL:** repository review, SQL review, mocked/static Jest contracts, TypeScript, ESLint
  and the production build. No database was contacted for these checks.
- **READ-ONLY LIVE:** the connected project ref is `httywgkwfqvrbuwuzutu` (confirmed from
  `.env`/`.env.local`, the JWT claims and the `sb-project-ref` response header). Only Data API
  metadata, Storage bucket metadata and read-only RPC calls were used. No secrets are
  reproduced here.
- **STAGING:** **not available/proven.** There was no Management API token, linked project,
  direct Postgres/`DATABASE_URL`, `psql`, working Docker stack or active Supabase MCP. The
  exact SQL identity query has not been executed against a Staging target. All database writes
  and migration applications remain blocked.
- **PRODUCTION:** untouched. No `db push`, `migration up`, SQL mutation, deployment or paid
  resource was performed.

### K.2 Confirmed local defects fixed in this pass

| Defect | Fix |
|---|---|
| Both order routes used a service-role fallback when `complete_zero_total_order()` was missing. The filtered update could match zero rows while the API still returned success. | Removed the fallback. Missing RPC now returns `503` with the order reference and leaves the order pending. The RPC result must be a `paid` order before success is returned. |
| `complete_zero_total_order()` accepted a null or negative total (`coalesce(total,0) > 0`). | Guard is now `v_order.total is distinct from 0`; only an exact zero total can complete. |
| `set_order_shipping_method()` could change a paid/processing order and did not bind the method to the charged fee. | It now locks the order, requires `status = 'pending'`, rejects deleted/non-owner orders, verifies the method is offered for the destination, and requires the option fee to equal `orders.shipping_fee`. |
| `confirm_order_payment()` could settle a second, different payment reference after an order already had a succeeded payment. | Added a `succeeded`-payment guard while preserving same-reference webhook idempotency. Also rejects null/zero/negative amounts before the mismatch check. |
| `20261030_order_status_cod_transitions.sql` replaced the transition function but did not create its trigger in a fresh database. | Added a guarded `DO` block that creates the trigger only when no trigger already calls `validate_order_status_transition`; revoked default `PUBLIC` execute. |
| Checkout coupon recomputation assumed non-null `used_count`, a supported type and a non-null/non-negative value. | Added null-safe `used_count`, explicit type/value checks and null-safe increment. |
| `image/jpg` uploads were accepted by the app but sent to Storage with a MIME type the bucket does not allow. | Normalized `image/jpg` to `image/jpeg` before upload; updated the contract test. |
| `20261029`, the checkout hardening and the bucket migration could install objects that only fail at runtime when a live baseline helper is missing. | Added `to_regprocedure(...)` preflight guards for `get_shipping_options` and `owns_product` that fail the migration early with a clear dependency error. |
| Stale tests expected the removed service-role fallback and the old negative-total guard. | Updated the endpoint and migration contract tests; added static guards for the duplicate-payment, trigger-creation and dependency guards. |

SQL review also confirmed that every new `SECURITY DEFINER` function sets
`search_path = public`; payment RPCs revoke `PUBLIC`/`anon` and grant only
`authenticated, service_role` (with `confirm_order_payment` kept `service_role`-only).
The receipt table has no customer INSERT/UPDATE/DELETE policy, so writes go through the
`SECURITY DEFINER` RPCs. The partial unique index `payments_provider_ref_uidx` is the one the
`ON CONFLICT` predicate targets.

### K.3 Read-only live evidence

- `20261023_production_readiness.sql` is **applied** (inferred from the live schema and
  functions). `payment_receipts` exists; the migration defines its unique reference index.
  `orders.shipping_method_id` and `confirm_order_payment` exist. The live index definition
  itself was not directly queried (no Postgres/Management API access).
- `20261028` and later are **not applied**: `orders.payment_method` is absent,
  `complete_zero_total_order` is absent, and `initiate_external_wallet_payment`,
  `submit_external_wallet_receipt` and `verify_external_wallet_payment` are absent. The live
  `confirm_order_payment` is the older version.
- `get_shipping_options(text, numeric, integer)` exists live and returns
  `method_id`, `method_name`, `method_type`, `carrier`, `fee`, delivery days and `is_free`.
  For `Egypt`, subtotal `100`, it returned Standard fee `0` and Express fee `12.99`.
  A probe with country `Nowhere` returned the same options, so the live function appears to
  ignore country and use the default zone. This is a live behavior risk, not a repo migration
  definition.
- `cart_totals` is queryable through the Data API (`200`) even though it is absent from the
  OpenAPI definitions; it is not a missing relation. Its definition is a live baseline object,
  not defined by a repository migration.
- The live `product-images` bucket is public, 10 MB, and allows
  `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`; this matches
  `20261030_product_images_bucket.sql`.
- A read-only coupon sample showed types `percentage` and `fixed`; no coupon codes or customer
  data were selected.
- `orders.user_id` is required by the live schema and the read-only null-owner count was `0`.
  The 20261029 ownership checks use `is distinct from`; the 20261028 checks use `<>` on a
  non-null column.

### K.4 Final migration order

The six new files are `20261028`, `20261029` and the four `20261030_*` files. Apply them in
this order, after restoring/verifying the baseline objects they depend on:

| Order | Migration | Dependency / note |
|---|---|---|
| 1 | `20261023_production_readiness.sql` | **Already live.** Base receipts, checkout, confirm, grants. |
| 2 | `20261024_custom_print_requests.sql` | Baseline dependency; already part of the sequence. |
| 3 | `20261025_refund_hardening.sql` | Refund/status interactions; baseline dependency. |
| 4 | `20261026_admin_audit_log.sql` | Audit writes used by admin payment actions. |
| 5 | `20261028_payment_methods_external_wallet.sql` | Requires `payment_receipts`, `orders.shipping_method_id`, `orders.user_id NOT NULL`. |
| 6 | `20261029_order_payment_completion.sql` | Adds zero-total completion and the hardened shipping-method RPC. |
| 7 | `20261030_checkout_coupon_shipping_hardening.sql` | Requires live `get_shipping_options(text,numeric,integer)` contract; not repo-defined. |
| 8 | `20261030_confirm_order_payment_partial_index.sql` | Requires the `payments_provider_ref_uidx` partial index from 20261023. |
| 9 | `20261030_order_status_cod_transitions.sql` | Requires the existing order-status function/trigger baseline; installs the trigger if absent. |
| 10 | `20261030_product_images_bucket.sql` | Requires `public.owns_product` and the Storage schema. |

The four `20261030_*` files sort lexicographically in this same order (checkout, confirm,
order_status, product-images), so a normal timestamp runner is deterministic.

### K.5 Proposed Staging commands — **NOT EXECUTED**

These are placeholders only. None was run. Replace `<STAGING_REF>` with a verified isolated
Staging project ref; never use the production ref. Do not paste secrets into logs.

```bash
# NOT EXECUTED — prove the target before any write.
supabase projects list
supabase link --project-ref <STAGING_REF>
supabase migration list --linked

# NOT EXECUTED — read-only identity check; expected result must identify Staging.
# select current_database(), current_user, current_setting('server_version');

# NOT EXECUTED — inspect the plan first.
supabase db push --dry-run

# NOT EXECUTED — take a restorable Staging backup (pg_dump runs in a container; Docker required).
supabase db dump --linked -f staging-before-20261028.sql

# NOT EXECUTED — apply only after the target, backup and approval are proven.
supabase db push

# NOT EXECUTED — verify the objects after apply.
# select proname, prosecdef, proconfig from pg_proc
#  where pronamespace = 'public'::regnamespace
#    and proname in ('complete_zero_total_order','set_order_shipping_method',
#                    'confirm_order_payment','validate_order_status_transition');
# select indexname, indexdef from pg_indexes
#  where schemaname = 'public' and tablename = 'payments';
# select tgname, tgenabled from pg_trigger
#  where tgrelid = 'public.orders'::regclass and not tgisinternal;
# select grantee, privilege_type from information_schema.routine_privileges
#  where routine_schema = 'public'
#    and routine_name in ('complete_zero_total_order','set_order_shipping_method',
#                         'confirm_order_payment');
```

Blocked prerequisites for these commands: no isolated Staging project was proven, no
Management API token, no linked project, no direct Postgres/`DATABASE_URL`, no `psql`, and no
working Docker/CLI database path. Creating Staging would require a separate Supabase project
(not provisioned here), the live-only baseline objects (`get_shipping_options`, `cart_totals`,
the order-status trigger and `owns_product`), synthetic seed data only, and an approved
CLI/Management API credential. Do not copy production PII into Staging.

### K.6 Staging scenario matrix (12)

All rows are **STAGING — NOT RUN** unless the evidence column explicitly says local. Local
tests mock Supabase or statically inspect SQL; they are not live RPC/RLS proof.

| # | Scenario | Expected result | Evidence |
|---|---|---|---|
| 1 | COD create → admin collect → duplicate collect | Order stays `pending` with a pending COD payment; admin collection makes it `paid`; a second collection is idempotent and never creates a second succeeded payment. | LOCAL contract tests; STAGING not run |
| 2 | Shipping method rejection | Unknown method, method not offered for destination, fee/method mismatch, or change after payment starts is rejected; order remains pending and payable. | LOCAL static/endpoint tests; STAGING not run |
| 3 | Forged totals/currency | Browser-supplied amount, total, currency or owner is ignored; checkout recomputes from DB prices; invalid shipping fee or mismatched payment amount is rejected. | LOCAL contract tests; STAGING not run |
| 4 | Coupon edge cases | Expired/future/disabled/maxed/per-user-maxed/unsupported/negative-value coupons are rejected; checkout recomputes the discount and increments `used_count` once. | LOCAL calculations/static tests; STAGING not run |
| 5 | Zero-total order | Order completes `paid` with no payment row; retry is idempotent; missing `complete_zero_total_order` returns `503` and leaves it pending; negative/null total is rejected. | LOCAL endpoint/static tests; STAGING not run |
| 6 | Duplicate payment/webhook | Same provider reference is idempotent; a different reference after a succeeded payment is rejected; the partial index `ON CONFLICT` inference works. | LOCAL static tests; STAGING not run |
| 7 | External-wallet receipt | Submit → pending receipt; approve → payment/order paid; reject → resubmit; duplicate reference across orders rejected; missing/foreign receipt path rejected. | LOCAL contract tests; STAGING not run |
| 8 | Missing COD proof | Admin cannot collect without a matching COD payment; non-admin cannot collect; a wallet/other-provider payment cannot be collected as COD; no paid order results. | LOCAL contract/static tests; STAGING not run |
| 9 | Invalid status transitions | `pending → shipped`, `cancelled → paid` and other disallowed transitions are rejected; `pending → processing`, `paid → shipped` and `processing → shipped` are allowed. | LOCAL static tests; STAGING not run |
| 10 | Cross-user access | User B cannot read/pay/complete/set the shipping method for user A's order or read A's receipt; RLS and owner checks both deny. | LOCAL contract tests; STAGING not run |
| 11 | Unauthorized RPC calls | `anon` cannot call owner RPCs; `authenticated` cannot call `confirm_order_payment`; non-admin cannot verify receipts or collect COD; default `PUBLIC` execute is absent. | LOCAL static/contract tests; STAGING not run |
| 12 | Dependency failure | Missing `get_shipping_options`, `complete_zero_total_order`, order-status trigger or bucket/policies fails closed or returns a recoverable `503`; no false success, no partial paid state. | LOCAL static/endpoint tests; STAGING not run |

### K.7 Actual verification results

| Check | Result | Label |
|---|---|---|
| `npx tsc --noEmit` | Pass, no output | LOCAL |
| `npm run lint` | Pass; 0 errors, 22 existing `react-hooks/set-state-in-effect` warnings | LOCAL |
| `npm test` | **32 suites / 275 tests pass** | LOCAL (mocked/static) |
| `npm run build` | Pass; Next.js 16.2.9 compiled all routes | LOCAL |
| Live schema/function reads | `20261023` present; `20261028+` absent; live `get_shipping_options` contract and bucket config inspected | READ-ONLY LIVE |
| Apply migrations | **NOT RUN** | STAGING BLOCKED |
| Staging 12 scenarios | **NOT RUN** | STAGING BLOCKED |
| Production write/deploy | **NONE** | PRODUCTION UNTOUCHED |

### K.8 Remaining risks / blocked items

- **No isolated Staging proof.** The connected project cannot be proven to be Staging, so no
  migration was applied. The exact SQL identity query remains unexecuted.
- **Baseline objects are not in the repository.** `get_shipping_options`, `cart_totals`, the
  order-status trigger and `public.owns_product` are live baseline objects. A fresh project
  must restore them before these migrations are meaningful. The checkout and shipping-method
  migrations now fail early with a `to_regprocedure` dependency error when
  `get_shipping_options` is absent; the bucket migration does the same for `owns_product`,
  instead of installing runtime-broken objects.
- **Live shipping behavior ignores country** in the read-only probe; it returned the default
  zone for `Nowhere`. International fee validation therefore needs Staging evidence.
- **A destination with no offered method still allows a zero-fee order with no
  `shipping_method_id`.** That is the existing behavior and may be intentional for pickup or
  unsupported destinations, but it needs an explicit business decision and a Staging check.
- **Vendor shipment creation can choose a different active shipping method from the order**
  and writes `shipping_fee_charged: 0`. There is no service-level/fee reconciliation in that
  route. This is pre-existing behavior, not changed in this pass, and needs a business rule.
- **Coupon `used_count` ownership is unverified.** The checkout migration increments
  `used_count`; if the live `apply_coupon` also increments it, usage could be double-counted.
  This was not tested live and must be checked in Staging.
- **RLS/RPC behavior is unproven live.** Jest mocks do not prove PostgREST grants, RLS,
  trigger execution or Storage policies.
- **Legacy `confirm_order_payment` still accepts `cod`/`wallet` for `service_role`.** That is a
  trusted-server boundary, but Staging should confirm no browser-reachable grant remains.
- **No deployment.** The application is locally verified but must not be deployed as the final
  payment/fulfilment flow until the Staging matrix passes.

### K.9 Production and deployment confirmation

Production was not changed. No migration was applied, no `db push` or `migration up` was run,
no SQL mutation was executed, no application was deployed, and no paid resource was created.
All live evidence in this report is read-only. No environment secret, token, database password
or customer data was printed.

---

## L. Sixth-pass audit — 2026-10-29 (migration history, code↔schema trace, two local fixes)

Labels: **LOCAL** = proven from local source, files and test runs · **READ-ONLY-LIVE** =
proven by `SELECT`-only queries against the production project · **STAGING-NOT-RUN** = defined
but deliberately not executed · **UNVERIFIED** = cannot be proven in this environment.

### L.1 Scope

Stage 1: how the Supabase CLI decides what to run, and repo-vs-live migration drift.
Stage 2: end-to-end trace of checkout preview → totals → shipping → coupon → order creation →
COD/wallet/zero-total payment → receipt verification → shipment/status transitions →
product-image storage, checking each app call against the **live** schema, not against the repo.
Stage 3: does an isolated staging environment exist? No migration, write, or deploy was
performed anywhere.

### L.2 Environment identity — the blocking safety fact (READ-ONLY-LIVE)

| Check | Result |
| --- | --- |
| `get_project_url` (Supabase MCP) | `https://httywgkwfqvrbuwuzutu.supabase.co` = production |
| `supabase/.temp/project-ref` | `httywgkwfqvrbuwuzutu` |
| `supabase/.temp/linked-project.json` | ref `httywgkwfqvrbuwuzutu`, name `galaxy-store` |
| `list_branches` | `[]` — no development branch, no staging |

**The Supabase CLI in this working copy is linked to production**, and no isolated staging
project or branch exists. Any `supabase db push`, `migration repair`, `db dump` or `migration up`
run from this directory would target production. None of them was run (L.9).

### L.3 How the CLI decides what actually runs (LOCAL)

Read from Supabase CLI 2.117.0 source (`list.go` / `file.go`):

- A migration filename must match `^([0-9]+)_(.*)\.sql$`; the **version** is the digit run before
  the first `_`. An 8-digit prefix such as `20261030` is a valid version.
- Files that do not match are skipped with a warning — the seven `create_*.sql` files never run.
- "Pending" = the version string is absent from remote `supabase_migrations.schema_migrations`,
  whose **primary key is `version`** (verified live). There is no ordering guard and no
  dependency graph; pending files run in filename order, each in one implicit transaction.
- Therefore: a file can be *pending* even though the same work is already live under a
  different (14-digit) version id, and two files sharing a prefix share a single version slot.

### L.4 Migration drift: repository vs live history (READ-ONLY-LIVE)

Live `schema_migrations` ends at `20261026` (plus 14-digit ids such as `20260916151525`). Repo
versions already applied live: `20261001`, `20261002`, `20261023`, `20261024`, `20261025`,
`20261026`.

| Repository file | Parsed version | Live status | Verdict |
| --- | --- | --- | --- |
| `20260907_create_admin_users_secure` | `20260907` | not in history | legacy **pending** — must not run |
| `20260907_create_gallery_images` | `20260907` (dup) | not in history | legacy pending + **duplicate version** |
| `20260909_add_cart_color_size` | `20260909` | not in history | legacy pending |
| `20260909_fix_cart_items_color_size` | `20260909` (dup) | not in history | legacy pending + duplicate version |
| `20260909_fix_cart_items_detailed_view` | `20260909` (dup) | live has `20260909091603 secure_cart_views_add_product_image` | legacy pending + duplicate version |
| `20260910_fix_cart_stock_search_reviews` | `20260910` | live has `20260909223707 …_v2` | legacy pending (older duplicate) |
| `20260910_fix_checkout_security` | `20260910` (dup) | not in history | legacy pending + duplicate version |
| `20260911_security_fixes` | `20260911` | not in history | legacy pending |
| `20260913_fix_confirm_order_payment_security` | `20260913` | not in history | legacy pending — creates a **5-arg overload** of `confirm_order_payment` next to live's 6-arg version → PostgREST ambiguity; its `ON CONFLICT` also lacks the partial-index predicate |
| `20260916_fix_broken_endpoints` | `20260916` | live has `20260916151525 fix_broken_endpoints_20260916` | legacy pending (older duplicate) |
| `20260916_fix_rvp_and_seed_gallery` | `20260916` (dup) | not in history | legacy pending + duplicate version |
| `20260917_optimize_rls_auth_uid` | `20260917` | not in history | legacy pending |
| `20260930_grant_orders_select` | `20260930` | live has `20260930204023 grant_select_orders_to_authenticated` | legacy pending (older duplicate) |
| `20261001_order_shipping_method` | `20261001` | applied | keep |
| `20261001_vodafone_cash` | `20261001` (**collision** with the applied file) | version already recorded | **silently skipped**. Do not "repair" it: it returns `payments` from `submit/verify_vodafone_cash_payment` while live returns `payment_receipts` → `CREATE OR REPLACE` would fail |
| `20261002_backfill_product_variants` | `20261002` | applied | keep |
| `20261002_payment_receipts_table` | `20261002` (collision) | version already recorded | silently skipped. Do not "repair" it: it redefines `verify_vodafone_cash_payment` with `p_receipt_id` semantics (the admin route passes an order id) and its `create policy` calls are not idempotent |
| `20261002_payment_reconciliation_guard` | `20261002` (collision) | live has `20261002154524 payment_reconciliation_provider_guard` | silently skipped; work already live |
| `20261023`…`20261026` | applied | applied | keep |
| `20261028`, `20261029`, `20261030` ×4 | pending | pending | the six intended migrations |
| `create_*.sql` ×7 | no version | — | skipped by the CLI (filename pattern) |
| `20260913_comprehensive_audit_fixes_ARCHIVED_DANGEROUS` | — | was pending | **moved out** — see L.5 |

**Pushing this directory to production as-is is not safe.** 13 legacy files are pending, four
pairs/triples share a version (`schema_migrations` is keyed by `version`, so the second file of
each duplicate pair cannot be recorded and the push would abort *after* the first file of the
pair had already been applied to production), and at least one of them would downgrade live
functions. This is a hard, verified blocker — not a theoretical risk.

### L.5 Confirmed defects fixed locally (LOCAL)

**Fix 1 — `20260913_comprehensive_audit_fixes_ARCHIVED_DANGEROUS.sql` moved to
`supabase/migrations-archived/`.** Evidence that running it would damage any target:
- Its `apply_coupon` reads `coupons.usage_limit`, a column the live `coupons` table does not
  have (`type`, `value`, `max_uses`, `max_uses_per_user`, `starts_at` verified live) → **every
  coupon apply would error** the moment it ran.
- On push, `20261023` is already recorded as applied and would be *skipped*, so nothing would
  restore `apply_coupon`, `can_access_cart`, `calculate_tax` or `get_shipping_options` afterwards.
- It installs a second order-status trigger (`trg_log_order_status` next to the live
  `log_order_status`) and drops/recreates views (`orders_status_history`, `shipping_tracking`).
- On a fresh database it creates the **wrong `coupons` shape** (`discount_type`/`usage_limit`),
  which the current `checkout()` cannot use → checkout breaks even on a clean staging build.
The file is preserved intact in `supabase/migrations-archived/`; nothing was deleted.

**Fix 2 — `20261030_checkout_coupon_shipping_hardening.sql` preflight extended.** It now also
requires `gift_wrap_fee()`, `calculate_tax(numeric, jsonb)`, `can_access_cart(uuid, text)`, the
`coupons` table and its five columns the new `checkout()` reads, failing the migration with a
clear dependency error instead of installing a `checkout()` that only breaks when a customer
places an order. All of these were verified present on live, so this guard does not block a
live or baseline-restored staging apply; the two existing guard assertions
(`get_shipping_options` in `20261029`, `owns_product` in `20261030_product_images`) are intact.

Not changed, deliberately: the 13 legacy files were **not** moved, because some may contain
work that is not proven live — relocating them would silently drop schema changes. Their
exclusion/remediation is a decision that needs approval (L.11).

### L.6 Code ↔ schema trace (READ-ONLY-LIVE)

| App call site | Arguments used | Live signature | Verdict |
| --- | --- | --- | --- |
| `orders/route.js:323` `checkout` | 7 named args (`p_session_token` omitted) | `checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)` — 8th has a default | match; `20261030` keeps the signature |
| `orders/route.js:284`, `shipping/route.js:23`, `checkout/preview/route.js:202` `get_shipping_options` | `p_country`, `p_order_subtotal`, `p_weight_grams: 0` | `(text,numeric,integer)` → `method_id`/`fee`/… | match |
| `cart/route.js:292`, `orders/route.js:167` `apply_coupon` | `(p_cart_id, p_code[, p_session_token])` | `(uuid,text,text)` | match. Live body does **not** increment `used_count`, so the checkout increment is the only one → the double-count risk is **resolved** |
| `checkout/preview/route.js` `calculate_tax` | `(p_subtotal, p_shipping_address)` | `(numeric,jsonb)` | match |
| `orders/[id]/payment/route.js` `pay_with_cod` | `p_order_id` | `(uuid)` | match; live body is the older unhardened one → `20261028` replaces it |
| `admin/orders/route.js:285` `mark_cod_collected` | `p_payment_id` | `(uuid)` | match |
| `payments/external-wallet` + `_lib/submit-receipt.js` | 4 args | **absent live** | app probes and returns 409 (fail-closed) until `20261028` |
| `admin/orders/route.js:386` verify RPCs | `p_order_id, p_approve, p_note` | `verify_vodafone_cash_payment(uuid,boolean,text)`; wallet variant absent live | match; wallet 409 until `20261028` |
| `orders/route.js:349` `set_order_shipping_method` | `(p_order_id, p_shipping_method_id)` | `(uuid,uuid)` | match; live still has the default `PUBLIC` execute + no caller check → `20261029` closes it |
| `complete_zero_total_order` | both order routes | **absent live** | app refuses the unsafe fallback (503) until `20261029` |
| `confirm_order_payment` | no caller in app code | `(uuid,text,text,numeric,jsonb,text)`, service-role only | `ON CONFLICT` predicate matches the live partial index `payments_provider_ref_uidx (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL` exactly; the 5-arg overload must never be created |
| `create_shipment` / `update_shipment_status` | vendor route does **not** call them (direct service-role inserts after an RLS ownership check) | admin-gated inside the definer body (`is_admin()`) | OK |
| `validate_order_status_transition` | `20261030_order_status` vs live | strict superset (adds `pending→processing`, `paid→shipped`, `processing→shipped`) | no transition removed |

Schema-compat facts verified live: `payment_provider` lacks `external_wallet` (so
`ADD VALUE IF NOT EXISTS` is the real change; the value is only referenced inside function
bodies, so it is transaction-safe on PG17); `orders` has no `payment_method` and its check
constraint allows the `NULL` that checkout leaves; `orders.total_matches_components` is an
**exact** equality and still holds because every component is `numeric(12,2)` and the new
checkout caps the discount at the subtotal (the `greatest(…,0)` clamp never fires); `payments`
has every column `20261028` writes; `payment_receipts.status` already allows `superseded` and
has no provider check; no trigger exists on `payment_receipts`, so the new guard installs
cleanly; the live `guard_order_status_transition` trigger is detected by the `20261030` DO block
so no duplicate trigger is created; the `product-images` bucket and its three policies are
identical to live; `gift_wrap_fee()`, `calculate_tax`, `can_access_cart`, `owns_product` and all
five `coupons` columns are present, so the extended preflight passes on live.

### L.7 Final migration order

`20261023`→`20261026` are already live. Then, in this order:

1. **`20261028_payment_methods_external_wallet.sql`** — enum value, `orders.payment_method` +
   backfill + index, hardened `pay_with_cod`/`mark_cod_collected`, the wallet RPCs, the receipt
   guard trigger. Everything else builds on these objects.
2. **`20261029_order_payment_completion.sql`** — `complete_zero_total_order()` and the
   `set_order_shipping_method()` hole.
3. **`20261030_checkout_coupon_shipping_hardening.sql`** — replaces `checkout()`; depends on the
   baseline helpers now guarded by its preflight.
4. **`20261030_confirm_order_payment_partial_index.sql`** — matching `ON CONFLICT` predicate
   (the partial index has been live since `20261023`).
5. **`20261030_order_status_cod_transitions.sql`** — widened transitions, after the COD/wallet
   flows that write status.
6. **`20261030_product_images_bucket.sql`** — bucket + policies; independent, so it goes last.

All six are additive, none reverts another, and the four same-date files have no cross-
dependencies (verified by reading each one); they apply in filename order.

### L.8 Staging plan (STAGING-NOT-RUN)

**Prerequisites:** an isolated Supabase project that is provably *not* `httywgkwfqvrbuwuzutu`;
Docker for a schema-only baseline restore; the CLI re-linked to that project. A fresh staging
built from this repo alone is **impossible**: the seven `create_*.sql` files never run, the repo
does not contain the live numbered baseline (`20260706…20260722`), and `gift_wrap_fee()` /
`calculate_tax` / `can_access_cart` exist only in the live schema. The baseline must therefore be
restored from live (schema only) and live's `schema_migrations` **version list** (metadata only,
no customer data) seeded, so `db push` applies exactly the six intended files.

Proposed commands — **none of these was executed**:

```bash
# 1) prove identity before anything else
supabase projects list                      # confirm a distinct staging ref
supabase link --project-ref <STAGING_REF>   # never httywgkwfqvrbuwuzutu
cat supabase/.temp/project-ref              # must print the staging ref

# 2) baseline: schema-only restore + seed schema_migrations version list (metadata only)
supabase db dump --db-url "$STAGING_DB_URL" --schema-only --file staging-baseline.sql
#   restore staging-baseline.sql, then insert live's version rows into supabase_migrations

# 3) apply exactly the six intended files
supabase migration list                     # expect: 6 pending, 0 legacy pending
supabase db push                           # or paste the six files in order via SQL Editor

# 4) verify (read-only)
supabase migration list                     # expect: up to date
```

Twelve verification scenarios, staging only, all with synthetic data:
1. `payment_provider` gains `external_wallet`; `orders.payment_method` exists, is indexed, and
   historical rows backfill unambiguously (failed-only orders stay `NULL`).
2. COD order: pending → processing → printing → shipped → delivered, one step at a time.
3. COD collection: `mark_cod_collected` idempotent; repeated calls do not double-settle.
4. Zero-total order: completes as `paid` with no payment row; repeat call is idempotent; a
   non-owner and an anonymous caller are rejected; a nonzero total is rejected.
5. `set_order_shipping_method`: anonymous caller rejected; non-owner rejected; only while pending.
6. External wallet: initiate → submit receipt → previous pending receipt becomes `superseded` →
   admin approve settles once; admin reject keeps the order pending.
7. `confirm_order_payment`: double settlement with a different reference is refused; the same
   reference is idempotent; amount mismatch and cross-order reference are refused; anon/authenticated
   get no execute grant.
8. Coupon: `used_count` incremented exactly once per checkout; expiry/limit/`starts_at` re-checked
   at checkout time; stale `carts.discount_amount` cannot be reused.
9. Shipping: a fee that does not match an available method for the destination is rejected;
   passing `0` when the destination has only paid methods is rejected.
10. `orders.total_matches_components` holds for discount-capped and gift-wrapped orders.
11. Product images: owner upload/replace/delete succeed; another vendor and an anonymous user are
    denied; the bucket stays public, 10 MB, with the five allowed MIME types.
12. Negative probes on every payment RPC as `anon` and as a non-owner `authenticated` user.

### L.9 Commands deliberately NOT run

`supabase db push` · `supabase migration repair` · `supabase migration up` ·
`supabase db dump` · `supabase link` · any SQL `INSERT`/`UPDATE`/`DELETE`/DDL · any of the 12
scenarios · any deploy. Only `SELECT`-only queries (via MCP), `list_branches`, local file reads,
local builds and local tests were executed.

### L.10 Verification results for this pass (LOCAL)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass, no errors |
| `npm run lint` | 0 errors, 22 warnings (pre-existing React `setState`-in-effect pattern) |
| `npm test` | **32 suites / 275 tests, all pass** |
| `npm run build` | pass, all routes emitted |
| Guard assertions | `order-payment-completion-migration.test.ts` (get_shipping_options) and `payment-migration-guards.test.ts` (owns_product) still pass after the preflight change |

Nothing here proves database behaviour: these are local checks, not live or staging execution.

### L.11 Remaining risks

- **The 13 legacy files and 7 `create_*.sql` files are still in `supabase/migrations/`.** Any
  push must exclude them; that decision (relocate vs `migration repair`) needs approval.
- **Three version collisions** (`20261001_vodafone_cash`, `20261002_payment_receipts_table`,
  `20261002_payment_reconciliation_guard`) are silently skipped today. Repairing or renaming
  their versions would make them run — and they would fail or break admin payment verification.
- **Fresh staging cannot be built from the repo alone** (baseline + `schema_migrations` seeding
  required), and `gift_wrap_fee()` is a live-only object with no migration in the repo.
- `get_shipping_options` ignores the destination country on live (pre-existing, section K).
- Docker is unavailable here → full schema dump/restore is **UNVERIFIED**.
- Upstash/Resend/wallet credentials are manual → distributed rate limiting is **UNVERIFIED**.
- None of the 12 staging scenarios has been executed anywhere.

### L.12 Production and deployment confirmation (sixth pass)

Production was not changed in this pass either. No migration was applied, no push/repair/up was
run, no SQL mutation was executed, no application was deployed, no paid resource was created.
Two local changes only: the dangerous archived file was relocated (content preserved) and a
migration preflight guard was extended. All live evidence remains read-only; no secret, token or
customer data was printed.
