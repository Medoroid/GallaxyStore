-- READ-ONLY POST-DEPLOYMENT VERIFICATION — every row must satisfy the stated expectation.
-- Run AFTER each migration group (and again at the end) in Supabase SQL Editor.

-- A. Required tables (none may be null)
select to_regclass('public.site_banners') site_banners,
       to_regclass('public.site_sections') site_sections,
       to_regclass('public.store_themes') store_themes,
       to_regclass('public.theme_settings') theme_settings,
       to_regclass('public.creator_profiles') creator_profiles,
       to_regclass('public.creator_product_templates') creator_templates,
       to_regclass('public.creator_design_products') creator_design_products,
       to_regclass('public.creator_gallery_items') creator_gallery_items,
       to_regclass('public.mockup_templates') mockup_templates,
       to_regclass('public.shared_designs') shared_designs,
       to_regclass('public.gift_boxes') gift_boxes,
       to_regclass('public.gift_box_items') gift_box_items,
       to_regclass('public.order_item_gift_box_contents') gift_box_snapshots;

-- B. Required columns (all must be true)
select exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='products'
   and column_name='available_sizes') products_sizes,
 exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='design_versions'
   and column_name='editor_state') design_editor_state,
 exists(select 1 from information_schema.columns
 where table_schema='public' and table_name='vendor_payout_requests'
   and column_name='payout_method') payout_method;

-- C. P0 ACLs (all must be false)
select has_function_privilege('anon','public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)','EXECUTE') anon_confirm,
       has_function_privilege('authenticated','public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)','EXECUTE') auth_confirm,
       has_function_privilege('anon','public.sync_product_available_colors(uuid)','EXECUTE') anon_colors,
       has_function_privilege('anon','public.verify_vodafone_cash_payment(uuid,boolean,text)','EXECUTE') anon_verify;

-- D. Inventory integrity: cancel_order=false, trigger=true
select p.proname,
       pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%' as increments_stock
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('cancel_order','restock_on_order_cancel');

-- E. Payout RPC signature and grants
select oid::regprocedure as signature, proacl::text
from pg_proc where proname='request_vendor_payout';

-- F. RLS policies on financial tables must not be TO public
select tablename, policyname, roles::text from pg_policies
 where schemaname='public' and tablename in ('vendor_earnings','vendor_payout_requests')
 order by tablename, policyname;

-- G. Vendor views: all 19 must contain security_invoker=true
select c.relname, c.reloptions::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
 order by c.relname;

-- H. Creator Studio publish flow
select to_regprocedure('public.creator_publish_product(uuid, jsonb)') publish_fn,
       (select count(*) from public.creator_product_templates) template_count;

-- H2. R1 — final checkout() must contain BOTH hardenings and gift-box logic.
select pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure) like '%v_coupon.starts_at > now()%' as coupon_hardened,
       pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure) like '%public.get_shipping_options(v_country%' as shipping_hardened,
       pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure) like '%gift_box_items%' as giftbox_aware,
       pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure) not like '%round(base_fee, 2) = round(p_shipping_fee, 2)%' as no_old_fee_check;

-- I. Enum values + gift_box CHECK (NOT an enum label)
select t.typname, e.enumlabel
  from pg_enum e join pg_type t on t.oid=e.enumtypid
 where t.typname='design_file_format' and e.enumlabel in ('jpg','webp')
 order by 1,2;

select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid='public.custom_print_requests'::regclass
   and contype='c'
   and pg_get_constraintdef(oid) like '%gift_box%';

-- J. Migration history (record final count)
select count(*) as applied_migration_versions,
       max(version) as last_version
from supabase_migrations.schema_migrations;
