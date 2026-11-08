# Database & Data Integrity Report (Phase Five)

**Date:** 2026-11-01
**Method:** 100% read-only review via Supabase MCP (`execute_sql` as `supabase_read_only_user` — a `BYPASSRLS`/`pg_read_all_data` role that cannot write; `SET ROLE anon` was denied by the platform, so role exposure was derived from catalog grants + view definitions + owner semantics instead of live impersonation), plus `get_advisors` (security + performance), `list_tables`, `list_extensions`, `list_migrations`, and source-code greps for view/API consumption.
**Production protection:** no `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`/`TRUNCATE` was executed. All remediation SQL is **prepared locally** in `supabase/manual-review/06_harden_view_exposure.sql` and awaits explicit owner approval.

---

## 1. Executive summary

| Area | Verdict |
|---|---|
| RLS coverage | ✅ **Healthy** — all 83 public tables have RLS enabled; only 2 have zero policies (`_seed_report`, `admin_audit_log`) and are therefore **locked to everyone** except superuser (safe default) |
| Row-level policy design | ✅ **Healthy** — consistent owner-or-admin / admin-only / public-storefront patterns; carts/orders/wallets intentionally mutate only through `SECURITY DEFINER` RPCs (table-level writes correctly blocked) |
| Referential integrity | ✅ **Perfect** — all **132** foreign keys checked, **0 orphan rows** |
| Triggers | ✅ **Healthy** — 130+ triggers incl. `prevent_role_self_escalation`, `prevent_store_status_self_approval`, status-transition guards, restock-on-cancel, wallet apply |
| Storage | ✅ **Healthy** — 10 buckets; sensitive buckets private; private design bucket (`custom-print-designs`) has **no policies at all → service-role only** (correct); storage policies are owner-folder-scoped + `is_admin()` |
| Functions (`SECURITY DEFINER`) | ✅ **Spot-check pass** — 38 anon + 85 authed-callable; the 3 most sensitive (`verify_vodafone_cash_payment`, `approve_vendor_payout_request`, `set_order_shipping_method`) all enforce `is_admin()`/ownership internally and set `search_path`. Full audit recommended as follow-up (non-blocking) |
| **Views exposure** | ⚠️ **3 real findings — remediation prepared, approval-gated** (see §5): 6 anon-exposed unguarded sensitive views; 9 unguarded vendor views (cross-tenant for any signed-in user); 2 unguarded cart views (app-used) |
| Indexes | ℹ️ Performance-only: 154 unused (INFO), 7 multiple-permissive-policies (WARN), 4 duplicate indexes (WARN) — no security impact; cleanup optional |
| Data entry gaps | ⚠️ `store_settings` = **0 rows** (settings-driven storefront reads defaults until filled — checklist §1–§10), `reviews` = 0, `custom_print_requests` = 0 |
| DR schema snapshot | ⛔ **Blocked** — `supabase db dump --linked` needs human approval |

**Bottom line:** the database core (RLS, FKs, triggers, storage, RPC guards) is in good shape. The single meaningful exposure class is **owner-rights views**: all 41 views run as `postgres` (`BYPASSRLS`), so **table RLS does not protect them** — only grants and in-view `WHERE` guards do. Six sensitive views grant `anon` with no guard; nine vendor views grant `authenticated` with no per-store guard. All fixes are prepared and gated in `06_harden_view_exposure.sql`.

---

## 2. Schema inventory

- **83 tables** in `public`, all with `relrowsecurity = true`, none with `FORCE ROW LEVEL SECURITY`.
- Approximate vs exact row counts (stats were stale; exact counts taken via `query_to_xml`):

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| profiles | 279 | products | 22 |
| wallets | 279 | product_variants | 25 |
| carts | 215 | product_images | 29 |
| wishlists | 388 | orders | 12 |
| notification_preferences | 1677 | order_items | 15 |
| search_logs | 252 | coupons | 2 |
| notification_deliveries | 165 | shipping_zones / rates | 2 / 4 |
| addresses | 4 | admin_users | 1 |
| **store_settings** | **0** ⚠️ | **custom_print_requests** | 0 |
| reviews / refunds | 0 / 0 | admin_audit_log | 0 |

- Largest relations: `products` 800 kB, `notification_preferences` 552 kB, `wishlists` 392 kB — a small, healthy database.
- **`store_settings = 0`** means the settings-driven storefront (`lib/storeSettings.ts`) currently serves built-in defaults; real contact/currency/social data must be entered per `docs/STORE-SETTINGS-CHECKLIST.md` (data-entry task, not a defect).
- ~**180 migrations applied** (latest: `admin_audit_log`, 2026-10-26). Local pending migrations (`supabase/migrations/20261101_add_gift_box_product_type.sql` and `manual-review/01`–`06`) are correctly **not** present in the remote list.

## 3. RLS & policy review

- **Broad table grants to `anon`/`authenticated` (74 tables) are the Supabase default pattern** — they are *not* the enforcement layer; RLS policies are. Verified per-table policy map:
  - Owner-or-admin SELECT/UPDATE/DELETE patterns on user-owned rows (`addresses`, `orders`, `carts`, `cart_items`, `wallets`, `wishlists`, `custom_print_requests`, …).
  - Admin-only writes for catalog/config (`products`, `categories`, `brands`, `coupons`, `shipping_*`, `store_settings`, `vendor_*` governance tables).
  - Public SELECT only for storefront content (`products`, `categories`, `brands`, `collections`, `store_settings` public settings).
  - **Deliberate design:** `carts`, `cart_items`, `orders`, `wallets`, `wallet_transactions` expose **SELECT-only policies**; all mutations go through `SECURITY DEFINER` RPCs (`add_to_cart`, `checkout`, wallet apply, …) with internal ownership/role checks — direct PostgREST writes are impossible. This is a *strength*, not a gap.
- **Zero-policy tables:** `_seed_report` (14 rows) and `admin_audit_log` (0 rows) have RLS on and no policies → inaccessible to `anon`/`authenticated` (advisor level: INFO). Service-role/superuser only. Recommended: leave as-is (intentional lock) — optionally add a service-role note in the schema docs.
- **Role attributes:** `anon`/`authenticated` = non-super, no `BYPASSRLS`; `service_role` = `BYPASSRLS` ✓; `postgres` = `BYPASSRLS` + `CREATEROLE`.
- Performance advisor `multiple_permissive_policies` (WARN ×7): `admin_users` (6 role-SELECT combos) and `payment_receipts` (admin + own-receipt policies) — legitimate "admin OR owner" OR-patterns; performance-only.

## 4. Functions, triggers, storage

- **`SECURITY DEFINER` functions:** advisors report 38 executable by `anon` and 85 by `authenticated` (cart/search/quote RPCs with internal checks by design). Spot-check of the three most sensitive:
  - `verify_vodafone_cash_payment` — `if not public.is_admin() then raise exception 'Admin only'` ✓ (despite anon-executable, non-admins always fail) + `SET search_path TO 'public'` ✓
  - `approve_vendor_payout_request` — `if not public.is_admin() … 'Admin access required'` ✓ + search_path ✓
  - `set_order_shipping_method` — loads order, `if v_owner <> auth.uid() … 'Not your order'` ✓ + validates the shipping method ✓ + search_path ✓
  - **Verdict:** guarded. *Follow-up (non-blocking):* sweep the remaining anon-callable functions for internal checks (pattern established by these three).
- **Triggers (130+):** notable guards — `prevent_role_self_escalation` (profiles), `prevent_store_status_self_approval` (stores), order/shipment/design status-transition guards, restock-on-cancel, `wallet_transactions` apply trigger, welcome/notify triggers. No missing-guard findings.
- **Storage (10 buckets):**
  - `custom-print-designs` — **private, ZERO policies** → only service role can touch it (correct: uploads/serving go through the API).
  - `payment-receipts`, `design-uploads` — private + owner/admin policies ✓ (receipts also need admin `SELECT` for verification flow).
  - Public buckets (`avatars`, `product-images`, `gallery-images`, `fonts`, `design-previews`, `customization-previews`, `review-media`) — policies are owner-folder-scoped (`foldername(name)[1] = auth.uid()`) + `is_admin()` for writes ✓.
  - Note: `review-media` is public + allows video ≤ 50 MB — by design for public reviews; flag if policy changes.

## 5. Views exposure analysis (the core finding)

**Facts:** all **41** views are owned by `postgres` (`BYPASSRLS`) and **none** is `security_invoker` → they execute with owner rights and **bypass the caller's table RLS**. Effective protection = view GRANTS + in-body `WHERE` guards. Exposure below is derived from live `has_table_privilege()` + `pg_get_viewdef()` (static, high-confidence; live role-impersonation unavailable to the read-only role).

### 5a. Findings

| # | Severity | Views | Grant | Guard | App consumer | Exposure |
|---|---|---|---|---|---|---|
| **V1** | 🔴 High | `order_summary`, `order_items_detailed`, `shipment_tracking`, `wishlist_items_detailed`, `notification_summary` (+ `low_stock_variants` 🟠 med) | **anon + authenticated** | **NONE** | **None** (grep-verified) | Anyone with the public anon key can read **all orders** (order numbers, user IDs, statuses, totals), **all order items** (gift notes, print instructions), **all shipment tracking numbers/addresses**, **all wishlists**, **all users' notification activity** via `GET /rest/v1/<view>` |
| **V2** | 🟠 Med | 9 vendor views: `vendor_average_order_value`, `vendor_best_customers`, `vendor_customer_retention`, `vendor_monthly_stats`, `vendor_pending_shipments`, `vendor_refund_rate`, `vendor_revenue_over_time`, `vendor_sales_by_category`, `vendor_top_products` | **authenticated** | **NONE** (verified: no `owns_store`/`auth.uid()`/`is_admin()` in body — e.g. `vendor_revenue_over_time` groups by `store_id` with no store filter) | 6 of 9 via `app/api/vendor/stats/route.js` (caller token + `.eq("store_id", own store)`) | **Any signed-in user** can read **every store's** revenue, best customers, refund rates, pending shipments — cross-tenant analytics leak |
| **V3** | 🟠 Med | `order_item_print_files` | authenticated | NONE | **None** (grep-verified) | Any signed-in user reads every order's print instructions + `design_file_path` (private-bucket paths) |
| **V4** | 🟡 Low–Med | `cart_totals`, `cart_items_detailed` | authenticated | NONE | **Yes** — `app/api/cart` GET, `app/api/orders`, `app/api/checkout/preview` (all with a validated user JWT + `.eq("cart_id", own)`); guests use RPCs; `cartService.getCart` is dead code | Any signed-in user can query the raw view **without** the `.eq()` filter and enumerate all 215 carts (owner IDs, coupons, totals, item details) |

### 5b. Views verified SAFE

- **`admin_coupon_performance`, `admin_customer_ltv`, `admin_design_moderation_queue`, `admin_mv_coupon_performance`, `admin_printing_queue`** — anon+authed grants BUT `WHERE is_admin()` in body → `auth.uid()` null/false for anon ⇒ **0 rows** ✓ (revoked anyway as defense-in-depth — no consumer).
- **10 guarded vendor views** (`vendor_dashboard_overview`, `vendor_order_items`, `vendor_printing_queue`, `vendor_conversion_metrics`, `vendor_pending_designs`, all `vendor_mv_*`) — `WHERE owns_store(...)` ✓.
- **`reviews_detailed`** — approved-only, deleted-filtered (public by design).
- **`storefront_products`**, **`mv_trending_products`** — public storefront data by design.
- **6 admin views with NO grants at all** (`admin_customers_overview`, `admin_daily_sales`, `admin_inventory_status`, `admin_orders_overview`, `admin_product_performance`, `admin_reviews_moderation_queue`) — inaccessible to `anon`/`authenticated` ✓.

### 5c. Remediation prepared → `supabase/manual-review/06_harden_view_exposure.sql` (**approval-gated**)

- **Section A:** `REVOKE SELECT` on V1/V3 views + the 5 is_admin-guarded admin views (zero app consumers → zero feature risk).
- **Section B:** `CREATE OR REPLACE` the 9 V2 vendor views with `AND (owns_store(store_id) OR …service_role claims…)`. Legitimate callers unchanged: the stats route always filters to the caller's own store (guard passes), admins pass via `is_admin()` inside `owns_store()`, `service_role` passes via the claims escape hatch.
- **Section C:** `ALTER VIEW … SET (security_invoker = true)` for the two V4 cart views so the underlying `carts`/`cart_items` **owner-or-admin RLS policies** apply (verified: every underlying table has `authenticated` SELECT grants + SELECT policies, and all app consumers query with the owner's JWT → no breakage; `service_role` keeps `BYPASSRLS`).
- Includes pre-flight greps, post-apply verification queries, and a full commented **rollback** section (original view bodies captured).
- **Not applied.** Requires explicit approval; recommended order: staging first, then backup, then production.

## 6. Referential integrity

- **132 FKs** enumerated from `pg_constraint` and checked programmatically (child column `IS NOT NULL AND NOT EXISTS parent`): **0 orphans across all 132** ✅.
- Orphan-prone flows (order items after cancel, cart items after product delete, notification deliveries) are additionally protected by triggers (soft-delete `deleted_at` patterns + cascade rules).

## 7. Extensions & migrations

- **Installed:** `pg_stat_statements`, `pg_cron`, `pg_trgm`, `pgcrypto`, `pg_net`, `ltree`, `uuid-ossp`, `pg_graphql`, `supabase_vault`, `plpgsql` (+ `http`/`tablefunc`/`intarray`/`btree_gin` etc. available). No risky extension observed.
- **Migrations:** ~190 applied versions (oldest `20260706081845`, newest `20261026`), latest app migration `admin_audit_log`. The gift-box CHECK migration and `manual-review/01`–`06` are **local-only and pending approval** (verified: `custom_print_requests.product_type` live CHECK = `tshirt| mug| phonecase| poster| other` — no `gift_box` yet, as expected).
- ⚠️ **Local rebuild test (2026-11-01) — the repository cannot recreate the schema:** a fresh `supabase start` fails deterministically:
  1. the CLI **skips the 7 legacy `create_*.sql` files** (filename must match `<timestamp>_name.sql`),
  2. **no active migration creates `public.profiles`** — its creator (`20260913_comprehensive_audit_fixes_ARCHIVED_DANGEROUS.sql`) was moved to `supabase/migrations-archived/`,
  3. therefore `20260907_create_admin_users_secure.sql` fails with `relation "public.profiles" does not exist`.
  Core tables (`products`, `stores`, `categories`, `brands`, …) have no creator anywhere in the active chain — their DDL exists only in production. **Consequence:** the production schema is *not reproducible* from this repository, which makes the approval-gated DR schema snapshot (§9) the only viable rebuild path. This also blocked creating a local Supabase stack for integration/E2E testing (see tracker Phase Six).

## 8. Prepared SQL inventory (all approval-gated, none applied)

| File | Purpose | Status |
|---|---|---|
| `01_product_images_cleanup.sql` | Orphan/duplicate product image cleanup | Awaiting approval |
| `02_test_products_cleanup.sql` | Test product removal | Awaiting approval |
| `03_currency_cleanup.sql` | Currency normalization | Awaiting approval |
| `04_shipping_zones_egypt.sql` | Egypt shipping zone + rates | Awaiting approval |
| `05_checkout_weight_shipping_fee.sql` | Weight-based fee column/flag (gated by `SHIPPING_CALCULATE_WEIGHT`, default off) | Awaiting approval |
| `06_harden_view_exposure.sql` | View exposure fixes (§5c above) | **New — awaiting approval** |
| `supabase/migrations/20261101_add_gift_box_product_type.sql` | Extend product_type CHECK for gift boxes (A2) | Awaiting approval |

## 9. Blocked items requiring owner action

1. **Apply `manual-review/01`–`06` + the gift-box migration** — all written, reviewed, rollback-capable; production untouched.
2. **DR schema snapshot** (`supabase db dump --linked`) — read from production, needs human approval (still blocked). Now **critical**: per §7, the repo's migration chain cannot rebuild the schema on its own (`profiles`/`products`/… have no active creator), so this snapshot is the only viable disaster-recovery path.
3. **`store_settings` data entry** — contact info, currency decision, social links (checklist §1–§10).
4. **Optional follow-ups (non-blocking):** sweep remaining anon-callable `SECURITY DEFINER` functions for internal guards; drop 4 duplicate indexes + evaluate 154 unused indexes; consider `REVOKE` hardening on `admin_audit_log`/`_seed_report` documentation.

## 10. Status

| Tracker item | Status |
|---|---|
| Full schema/RLS/functions/triggers/storage policy review → this report | ✅ **Done (read-only)** |
| Diagnostic + guarded cleanup/hardening SQL → `supabase/manual-review/` | ✅ **Prepared** (01–06; 06 new) — **BLOCKED-REQUIRES APPROVAL** to apply |
| DR schema snapshot (`supabase db dump --linked`) | ⛔ **BLOCKED — requires human approval** |
