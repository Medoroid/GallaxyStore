# Database Migration Plan (local only — NOT applied)

Date: 2026-11-17 · Target: Supabase `httywgkwfqvrbuwuzutu` · All statements below are **prepared, not executed**.

## 0. Non-negotiable preconditions

1. Use an isolated Staging database with representative test data. Never apply these to production without explicit human approval.
2. Take a logical backup (`pg_dump`/Supabase backup) and record its restore point.
3. Record live baseline definitions for functions that will be replaced:
   ```sql
   select p.proname, pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('cancel_order','request_vendor_payout','approve_vendor_payout_request',
                       'confirm_order_payment','sync_product_available_colors');
   ```
4. Run the preflight queries below; stop if any result contradicts the expected state.

## 1. Preflight (read-only)

```sql
-- A. Known drift (all must currently be false/missing)
select to_regclass('public.store_themes') is null as theme_missing,
       to_regclass('public.gift_boxes') is null as giftbox_missing,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='products'
                 and column_name='available_sizes') as sizes_present;

-- B. Confirm the vulnerable grants still exist (for before/after evidence)
select proname, proacl from pg_proc
where proname in ('confirm_order_payment','sync_product_available_colors',
                  'verify_vodafone_cash_payment');

-- C. Confirm double restock exists (both true BEFORE step 4)
select p.proname,
       pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%' as increments_stock
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('cancel_order','restock_on_order_cancel');
```

## 2. Execution order

| # | File | Why this position |
|---|---|---|
| 1 | `supabase/manual-apply/20261112_pending_bundle.sql` | Base schema: site content, themes, creator studio, `available_sizes`, colour-sync guard, admin performance view, §8 security revokes. Must precede everything that selects the new columns/tables. |
| 2 | `supabase/migrations/20261116130000_custom_print_studio.sql` | Creates mockup/design tables and `mockup-assets` bucket. |
| 3 | `supabase/migrations/20261117140000_gift_box_bundles.sql` | Creates gift-box tables and the **component-aware** `restock_on_order_cancel()` trigger function. |
| 4 | `supabase/migrations/20261117150000_fix_cancel_order_double_restock.sql` | After step 3 so it coexists with the component-aware trigger; removes the inline restock from `cancel_order()`. |
| 5 | `supabase/migrations/20261117160000_vendor_payout_method.sql` | Drops/recreates `request_vendor_payout` with `p_method`; re-grants EXECUTE; copies method in approve. Route ships with a fallback, but deploy together. |
| 6 | `supabase/migrations/20261117170000_harden_financial_rls.sql` | Narrows financial policies to `authenticated` and removes the PUBLIC grant from `verify_vodafone_cash_payment`. |

Note: `20261117130000_revoke_public_security_definer_execute.sql` is the standalone source of bundle §8. If the bundle was applied, do **not** treat it as a missing step; its statements are idempotent anyway.

Apply each file as one script in SQL Editor, capture any error, and stop the sequence on the first failure. Do not use `supabase db push`, `db reset`, `DROP TABLE`, or `TRUNCATE`.

## 3. Post-apply verification (all must pass)

```sql
-- A. Schema
select to_regclass('public.store_themes') as themes,
       to_regclass('public.site_banners') as banners,
       to_regclass('public.creator_profiles') as creators,
       to_regclass('public.gift_boxes') as giftboxes,
       to_regclass('public.mockup_templates') as mockups;
select exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='products'
                 and column_name='available_sizes') as product_sizes_column;

-- B. Payment/colour revokes: no =X/, no anon/authenticated for the four functions
select proname, proacl,
       not (proacl::text like '%=X/%' or proacl::text like '%anon=X%'
            or proacl::text like '%authenticated=X%') as locked_down
from pg_proc where proname in ('confirm_order_payment','sync_product_available_colors',
                               'trg_sync_colors_from_variant','trg_sync_colors_from_variant_options');

-- C. Restock single authority: cancel_order false, trigger true
select p.proname,
       pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%' as increments_stock
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('cancel_order','restock_on_order_cancel');

-- D. Gift box tables/functions
select to_regclass('public.gift_box_items') is not null as items,
       to_regprocedure('public.gift_box_assert_components_available(uuid)') is not null as guard;

-- E. Payout method
select column_name from information_schema.columns
 where table_schema='public' and table_name='vendor_payout_requests'
   and column_name='payout_method';
select oid::regprocedure, proacl from pg_proc where proname='request_vendor_payout';

-- F. RLS roles
select tablename, policyname, roles, cmd from pg_policies
 where schemaname='public' and tablename in ('vendor_earnings','vendor_payout_requests',
   'vendor_commissions','recently_viewed_products');

-- G. Admin performance view (bundle includes its own query for the f9a11e67… product)
-- H. Storage
select id from storage.buckets where id in ('theme-assets','site-banners','mockup-assets');
```

## 4. Application smoke tests after migrations

1. `GET /api/admin/products` → 200 and includes `available_sizes`.
2. Admin create product with colours + sizes + `compare_at_price` → DB row matches.
3. `GET /api/gift-boxes` → 200 with real boxes (no `schema_pending`).
4. Admin gift-box flow: create box → add components → publish → add to cart → checkout → stock snapshot → cancel → restock exactly once.
5. Vendor payout: request with `method=paypal` → row has `payout_method='paypal'`; admin list shows it; approve → `vendor_payouts.payout_method` populated; double approve → 409.
6. Custom Print Studio: mockup assets list + template save works.

## 5. Rollback

- Restore the logical backup from step 0 (preferred for schema-wide changes).
- For individual functions, the live definitions captured in step 0 can be replayed with `CREATE OR REPLACE`.
- Specific reversals:
  - `cancel_order`: re-create the captured pre-fix function (restores the double restock — only acceptable in an emergency, then fix the root cause again).
  - payout: drop the 3-arg function, re-create the captured 2-arg version, `GRANT EXECUTE ... TO authenticated, service_role`, drop `payout_method` column.
  - RLS: `ALTER POLICY <name> ON <table> TO public;` for each policy in `20261117170000`.
  - grants: `GRANT EXECUTE ON FUNCTION public.confirm_order_payment(...) TO public, anon, authenticated;` — **never** do this in production; it reopens the P0 vulnerability.

## 6. Known blockers

- No Staging project/credentials exist (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` absent), so none of the above has been executed or runtime-verified. Everything remains `BLOCKED` in the tracker.
