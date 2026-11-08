# Gallaxy Store — Active TODO

> Last updated: 2026-10-29.
> **Deployment gate:** the application code expects the following migrations. None of
> them has been applied to the live project. The 2026-10-25 audit made the missing-RPC
> path fail closed; it does **not** use a service-role fallback.
>
> 1. `supabase/migrations/20261028_payment_methods_external_wallet.sql` — external-wallet
>    checkout will fail until it is applied; COD still calls an older live RPC that lacks the
>    hardened idempotency and method persistence (the live trigger does still flip a fully paid
>    pending order to `paid`). The live `confirm_order_payment` also keeps a default `PUBLIC`
>    execute grant until the migration lands.
> 2. `supabase/migrations/20261029_order_payment_completion.sql` — adds
>    `complete_zero_total_order()` (a fully discounted order is completed as `paid` with no
>    payment row) and closes the anonymous hole in `set_order_shipping_method()`. The
>    zero-total RPC now rejects null/negative totals, and the shipping RPC only runs while the
>    order is pending and binds the method to the charged fee.
> 3. `supabase/migrations/20261030_checkout_coupon_shipping_hardening.sql` — revalidates and
>    recomputes coupons at checkout, checks `starts_at`, and validates the shipping fee against
>    the methods actually offered for the destination. It depends on the live
>    `get_shipping_options(text, numeric, integer)` contract, which no repository migration
>    defines.
> 4. `supabase/migrations/20261030_confirm_order_payment_partial_index.sql` — fixes the
>    `ON CONFLICT` predicate so payment confirmation can use the partial unique index, and
>    rejects a different succeeded payment on the same order.
> 5. `supabase/migrations/20261030_order_status_cod_transitions.sql` — adds the COD/fulfilment
>    order transitions (`pending → processing`, `paid → shipped`, `processing → shipped`) and
>    installs the missing trigger when a fresh database has none.
> 6. `supabase/migrations/20261030_product_images_bucket.sql` — makes the existing
>    `product-images` bucket and policies reproducible in a fresh environment.
>
> Do not deploy this as the final payment/fulfilment flow until the migrations have been
> reviewed, approved and applied to an isolated Staging project. The application now fails
> closed while they are missing, but COD order status progression and checkout
> coupon/shipping hardening are not active live. See
> `docs/FINAL-REPORT.md` §K for the audit, the 12 Staging scenarios and the proposed
> commands (none executed).

## Status key

- **DONE** — implemented and verified by local tests/build.
- **UNAPPLIED** — SQL exists in the repository but has not touched the live database.
- **MANUAL** — requires an operator with account access or business data.
- **UNVERIFIED** — cannot be proven in this environment.

## 2026-10-25 audit snapshot

- **LOCAL:** `npx tsc --noEmit` pass; `npm run lint` 0 errors / 22 existing warnings;
  `npm test` 32 suites / 275 tests pass; `npm run build` pass (Next.js 16.2.9).
- **READ-ONLY LIVE:** project ref `httywgkwfqvrbuwuzutu`; `20261023` is applied,
  `20261028+` are not. `payment_receipts`, `orders.shipping_method_id`, `cart_totals`,
  `get_shipping_options` and the `product-images` bucket exist; `orders.payment_method`,
  `complete_zero_total_order` and the external-wallet RPCs do not. No live writes.
- **STAGING:** no isolated Staging project was proven or available. No migration was applied.
- **PRODUCTION:** untouched. No deployment, `db push`, SQL mutation or paid resource.
- **Fixed in this pass:** removed both unsafe zero-total service-role fallbacks; tightened
  `complete_zero_total_order` to an exact zero total; restricted and fee-bound
  `set_order_shipping_method`; blocked a second succeeded payment in
  `confirm_order_payment`; made the COD status trigger reproducible; hardened coupon
  null/type/value checks; normalized `image/jpg` uploads to `image/jpeg`; added
  `get_shipping_options`/`owns_product` migration preflights.
- **Remaining risks:** the live `get_shipping_options` contract is not defined by a
  repository migration; `cart_totals` and the order-status trigger are live-only baseline
  objects; the live `get_shipping_options` ignores country and returned the default zone in
  the read-only probe; no Staging proof of RLS/RPC behavior; no Management API/CLI/Postgres
  access.

## P0 — blocking for production

### Payment refactor (implemented in code)

- [x] COD is created server-side as a **pending** payment; it is never `succeeded`
      until an admin records that the courier collected the cash.
- [x] New orders accept only `cod` and `external_wallet`; Stripe, Paymob, internal
      `wallet` and new legacy Vodafone orders are rejected.
- [x] Wallet account details are stored once in the private
      `store_settings.external_wallet` row and exposed to signed-in customers only
      through `/api/payment-methods` with display-only fields.
- [x] Receipt upload is authenticated, owner-scoped, size-limited, validated by
      magic bytes, stored in the private `payment-receipts` bucket, and never marks
      an order paid.
- [x] Admin receipt review is admin-only, records reviewer/date/note, keeps rejected
      evidence, and allows a controlled resubmission.
- [x] Duplicate transfer references are rejected across orders; retries are handled
      without creating a second paid record.
- [x] `/api/checkout` and `/api/checkout/verify` return `410`; the Stripe webhook
      acknowledges legacy events with `settled:false` so retries stop; Paymob remains
      `410`.
- [x] Admin “Mark cash collected” action is separate from receipt verification and
      is audited.
- [x] Legacy Vodafone receipts/orders remain readable and verifiable. The migration
      also adds a guard trigger so a legacy receipt cannot be attached to a
      COD/external-wallet order or forged onto another owner/order path, even by calling
      the old RPC directly.

### Database migration (unapplied)

- [x] **Order/payment completion** implemented in code and SQL
      (`20261029_order_payment_completion.sql`, unapplied):
  - A zero-total (fully discounted) order is completed as `paid` with **no** payment row,
    because `payments.amount > 0` makes a 0-amount COD/wallet row impossible. This removes
    the “order created but left pending forever” dead end. `/api/orders` calls
    `complete_zero_total_order()` at checkout and returns `free_order: true` /
    `payment_status: "paid"`; the checkout and order pages render it as a free order.
  - The SQL guard now requires an **exact** zero total (`is distinct from 0`), so a null or
    negative total cannot be marked paid. The owner check uses `is distinct from`.
  - If `complete_zero_total_order()` is missing, both order routes return `503` with the
    order reference and leave the order pending. The previous service-role fallback was
    removed because its filtered update could match zero rows while the API still returned
    success.
  - `set_order_shipping_method()` now rejects anonymous callers, locks the order, only
    changes a pending order, and verifies the persisted method is offered for the destination
    and its fee equals `orders.shipping_fee`. The old `v_owner <> auth.uid()` check evaluated
    to NULL (and therefore passed) when `auth.uid()` was null.
- [x] **Resume a stuck payment** (customer): `POST /api/orders/[id]/payment` starts/resumes
      the payment for an owner’s pending order that has no payment attempt (a transient
      failure after the order was created). The order page shows a “Finish setting up your
      payment” panel offering COD, wallet (only when configured) or free-order completion.
      An already-paid zero-total order returns an idempotent success; a missing completion RPC
      returns `503` instead of pretending the order is paid.
- [ ] **Review and apply** `20261028_payment_methods_external_wallet.sql` with explicit
      approval. It adds the `external_wallet` enum value, `orders.payment_method`, the
      external-wallet RPCs, **replaces** the older live `pay_with_cod` /
      `mark_cod_collected` functions with hardened versions, and fixes the payment RPC
      EXECUTE grants (`PUBLIC` removal; `confirm_order_payment` service-role only).
- [ ] **Review and apply** `20261029_order_payment_completion.sql` with explicit approval
      (additive; does not touch historical data).
- [ ] **Review** `20261030_checkout_coupon_shipping_hardening.sql` (recomputes the coupon at
      checkout, validates `starts_at`, null-safe `used_count`, supported coupon types/values,
      and validates the shipping fee against destination options). **UNAPPLIED.** It depends
      on the live `get_shipping_options(text, numeric, integer)` contract; restore the schema
      baseline before using a fresh project.
- [ ] **Review** `20261030_confirm_order_payment_partial_index.sql` (adds the matching
      `WHERE provider_payment_id IS NOT NULL` predicate to `ON CONFLICT`, rejects null/zero/negative
      amounts, and rejects a different succeeded payment on the same order). **UNAPPLIED.**
      Without it, payment confirmation can fail with “no unique or exclusion constraint
      matching the ON CONFLICT specification” or double-settle an order.
- [ ] **Review** `20261030_order_status_cod_transitions.sql` (adds `pending → processing`,
      `paid → shipped`, `processing → shipped`, and installs the trigger when missing).
      **UNAPPLIED.** Until it is applied, the shipment route creates the shipment but the COD
      order stays `pending`/does not reach `shipped`.
- [ ] **Review** `20261030_product_images_bucket.sql` (creates the public `product-images`
      bucket and its owner-scoped policies). **UNAPPLIED.** The live bucket already matches the
      migration's public/10 MB/png-jpeg-webp-gif-avif configuration.
- [ ] Confirm all migrations in an **isolated Staging** Supabase project first. There is no
      verified Staging project in this environment; see `docs/FINAL-REPORT.md` §K.
- [ ] After applying, run the 12 Staging scenarios in `docs/FINAL-REPORT.md` §K, including
      COD, shipping rejection, forged totals, coupons, zero-total orders, duplicate
      payment/webhook, wallet receipts, missing COD proof, invalid transitions, cross-user
      access, unauthorized RPCs and dependency failures.
- [ ] Deploy the application only after the reviewed migrations are live.

### External / manual configuration

- [ ] Configure the wallet provider name, account name and account number in
      **Admin → Settings → Wallet transfers** after the migration is applied.
      Until then, wallet checkout is disabled and COD remains available.
- [ ] Resend key + verified sender — **MANUAL** (email is best-effort and skipped
      when unset).
- [ ] Production smoke test of COD/wallet on the deployed build — **MANUAL**.
- [ ] Redis/Upstash for distributed rate limiting — **UNVERIFIED** (the code supports
      `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; without them it uses the
      per-instance limiter).

## P1 — complete admin workflows

- [x] COD and wallet filters/panels in admin orders.
- [x] Wallet settings form with private storage.
- [x] Generic wallet receipt endpoint and legacy endpoint retained.
- [x] Receipt viewer for both providers.
- [x] Currency retained on the wallet step after the cart is cleared.
- [x] `.env.example`, FAQ and privacy copy updated to the new methods.
- [x] Server-side provider selection for admin verification; browser cannot choose
      which RPC runs.
- [x] Admin approval/rejection requires an explicit boolean decision; a malformed
      request cannot silently approve a receipt.
- [x] Admin audit entries for payment approval, rejection and COD collection.
- [x] Checkout surfaces the created order reference when payment setup fails after
      the order was created.
- [x] A stuck order (no payment attempt) can resume/choose its payment from the order page
      (`POST /api/orders/[id]/payment`), and a fully discounted order reads as “Free order”.
- [x] The legacy Stripe success page shows a clear “Card Payments Unavailable” state instead
      of “Verification Failed” when `/api/checkout/verify` returns `410`.
- [x] Order detail and order list format totals with the order’s own currency.

## P2 — hardening / quality

- [x] Contract tests for COD initiation, admin decisions, receipt validation,
      settings normalization and disabled gateways.
- [x] Disabled Stripe routes return safe, explicit responses.
- [x] No browser-supplied amount, currency, owner or payment status is trusted.
- [x] Private receipt path must start with `<auth.uid>/<order_id>/`; the external-wallet
      RPC rejects traversal/backslash paths even if the API is bypassed. The migration's
      legacy Vodafone trigger now also enforces the exact owner/order prefix at the DB
      boundary (the live RPC only checks the user folder).
- [x] The legacy Vodafone RPC is protected by an unapplied DB trigger against
      COD/external-wallet orders, conflicting new-method payments, and forged
      owner/path/provider rows.
- [x] Every payment RPC revokes the default `PUBLIC` execute grant; the new pending
      contract test asserts this and that `confirm_order_payment` stays service-role only.
- [x] Contract tests for zero-total completion, the resume-payment endpoint and the
      `20261029` migration invariants (`set_order_shipping_method` anon guard, free-order
      RPC ownership/idempotency, PUBLIC grant removal). Static guards also cover the
      duplicate-succeeded-payment rejection, order-status trigger creation and the
      `get_shipping_options`/`owns_product` dependency preflights.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` run locally.
- [ ] Full schema reproducible from committed migrations — **PARTIAL** (Docker
      unavailable; historical remote migrations not all captured).
- [x] Distributed-capable rate limiting (`lib/rate-limit.ts`): Upstash Redis REST is
      used when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, with a
      per-instance fallback when they are absent. Money/state-changing routes fail closed
      if a configured store is unreachable; read/review routes fall back locally.
- [ ] Live Redis/Upstash verification — **UNVERIFIED** (no credentials in this
      environment).

## Second-pass fixes (2026-10-24)

Additional defects found by a read-only review and fixed locally:

- [x] `app/api/admin/route.js` — a missing `logger` import made the error path throw
      `ReferenceError` instead of returning a 500 JSON response.
- [x] `app/vendor/layout.tsx` — the vendor guard accepted any non-404 response
      (401/403/500) as a valid vendor; it now requires `data.success`.
- [x] `app/api/vendor/payout/route.js` — POST read `store_id` from the body and
      therefore rejected every request from the earnings page (which never sent it);
      it now derives the store from the session and ignores a client-supplied id.
      GET additionally returns a withdrawable summary.
- [x] `app/api/vendor/stats/route.js` — added `products` (aggregated variant stock and
      units sold) and `recent_orders` (assembled from `vendor_order_items`); rolled the
      per-product `vendor_conversion_metrics` up to a store-level rate.
- [x] `app/vendor/{page,products,orders,shipments,printing,earnings}` — fixed the field
      names, top-level arrays and view columns that never matched the API.
- [x] `app/returns/page.tsx` — the item list was always empty because `/api/orders`
      (list) does not embed `order_items`; items are now fetched lazily from
      `/api/orders/[id]`. Currency, status labels and eligible statuses corrected.
- [x] `app/orders/page.tsx`, `app/track-order/page.tsx` — dropped the unreachable
      `confirmed` status and added `partially_refunded`.
- [x] `app/admin/orders/page.tsx` — added `refunded` / `partially_refunded` to the
      status options (already valid in the API).
- [x] `app/wishlist/page.tsx` + `app/api/wishlist/route.js` — wishlist images resolved
      to public storage URLs and the hardcoded `$` replaced with the product currency.
- [x] `lib/products.ts` + `app/stores/cartStore.ts` — extracted
      `productImageUrlFromPath()` and used it so synced cart items stop losing images.
- [x] `app/components/ProductCard.tsx` — the Wishlist button was a dead
      `preventDefault()`; it now toggles the real wishlist and redirects anonymous
      users to login. Quick view navigates to the product page.
- [x] `app/api/admin/products/route.js` — a product update that omitted
      `stock_quantity` silently zeroed the default variant; stock is now only written
      when a value is supplied.
- [x] `app/products/page.tsx` — the “Newest” option mapped to the popularity sort;
      relabelled to “Most Popular” (the `search_products` RPC has no recency sort).

### Vendor residuals (resolved in the third pass)

- [x] `/vendor/products` now has a first-party product editor backed by
      `/api/vendor/products`; the store is derived from the session, ownership is checked
      on every update/archive, partial updates keep unsent fields, and images/stock are
      synced with the product.
- [x] `/vendor/orders` now uses `/api/vendor/orders` and shows a customer display name
      resolved only for customer ids that appear in this store's own `vendor_order_items`.
      Email, phone and delivery address are deliberately not selected or returned. The
      page also expands item details locally instead of linking to the customer-only
      `/orders/[id]` page, and the truck icon links to `/vendor/shipments`.

## Third-pass fixes (2026-10-24)

All changes are local; no database mutation or migration was applied.

### Vendor product editor

- [x] New `app/api/vendor/products/route.js`: GET lists only the authenticated owner's
      store products plus category/brand lookups; POST creates, updates or archives.
      `store_id` always comes from the session, never the body; another store's product
      returns 404; partial updates merge with the existing row; images and the default
      variant (price/stock) are synced.
- [x] New `lib/product-admin.ts` holds the shared payload/variant/image helpers, imported
      by both the admin and vendor product routes (admin behavior preserved).
- [x] Rebuilt `app/vendor/products/page.tsx`: real Add/Edit/Archive form (price, category,
      stock, status, visibility, colors, descriptions, images), success/error feedback,
      loading and empty states; no admin redirect.

### Vendor orders

- [x] New `app/api/vendor/orders/route.js`: groups `vendor_order_items` by order for the
      session store, returns line items and currency, and resolves `customer_name` through
      a restricted service-role `profiles` lookup limited to customer ids that appear in
      this store's items. Email, phone and address are not selected.
- [x] Rebuilt `app/vendor/orders/page.tsx`: uses the new endpoint, shows customer name and
      currency, expands items in-place (no inaccessible `/orders/[id]` link), filters by
      status, and links the truck action to `/vendor/shipments`.

### Reviews

- [x] Hardened `/api/reviews/[id]/vote` and `/report`: UUID validation, auth, review
      existence, own-review rejection, duplicate vote/open-report rejection (409), reason
      whitelist/details length, RPC error mapping, and rate limiting.
- [x] `app/components/Reviews.tsx`: vote/report/delete now surface success and failure,
      prevent duplicate votes/reports in the UI, show counts, and disable while pending.

### Server totals and shipping

- [x] `/api/orders` now always resolves `get_shipping_options` for the destination:
      a selected method must exist, its fee is used (body fee ignored), and omitting a
      method is rejected when options exist. If no options exist, the fee stays 0.
- [x] Checkout no longer invents a 49/0 fallback shipping fee; it displays the selected
      server option (or 0 while none exists).
- [x] Tests assert an unavailable method is rejected and the checkout RPC receives the
      fee from `shipping_rates`, not the request body.

### Rate limiting

- [x] `lib/rate-limit.ts` keeps the fixed-window in-memory limiter and adds
      `checkRateLimitAsync` with optional Upstash Redis REST (`/pipeline` INCR + PEXPIRE NX,
      1.5s timeout, `getClientIp`). `failureMode: "fail_closed"` is used for checkout,
      payment, wallet, receipt, cancel, returns, custom-print, tracking and vendor
      writes (products, images, shipments, payouts); `"fail_open"` is used only for
      search, reviews and vendor reads.
- [x] Sensitive routes switched to the async limiter. Without Upstash credentials the
      per-instance limiter is used and one warning is logged.

### Other

- [x] Vendor earnings: load errors are surfaced with retry; "Completed Payouts" now
      formats currency.
- [x] Vendor printing: queue errors are surfaced with retry.

## Fourth-pass fixes (2026-10-24)

All changes are local; no database mutation or migration was applied.

### Money and coupon correctness

- [x] `lib/checkout-calculations.ts` — `couponValidationError()` treated `null`
      `max_uses` / `max_uses_per_user` as `0` (`Number(null) === 0`), so an unlimited
      coupon was rejected as exhausted. `computeCouponDiscount()` treated a `null`
      `max_discount_amount` as a zero cap, so every uncapped percentage coupon produced
      a zero discount. Both now distinguish missing limits from real zero values.
- [x] `lib/shipments.ts` — `estimateDeliveryDates(null, …)` became “today” because
      `Number(null) === 0`; null/empty windows now return no estimate. Re-sending
      `delivered` keeps the original `delivered_at` and `actual_delivery_date` instead
      of moving the delivery date to today.
- [x] `app/api/checkout/preview/route.js` — no longer shows a silent zero tax, gift-wrap
      or shipping fee when the pricing RPC fails. It returns 503 instead, matching the
      checkout RPC. A failed coupon-usage lookup marks the coupon unverified rather than
      showing a discount that may be rejected.
- [x] `app/api/orders/route.js` — a failed `cart_totals` lookup returns 503 instead of
      computing shipping from a zero subtotal; the chosen shipping method is persisted
      **before** payment starts, so an order cannot be paid without its shipping method.

### Payments and fulfilment

- [x] `app/api/orders/[id]/payment/route.js` — validates the order UUID, checks the
      external-wallet RPC capability before starting a wallet payment, and has the same
      guarded service-role fallback for zero-total orders when
      `complete_zero_total_order()` is missing (live until `20261029`).
- [x] `app/api/vendor/shipments/route.js` — a pending order is now shippable only when
      the payment rows prove it is COD; a payment lookup error fails closed with 503.
      Creating a shipment moves a paid **or pending-COD** order to `processing`, and an
      all-items-shipped aggregate can move `paid`/`processing`/`printing` to `shipped`.
      The matching order transitions are in the review migration
      `20261030_order_status_cod_transitions.sql`.
- [x] `app/api/vendor/products/route.js` — product writes reject an `images` field; all
      image writes must use `/api/vendor/products/images`, which validates MIME, size,
      ownership, primary/reorder and alt text.
- [x] `app/api/vendor/products/images/route.js` — deletes the database row before the
      storage object (a failed row delete cannot leave a broken image), rollback
      cleanup logs each independent failure instead of silently skipping the rest, and
      `set_primary` restores the previous primary image if the target update fails.
- [x] `lib/product-image-upload.ts` — generated storage identifiers are sanitized so a
      caller-supplied identifier cannot inject path segments.
- [x] `app/api/vendor/payout/route.js` — added a `fail_closed` rate limit to the
      state-changing payout request.
- [x] Vendor product/image/shipment writes now use `failureMode: "fail_closed"`;
      vendor reads remain `fail_open`.

### Review migrations (unapplied)

- [x] `20261030_checkout_coupon_shipping_hardening.sql` — recomputes the coupon at
      checkout, checks `starts_at`, and validates the fee against destination options.
- [x] `20261030_order_status_cod_transitions.sql` — COD fulfilment transitions.
- [x] `20261030_confirm_order_payment_partial_index.sql` — matches the partial unique
      index predicate in `ON CONFLICT`.
- [x] `20261030_product_images_bucket.sql` — reproducible bucket and policies.

### Focused tests added

- [x] `checkout-calculations.test.ts` — null coupon limits/caps, totals, shipping
      selection, coupon validation.
- [x] `shipments.test.ts` — live-aligned transitions, input parsing, delivery estimates,
      item/order aggregation.
- [x] `product-image-upload.test.ts` — MIME/size/path traversal validation.
- [x] `payment-capabilities.test.ts` — missing/existing RPC probe, cache, fail-closed
      probe errors.
- [x] `checkout-preview-contract.test.ts` — server totals, uncapped coupon, ownership,
      price/stock reporting, shipping-RPC failure.
- [x] `vendor-shipments-contract.test.ts` — ownership, invalid transitions, COD
      pending→processing, non-COD rejection, payment-lookup fail-closed, no manual
      status-history writes.
- [x] `product-image-upload-rollback.test.ts` — partial upload cleanup and primary
      restoration.
- [x] Extended `orders-shipping-contract.test.ts` (shipping-method save failure) and
      `order-payment-endpoint-contract.test.ts` (wallet capability, zero-total fallback).

## Verification log

| Command / check | Result |
|---|---|
| `npx tsc --noEmit` | pass (no output) |
| `npm run lint` | pass; **0 errors**, 22 `react-hooks/set-state-in-effect` warnings (no unused vars/imports) |
| `npm test` | **31 suites / 266 tests pass** (adds the fourth-pass checkout, shipment, image-rollback, payment-capability and preview contracts) |
| `npm run build` | pass; all routes compiled by Next.js 16.2.9, including `/api/checkout/preview`, `/api/vendor/products/images` and `/api/vendor/shipments` |
| Read-only live inspection | `payment_provider` lacks `external_wallet`; live `orders` has no `payment_method`; the legacy Vodafone guard trigger is absent; older `pay_with_cod` / `mark_cod_collected` exist but do not persist the method; the live `sync_order_payment_status` trigger does flip a fully paid pending order to `paid`; `submit_vodafone_cash_receipt`, `verify_vodafone_cash_payment` and `confirm_order_payment` still had default `PUBLIC` execute; `payments_amount_check` is `amount > 0`; `set_order_shipping_method` had a default `PUBLIC` grant and a null-owner hole; neither migration is applied |
| Apply `20261028_payment_methods_external_wallet.sql` | **NOT RUN** (requires approval) |
| Apply `20261029_order_payment_completion.sql` | **NOT RUN** (requires approval) |
| Apply `20261030_*` review migrations | **NOT RUN** (requires approval) |
| Staging/production COD + wallet + shipment smoke test | **NOT RUN** |
| Read-only live `carts` schema | confirmed `currency`, `coupon_id`, `coupon_code`, `discount_amount` |
| Read-only live `product-images` bucket | public, 10 MB, png/jpeg/webp/gif/avif; insert/update/delete policies use `owns_product` |
| `supabase db dump --linked` | blocked: Docker daemon unavailable |

The live queries were read-only. Some retries failed with the CLI temporary-role
authentication error; no database mutation was attempted.

## Known residuals

- The SQL migrations have not been executed anywhere. Their runtime behavior is
  **unverified**; the Jest contract tests mock the RPC layer.
- Zero-total order completion and the anonymous-caller fix in `set_order_shipping_method`
  depend on `20261029_order_payment_completion.sql`. Until it is applied, a fully discounted
  order still ends up stuck `pending` and an unauthenticated caller can still change an
  order’s shipping method at the database boundary (the application only calls that RPC for
  the authenticated owner).
- External-wallet checkout fails until `20261028` is applied. COD currently falls back
  to the older live RPC, which does not persist `orders.payment_method`; the live
  `sync_order_payment_status` trigger can still move the order to `paid` when a COD
  payment succeeds. The migration removes the remaining `PUBLIC` RPC grants and narrows
  `confirm_order_payment` to `service_role`.
- COD order status progression (`pending → processing`, `processing → shipped`) and the
  live `paid → shipped` path depend on `20261030_order_status_cod_transitions.sql`. Until
  it is applied, the shipment is still created and its own status advances, but the order
  status update is logged as best-effort and may remain `pending`/`processing`.
- Checkout still uses the live coupon/shipping RPC until
  `20261030_checkout_coupon_shipping_hardening.sql` is applied. The application refreshes
  the coupon and resolves the shipping fee server-side, but the database boundary is not
  yet hardened against a direct RPC caller.
- Payment confirmation can fail until
  `20261030_confirm_order_payment_partial_index.sql` is applied because the live function
  uses an `ON CONFLICT` clause that does not match the partial unique index.
- A fresh environment has no `product-images` bucket until
  `20261030_product_images_bucket.sql` is applied; the live bucket exists but is not
  reproducible from the repository.
- Lint warnings are only `react-hooks/set-state-in-effect` (23), intentionally kept
  for legacy fetch/sync effects. There are no lint errors.
- Rate limiting is distributed-capable but **unverified**: Upstash is used only when
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; otherwise each
  instance keeps its own counters. A live Redis test is still pending.
- Vendor customer names are resolved with the service role after checking the session
  store; the RLS design of `profiles` was not independently verified against the live
  database. Only `full_name` is returned.
- A full schema snapshot/baseline is still recommended for disaster recovery.

---

## Audit snapshot — 2026-10-29 (sixth pass: migration history + code↔schema trace)

Full write-up in `docs/FINAL-REPORT.md` §L. Labels: LOCAL / READ-ONLY-LIVE / STAGING-NOT-RUN /
UNVERIFIED. No live write, no migration, no deploy.

### Blocking finding (READ-ONLY-LIVE)

- `supabase/.temp/project-ref` = `httywgkwfqvrbuwuzutu` and `linked-project.json` = `galaxy-store`
  → **the CLI in this working copy is linked to production.** `list_branches` = `[]` → no
  isolated staging branch exists. Every `db push` / `migration repair` from here would hit
  production, so none was run.
- Supabase CLI 2.117.0 (LOCAL, from source): version = digits before the first `_`; non-matching
  filenames (`create_*.sql` ×7) are skipped with a warning; pending = version absent from
  `supabase_migrations.schema_migrations`, whose **PK is `version`**; pending files run in
  filename order, one transaction each.
- Drift (READ-ONLY-LIVE): live history ends at `20261026`. Of the repo's 35 migration files,
  **13 legacy files are pending** (20260907 ×2, 20260909 ×3, 20260910 ×2, 20260911, 20260913_fix,
  20260916 ×2, 20260917, 20260930) — several are older duplicates of work already live under
  14-digit ids — **4 are applied** (`20261001`, `20261002`, `20261023`–`20261026`) and **6 are the
  intended pending set**. Four version prefixes repeat (`20260907` ×2, `20260909` ×3, `20260910`
  ×2, `20260916` ×2): because `schema_migrations` is keyed by `version`, the second file of each
  duplicate pair cannot be recorded, so a full-directory push would abort *after* already applying
  the first file of each pair. **Pushing this directory as-is is unsafe.**
- Three files share a version with already-applied files (`20261001_vodafone_cash`,
  `20261002_payment_receipts_table`, `20261002_payment_reconciliation_guard`) and are therefore
  silently skipped. Do **not** repair/rename their versions: they would fail on a return-type
  conflict or redefine `verify_vodafone_cash_payment` with `p_receipt_id` semantics, breaking
  admin payment verification.

### Fixes applied (LOCAL)

- [x] `20260913_comprehensive_audit_fixes_ARCHIVED_DANGEROUS.sql` moved to
      `supabase/migrations-archived/` (content preserved, nothing deleted). Its `apply_coupon`
      reads `coupons.usage_limit`, which live `coupons` does not have → every coupon apply would
      break; on push `20261023` is already recorded so nothing would restore the functions; it
      also adds a duplicate order-status trigger and creates the wrong `coupons` shape on a fresh
      DB (breaking checkout there too).
- [x] `20261030_checkout_coupon_shipping_hardening.sql` preflight extended with
      `gift_wrap_fee()`, `calculate_tax(numeric, jsonb)`, `can_access_cart(uuid, text)`, plus the
      `coupons` table and the five columns the new `checkout()` reads. All verified present on
      live, so a live/baseline-restored staging apply still succeeds and fails fast elsewhere.
- [ ] Decision still needed: what to do with the 13 legacy files and the 7 `create_*.sql` files
      (relocate to `migrations-archived/` vs `supabase migration repair`). They were **not**
      moved, because some may contain work that is not proven live.

### Code ↔ schema trace (READ-ONLY-LIVE) — all app calls match the live signatures

`checkout` (7 named args, 8th defaulted) · `get_shipping_options(text,numeric,integer)` with
`p_weight_grams: 0` · `apply_coupon(uuid,text,text)` (live does **not** increment `used_count`,
so the checkout increment is the only one — double-count risk resolved) · `calculate_tax` ·
`pay_with_cod(p_order_id)` · `mark_cod_collected(p_payment_id)` ·
`set_order_shipping_method(uuid,uuid)` (live still has default PUBLIC execute + no caller check →
closed by `20261029`) · `verify_vodafone_cash_payment(p_order_id,…)` ·
`submit/verify_external_wallet_receipt` and `complete_zero_total_order` are absent live and the
app fails closed (409/503) until `20261028`/`20261029` land. `confirm_order_payment` has no app
caller; its `ON CONFLICT` predicate matches the live partial index exactly
(`… WHERE provider_payment_id IS NOT NULL`). `20261030`'s transition list is a strict superset of
the live trigger function (no transition removed). `20261028`'s `ADD VALUE IF NOT EXISTS` is
transaction-safe on PG17; `orders.total_matches_components` still holds (exact equality, all
components `numeric(12,2)`, discount capped at subtotal); `payment_receipts.status` already allows
`superseded`; no trigger exists on `payment_receipts`; the `product-images` bucket and its three
policies are identical to live.

### Verification log — 2026-10-29 (LOCAL)

- [x] `npx tsc --noEmit` — passes.
- [x] `npm run lint` — 0 errors, 22 warnings (pre-existing).
- [x] `npm test` — 32 suites / 275 tests, all pass.
- [x] `npm run build` — passes.
- [x] Existing migration guard tests still pass after the preflight change.

### Environment status — 2026-10-29

- Local `tsc`: pass · Lint: 0 errors / 22 warnings · Tests: 32 suites / 275 tests · Build: pass.
- Live database (read-only verified): matches the six pending migrations' assumptions; nothing
  applied.
- Migration gate: the six intended migrations are ready **but** a push must exclude the 13 legacy
  files and the 7 `create_*.sql` files, and the CLI must first be re-linked to an isolated
  staging project (none exists today). STAGING: not created · UNVERIFIED: Docker baseline
  restore, Upstash/Resend/wallet credentials, all 12 staging scenarios.

---

## Payment-alignment pass — 2026-10-29 (COD + manual Vodafone Cash only)

Goal per the product requirement: exactly two payment methods — cash on delivery and a manual
wallet (Vodafone Cash) transfer with an admin-reviewed receipt — with no electronic payment
gateway reachable from the UI **or** the API. Full write-up in
`docs/PAYMENT-FLOW-COD-VODAFONE-AR.md`. Local changes only; no migration applied anywhere.

- [x] `app/api/wallet/route.js` — `POST` (pay from the internal wallet balance via
      `pay_with_wallet`) now returns `410 Gone`. It was the last open API path that could settle
      an order through a non-approved provider; nothing in the UI called it, so no page broke.
      `GET` (balance read for historical wallets) is unchanged.
- [x] `app/checkout/page.tsx` — the payment step now previews the server-configured transfer
      account (`ExternalWalletInstructions`, `data-testid="checkout-wallet-preview"`) when the
      manual transfer is selected, so the customer sees the current Vodafone Cash number
      **before** placing the order. The number still comes only from `store_settings`; nothing
      is hard-coded, and an unconfigured account keeps the option disabled with a clear reason.
- [x] `app/admin/orders/page.tsx` — the wallet-transfer review panel now shows the **receiving
      account** (number/name/provider from Admin → Settings) for cross-checking, and a
      collapsible **previous transfer attempts** history (per-attempt date, decision state,
      reference, payer phone, admin note) built from the `payments` array the API already
      returns. No receipt image of another customer is exposed; history rows are metadata only.
- [x] `app/orders/page.tsx` + `app/api/orders/route.js` (GET) — the customer orders list now
      carries a per-order `payment_summary` (own rows only, user-JWT/RLS scoped) and renders a
      payment badge that separates: receipt required / awaiting verification / rejected /
      payment confirmed / pay on delivery / cash collected. Previously the list showed only the
      fulfilment status and said nothing about payment.
- [x] `app/admin/settings/page.tsx` — wallet-transfer section copy now states that the admin is
      setting the receiving Vodafone Cash account, that details are private/display-only, and
      that a submitted receipt never marks an order paid.
- [x] Verified unchanged and compliant: `/api/orders` POST (cod/external_wallet only, server
      totals, wallet config + RPC-capability gates before order creation), receipt submission
      pipeline (owner path prefix, magic bytes, 5 MB cap, reference dedupe, supersede-not-delete),
      admin verify/collect actions (explicit boolean decision, server-side provider choice,
      audit entries, `verified_by`/`collected_by` in the pending 20261028 RPCs), Stripe/Paymob
      `410`/ack-without-settle responses, legacy `/api/payments/vodafone-cash` retained.
- [x] `npx tsc --noEmit` pass; `npm run lint` 0 errors / 22 pre-existing warnings;
      `npm test` 32 suites / 275 tests pass (after the changes above).
- [ ] Local database: Docker Desktop was started in this environment and the local Supabase
      stack brought up; applying the six pending migrations to the **local** database only
      (`supabase db reset`) — never to the linked production project.
- [ ] Configure the actual Vodafone Cash number in Admin → Settings → Wallet transfers once
      `20261028` is applied (until then the manual-transfer option stays disabled at checkout
      with a clear message, and COD remains fully usable).

---

## Intensive site audit — 2026-10-29 (non-payment)

Full browser-level audit (Playwright guest crawl of 23 pages + interactions + read-only live
DB probes + `npm audit`). Full write-up with root causes and fixes:
`docs/TESTING-REPORT-AR-2026-10-29.md`. Highlights (fix before launch):

- [ ] **Upgrade `next` to 16.4.3** — current 16.2.9 + Turbopack is inside the
      "Middleware/Proxy bypass" CVE range (admin/vendor route protection depends on it) and
      `npm audit` reports 44 vulnerabilities (2 critical). Then `npm audit fix`.
- [ ] **`/gift-boxes` is a demo mockup** — hardcoded boxes added to cart with fake
      `gift-*` product ids (fail at cart sync/checkout) and its custom request form
      "simulates" a submit (nothing is sent). Link it to real products + a real API, or hide
      the page until then.
- [ ] **Broken demo product data (live DB, read-only verified):** 23/29 `product_images`
      rows point to paths missing from the `product-images` bucket (9 English seed products
      render 400 images); 10 rows hotlink Unsplash/Pinterest; a published "test product"
      (EGP 2,000) is visible in Nova Print Co. Re-upload real images / clean the rows.
- [ ] **`lib/logger.ts:4` silences `warn`/`info` in production** — security warnings (e.g.
      blocked wallet-payment attempts) are invisible. Allow `warn` + wire a log drain.
- [ ] **Cart page is half-Arabic in an English (`lang="en"`) site** — 23 hardcoded Arabic
      strings in `app/cart/page.tsx`, plus Arabic `not-found.tsx` / `error.tsx`. Unify to
      English (or implement real i18n with `dir`).
- [ ] **Cart shows a hardcoded shipping estimate** (`subtotal > 500 ? 0 : 49` in
      `app/cart/page.tsx:167`) that contradicts live `shipping_rates` ($4.99, free > $50).
      Fetch `/api/shipping` instead; also `/api/shipping/route.js:27` still sends
      `p_weight_grams: 0` (old issue #29).
- [ ] **Market identity:** `store_settings` is completely empty (0 rows); shipping zones
      treat Egypt as international (Domestic US only); contact page has a +1 (555) placeholder
      phone next to a Cairo address; homepage claims "12k+ reviews" with 0 reviews in DB.
- [ ] **Mixed currencies:** 18 published products USD / 3 EGP, no store-level currency.
- [ ] **Upstash Redis env vars** (`UPSTASH_REDIS_REST_URL/TOKEN`) still unverified — the
      rate limiter falls back to per-process memory in production (old issue #5).
- [ ] Polish: reset-password shows "Invalid or expired reset link" to plain visitors;
      `/products` flashes "All 0 products" while loading; `/api/custom-print` returns 400
      (not 401) for unauthenticated POSTs; root-file clutter; package version 0.1.0.
- Verified working this pass: all public pages 200, auth redirects for
      /admin /vendor/* /orders /checkout /profile /wishlist, search/filter/sort, guest cart,
      order tracking (fake ref → "Order not found"), custom-print submit path, uploaded-product
      images 200, mobile no-overflow, API 401 gating, `tsc`/lint 0 errors/275 tests/build all
      green. Old REMAINING-ISSUES.md items #2/#3/#9/#11/#12/#13/#15/#28/#30/#32 confirmed
      fixed; #16/#27/#29 confirmed still open (covered above).
