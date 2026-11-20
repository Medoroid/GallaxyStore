-- READ-ONLY PRE-DEPLOYMENT SNAPSHOT — run in Supabase SQL Editor before any DDL.
-- Copy the output into the deployment record; never paste DDL into this script.

-- 1. Identity and history
select current_user, session_user, current_role, current_database(),
       current_setting('transaction_read_only') as tx_read_only;
select version, name from supabase_migrations.schema_migrations order by version;
select count(*) as applied_migration_versions from supabase_migrations.schema_migrations;

-- 2. Baseline object counts
select count(*) filter (where relkind='r') as tables,
       count(*) filter (where relkind='v') as views,
       count(*) filter (where relkind='m') as matviews
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';
select count(*) as functions from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public';
select count(*) as policies from pg_policies where schemaname='public';
select id, public from storage.buckets order by id;

-- 3. Objects the deployment will touch (present/absent BEFORE)
select to_regclass('public.site_banners') site_banners,
       to_regclass('public.store_themes') store_themes,
       to_regclass('public.creator_profiles') creator_profiles,
       to_regclass('public.creator_product_templates') creator_templates,
       to_regclass('public.creator_design_products') creator_design_products,
       to_regclass('public.creator_gallery_items') creator_gallery_items,
       to_regclass('public.mockup_templates') mockup_templates,
       to_regclass('public.shared_designs') shared_designs,
       to_regclass('public.gift_boxes') gift_boxes,
       to_regclass('public.gift_box_items') gift_box_items;

select exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='products'
   and column_name='available_sizes') as has_available_sizes,
 exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='vendor_payout_requests'
   and column_name='payout_method') as has_payout_method,
 exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='design_versions'
   and column_name='editor_state') as has_editor_state;

-- 4. P0 ACL baseline (all currently TRUE for anon)
select proname, proacl::text from pg_proc
 where proname in ('confirm_order_payment','sync_product_available_colors',
                   'verify_vodafone_cash_payment','request_vendor_payout',
                   'cancel_order','restock_on_order_cancel')
 order by proname;

-- 5. Enum values that migrations add
select t.typname, e.enumlabel
  from pg_enum e join pg_type t on t.oid=e.enumtypid
 where (t.typname='design_file_format' and e.enumlabel in ('jpg','webp'))
    or (t.typname='custom_print_requests_product_type' and e.enumlabel='gift_box')
 order by 1,2;

-- 6. Restore snapshot: capture definitions of functions the chain REPLACES.
--    Save this output next to the backup. Needed by 03_ROLLBACK.sql.
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and p.proname in (
     'confirm_order_payment','verify_vodafone_cash_payment',
     'request_vendor_payout','approve_vendor_payout_request',
     'cancel_order','restock_on_order_cancel',
     'checkout','get_shipping_options','calculate_tax','gift_wrap_fee',
     'complete_zero_total_order','initiate_external_wallet_payment',
     'submit_external_wallet_receipt','verify_external_wallet_payment'
   )
 order by 1;

-- 7. Restore snapshot: row counts of tables touched by backfills/UPDATEs.
select 'orders' tbl, count(*) rows from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'order_status_history', count(*) from public.order_status_history
union all select 'products', count(*) from public.products
union all select 'product_variants', count(*) from public.product_variants
union all select 'payments', count(*) from public.payments
union all select 'payment_receipts', count(*) from public.payment_receipts
union all select 'vendor_payout_requests', count(*) from public.vendor_payout_requests
union all select 'carts', count(*) from public.carts
union all select 'cart_items', count(*) from public.cart_items
union all select 'custom_print_requests', count(*) from public.custom_print_requests
union all select 'reviews', count(*) from public.reviews;
