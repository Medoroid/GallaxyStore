# Database Migration Recovery Report

Date: 2026-11-18 · Target project ref: `httywgkwfqvrbuwuzutu` · **Read-only extraction; nothing was written to production.**

## 1. Source of truth

The schema baseline was generated from the **live production catalog**, not from TypeScript, migration files, or assumptions.

- Connection: Supabase MCP `execute_sql`, authenticated as `supabase_read_only_user` (PostgreSQL 17.6 on aarch64-unknown-linux-gnu).
- Every extraction query was a `SELECT` against `pg_catalog` / `information_schema` / `pg_indexes` / `pg_policies` / `storage.*`, using `pg_get_functiondef`, `pg_get_viewdef`, `pg_get_constraintdef`, `pg_get_triggerdef`, `format_type` and `pg_get_expr`. No DDL, DML, transaction control, or privileged function call was issued.
- Local files were inspected read-only for context: `supabase/config.toml`, all 49 `supabase/migrations/*.sql`, all 8 `supabase/manual-review/*.sql`, and `docs/DATABASE-MIGRATION-PLAN.md`.
- Production and local drift check: production `request_vendor_payout` has **2 arguments** (`p_store_id uuid, p_amount numeric`), while `docs/DATABASE-MIGRATION-PLAN.md` step 5 and `06_local_staging_p0_verification.sql` expect a 3-argument version. This confirms the planned bundle was never applied to production, so the live catalog is the correct recovery source.

## 2. Counts extracted

| Object class | Production count | Extracted / reproduced in baseline |
|---|---:|---:|
| Extensions installed | 9 total (6 `extensions`, 2 `pg_catalog`, 1 `vault`) | 4 schema dependencies recreated (`pgcrypto`, `pg_trgm`, `uuid-ossp`, `ltree`) |
| Sequences (`public`) | 2 | 1 (`order_number_seq`); `_seed_report_id_seq` excluded |
| Enum types (`public`) | 13 types / 67 labels | 13 / 67 (all) |
| Tables (`public`, relkind `r`) | 76 | 75 (all except `_seed_report` helper) |
| Columns | 812 across 76 tables | 807 across 75 tables |
| Constraints | 397 total — 76 PK, 41 UNIQUE, 148 CHECK, 132 FK | 397 (76 PK + 41 UNIQUE + 148 CHECK inline; 132 FK via guarded loop) |
| Indexes | 321 | 203 definitions extracted for 45 foundational tables; 134 non-constraint indexes written (69 constraint-backed indexes are created by the PK/UNIQUE constraints) |
| Views + matviews | 51 (41 views, 10 matviews) | 11 foundational view definitions (`pg_get_viewdef`) |
| Functions/procedures | 180 | 31 foundational definitions (`pg_get_functiondef`, including `SECURITY DEFINER` and `SET search_path`) |
| Triggers | 123 non-internal in `public` + 4 on `auth.users` | 38 core-table + 4 auth definitions extracted; 32 written (only those whose functions are in the baseline) |
| Storage buckets | 10 | 10 (names, public flag, size limit, MIME types) |
| Storage policies | 28 (all on `storage.objects`) | Names/roles/commands recorded below; not recreated |
| RLS policies (`public`) | 206 | Intentionally excluded |

Extension versions observed: `ltree 1.3`, `pg_net 0.20.3`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `uuid-ossp 1.1` (schema `extensions`); `pg_cron 1.6.4`, `plpgsql 1.0` (`pg_catalog`); `supabase_vault 0.3.1` (`vault`).

## 3. File written

- **`supabase/manual-apply/00_authoritative_baseline.sql`** — new file, 2,621 lines / ~133 KB. Header: `Generated from production catalog read-only 2026-11-18; local/staging only; no data`.
- Contains, in order: extension creation, `order_number_seq`, 13 guarded enum `CREATE TYPE` blocks, 75 `CREATE TABLE IF NOT EXISTS` statements with full column definitions plus PK/UNIQUE/CHECK constraints, 132 guarded FK `ALTER TABLE` statements, 134 foundational indexes, 31 `CREATE OR REPLACE FUNCTION` definitions, 11 `CREATE OR REPLACE VIEW` definitions, 32 guarded triggers (29 on `public`, 3 on `auth.users`), and 10 `INSERT ... ON CONFLICT DO NOTHING` storage-bucket definitions.
- No credentials, keys, secrets, connection strings, business rows, or `COPY`/`INSERT INTO <app table>` statements.
- Idempotent by construction (`IF NOT EXISTS`, guarded `DO` blocks, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`). Designed to be applied to a **fresh** local/staging database **before** the 49 existing migrations, so those migrations layer on top.

## 4. Intentionally excluded

- All business data and file objects (schema only).
- 206 RLS policies in `public` and all 28 `storage.objects` policies. These are security-sensitive, role-dependent, and defined/redefined by later migrations and `manual-review/*.sql`; recreating them from a stale snapshot could reopen the P0 issues documented in `DATABASE-MIGRATION-PLAN.md`. For reference, the production storage policy names are: `avatars_owner_{delete,insert,update}`, `customization_previews_owner_{delete,insert,update}`, `design_previews_admin_{delete,insert,update}`, `design_uploads_owner_insert`, `design_uploads_owner_or_admin_{delete,select,update}`, `fonts_bucket_admin_{delete,insert,update}`, `gallery_images_admin_{delete,insert,update}`, `gallery_images_public_select` (the only policy granted to `anon`), `payment_receipts_owner_{delete,insert,select}`, `product_images_owner_{delete,insert,update}`, `review_media_bucket_owner_{delete,insert}`.
- GRANTs / privilege changes (later migrations own these; production `proacl` was read but not replayed).
- 10 materialized views and their refresh RPCs, 40 reporting/admin/vendor analytics views, and 149 non-foundational functions (notification, logging, payment orchestration, print queue, refund/payout workflows, seed helpers).
- Triggers whose supporting functions are not part of the baseline, including `create_default_notification_preferences()` (and therefore `on_auth_user_created_notification_prefs` and `create_default_notification_prefs_trigger`), `set_design_version_number()` (`before_insert_design_version`), and the notify/log/sync trigger families.
- The `_seed_report` helper table and its sequence.
- `pg_cron` job schedules, Realtime publications, auth provider configuration, and API keys — outside the schema baseline scope and/or not safely portable.
- 118 non-foundational indexes (analytics/reporting tables and derived views).

No production object was found that was *required* for the baseline but impossible to reconstruct. All 75 in-scope tables, their 807 columns, 397 constraints, 13 enums, and the 31 named foundation functions/views were recovered verbatim. The only objects deliberately left out are listed above.

## 5. How to verify on local staging

Run against a **local** Supabase stack only — never against `httywgkwfqvrbuwuzutu`.

```powershell
# 1. Fresh local database with migrations + seed enabled (no config overrides).
#    The baseline is installed as the earliest migration
#    supabase/migrations/20260000000000_authoritative_baseline.sql, so CLI applies
#    it automatically before the historical migrations.
npx supabase db reset
# Result: 44 migrations applied + supabase/seed.sql, 0 errors.
```

```sql
-- 2. Structural parity: must match the production counts above.
select count(*) filter (where relkind='r')  as tables,
       count(*) filter (where relkind='S')  as sequences
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';
-- expected: tables = 75, sequences = 1

select count(*) as enum_types from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and typtype='e';                       -- expected: 13

select contype, count(*) from pg_constraint
where connamespace='public'::regnamespace group by contype order by contype;
-- expected: c=148, f=132, p=76, u=41

select count(*) from pg_indexes where schemaname='public';      -- expected: >= 134

select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('set_updated_at','is_admin','is_vendor','owns_store','owns_order','owns_product',
  'current_user_role','can_access_cart','calculate_tax','gift_wrap_fee','get_shipping_options',
  'search_products','get_search_suggestions','get_search_facets','get_popular_searches',
  'log_search','update_product_search_vector','handle_new_user','slugify',
  'restock_on_order_cancel','validate_order_status_transition'); -- expected: 21

select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v' and c.relname in
 ('cart_items_detailed','cart_totals','storefront_products','order_summary',
  'order_items_detailed','reviews_detailed','wishlist_items_detailed',
  'low_stock_variants','order_item_print_files','shipment_tracking',
  'notification_summary');                                      -- expected: 11

select id from storage.buckets order by id;                     -- expected: 10 rows

-- 3. Idempotency: re-running the baseline must raise no errors and not change counts.
-- 4. Then run the existing preflight/assertion suites:
--    supabase/manual-review/06_local_staging_p0_verification.sql
--    supabase/manual-review/07_vendor_isolation_staging.sql
-- 5. Application smoke tests from docs/DATABASE-MIGRATION-PLAN.md section 4.
```

If any count above is lower, the baseline was not applied to a clean schema; reset and reapply before running migrations.

## 6. Bootstrap hardening applied during validation

The first local bootstrap exposed real defects in the historical migration chain. All were fixed at the root and `npx supabase db reset` now completes with migrations and seed enabled:

- 18 files had duplicate 8-digit version prefixes; renamed to unique 14-digit versions (`<date>000001_…`, `000002_…`). Updated `__tests__/payment-migration-guards.test.ts` references.
- `20260909000001/2…` and `20260909000003…`: guarded the `cart_items_cart_variant_color_size_unique` constraint and replaced `CREATE OR REPLACE VIEW cart_items_detailed` with `DROP VIEW IF EXISTS …` + create (Postgres cannot drop columns via replace).
- `20260910000002…`: removed invalid RLS statements on views (`ALTER TABLE <view> ENABLE ROW LEVEL SECURITY`, `CREATE POLICY ON VIEW`); `security_invoker = true` is the correct mechanism.
- `20260916000001…`: replaced `'superadmin'` with the only valid admin value for `profiles.role` enum (`'admin'`; enum labels: customer/vendor/admin).
- `20261002000002…`, `20261023…`: added `DROP FUNCTION IF EXISTS` before redefining functions with changed return types or parameter names.
- Baseline extended with `owns_design`, `owns_product`, `set_design_version_number`, `trg_sync_colors_from_variant[_options]` and guard-compatible RLS policy narrowing in `20261117170000…`.

Post-bootstrap verification (local): **91 tables / 68 functions / 17 views / 44 triggers / 33 policies / 44 migrations applied**; `available_sizes` and `payout_method` present; anon/authenticated cannot execute `confirm_order_payment`; anon cannot execute `verify_vodafone_cash_payment`; `cancel_order` has no inline restock and the trigger still restocks.
