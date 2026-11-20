# Production Database Migration Runbook

> **PRODUCTION WRITE OPERATIONS REQUIRE EXPLICIT HUMAN APPROVAL.**
> This runbook was prepared from a READ-ONLY inspection of production and validated on an isolated local Supabase stack. The agent did not and must not execute these steps against production.

Prepared: 2026-11-18 · Target project: `httywgkwfqvrbuwuzutu` · Local validation: `npx supabase db reset` → 44 migrations applied, seed loaded, 0 errors.

## A. Pre-migration checklist

1. **Snapshot schema and grants** (read-only):
   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   select count(*) from pg_tables where schemaname='public';
   select proname, proacl from pg_proc
    where proname in ('confirm_order_payment','verify_vodafone_cash_payment',
                      'sync_product_available_colors','request_vendor_payout',
                      'cancel_order','restock_on_order_cancel');
   ```
2. **Backup**: take a logical backup (`pg_dump --schema-only` plus a full backup) and a storage-object backup. Record the restore point. Production history currently ends at `20261026_admin_audit_log`.
3. **Do not apply the baseline file to production.** `20260000000000_authoritative_baseline.sql` reconstructs objects that already exist there; it is only for rebuilding Local/Staging.
4. **Confirm no conflicting history**: migration filenames were renumbered locally to unique 14-digit versions. Production versions may differ; decide object-level before applying, not by version string alone.
5. **Allowed window**: schedule low traffic; note that some statements take ACCESS EXCLUSIVE locks (constraint/index/trigger changes).
6. **Rollback owner** identified and available.

## B. Ordered migration plan

All files are in `supabase/migrations/`. The following groups must be applied in this order on a fresh Staging first, then (after approval) on Production. For production, skip objects already proven present by a pre-check.

### Group 0 — verify-only (already in production baseline)
`20260907000001_create_admin_users_secure.sql` … `20261026_admin_audit_log.sql`: foundational objects already exist in production. Verify existence; do not re-run blindly. Local helper functions from `00_authoritative_baseline.sql` are **local-only**.

### Group 1 — payment / checkout / catalog
| File | Purpose | Risk | Verification query |
|---|---|---|---|
| `20261028_payment_methods_external_wallet.sql` | Wallet payment methods + RPCs | function redefinitions; ACL resets | `select to_regprocedure('public.initiate_external_wallet_payment(uuid)')` |
| `20261029_order_payment_completion.sql` | Payment completion helpers | medium | `select to_regprocedure('public.complete_zero_total_order(uuid)')` |
| `20261030000001_checkout_coupon_shipping_hardening.sql` | Coupon/shipping checks | medium | `select to_regprocedure('public.get_shipping_options(text,numeric,integer)')` |
| `20261030000002_confirm_order_payment_partial_index.sql` | Confirmation guard + index | **ACL-sensitive** | `select proacl from pg_proc where proname='confirm_order_payment'` |
| `20261030000003_order_status_cod_transitions.sql` | COD status machine | low | `select to_regprocedure('public.validate_order_status_transition(order_status,order_status)')` |
| `20261030000004_product_images_bucket.sql` | Product image bucket policies | storage | `select id from storage.buckets where id='product-images'` |
| `20261101_add_gift_box_product_type.sql` | `gift_box` enum value | low | `select enumlabel from pg_enum ... where enumlabel='gift_box'` |

### Group 2 — content / theme / creator / catalog
| File | Purpose | Risk | Verification |
|---|---|---|---|
| `20261108130000_site_content_banners_sections.sql` | Banners/sections + bucket | new tables | `to_regclass('public.site_banners')` |
| `20261110100000_theme_management.sql` | Theme tables + assets | new tables | `to_regclass('public.store_themes')` |
| `20261110120000_creator_studio_core.sql` | Creator tables | preflight guards | `to_regclass('public.creator_profiles')` |
| `20261110160000_creator_studio_template_seed.sql` | Template seed | data seed | `select count(*) from creator_product_templates` |
| `20261110170000_creator_studio_publish_functions.sql` | Publish RPCs | function grants | `to_regprocedure('public.creator_publish_product(uuid)')` |
| `20261112090000_fix_admin_product_performance.sql` | View fix (phantom rows) | view replacement | bundle §7 query |
| `20261115120000_product_available_sizes_and_color_sync_guard.sql` | `available_sizes` + colour guard | **required by code** | `information_schema.columns` + `pg_get_functiondef` guard |
| `20261116130000_custom_print_studio.sql` | Studio tables/bucket | new tables | `to_regclass('public.mockup_templates')` |

### Group 3 — P0/P1 corrections (must be last)
| File | Purpose | Risk | Verification |
|---|---|---|---|
| `20261117130000_revoke_public_security_definer_execute.sql` | Revoke anon/PUBLIC on payment + colour RPCs | **ACL-sensitive** | `has_function_privilege('anon', …) = false` |
| `20261117140000_gift_box_bundles.sql` | Gift-box schema + component-aware restock trigger | new tables/trigger | `to_regclass('public.gift_boxes')` |
| `20261117150000_fix_cancel_order_double_restock.sql` | Trigger becomes single restock authority | **inventory integrity** | `cancel_order` has no inline increment; trigger has one |
| `20261117160000_vendor_payout_method.sql` | 3-arg payout RPC + method column + advisory lock | function drop/recreate; coordinate with API deploy | `pronargs=3`, column exists |
| `20261117170000_harden_financial_rls.sql` | Narrow 10 policies; revoke verify RPC grant | RLS/ACL | `pg_policies.roles = {authenticated}` |
| `20261118100000_drop_duplicate_indexes.sql` | Drop 4 exact duplicate indexes | locking; use CONCURRENTLY on prod | `pg_indexes` no duplicates |
| `20261118110000_enable_rls_and_final_view_grants.sql` | Enable RLS on any remaining tables; final view ACLs | low | `relrowsecurity` on all tables; anon denied on cart views |
| `20261118115000_authoritative_vendor_views.sql` | Recreate 19 vendor views locally (LOCAL/STAGING ONLY — already in production) | do not apply to production | `vendor_%` views exist locally |
| `20261118120000_fix_vendor_views_security_invoker.sql` | Convert all 19 vendor views to `security_invoker=true` | **access change**: underlying RLS now applies | all 19 reloptions contain `security_invoker=true`; two-vendor probe passes |
| `20261118130000_vendor_order_rls.sql` | Vendor-scoped SELECT policies on orders/order_items | security-sensitive | vendor sees own store orders; no cross-store; anon denied |

**Deploy coupling:** the vendor payout API sends `p_method` with a 2-arg fallback, so code and migration may be deployed in either order, but end-to-end method persistence requires the migration.

## C. Post-migration verification (all must pass)

```sql
-- core schema
select to_regclass('public.store_themes'), to_regclass('public.site_banners'),
       to_regclass('public.creator_profiles'), to_regclass('public.gift_boxes'),
       to_regclass('public.mockup_templates');
select exists (select 1 from information_schema.columns
 where table_schema='public' and table_name='products' and column_name='available_sizes');
select exists (select 1 from information_schema.columns
 where table_schema='public' and table_name='vendor_payout_requests' and column_name='payout_method');

-- P0 ACLs (all must be false)
select has_function_privilege('anon','public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)','EXECUTE'),
       has_function_privilege('authenticated','public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)','EXECUTE'),
       has_function_privilege('anon','public.sync_product_available_colors(uuid)','EXECUTE'),
       has_function_privilege('anon','public.verify_vodafone_cash_payment(uuid,boolean,text)','EXECUTE');

-- inventory single restock: cancel_order false, trigger true
select p.proname,
       pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('cancel_order','restock_on_order_cancel');

-- payout RPC and grants
select oid::regprocedure, proacl from pg_proc where proname='request_vendor_payout';

-- RLS roles (must not be {public})
select tablename, policyname, roles from pg_policies
 where schemaname='public' and tablename in ('vendor_earnings','vendor_payout_requests');

-- vendor views: all 19 must contain security_invoker=true
select c.relname, c.reloptions
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
 order by c.relname;
```

Application smoke tests: admin product GET 200; create product with colours/sizes; gift-box list 200; vendor payout request with `method=paypal`; admin payout approve; cancel a disposable staged order and assert stock returns exactly once.

## D. Rollback / recovery

- **Before applying**: backup + `pg_get_functiondef` snapshot of every function being replaced.
- **Migration failure mid-file**: stop the batch; identify the statement; fix the SQL (do not mark the version applied manually); restore from backup only if partial state is unsafe.
- **Wrong ACL**: replay the specific `REVOKE`/`GRANT` statements; never grant anon EXECUTE on payment functions as a workaround.
- **Double restock observed**: re-apply `20261117150000`; do not drop the trigger.
- **Lock timeout**: rerun index changes with `CREATE INDEX CONCURRENTLY` in a separate maintenance window; the duplicate-index file is optional and can be deferred.
- **Irreversible changes**: none in this set are planned, but the 3-arg payout RPC replacement must be rolled back by re-creating the captured 2-arg definition and re-granting EXECUTE.

## E. Human execution gate
Only the project owner may run the above on production. After completion, paste the verification output into `docs/PRODUCTION-READINESS-FINAL-REPORT.md` and update tracker statuses from BLOCKED to VERIFIED.
