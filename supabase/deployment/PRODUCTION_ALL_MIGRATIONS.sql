/*
 * GALAXY STORE — ONE-TIME PRODUCTION DATABASE DEPLOYMENT
 * Project: httywgkwfqvrbuwuzutu
 * Generated: 2026-11-18 from the approved 22-file deployment manifest.
 *
 * HUMAN APPROVAL IS REQUIRED. No automatic rollback is included.
 *
 * BEFORE RUNNING THIS FILE:
 *   1. Take a full backup (schema + data + storage) and verify it is restorable.
 *   2. Run supabase/manual-apply/production-deployment/01_PRECHECK.sql SEPARATELY
 *      and review its output BEFORE running this file. The PRECHECK section below
 *      is embedded for the record, not as a gating step: a single execution cannot
 *      stop for human review between the checks and the migrations.
 *   3. Use Supabase SQL Editor with a role that can execute DDL (normally postgres).
 *
 * EXECUTION:
 *   - Paste this entire file into SQL Editor and run once.
 *   - If any statement errors, STOP. Do not re-run the whole file blindly.
 *   - Review the embedded POSTCHECK at the end and the guide in
 *     supabase/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md.
 *
 * SAFETY:
 *   - No production operation was executed while preparing this file.
 *   - Every migration below is copied byte-for-byte from supabase/migrations/.
 *   - The historical checkout hardening migration is excluded; its logic is
 *     preserved inside migration 22/22 (unified checkout).
 */

-- ============================================================================
-- PHASE 0 — PRE-DEPLOYMENT CHECKS (run 01_PRECHECK.sql separately first)
-- ============================================================================
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


-- ============================================================================
-- MIGRATION 01/22 — 20261028_payment_methods_external_wallet.sql — timestamp 20261028
-- ============================================================================
-- Payment methods: persist the customer's choice, harden COD and add a generic
-- external-wallet transfer flow.
--
-- This migration is additive and deliberately keeps:
--   * stripe / paymob / wallet / vodafone_cash enum values
--   * historical payments, receipts and orders
--   * the legacy Vodafone Cash RPCs used by old order pages
--
-- It does NOT create card/Paymob sessions. New orders are limited to `cod` and
-- `external_wallet`.

-- ---------------------------------------------------------------------------
-- 1. Persist the payment method on the order
-- ---------------------------------------------------------------------------
alter type public.payment_provider
  add value if not exists 'external_wallet';

alter table public.orders
  add column if not exists payment_method text;

-- Backfill only where the historical data is unambiguous. The settled attempt
-- wins; otherwise the newest still-open attempt is the best available record.
-- Failed-only orders stay NULL so they are not mislabeled or blocked from using
-- the legacy Vodafone page.
update public.orders o
   set payment_method = (
     select p.provider::text
       from public.payments p
      where p.order_id = o.id
        and p.status in ('succeeded', 'pending', 'processing')
      order by (p.status = 'succeeded') desc, p.created_at desc
      limit 1
   )
 where o.payment_method is null
   and exists (
     select 1
       from public.payments p
      where p.order_id = o.id
        and p.status in ('succeeded', 'pending', 'processing')
   );

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'orders_payment_method_check'
       and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (
        payment_method is null
        or payment_method in (
          'cod',
          'external_wallet',
          'stripe',
          'paymob',
          'wallet',
          'vodafone_cash'
        )
      );
  end if;
end $$;

create index if not exists orders_payment_method_idx
  on public.orders (payment_method);

-- ---------------------------------------------------------------------------
-- 2. COD: server-side validation + idempotent creation
-- ---------------------------------------------------------------------------
create or replace function public.pay_with_cod(p_order_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.user_id <> v_uid then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and status = 'succeeded'
  ) then
    raise exception 'This order is already paid';
  end if;

  -- Idempotent retry: return the existing COD attempt instead of creating a
  -- second pending payment. A retry is allowed only while the order is pending.
  select * into v_payment
    from public.payments
   where order_id = p_order_id
     and provider = 'cod'
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is not null and v_payment.status = 'pending' then
    update public.orders
       set payment_method = 'cod', updated_at = now()
     where id = p_order_id
       and payment_method is distinct from 'cod';
    return v_payment;
  end if;

  -- Never switch an order that already has another open payment (for example a
  -- wallet transfer awaiting review).
  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and status in ('pending', 'processing')
       and provider <> 'cod'
  ) then
    raise exception 'Another payment method is already in progress';
  end if;

  if v_payment.id is not null then
    update public.payments
       set status = 'pending',
           amount = v_order.total,
           currency = v_order.currency,
           provider_payment_id = null,
           failure_code = null,
           failure_message = null,
           failed_at = null,
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'reactivated_at', now(),
             'created_via', 'pay_with_cod'
           ),
           updated_at = now()
     where id = v_payment.id
     returning * into v_payment;
  else
    insert into public.payments
      (order_id, provider, amount, currency, status, attempt_number, raw_response)
    values
      (p_order_id, 'cod', v_order.total, v_order.currency, 'pending', 1,
       jsonb_build_object('created_via', 'pay_with_cod'))
    returning * into v_payment;
  end if;

  update public.orders
     set payment_method = 'cod', updated_at = now()
   where id = p_order_id;

  return v_payment;
end;
$$;

revoke execute on function public.pay_with_cod(uuid) from public, anon;
grant execute on function public.pay_with_cod(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. External wallet: initiate a pending attempt (no receipt yet)
-- ---------------------------------------------------------------------------
create or replace function public.initiate_external_wallet_payment(p_order_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.user_id <> v_uid then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and status = 'succeeded'
  ) then
    raise exception 'This order is already paid';
  end if;

  select * into v_payment
    from public.payments
   where order_id = p_order_id
     and provider = 'external_wallet'
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is not null and v_payment.status = 'pending' then
    update public.orders
       set payment_method = 'external_wallet', updated_at = now()
     where id = p_order_id
       and payment_method is distinct from 'external_wallet';
    return v_payment;
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and status in ('pending', 'processing')
       and provider <> 'external_wallet'
  ) then
    raise exception 'Another payment method is already in progress';
  end if;

  if v_payment.id is not null then
    update public.payments
       set status = 'pending',
           amount = v_order.total,
           currency = v_order.currency,
           provider_payment_id = null,
           failure_code = null,
           failure_message = null,
           failed_at = null,
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'reactivated_at', now(),
             'created_via', 'initiate_external_wallet_payment'
           ),
           updated_at = now()
     where id = v_payment.id
     returning * into v_payment;
  else
    insert into public.payments
      (order_id, provider, amount, currency, status, attempt_number, raw_response)
    values
      (p_order_id, 'external_wallet', v_order.total, v_order.currency, 'pending', 1,
       jsonb_build_object('created_via', 'initiate_external_wallet_payment'))
    returning * into v_payment;
  end if;

  update public.orders
     set payment_method = 'external_wallet', updated_at = now()
   where id = p_order_id;

  return v_payment;
end;
$$;

revoke execute on function public.initiate_external_wallet_payment(uuid) from public, anon;
grant execute on function public.initiate_external_wallet_payment(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. External wallet: customer submits a receipt
-- ---------------------------------------------------------------------------
create or replace function public.submit_external_wallet_receipt(
  p_order_id uuid,
  p_payer_phone text,
  p_transfer_reference text,
  p_receipt_path text
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment_id uuid;
  v_receipt public.payment_receipts;
  v_reference text := nullif(btrim(coalesce(p_transfer_reference, '')), '');
  v_phone text := nullif(btrim(coalesce(p_payer_phone, '')), '');
  v_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9\s\-()]{6,20}$' then
    raise exception 'A valid payer phone is required';
  end if;
  if v_reference is null or length(v_reference) < 4 or length(v_reference) > 120 then
    raise exception 'A valid transfer reference is required';
  end if;
  if v_path is null
     or v_path not like (v_uid::text || '/' || p_order_id::text || '/%')
     or position('..' in v_path) > 0
     or position(chr(92) in v_path) > 0 then
    raise exception 'Invalid receipt path';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.user_id <> v_uid then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  if v_order.payment_method is not null
     and v_order.payment_method <> 'external_wallet' then
    raise exception 'This order is not using a wallet transfer';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and provider in ('cod', 'stripe', 'paymob', 'wallet', 'vodafone_cash')
       and status in ('pending', 'processing', 'succeeded')
  ) then
    raise exception 'Another payment method is already in progress';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id
       and status = 'succeeded'
  ) then
    raise exception 'This order is already paid';
  end if;

  -- The same transfer can never pay two different orders.
  if exists (
    select 1
      from public.payment_receipts pr
      join public.payments p on p.id = pr.payment_id
     where pr.provider = 'external_wallet'
       and pr.transfer_reference = v_reference
       and p.order_id <> p_order_id
       and pr.status in ('pending', 'approved')
  ) then
    raise exception 'That transfer reference is already used by another order';
  end if;

  select id into v_payment_id
    from public.payments
   where order_id = p_order_id
     and provider = 'external_wallet'
   order by created_at desc
   limit 1
   for update;

  if v_payment_id is null then
    insert into public.payments
      (order_id, provider, amount, currency, status, attempt_number, raw_response)
    values
      (p_order_id, 'external_wallet', v_order.total, v_order.currency, 'pending', 1,
       jsonb_build_object(
         'payer_phone', v_phone,
         'receipt_path', v_path,
         'uploaded_at', now()
       ))
    returning id into v_payment_id;
  else
    -- A new attempt supersedes only the pending receipt. Rejected/approved
    -- evidence is retained for audit.
    update public.payment_receipts
       set status = 'superseded', updated_at = now()
     where payment_id = v_payment_id
       and status = 'pending';

    update public.payments
       set status = 'pending',
           amount = v_order.total,
           currency = v_order.currency,
           provider_payment_id = null,
           failure_code = null,
           failure_message = null,
           failed_at = null,
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'payer_phone', v_phone,
             'receipt_path', v_path,
             'uploaded_at', now(),
             'verified_at', null,
             'verify_note', null,
             'rejected', false,
             'rejection_reason', null
           ),
           updated_at = now()
     where id = v_payment_id;
  end if;

  insert into public.payment_receipts
    (payment_id, user_id, provider, transfer_reference, payer_phone, receipt_url, status)
  values
    (v_payment_id, v_uid, 'external_wallet', v_reference, v_phone, v_path, 'pending')
  returning * into v_receipt;

  update public.orders
     set payment_method = 'external_wallet', updated_at = now()
   where id = p_order_id
     and payment_method is distinct from 'external_wallet';

  return v_receipt;
end;
$$;

revoke execute on function public.submit_external_wallet_receipt(uuid, text, text, text)
  from public, anon;
grant execute on function public.submit_external_wallet_receipt(uuid, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4b. Legacy Vodafone receipts cannot be attached to a new payment method
--
-- The legacy RPC is kept so historical orders can still submit evidence, but
-- it predates orders.payment_method and does not check for conflicting
-- payments. This trigger closes that hole even when the RPC is called directly
-- with the authenticated user's JWT. It deliberately only rejects the two new
-- methods so old Vodafone orders with abandoned Stripe/Paymob attempts keep
-- working.
-- ---------------------------------------------------------------------------
create or replace function public.guard_vodafone_receipt_method()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_user_id uuid;
  v_method text;
  v_payment_provider text;
begin
  if new.provider is distinct from 'vodafone_cash' then
    return new;
  end if;

  select p.order_id, p.provider::text, o.user_id, o.payment_method
    into v_order_id, v_payment_provider, v_order_user_id, v_method
    from public.payments p
    join public.orders o on o.id = p.order_id
   where p.id = new.payment_id;

  if v_order_id is null then
    raise exception 'Payment not found';
  end if;

  if v_payment_provider <> 'vodafone_cash' then
    raise exception 'Payment is not a Vodafone Cash attempt';
  end if;

  -- The legacy RPC only checks that the object lives under the caller's folder.
  -- Enforce the stronger customer/order ownership rule at the table boundary as
  -- well, so calling the SECURITY DEFINER RPC directly cannot attach evidence to
  -- somebody else's order or to a different order in the same folder.
  if new.user_id is null or new.user_id <> v_order_user_id then
    raise exception 'Order not found or access denied';
  end if;

  if new.receipt_url is null
     or new.receipt_url not like (new.user_id::text || '/' || v_order_id::text || '/%')
     or position('..' in new.receipt_url) > 0
     or position(chr(92) in new.receipt_url) > 0 then
    raise exception 'Invalid receipt path';
  end if;

  if v_method in ('cod', 'external_wallet') then
    raise exception 'This order is not using Vodafone Cash';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = v_order_id
       and provider in ('cod', 'external_wallet')
       and status in ('pending', 'processing', 'succeeded')
  ) then
    raise exception 'Another payment method is already in progress';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_vodafone_receipt_method on public.payment_receipts;
create trigger guard_vodafone_receipt_method
  before insert on public.payment_receipts
  for each row
  execute function public.guard_vodafone_receipt_method();

-- Trigger functions do not need a direct EXECUTE grant.
revoke execute on function public.guard_vodafone_receipt_method() from public;

-- The legacy RPCs are still needed by historical order pages, but they inherited
-- the default PUBLIC EXECUTE grant. Keep them callable only by signed-in users
-- (and the service role); their own auth/admin checks remain the second gate.
revoke execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text)
  from public, anon;
grant execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text)
  to authenticated, service_role;

revoke execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  from public, anon;
grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  to authenticated, service_role;

-- confirm_order_payment() is a trusted server/webhook entry point: it has no
-- owner or admin check and can mark any pending order paid. Migration 20261023
-- tried to lock it down but only revoked anon/authenticated, leaving the default
-- PUBLIC grant (anon inherits it) in place. Remove PUBLIC as well and keep it
-- service-role only.
revoke execute on function public.confirm_order_payment(
  uuid, text, text, numeric, jsonb, text
) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(
  uuid, text, text, numeric, jsonb, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. External wallet: one valid admin decision per receipt attempt
-- ---------------------------------------------------------------------------
create or replace function public.verify_external_wallet_payment(
  p_order_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_receipt public.payment_receipts;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status in ('cancelled', 'refunded', 'partially_refunded') then
    raise exception 'A cancelled or refunded order cannot be marked paid';
  end if;

  select * into v_payment
    from public.payments
   where order_id = p_order_id
     and provider = 'external_wallet'
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is null then
    raise exception 'No wallet transfer payment found for this order';
  end if;

  if v_payment.status = 'succeeded' then
    if p_approve then
      return (
        select pr
          from public.payment_receipts pr
         where pr.payment_id = v_payment.id
           and pr.status = 'approved'
         order by pr.created_at desc
         limit 1
      );
    end if;
    raise exception 'Payment is already approved';
  end if;

  -- Do not settle a second provider on an order that was already paid while this
  -- transfer was waiting for review.
  if p_approve is true and exists (
    select 1 from public.payments
     where order_id = p_order_id
       and id <> v_payment.id
       and status = 'succeeded'
  ) then
    raise exception 'This order is already paid by another payment';
  end if;

  select * into v_receipt
    from public.payment_receipts
   where payment_id = v_payment.id
     and status = 'pending'
   order by created_at desc
   limit 1
   for update;

  if v_receipt.id is null then
    raise exception 'No pending receipt found for this payment';
  end if;

  update public.payment_receipts
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_notes = p_note,
         verified_by = auth.uid(),
         verified_at = now(),
         updated_at = now()
   where id = v_receipt.id
   returning * into v_receipt;

  if p_approve then
    update public.payments
       set status = 'succeeded',
           provider_payment_id = v_receipt.transfer_reference,
           amount = v_order.total,
           currency = v_order.currency,
           captured_at = now(),
           failure_code = null,
           failure_message = null,
           failed_at = null,
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'payer_phone', v_receipt.payer_phone,
             'receipt_path', v_receipt.receipt_url,
             'verified_by', auth.uid(),
             'verified_at', now(),
             'verify_note', p_note,
             'rejected', false,
             'rejection_reason', null
           ),
           updated_at = now()
     where id = v_payment.id;

    update public.orders
       set status = 'paid', updated_at = now()
     where id = p_order_id
       and status = 'pending';
  else
    update public.payments
       set status = 'failed',
           failed_at = now(),
           failure_message = coalesce(p_note, 'Receipt rejected by administrator'),
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'verified_by', auth.uid(),
             'verified_at', now(),
             'verify_note', p_note,
             'rejected', true,
             'rejection_reason', p_note
           ),
           updated_at = now()
     where id = v_payment.id;
  end if;

  return v_receipt;
end;
$$;

revoke execute on function public.verify_external_wallet_payment(uuid, boolean, text)
  from public, anon;
grant execute on function public.verify_external_wallet_payment(uuid, boolean, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. COD collection: payment_id based, admin-only, idempotent
-- ---------------------------------------------------------------------------
create or replace function public.mark_cod_collected(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Read the payment without a lock only to find its order. Lock the order
  -- before the payment, matching the other payment RPCs, to avoid a
  -- payment->order / order->payment deadlock with pay_with_cod or a receipt
  -- retry.
  select * into v_payment
    from public.payments
   where id = p_payment_id;

  if v_payment.id is null or v_payment.provider <> 'cod' then
    raise exception 'COD payment not found';
  end if;

  select * into v_order
    from public.orders
   where id = v_payment.order_id
   for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  select * into v_payment
    from public.payments
   where id = p_payment_id
   for update;

  if v_payment.id is null or v_payment.provider <> 'cod' then
    raise exception 'COD payment not found';
  end if;

  -- Idempotent admin retry: never create/duplicate a collection.
  if v_payment.status = 'succeeded' then
    return v_payment;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'COD payment is not in a collectable state';
  end if;

  if v_order.status in ('cancelled', 'refunded', 'partially_refunded') then
    raise exception 'A cancelled or refunded order cannot collect cash';
  end if;

  -- A COD row can remain pending if a card/wallet attempt settled first. Never
  -- record a second settlement on an already-paid order.
  if exists (
    select 1 from public.payments
     where order_id = v_order.id
       and id <> v_payment.id
       and status = 'succeeded'
  ) then
    raise exception 'This order is already paid by another payment';
  end if;

  update public.payments
     set status = 'succeeded',
         captured_at = now(),
         failure_code = null,
         failure_message = null,
         failed_at = null,
         raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
           'collected_by', auth.uid(),
           'collected_at', now(),
           'collection_method', 'cash_on_delivery'
         ),
         updated_at = now()
   where id = v_payment.id
   returning * into v_payment;

  -- The payments trigger usually marks a pending order paid as soon as the
  -- payment becomes succeeded. Keep an explicit fallback, but update the status
  -- only when it is actually pending so we do not write a noisy paid -> paid
  -- history row. The method update is separate and does not touch status.
  update public.orders
     set status = 'paid', updated_at = now()
   where id = v_order.id
     and status = 'pending';

  update public.orders
     set payment_method = 'cod', updated_at = now()
   where id = v_order.id
     and payment_method is distinct from 'cod';

  return v_payment;
end;
$$;

revoke execute on function public.mark_cod_collected(uuid) from public, anon;
grant execute on function public.mark_cod_collected(uuid) to authenticated, service_role;


-- ============================================================================
-- MIGRATION 02/22 — 20261029_order_payment_completion.sql — timestamp 20261029
-- ============================================================================
-- Order/payment completion gaps found after the payment-method refactor:
--
--   1. A fully discounted order has total = 0, so `payments.amount > 0` makes
--      it impossible to create a COD/wallet payment. The order used to be left
--      `pending` with no payment forever (the "payment setup failed" dead end).
--      Zero-total orders now complete as `paid` with no payment row.
--
--   2. set_order_shipping_method() checked `v_owner <> auth.uid()`, which is
--      NULL (and therefore passes) for an anonymous caller. It also inherited
--      the default PUBLIC EXECUTE grant. Both are closed here.
--
-- This migration is additive and does not touch historical data.

-- set_order_shipping_method() calls the live baseline helper below. Fail the
-- migration early instead of installing a function that only fails at runtime
-- in a fresh environment where the baseline was not restored.
do $$
begin
  if to_regprocedure('public.get_shipping_options(text, numeric, integer)') is null then
    raise exception 'Dependency missing: public.get_shipping_options(text, numeric, integer)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Zero-total (free) orders are complete at checkout
-- ---------------------------------------------------------------------------
create or replace function public.complete_zero_total_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.user_id is distinct from v_uid then
    raise exception 'Order not found or access denied';
  end if;

  -- Idempotent: an order that is already paid is returned unchanged.
  if v_order.status = 'paid' then
    return v_order;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  -- Guard rail: this entry point only completes a real zero-total order. A
  -- positive total would give merchandise away; a negative/null total is an
  -- invalid financial state and must not be marked paid either.
  if v_order.total is distinct from 0 then
    raise exception 'This order does not have a zero total';
  end if;

  -- The order_status_history trigger records the transition automatically.
  update public.orders
     set status = 'paid', updated_at = now()
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.complete_zero_total_order(uuid) from public, anon;
grant execute on function public.complete_zero_total_order(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. set_order_shipping_method(): require authentication at the DB boundary
-- ---------------------------------------------------------------------------
create or replace function public.set_order_shipping_method(
  p_order_id uuid,
  p_shipping_method_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_country text;
  v_option record;
  v_found boolean := false;
begin
  -- For an anonymous caller `v_owner <> auth.uid()` is NULL, which used to skip
  -- the ownership check entirely. Reject missing auth up front.
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.deleted_at is not null then
    raise exception 'Order not found';
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'Not your order';
  end if;

  -- Changing the method after payment starts could change the service level
  -- without re-pricing the order. The checkout flow calls this only while the
  -- order is pending.
  if v_order.status <> 'pending' then
    raise exception 'Only a pending order can change its shipping method';
  end if;

  if p_shipping_method_id is null then
    if coalesce(v_order.shipping_fee, 0) <> 0 then
      raise exception 'A shipping fee is already set; choose a shipping method';
    end if;
  else
    if not exists (
      select 1 from public.shipping_methods
       where id = p_shipping_method_id and is_active and deleted_at is null
    ) then
      raise exception 'Invalid shipping method';
    end if;

    -- Bind the persisted method to the fee that was actually charged. Without
    -- this, a direct RPC caller could label a standard-paid order as express.
    v_country := coalesce(
      nullif(btrim(v_order.shipping_address_snapshot->>'country'), ''),
      'Egypt'
    );

    for v_option in
      select *
        from public.get_shipping_options(
          v_country,
          coalesce(v_order.subtotal, 0),
          0
        )
    loop
      if v_option.method_id = p_shipping_method_id then
        v_found := true;
        if v_option.fee is null
           or round(v_option.fee, 2) is distinct from
              round(coalesce(v_order.shipping_fee, 0), 2) then
          raise exception 'Shipping fee does not match the selected method';
        end if;
        exit;
      end if;
    end loop;

    if not v_found then
      raise exception 'Invalid shipping method for this order';
    end if;
  end if;

  update public.orders
     set shipping_method_id = p_shipping_method_id,
         updated_at = now()
   where id = p_order_id;
end;
$$;

revoke execute on function public.set_order_shipping_method(uuid, uuid)
  from public, anon;
grant execute on function public.set_order_shipping_method(uuid, uuid)
  to authenticated, service_role;


-- ============================================================================
-- MIGRATION 03/22 — 20261030000002_confirm_order_payment_partial_index.sql — timestamp 20261030000002
-- ============================================================================
-- Fix ON CONFLICT inference for confirm_order_payment (review only).
--
-- 20261023 creates:
--   create unique index payments_provider_ref_uidx
--     on public.payments (provider, provider_payment_id)
--     where provider_payment_id is not null;
--
-- but the live confirm_order_payment() uses:
--   on conflict (provider, provider_payment_id) do update ...
--
-- PostgreSQL does not infer a partial unique index unless the ON CONFLICT
-- clause repeats the index predicate. The insert therefore fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" for every successful payment confirmation.
--
-- This migration keeps the partial index (so multiple NULL references remain
-- allowed) and adds the matching predicate to the function. It does not touch
-- existing payment rows.

create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_raw_response jsonb default null,
  p_currency text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_provider public.payment_provider;
  v_existing_order uuid;
begin
  if p_provider is null or p_provider not in ('stripe', 'paymob', 'cod', 'wallet') then
    raise exception 'Provider % cannot be confirmed through this function', p_provider;
  end if;
  v_provider := p_provider::public.payment_provider;

  if p_provider_payment_id is null or length(btrim(p_provider_payment_id)) = 0 then
    raise exception 'A provider payment id is required';
  end if;

  -- A NULL amount would make the mismatch check below evaluate to NULL and be
  -- skipped. A zero amount belongs to complete_zero_total_order(), not this
  -- provider-confirmation path. Reject both before touching the payment table.
  if p_amount is null or p_amount <= 0 then
    raise exception 'A valid payment amount is required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  if v_order.status in ('cancelled', 'refunded', 'partially_refunded') then
    raise exception 'Order cannot be paid in its current state';
  end if;

  if p_currency is not null and upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Payment currency mismatch: expected %, got %', v_order.currency, p_currency;
  end if;
  if abs(p_amount - v_order.total) > 0.01 then
    raise exception 'Payment amount mismatch: expected %, got %', v_order.total, p_amount;
  end if;

  select order_id into v_existing_order
    from public.payments
   where provider = v_provider and provider_payment_id = p_provider_payment_id;
  if v_existing_order is not null and v_existing_order <> p_order_id then
    raise exception 'This payment reference is already attached to another order';
  end if;

  -- A duplicate webhook for the same reference is idempotent, but a different
  -- provider reference must never settle an order that already has a succeeded
  -- payment. This closes the double-settlement hole that the partial unique
  -- index alone cannot cover (it only deduplicates the same reference).
  if exists (
    select 1
      from public.payments
     where order_id = p_order_id
       and status = 'succeeded'
       and not (
         provider = v_provider
         and provider_payment_id = p_provider_payment_id
       )
  ) then
    raise exception 'This order is already paid by another payment';
  end if;

  insert into public.payments
    (order_id, provider, provider_payment_id, amount, currency, status, raw_response, captured_at)
  values
    (p_order_id, v_provider, p_provider_payment_id, p_amount, v_order.currency, 'succeeded', p_raw_response, now())
  on conflict (provider, provider_payment_id) where provider_payment_id is not null do update
    set status = 'succeeded',
        amount = excluded.amount,
        currency = excluded.currency,
        raw_response = excluded.raw_response,
        captured_at = coalesce(public.payments.captured_at, now()),
        updated_at = now();

  update public.orders
     set status = 'paid'
   where id = p_order_id
     and status = 'pending'
   returning * into v_order;

  if v_order.id is null then
    select * into v_order from public.orders where id = p_order_id;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  to service_role;


-- ============================================================================
-- MIGRATION 04/22 — 20261030000003_order_status_cod_transitions.sql — timestamp 20261030000003
-- ============================================================================
-- COD fulfilment transitions (review only; do not apply without staging approval).
--
-- The live order-status trigger only allows `pending -> paid` and
-- `printing -> shipped`. A COD order stays `pending` until delivery, so a
-- vendor can create a shipment but the order can never move to `processing`
-- and then `shipped`.
--
-- This migration is additive: it keeps every existing transition and adds
--   pending    -> processing  (COD accepted for fulfilment)
--   paid       -> shipped     (direct fulfilment path; normally paid -> processing first)
--   processing -> shipped     (COD/standard fulfilment once all items ship)
--
-- The application still updates one step at a time and still treats a failed
-- order transition as non-fatal for the shipment itself.

create or replace function public.validate_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if old.status = new.status then return new; end if;

  allowed := case old.status
    when 'pending' then new.status in ('paid', 'processing', 'cancelled')
    when 'paid' then new.status in ('processing', 'shipped', 'cancelled', 'refunded')
    when 'processing' then new.status in ('printing', 'shipped', 'cancelled', 'refunded', 'partially_refunded')
    when 'printing' then new.status in ('shipped', 'refunded', 'partially_refunded')
    when 'shipped' then new.status in ('delivered', 'refunded', 'partially_refunded')
    when 'delivered' then new.status in ('refunded', 'partially_refunded')
    when 'partially_refunded' then new.status in ('refunded', 'partially_refunded')
    else false
  end;

  if not allowed then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

-- The live project already has a trigger that calls this function, but no
-- repository migration creates it. Install it when missing so a fresh staging
-- database enforces the same transitions instead of silently accepting any
-- status update.
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.orders'::regclass
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and p.pronamespace = 'public'::regnamespace
       and p.proname = 'validate_order_status_transition'
  ) then
    drop trigger if exists trg_validate_order_status_transition on public.orders;
    create trigger trg_validate_order_status_transition
      before update of status on public.orders
      for each row
      execute function public.validate_order_status_transition();
  end if;
end $$;

-- Trigger functions cannot be called directly, but keep the default PUBLIC
-- EXECUTE grant off the function for consistency with the other RPCs.
revoke execute on function public.validate_order_status_transition()
  from public, anon, authenticated;


-- ============================================================================
-- MIGRATION 05/22 — 20261030000004_product_images_bucket.sql — timestamp 20261030000004
-- ============================================================================
-- Reproducible product-images bucket and policies (review only).
--
-- The live bucket exists but is not created by any repository migration. A
-- fresh environment therefore has no place to upload product images, and the
-- bucket's MIME/size limits would silently differ.
--
-- The policy uses the product UUID as the first path segment. The vendor image
-- API validates the same shape before uploading.

-- The policies call this live baseline helper. Fail early with a clear message
-- instead of creating a bucket whose policies cannot be installed.
do $$
begin
  if to_regprocedure('public.owns_product(uuid)') is null then
    raise exception 'Dependency missing: public.owns_product(uuid)';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_owner_insert on storage.objects;
create policy product_images_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists product_images_owner_delete on storage.objects;
create policy product_images_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );


-- ============================================================================
-- MIGRATION 06/22 — 20261101_add_gift_box_product_type.sql — timestamp 20261101
-- ============================================================================
-- =============================================================================
-- Migration: allow 'gift_box' product type on custom_print_requests
-- Prepared:  2026-11-01 (production remediation — A2 Gift Boxes)
-- STATUS:    LOCAL ONLY — NOT APPLIED TO PRODUCTION. Requires explicit human
--            approval before running against the production project.
--
-- WHY:       /api/gift-box inserts gift-box requests into the existing
--            custom_print_requests queue (single admin view, existing status
--            workflow, existing SELECT own-or-admin RLS policy). Until this
--            migration runs, the API falls back to product_type='other' with a
--            "[GIFT BOX REQUEST]" notes marker — the feature works either way;
--            applying this migration only removes the fallback.
--
-- HOW TO APPLY (when approved):
--   * Prefer running this file MANUALLY in the Supabase SQL editor as a single
--     script. Do NOT use `supabase db push` for this repository until the
--     legacy `create_*.sql` files are reconciled: they are outside the CLI
--     migration history and a push could attempt to re-apply them.
--   * Run the whole file at once (it is idempotent).
--
-- REVERSAL:  re-add the original CHECK without 'gift_box' (existing rows with
--            product_type='gift_box' must first be moved to 'other').
-- =============================================================================

-- 1) Drop the existing CHECK constraint (guarded: only if it exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      DROP CONSTRAINT custom_print_requests_product_type_check;
  END IF;
END $$;

-- 2) Re-create it with 'gift_box' appended. All previous values preserved.
--    (If a constraint with this name still exists with the old definition the
--    statement below would fail loudly — that is intentional, review first.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      ADD CONSTRAINT custom_print_requests_product_type_check
      CHECK (product_type = ANY (
        ARRAY['tshirt'::text, 'mug'::text, 'phonecase'::text, 'poster'::text,
              'other'::text, 'gift_box'::text]
      ));
  END IF;
END $$;

-- 3) Verification (returns one row when correct).
SELECT pg_get_constraintdef(oid) AS product_type_check_definition
FROM pg_constraint
WHERE conname = 'custom_print_requests_product_type_check'
  AND conrelid = 'public.custom_print_requests'::regclass;


-- ============================================================================
-- MIGRATION 07/22 — 20261108130000_site_content_banners_sections.sql — timestamp 20261108130000
-- ============================================================================
-- Admin-managed storefront content: banners and sections.
--
-- Banners are image/text promos placed into named zones on a page (top strip,
-- under the hero, mid page, before the footer CTA). Sections are richer
-- content blocks (rich text, image+text, card grids, CTA) placed in the same
-- zones. Both share one lifecycle:
--   * writes go through the admin API with the service role (bypasses RLS),
--   * the public storefront reads only active rows whose schedule window is
--     open (RLS), ordered by sort_order,
--   * ordering/visibility never depends on client-supplied data.
--
-- Idempotent on purpose: this repository's migration chain cannot rebuild the
-- schema from scratch (docs/DATABASE-INTEGRITY-REPORT.md §7), so every object
-- below uses IF NOT EXISTS / OR REPLACE / drop-then-create and can be pasted
-- into the Supabase SQL editor more than once.

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  placement text not null default 'after_hero',
  title text,
  subtitle text,
  image_url text,
  link_url text,
  button_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_banners_page_check check (page ~ '^[a-z0-9_-]{1,40}$'),
  constraint site_banners_placement_check check (
    placement in ('top_strip', 'after_hero', 'mid_page', 'before_footer')
  ),
  constraint site_banners_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  placement text not null default 'mid_page',
  section_type text not null default 'rich_text',
  eyebrow text,
  title text,
  body text,
  image_url text,
  link_url text,
  button_label text,
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_sections_page_check check (page ~ '^[a-z0-9_-]{1,40}$'),
  constraint site_sections_placement_check check (
    placement in ('after_hero', 'mid_page', 'before_footer')
  ),
  constraint site_sections_type_check check (
    section_type in ('rich_text', 'image_text', 'cards', 'cta')
  ),
  constraint site_sections_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create index if not exists site_banners_zone_idx
  on public.site_banners (page, placement, sort_order);

create index if not exists site_banners_active_idx
  on public.site_banners (page, placement)
  where is_active;

create index if not exists site_sections_zone_idx
  on public.site_sections (page, placement, sort_order);

create index if not exists site_sections_active_idx
  on public.site_sections (page, placement)
  where is_active;

alter table public.site_banners enable row level security;
alter table public.site_sections enable row level security;

-- Public storefront: only active rows inside their schedule window.
drop policy if exists site_banners_public_select on public.site_banners;
create policy site_banners_public_select
  on public.site_banners
  for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists site_sections_public_select on public.site_sections;
create policy site_sections_public_select
  on public.site_sections
  for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- Admins may also manage content from an authenticated browser client; the
-- admin API normally uses the service role, which bypasses RLS entirely.
drop policy if exists site_banners_admin_all on public.site_banners;
create policy site_banners_admin_all
  on public.site_banners
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_sections_admin_all on public.site_sections;
create policy site_sections_admin_all
  on public.site_sections
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Least privilege: the storefront only ever reads.
revoke all on public.site_banners from public, anon, authenticated;
grant select on public.site_banners to anon, authenticated;
grant all on public.site_banners to service_role;

revoke all on public.site_sections from public, anon, authenticated;
grant select on public.site_sections to anon, authenticated;
grant all on public.site_sections to service_role;

drop trigger if exists set_site_banners_updated_at on public.site_banners;
create trigger set_site_banners_updated_at
  before update on public.site_banners
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_site_sections_updated_at on public.site_sections;
create trigger set_site_sections_updated_at
  before update on public.site_sections
  for each row
  execute function public.set_updated_at();

-- Public storage bucket for banner/section imagery (admin uploads use the
-- service role; the storefront reads the public URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-banners',
  'site-banners',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_banners_storage_public_read on storage.objects;
create policy site_banners_storage_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'site-banners');

drop policy if exists site_banners_storage_admin_insert on storage.objects;
create policy site_banners_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'site-banners' and public.is_admin());

drop policy if exists site_banners_storage_admin_update on storage.objects;
create policy site_banners_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'site-banners' and public.is_admin());

drop policy if exists site_banners_storage_admin_delete on storage.objects;
create policy site_banners_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'site-banners' and public.is_admin());


-- ============================================================================
-- MIGRATION 08/22 — 20261110100000_theme_management.sql — timestamp 20261110100000
-- ============================================================================
-- Theme Management System: store_themes, theme_assets, theme_settings,
-- theme_schedule_history, theme_versions + the public theme-assets bucket.
--
-- STATUS: PREPARED, NOT APPLIED. Production is read-only by policy — the owner
-- must review and apply this file (Supabase SQL editor or `supabase db push`)
-- before Theme Studio can persist anything. Until then every theme read
-- degrades gracefully to the built-in Galaxy Store default
-- (see lib/themes/server.ts), so the storefront is unaffected.
--
-- Lifecycle:
--   * writes go through the admin Theme Studio API with the service role
--     (verifyAdmin -> getServiceRoleClient), which bypasses RLS;
--   * anon may only ever see published rows (status active/scheduled);
--   * theme_versions is append-only: every publish/activate stores a snapshot
--     that can be compared and restored;
--   * theme_schedule_history records every lifecycle action for auditing.
--
-- Idempotent on purpose (IF NOT EXISTS / OR REPLACE / drop-then-create), like
-- the rest of this migration chain: safe to paste into the SQL editor more
-- than once. Never edit an already-applied migration — add a new file instead.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.store_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  category text not null default 'custom',
  preview_image text,
  theme_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  priority integer not null default 0,
  activation_mode text not null default 'manual',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  is_recurring boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_themes_slug_check check (slug ~ '^[a-z0-9-]{1,60}$'),
  constraint store_themes_category_check check (category ~ '^[a-z0-9_-]{1,40}$'),
  constraint store_themes_name_check check (char_length(name) between 1 and 100),
  constraint store_themes_status_check check (
    status in ('draft', 'scheduled', 'active', 'archived')
  ),
  constraint store_themes_mode_check check (
    activation_mode in ('manual', 'scheduled')
  ),
  constraint store_themes_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),
  constraint store_themes_timezone_check check (char_length(timezone) between 1 and 64)
);

create table if not exists public.theme_assets (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.store_themes (id) on delete cascade,
  asset_type text not null,
  asset_url text not null,
  mobile_asset_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint theme_assets_type_check check (
    asset_type in (
      'background_desktop', 'background_mobile',
      'banner_desktop', 'banner_mobile',
      'icon', 'logo', 'artwork'
    )
  ),
  constraint theme_assets_url_check check (char_length(asset_url) <= 2048)
);

-- Single-row settings table: id is fixed so the admin API can upsert it.
create table if not exists public.theme_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  default_theme_id uuid references public.store_themes (id) on delete set null,
  manual_override_theme_id uuid references public.store_themes (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint theme_settings_single_row check (
    id = '00000000-0000-0000-0000-000000000001'
  )
);

create table if not exists public.theme_schedule_history (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid references public.store_themes (id) on delete set null,
  action text not null,
  previous_theme_id uuid references public.store_themes (id) on delete set null,
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now(),
  constraint theme_schedule_history_action_check check (
    action in (
      'create', 'update', 'publish', 'activate', 'deactivate', 'schedule',
      'archive', 'delete', 'override', 'clear_override', 'set_default',
      'restore_default', 'restore_version'
    )
  )
);

create table if not exists public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.store_themes (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint theme_versions_version_check check (version >= 1),
  constraint theme_versions_theme_version_key unique (theme_id, version)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists store_themes_status_idx
  on public.store_themes (status);

create index if not exists store_themes_window_idx
  on public.store_themes (starts_at, ends_at);

create index if not exists store_themes_priority_idx
  on public.store_themes (priority desc, updated_at desc);

create index if not exists theme_versions_theme_idx
  on public.theme_versions (theme_id, version desc);

create index if not exists theme_schedule_history_theme_idx
  on public.theme_schedule_history (theme_id, performed_at desc);

create index if not exists theme_assets_theme_idx
  on public.theme_assets (theme_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.store_themes enable row level security;
alter table public.theme_assets enable row level security;
alter table public.theme_settings enable row level security;
alter table public.theme_schedule_history enable row level security;
alter table public.theme_versions enable row level security;

-- Storefront: published themes only. Drafts/archived rows are never visible
-- to anon (the resolution engine reads with the service role anyway).
drop policy if exists store_themes_public_select on public.store_themes;
create policy store_themes_public_select
  on public.store_themes
  for select
  to anon, authenticated
  using (status in ('active', 'scheduled'));

drop policy if exists store_themes_admin_all on public.store_themes;
create policy store_themes_admin_all
  on public.store_themes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Settings: admins may read from a browser client; all writes happen through
-- the service-role API. anon has no policy and no grant — invisible.
drop policy if exists theme_settings_admin_select on public.theme_settings;
create policy theme_settings_admin_select
  on public.theme_settings
  for select
  to authenticated
  using (public.is_admin());

-- theme_versions / theme_schedule_history / theme_assets intentionally have
-- NO client policies: snapshots, audit history and asset rows are only ever
-- touched by the service role (they are not public data; the images themselves
-- are served from a public storage bucket via their URLs).

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

revoke all on public.store_themes from public, anon, authenticated;
grant select on public.store_themes to anon, authenticated;
grant all on public.store_themes to service_role;

revoke all on public.theme_settings from public, anon, authenticated;
grant select on public.theme_settings to authenticated;
grant all on public.theme_settings to service_role;

revoke all on public.theme_versions from public, anon, authenticated;
grant all on public.theme_versions to service_role;

revoke all on public.theme_schedule_history from public, anon, authenticated;
grant all on public.theme_schedule_history to service_role;

revoke all on public.theme_assets from public, anon, authenticated;
grant all on public.theme_assets to service_role;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_store_themes_updated_at on public.store_themes;
create trigger set_store_themes_updated_at
  before update on public.store_themes
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_theme_settings_updated_at on public.theme_settings;
create trigger set_theme_settings_updated_at
  before update on public.theme_settings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Singleton settings row
-- ---------------------------------------------------------------------------

insert into public.theme_settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: public theme-assets bucket (backgrounds, banners, decorations).
-- Mirrors the site-banners bucket: public read, is_admin() writes only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'theme-assets',
  'theme-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists theme_assets_storage_public_read on storage.objects;
create policy theme_assets_storage_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'theme-assets');

drop policy if exists theme_assets_storage_admin_insert on storage.objects;
create policy theme_assets_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'theme-assets' and public.is_admin());

drop policy if exists theme_assets_storage_admin_update on storage.objects;
create policy theme_assets_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'theme-assets' and public.is_admin());

drop policy if exists theme_assets_storage_admin_delete on storage.objects;
create policy theme_assets_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'theme-assets' and public.is_admin());


-- ============================================================================
-- MIGRATION 09/22 — 20261110120000_creator_studio_core.sql — timestamp 20261110120000
-- ============================================================================
-- Creator Design Studio — core schema, RLS and storage (phase 2 of 10).
--
-- Reuses the live design subsystem (user_designs / design_versions /
-- design_files / design_categories — docs/DESIGN-STUDIO-PLAN.md §1.1) and adds
-- only what is genuinely missing:
--   * creator_profiles          public persona behind /creators/[username]
--                               (profiles has no public read policy, so the
--                               public persona must live elsewhere)
--   * creator_product_templates product-type catalog (8 types seeded with the
--                               mockup engine in phase 5)
--   * creator_design_products   design x product configuration, review status,
--                               generated mockups, fulfillment boundary
--   * creator_gallery_items     gallery publication
-- plus one column (design_versions.editor_state) and two enum values (jpg/webp).
--
-- Security model (plan §2 D5): the four new tables are SELECT-only under RLS.
-- Every mutation goes through API routes using the service role, which is the
-- only way to enforce the publish state machine and make self-approval
-- impossible from a client. Mirrors the payment_receipts house pattern.
--
-- Idempotent: IF NOT EXISTS / drop-then-create / on conflict everywhere, so the
-- file can be re-run safely (this repository's migration chain cannot rebuild
-- the schema from scratch — docs/DATABASE-INTEGRITY-REPORT.md §7).

-- ---------------------------------------------------------------------------
-- 0) Preflight — fail early if the live baseline this migration extends is
--    missing, instead of creating orphaned objects.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_designs') is null then
    raise exception 'Dependency missing: public.user_designs';
  end if;
  if to_regclass('public.design_versions') is null then
    raise exception 'Dependency missing: public.design_versions';
  end if;
  if to_regclass('public.design_files') is null then
    raise exception 'Dependency missing: public.design_files';
  end if;
  if to_regclass('public.design_categories') is null then
    raise exception 'Dependency missing: public.design_categories';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Dependency missing: public.profiles';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Dependency missing: public.is_admin()';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Dependency missing: public.set_updated_at()';
  end if;
  if to_regprocedure('public.owns_design(uuid)') is null then
    raise exception 'Dependency missing: public.owns_design(uuid)';
  end if;
  if to_regtype('public.design_status') is null then
    raise exception 'Dependency missing: type public.design_status';
  end if;
  if to_regtype('public.design_file_format') is null then
    raise exception 'Dependency missing: type public.design_file_format';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Upload formats: the studio accepts PNG/JPG/WebP/SVG. The enum predates
--    jpg/webp; ADD VALUE is additive. This migration never inserts rows that
--    use the new values, so running inside a transaction block is safe.
-- ---------------------------------------------------------------------------
alter type public.design_file_format add value if not exists 'jpg';
alter type public.design_file_format add value if not exists 'webp';

-- ---------------------------------------------------------------------------
-- 2) Editor persistence: a version IS an editor snapshot, so design history,
--    undo checkpoints and "resume editing later" all read this column.
-- ---------------------------------------------------------------------------
alter table public.design_versions
  add column if not exists editor_state jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3) creator_profiles — public persona only. Private account data (email,
--    phone, addresses) stays in profiles, which has no public read policy.
--    The API rejects any field outside this set (plan §5.1).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique
                  references auth.users (id) on delete cascade,
  username      text not null unique
                  constraint creator_profiles_username_check
                    check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text not null
                  constraint creator_profiles_display_name_check
                    check (char_length(display_name) between 2 and 60),
  avatar_url    text,
  bio           text
                  constraint creator_profiles_bio_check
                    check (bio is null or char_length(bio) <= 500),
  social_links  jsonb not null default '{}'::jsonb
                  constraint creator_profiles_social_links_check
                    check (jsonb_typeof(social_links) = 'object'),
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  can_publish   boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) creator_product_templates — product-type catalog. Geometry (views, print
--    areas, layers, colors, sizes) is validated server-side before insert;
--    seeded with the 8 real product types in phase 5.
-- ---------------------------------------------------------------------------
create table if not exists public.creator_product_templates (
  id              uuid primary key default gen_random_uuid(),
  template_key    text not null unique
                    constraint creator_product_templates_key_check
                      check (template_key ~ '^[a-z0-9_]{2,40}$'),
  name            text not null
                    constraint creator_product_templates_name_check
                      check (char_length(name) between 1 and 80),
  name_ar         text,
  category        text not null default 'custom'
                    constraint creator_product_templates_category_check
                      check (category ~ '^[a-z0-9_-]{1,40}$'),
  dimensions_mm   jsonb not null
                    constraint creator_product_templates_dimensions_check
                      check (jsonb_typeof(dimensions_mm) = 'object'),
  views           jsonb not null
                    constraint creator_product_templates_views_check
                      check (jsonb_typeof(views) = 'array'),
  colors          jsonb not null
                    constraint creator_product_templates_colors_check
                      check (jsonb_typeof(colors) = 'array'),
  sizes           jsonb not null
                    constraint creator_product_templates_sizes_check
                      check (jsonb_typeof(sizes) = 'array'),
  mockup_format   text not null default 'png'
                    constraint creator_product_templates_format_check
                      check (mockup_format in ('png', 'jpg', 'webp')),
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists creator_product_templates_catalog_idx
  on public.creator_product_templates (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 5) creator_design_products — one row per design x product type: independent
--    per-product transforms, colors, sizes and generated mockups, plus the
--    review state and the POD fulfillment boundary (plan §2 D8).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_design_products (
  id                  uuid primary key default gen_random_uuid(),
  design_id           uuid not null
                        references public.user_designs (id) on delete cascade,
  template_id         uuid not null
                        references public.creator_product_templates (id) on delete restrict,
  creator_profile_id  uuid not null
                        references public.creator_profiles (id) on delete cascade,
  view_states         jsonb not null default '{}'::jsonb
                        constraint creator_design_products_view_states_check
                          check (jsonb_typeof(view_states) = 'object'),
  selected_colors     text[] not null default '{}'
                        constraint creator_design_products_colors_check
                          check (cardinality(selected_colors) between 0 and 64),
  selected_sizes      text[] not null default '{}'
                        constraint creator_design_products_sizes_check
                          check (cardinality(selected_sizes) between 0 and 64),
  mockups             jsonb not null default '[]'::jsonb
                        constraint creator_design_products_mockups_check
                          check (case when jsonb_typeof(mockups) = 'array'
                                      then jsonb_array_length(mockups) <= 200
                                      else false end),
  status              public.design_status not null default 'draft',
  rejection_reason    text,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  submitted_at        timestamptz,
  product_id          uuid references public.products (id) on delete set null,
  fulfillment_mode    text not null default 'unconfigured'
                        constraint creator_design_products_fulfillment_check
                          check (fulfillment_mode in ('unconfigured', 'configured')),
  stock_buffer        integer not null default 0
                        constraint creator_design_products_stock_buffer_check
                          check (stock_buffer between 0 and 100000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- One live configuration per design per product type (duplicates are how the
-- same artwork ends up twice in the catalog).
create unique index if not exists creator_design_products_design_template_uq
  on public.creator_design_products (design_id, template_id)
  where deleted_at is null;

create index if not exists creator_design_products_profile_idx
  on public.creator_design_products (creator_profile_id, created_at desc)
  where deleted_at is null;

create index if not exists creator_design_products_product_idx
  on public.creator_design_products (product_id)
  where product_id is not null;

create index if not exists creator_design_products_status_idx
  on public.creator_design_products (status, submitted_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 6) creator_gallery_items — Option B: share artwork without selling it.
--    product_id fills in later when the same artwork becomes a store product
--    (never re-uploaded).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_gallery_items (
  id                  uuid primary key default gen_random_uuid(),
  design_id           uuid not null
                        references public.user_designs (id) on delete cascade,
  owner_id            uuid not null
                        references public.profiles (id) on delete cascade,
  creator_profile_id  uuid references public.creator_profiles (id) on delete set null,
  title               text not null
                        constraint creator_gallery_items_title_check
                          check (char_length(title) between 2 and 120),
  description         text
                        constraint creator_gallery_items_description_check
                          check (description is null or char_length(description) <= 2000),
  preview_path        text,
  tags                text[] not null default '{}'
                        constraint creator_gallery_items_tags_check
                          check (cardinality(tags) between 0 and 30),
  visibility          text not null default 'public'
                        constraint creator_gallery_items_visibility_check
                          check (visibility in ('public', 'unlisted')),
  status              public.design_status not null default 'draft',
  rejection_reason    text,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  submitted_at        timestamptz,
  published_at        timestamptz,
  product_id          uuid references public.products (id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists creator_gallery_items_owner_idx
  on public.creator_gallery_items (owner_id, created_at desc)
  where deleted_at is null;

create index if not exists creator_gallery_items_profile_idx
  on public.creator_gallery_items (creator_profile_id, published_at desc)
  where deleted_at is null and status = 'approved';

create index if not exists creator_gallery_items_public_idx
  on public.creator_gallery_items (published_at desc)
  where deleted_at is null and status = 'approved' and visibility = 'public';

-- ---------------------------------------------------------------------------
-- 7) updated_at triggers (house helper)
-- ---------------------------------------------------------------------------
drop trigger if exists set_creator_profiles_updated_at on public.creator_profiles;
create trigger set_creator_profiles_updated_at
  before update on public.creator_profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_product_templates_updated_at on public.creator_product_templates;
create trigger set_creator_product_templates_updated_at
  before update on public.creator_product_templates
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_design_products_updated_at on public.creator_design_products;
create trigger set_creator_design_products_updated_at
  before update on public.creator_design_products
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_gallery_items_updated_at on public.creator_gallery_items;
create trigger set_creator_gallery_items_updated_at
  before update on public.creator_gallery_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8) RLS — SELECT only. No INSERT/UPDATE/DELETE policy exists on any of these
--    tables: a client (creator or admin browser) physically cannot write them,
--    so protected approval fields and ownership are unreachable no matter what
--    the client sends. All writes happen through service-role API routes.
-- ---------------------------------------------------------------------------
alter table public.creator_profiles enable row level security;
alter table public.creator_product_templates enable row level security;
alter table public.creator_design_products enable row level security;
alter table public.creator_gallery_items enable row level security;

-- Public persona is public by design; the table stores persona fields only.
drop policy if exists creator_profiles_public_select on public.creator_profiles;
create policy creator_profiles_public_select
  on public.creator_profiles
  for select
  to anon, authenticated
  using (true);

-- Static catalog geometry (no private data); the studio filters is_active.
drop policy if exists creator_product_templates_public_select on public.creator_product_templates;
create policy creator_product_templates_public_select
  on public.creator_product_templates
  for select
  to anon, authenticated
  using (true);

-- Owner: owns_design() already returns true for admins and excludes
-- soft-deleted designs, so one policy covers both roles.
drop policy if exists creator_design_products_owner_select on public.creator_design_products;
create policy creator_design_products_owner_select
  on public.creator_design_products
  for select
  to authenticated
  using (public.owns_design(design_id));

-- Public: only configurations attached to a product that is already published
-- and visible. This is what makes the attribution embed on product cards safe.
drop policy if exists creator_design_products_public_select on public.creator_design_products;
create policy creator_design_products_public_select
  on public.creator_design_products
  for select
  to anon, authenticated
  using (
    product_id is not null
    and exists (
      select 1
        from public.products p
       where p.id = creator_design_products.product_id
         and p.status = 'published'
         and p.visibility = 'visible'
         and p.deleted_at is null
    )
  );

-- Gallery owner sees everything they own; everyone sees approved public rows.
drop policy if exists creator_gallery_items_owner_select on public.creator_gallery_items;
create policy creator_gallery_items_owner_select
  on public.creator_gallery_items
  for select
  to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists creator_gallery_items_public_select on public.creator_gallery_items;
create policy creator_gallery_items_public_select
  on public.creator_gallery_items
  for select
  to anon, authenticated
  using (status = 'approved' and visibility = 'public' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 9) Least privilege — storefront reads, service role writes.
-- ---------------------------------------------------------------------------
revoke all on public.creator_profiles from public, anon, authenticated;
grant select on public.creator_profiles to anon, authenticated;
grant all on public.creator_profiles to service_role;

revoke all on public.creator_product_templates from public, anon, authenticated;
grant select on public.creator_product_templates to anon, authenticated;
grant all on public.creator_product_templates to service_role;

revoke all on public.creator_design_products from public, anon, authenticated;
grant select on public.creator_design_products to anon, authenticated;
grant all on public.creator_design_products to service_role;

revoke all on public.creator_gallery_items from public, anon, authenticated;
grant select on public.creator_gallery_items to anon, authenticated;
grant all on public.creator_gallery_items to service_role;

-- ---------------------------------------------------------------------------
-- 10) Storage — the two buckets already exist live; make a fresh environment
--     match them and widen design-uploads to the formats the studio accepts
--     (live list lacks image/jpeg and image/webp). Size limits untouched.
--     Originals stay private; generated mockups stay public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-uploads',
  'design-uploads',
  false,
  209715200,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
    'application/pdf', 'application/postscript', 'image/vnd.adobe.photoshop',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Additive only: keep whatever else the live bucket already allows.
update storage.buckets
   set allowed_mime_types = array[
     'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
     'application/pdf', 'application/postscript', 'image/vnd.adobe.photoshop',
     'application/octet-stream'
   ]
 where id = 'design-uploads'
   and not (allowed_mime_types @> array['image/jpeg', 'image/webp']);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-previews', 'design-previews', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Owner-folder direct browser upload for originals (identical to the live
-- policies; recreated so a fresh environment behaves the same way).
drop policy if exists design_uploads_owner_insert on storage.objects;
create policy design_uploads_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'design-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists design_uploads_owner_or_admin_select on storage.objects;
create policy design_uploads_owner_or_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

drop policy if exists design_uploads_owner_or_admin_update on storage.objects;
create policy design_uploads_owner_or_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

drop policy if exists design_uploads_owner_or_admin_delete on storage.objects;
create policy design_uploads_owner_or_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

-- Generated mockups are written by the API with the service role; these admin
-- policies only reproduce the live configuration for fresh environments.
drop policy if exists design_previews_admin_write on storage.objects;
create policy design_previews_admin_write
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'design-previews' and public.is_admin());

drop policy if exists design_previews_admin_update on storage.objects;
create policy design_previews_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'design-previews' and public.is_admin());

drop policy if exists design_previews_admin_delete on storage.objects;
create policy design_previews_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'design-previews' and public.is_admin());


-- ============================================================================
-- MIGRATION 10/22 — 20261110160000_creator_studio_template_seed.sql — timestamp 20261110160000
-- ============================================================================
-- ===========================================================================
-- Phase 5 — seed the product-type catalog with the 8 required types.
--
-- The TypeScript registry (lib/design-studio/templates/index.ts) is the
-- RENDERING authority (it also carries the SVG body/overlay code); this seed
-- mirrors its geometry into creator_product_templates so commerce, publishing
-- and admin tooling can read the catalog from the database. Keep the two in
-- sync — a color/view that exists only here cannot be rendered, and one that
-- exists only in the registry cannot be sold.
--
-- JSON casing: SQL jsonb uses snake_case (print_area, name_ar, shade_hex) as
-- documented in the plan; the TS registry uses camelCase (printArea, nameAr,
-- shadeHex). Categories/keys satisfy the table CHECK constraints
-- (^[a-z0-9_-]{1,40}$ / ^[a-z0-9_]{2,40}$).
--
-- Idempotent: re-running never duplicates or reverts admin edits.
-- ===========================================================================

insert into public.creator_product_templates
  (template_key, name, name_ar, category, dimensions_mm, views, colors, sizes,
   mockup_format, is_active, sort_order)
values
  (
    'tshirt', 'T-Shirt', 'تيشيرت', 'apparel',
    '{"w": 560, "h": 700}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 290, "w": 300, "h": 400}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 270, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "black",   "name": "Black",        "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white",   "name": "White",        "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "heather", "name": "Heather Gray", "name_ar": "رمادي",  "hex": "#a7adb8", "shade_hex": "#828996"},
      {"key": "navy",    "name": "Navy",         "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",     "name": "Red",          "name_ar": "أحمر",   "hex": "#c62f38", "shade_hex": "#8f1f26"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 1
  ),
  (
    'hoodie', 'Hoodie', 'هودي', 'apparel',
    '{"w": 600, "h": 760}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 400, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 340, "w": 300, "h": 420}}
    ]'::jsonb,
    '[
      {"key": "white",    "name": "White",    "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "charcoal", "name": "Charcoal", "name_ar": "فحمي",   "hex": "#33343d", "shade_hex": "#1a1b22"},
      {"key": "black",    "name": "Black",    "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "gray",     "name": "Gray",     "name_ar": "رمادي",  "hex": "#8f95a3", "shade_hex": "#6a7080"},
      {"key": "navy",     "name": "Navy",     "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "maroon",   "name": "Maroon",   "name_ar": "عنابي",  "hex": "#7a2e39", "shade_hex": "#541d25"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 2
  ),
  (
    'sweatshirt', 'Sweatshirt', 'سويت شيرت', 'apparel',
    '{"w": 580, "h": 720}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 330, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 300, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "white",    "name": "White",         "name_ar": "أبيض",       "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "ash",      "name": "Ash",           "name_ar": "رمادي فاتح", "hex": "#c9ccd3", "shade_hex": "#a4a8b2"},
      {"key": "navy",     "name": "Navy",          "name_ar": "كحلي",       "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "forest",   "name": "Forest Green",  "name_ar": "أخضر",       "hex": "#2f5541", "shade_hex": "#1d382a"},
      {"key": "black",    "name": "Black",         "name_ar": "أسود",       "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "burgundy", "name": "Burgundy",      "name_ar": "خمري",       "hex": "#6d2b36", "shade_hex": "#4a1c24"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 3
  ),
  (
    'mug', 'Coffee Mug', 'كوب قهوة', 'drinkware',
    '{"w": 120, "h": 95, "depth": 80}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 700}, "print_area": {"x": 215, "y": 200, "w": 430, "h": 300}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White", "name_ar": "أبيض",    "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "black", "name": "Black", "name_ar": "أسود",    "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",    "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر",    "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "mint",  "name": "Mint",  "name_ar": "نعناعي",  "hex": "#7fd1b9", "shade_hex": "#5aa992"}
    ]'::jsonb,
    '[
      {"key": "11oz", "name": "11 oz", "label": "11 oz"},
      {"key": "15oz", "name": "15 oz", "label": "15 oz"}
    ]'::jsonb,
    'png', true, 4
  ),
  (
    'phone_case', 'Phone Case', 'غطاء هاتف', 'tech',
    '{"w": 75, "h": 152}'::jsonb,
    '[
      {"key": "back", "label": "Back", "canvas": {"w": 600, "h": 1200}, "print_area": {"x": 64, "y": 130, "w": 472, "h": 970}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "pink",  "name": "Pink",  "name_ar": "وردي",   "hex": "#f2a8c4", "shade_hex": "#d17fa3"},
      {"key": "clear", "name": "Clear", "name_ar": "شفاف",   "hex": "#e9f3f7", "shade_hex": "#c3d8e0"}
    ]'::jsonb,
    '[
      {"key": "iphone-15",     "name": "iPhone 15",    "label": "iPhone 15"},
      {"key": "iphone-15-pro", "name": "iPhone 15 Pro", "label": "15 Pro"},
      {"key": "galaxy-s24",    "name": "Galaxy S24",   "label": "S24"}
    ]'::jsonb,
    'png', true, 5
  ),
  (
    'tote_bag', 'Tote Bag', 'حقيبة قماش', 'accessories',
    '{"w": 380, "h": 420}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}}
    ]'::jsonb,
    '[
      {"key": "natural", "name": "Natural", "name_ar": "طبيعي", "hex": "#e8dcc6", "shade_hex": "#cbb998"},
      {"key": "black",   "name": "Black",   "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",    "name": "Navy",    "name_ar": "كحلي", "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "olive",   "name": "Olive",   "name_ar": "زيتي", "hex": "#5d6b3f", "shade_hex": "#414c2a"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "15×16 in"},
      {"key": "large",    "name": "Large",    "label": "18×20 in"}
    ]'::jsonb,
    'png', true, 6
  ),
  (
    'poster', 'Art Poster', 'ملصق فني', 'wall_art',
    '{"w": 305, "h": 381}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 800, "h": 1000}, "print_area": {"x": 45, "y": 45, "w": 710, "h": 910}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White Paper",  "name_ar": "ورق أبيض",  "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "ivory", "name": "Ivory Paper",  "name_ar": "ورق عاجي",  "hex": "#f6f1e7", "shade_hex": "#ddd5c4"},
      {"key": "black", "name": "Black Paper",  "name_ar": "ورق أسود", "hex": "#16161c", "shade_hex": "#000000"}
    ]'::jsonb,
    '[
      {"key": "12x16", "name": "12 × 16 in", "label": "12×16"},
      {"key": "18x24", "name": "18 × 24 in", "label": "18×24"},
      {"key": "24x36", "name": "24 × 36 in", "label": "24×36"}
    ]'::jsonb,
    'png', true, 7
  ),
  (
    'mouse_pad', 'Mouse Pad', 'ماوس باد', 'accessories',
    '{"w": 220, "h": 220}'::jsonb,
    '[
      {"key": "front", "label": "Top", "canvas": {"w": 900, "h": 900}, "print_area": {"x": 72, "y": 72, "w": 756, "h": 756}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض", "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر", "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "blue",  "name": "Blue",  "name_ar": "أزرق", "hex": "#2f5f9e", "shade_hex": "#1f4272"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "9×9 in"},
      {"key": "xl",       "name": "Extended", "label": "12×10 in"}
    ]'::jsonb,
    'png', true, 8
  )
on conflict (template_key) do nothing;


-- ============================================================================
-- MIGRATION 11/22 — 20261110170000_creator_studio_publish_functions.sql — timestamp 20261110170000
-- ============================================================================
-- Creator Design Studio — publishing + admin review functions (phase 7 of 10).
--
-- Two SERVICE-ROLE-ONLY RPCs (plan D11): supabase-js cannot span a transaction
-- across calls, so every multi-statement operation lives here in ONE
-- transaction:
--
--   creator_publish_product(uuid, jsonb)
--     First publish of a configured product row: creates the store product as
--     status='draft' / visibility='hidden' / store_id=null (plan D9 — never
--     publicly purchasable before admin approval), its single default variant
--     (stock = 0 while fulfillment is 'unconfigured', else `stock_buffer` —
--     plan D8), and its images derived from the row's generated mockups; then
--     links product_id and moves the row to pending_review. A re-submission
--     after rejection UPDATES that same product (never a second one — plan
--     §5.6 duplicate guard: the create branch is guarded by `product_id is
--     null` and every other path updates).
--
--   admin_review_creator_submission(text, uuid, text, text, uuid, text)
--     One transaction for the decision: submission row + product flip + stock
--     + admin_audit_log. Creators can never execute either function (REVOKE
--     below) and the admin API route sits behind verifyAdmin — no
--     self-approval path exists.
--
-- Additive and idempotent (create or replace / if not exists). Depends on
-- 20261110120000_creator_studio_core.sql (the four studio tables) and on the
-- baseline products / product_variants / product_images / admin_audit_log
-- schema. The API route surfaces a missing function as an honest 503.

-- ---------------------------------------------------------------------------
-- 0) Preflight — fail loudly and immediately if the schema is not ready
--    (same pattern as the core migration).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.creator_profiles') is null then
    raise exception 'Dependency missing: public.creator_profiles';
  end if;
  if to_regclass('public.creator_product_templates') is null then
    raise exception 'Dependency missing: public.creator_product_templates';
  end if;
  if to_regclass('public.creator_design_products') is null then
    raise exception 'Dependency missing: public.creator_design_products';
  end if;
  if to_regclass('public.creator_gallery_items') is null then
    raise exception 'Dependency missing: public.creator_gallery_items';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regclass('public.product_variants') is null then
    raise exception 'Dependency missing: public.product_variants';
  end if;
  if to_regclass('public.product_images') is null then
    raise exception 'Dependency missing: public.product_images';
  end if;
  if to_regclass('public.categories') is null then
    raise exception 'Dependency missing: public.categories';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Dependency missing: public.profiles';
  end if;
  if to_regclass('public.admin_audit_log') is null then
    raise exception 'Dependency missing: public.admin_audit_log';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) One gallery submission per design per owner. The API route does a
--    read-before-insert for the friendly idempotent path; this index is the
--    race backstop so two concurrent submits can never create duplicates.
-- ---------------------------------------------------------------------------
create unique index if not exists creator_gallery_items_design_owner_uq
  on public.creator_gallery_items (design_id, owner_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) creator_publish_product — publish one configured product row.
--    Raised errors are namespaced `publish:<code>`; the API route maps them
--    to house error codes (see app/api/designs/[id]/publish/route.js).
-- ---------------------------------------------------------------------------
create or replace function public.creator_publish_product(
  p_design_product_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row        public.creator_design_products%rowtype;
  v_profile    public.creator_profiles%rowtype;
  v_product_id uuid;
  v_name       text;
  v_base       text;
  v_slug       text;
  v_slug_seq   integer := 1;
  v_price      numeric;
  v_compare    numeric := null;
  v_currency   text;
  v_desc       text;
  v_short      text;
  v_category   uuid := null;
  v_images     text[] := '{}';
  v_stock      integer;
begin
  -- Lock the submission row: concurrent publishes serialize here, so a double
  -- submit can never create two store products (the loser sees pending_review
  -- after the winner's transaction commits).
  select * into v_row
    from public.creator_design_products
   where id = p_design_product_id
     and deleted_at is null
     for update;

  if not found then
    raise exception 'publish:design_product_not_found';
  end if;

  if v_row.status = 'pending_review' then
    raise exception 'publish:already_submitted';
  elsif v_row.status not in ('draft', 'rejected') then
    -- approved / archived are not publishable states.
    raise exception 'publish:invalid_status';
  end if;

  -- Publishing permission is admin-managed (plan: creators never self-grant).
  select * into v_profile
    from public.creator_profiles
   where id = v_row.creator_profile_id;

  if not found or not v_profile.can_publish then
    raise exception 'publish:publish_disabled';
  end if;

  -- Payload: already validated by the pure API-route module; re-checked here
  -- because this function is the transactional authority (service-role-only).
  v_name := nullif(trim(coalesce(p_payload ->> 'name', '')), '');
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'publish:invalid_name';
  end if;

  begin
    v_price := (p_payload ->> 'base_price')::numeric;
  exception when others then
    raise exception 'publish:invalid_price';
  end;
  if v_price is null or v_price < 0 or v_price > 99999999 then
    raise exception 'publish:invalid_price';
  end if;

  if p_payload ? 'compare_at_price' and p_payload ->> 'compare_at_price' is not null then
    begin
      v_compare := (p_payload ->> 'compare_at_price')::numeric;
    exception when others then
      raise exception 'publish:invalid_price';
    end;
    -- Same rule as the admin path (parseProductPayload): only a compare-at
    -- ABOVE the base price is meaningful; anything else is dropped.
    if v_compare is not null and (v_compare <= v_price or v_compare > 99999999) then
      v_compare := null;
    end if;
  end if;

  v_currency := upper(coalesce(
    nullif(trim(coalesce(p_payload ->> 'currency', '')), ''),
    'EGP'
  ));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'publish:invalid_currency';
  end if;

  v_desc := nullif(trim(coalesce(p_payload ->> 'description', '')), '');
  if v_desc is not null and char_length(v_desc) > 5000 then
    raise exception 'publish:invalid_description';
  end if;

  v_short := nullif(trim(coalesce(p_payload ->> 'short_description', '')), '');
  if v_short is not null and char_length(v_short) > 1000 then
    raise exception 'publish:invalid_description';
  end if;

  if p_payload ->> 'category_id' is not null then
    begin
      v_category := (p_payload ->> 'category_id')::uuid;
    exception when others then
      raise exception 'publish:invalid_category';
    end;
    if not exists (
      select 1
        from public.categories c
       where c.id = v_category
         and c.is_active
         and c.deleted_at is null
    ) then
      raise exception 'publish:invalid_category';
    end if;
  end if;

  -- Images are server-built public design-previews URLs of this row's
  -- mockups (cap 12 = MAX_PRODUCT_IMAGES). A store listing never ships
  -- without a real preview — the route enforces this before calling in.
  if jsonb_typeof(coalesce(p_payload -> 'images', 'null'::jsonb)) = 'array' then
    select coalesce(array_agg(s.value order by s.ord), '{}'::text[])
      into v_images
      from (
        select t.value, t.ord
          from jsonb_array_elements_text(p_payload -> 'images') with ordinality as t(value, ord)
         where t.ord <= 12
           and length(t.value) <= 2048
      ) s;
  end if;

  if coalesce(array_length(v_images, 1), 0) = 0 then
    raise exception 'publish:no_mockups';
  end if;

  -- Plan D8: unconfigured fulfillment must stay at zero stock so the existing
  -- checkout gate fails honestly instead of claiming manufacturability.
  v_stock := case
    when v_row.fulfillment_mode = 'configured'
      then greatest(coalesce(v_row.stock_buffer, 0), 0)
    else 0
  end;

  if v_row.product_id is null then
    -- First submission: create the store product as an invisible draft (D9).
    v_base := trim(both '-' from regexp_replace(lower(trim(v_name)), '[^a-z0-9]+', '-', 'g'));
    if coalesce(v_base, '') = '' then
      v_base := 'product';
    end if;

    v_slug := v_base;
    while exists (select 1 from public.products p where p.slug = v_slug) loop
      v_slug_seq := v_slug_seq + 1;
      if v_slug_seq > 1000 then
        v_slug := v_base || '-' || floor(random() * 1000000000)::text;
        exit;
      end if;
      v_slug := v_base || '-' || v_slug_seq::text;
    end loop;

    insert into public.products (
      name, slug, short_description, description, category_id, brand_id, store_id,
      status, visibility, is_featured, base_price, compare_at_price, currency,
      color, available_colors, published_at, created_at, updated_at
    ) values (
      v_name, v_slug, v_short, v_desc, v_category, null, null,
      'draft', 'hidden', false, v_price, v_compare, v_currency,
      null, '{}'::text[], null, now(), now()
    )
    returning id into v_product_id;

    insert into public.product_variants (
      product_id, sku, price, compare_at_price, stock_quantity,
      is_active, is_default, created_at, updated_at
    ) values (
      v_product_id,
      upper(left(v_slug || '-' || replace(v_product_id::text, '-', ''), 120)),
      v_price, v_compare, v_stock,
      true, true, now(), now()
    );
  else
    -- Re-submission after rejection: reuse the SAME listing (plan §5.6 —
    -- never a second product for one configuration row) and keep it hidden
    -- until the admin approves it again.
    v_product_id := null;
    update public.products
       set name = v_name,
           short_description = v_short,
           description = v_desc,
           category_id = v_category,
           base_price = v_price,
           compare_at_price = v_compare,
           currency = v_currency,
           status = 'draft',
           visibility = 'hidden',
           published_at = null,
           updated_at = now()
     where id = v_row.product_id
       and deleted_at is null
     returning id into v_product_id;

    if v_product_id is null then
      raise exception 'publish:invalid_status';
    end if;

    update public.product_variants
       set price = v_price,
           compare_at_price = v_compare,
           stock_quantity = v_stock,
           is_active = true,
           updated_at = now()
     where product_id = v_product_id
       and is_default
       and deleted_at is null;
  end if;

  -- Product images: replace with the row's current mockups (the first one is
  -- the primary image, mirroring replaceProductImages in lib/product-admin).
  delete from public.product_images
   where product_id = v_product_id;

  insert into public.product_images (product_id, storage_path, alt_text, is_primary, sort_order)
  select v_product_id, u.image, null, u.ord = 1, u.ord - 1
    from unnest(v_images) with ordinality as u(image, ord);

  -- Link + submit: one transaction, one authoritative state change.
  update public.creator_design_products
     set product_id = v_product_id,
         status = 'pending_review',
         rejection_reason = null,
         submitted_at = now(),
         updated_at = now()
   where id = v_row.id;

  return v_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) admin_review_creator_submission — approve/reject one pending submission.
--    Raised errors are namespaced `review:<code>` (mapped by the admin route
--    in a later phase). The actor parameters feed admin_audit_log without a
--    dependency on auth.users; they default to null so the function is also
--    callable from SQL tooling.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_creator_submission(
  p_target text,
  p_id uuid,
  p_decision text,
  p_reason text,
  p_actor_id uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target   text := lower(coalesce(p_target, ''));
  v_decision text := lower(coalesce(p_decision, ''));
  v_reason   text := nullif(trim(coalesce(p_reason, '')), '');
  v_reviewer uuid := null;
  v_crow     public.creator_design_products%rowtype;
  v_grow     public.creator_gallery_items%rowtype;
  v_product_id uuid;
begin
  if v_target not in ('product', 'gallery') then
    raise exception 'review:invalid_target';
  end if;
  if v_decision not in ('approve', 'reject') then
    raise exception 'review:invalid_decision';
  end if;
  if v_decision = 'reject' and v_reason is null then
    raise exception 'review:reason_required';
  end if;

  -- reviewed_by must reference public.profiles; only record an actor that
  -- actually has one (audit still keeps actor_id + actor_email verbatim).
  if p_actor_id is not null and exists (
    select 1 from public.profiles where id = p_actor_id
  ) then
    v_reviewer := p_actor_id;
  end if;

  if v_target = 'product' then
    select * into v_crow
      from public.creator_design_products
     where id = p_id
       and deleted_at is null
       for update;

    if not found then
      raise exception 'review:not_found';
    end if;
    if v_crow.status <> 'pending_review' then
      raise exception 'review:invalid_status';
    end if;

    if v_decision = 'approve' then
      if v_crow.product_id is null then
        raise exception 'review:product_missing';
      end if;

      select id into v_product_id
        from public.products
       where id = v_crow.product_id
         and deleted_at is null;

      if v_product_id is null then
        raise exception 'review:product_missing';
      end if;

      update public.creator_design_products
         set status = 'approved',
             rejection_reason = null,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_crow.id;

      update public.products
         set status = 'published',
             visibility = 'visible',
             published_at = now(),
             updated_at = now()
       where id = v_product_id;

      -- Plan D8 at approval time: stock follows the fulfillment boundary.
      update public.product_variants
         set stock_quantity = case
               when v_crow.fulfillment_mode = 'configured'
                 then greatest(coalesce(v_crow.stock_buffer, 0), 0)
               else 0
             end,
             is_active = true,
             updated_at = now()
       where product_id = v_product_id
         and is_default
         and deleted_at is null;
    else
      update public.creator_design_products
         set status = 'rejected',
             rejection_reason = v_reason,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_crow.id;

      -- A rejection can never leave a publicly visible listing behind.
      update public.products
         set status = 'draft',
             visibility = 'hidden',
             updated_at = now()
       where id = v_crow.product_id
         and (status <> 'draft' or visibility <> 'hidden');
    end if;
  else
    select * into v_grow
      from public.creator_gallery_items
     where id = p_id
       and deleted_at is null
       for update;

    if not found then
      raise exception 'review:not_found';
    end if;
    if v_grow.status <> 'pending_review' then
      raise exception 'review:invalid_status';
    end if;

    if v_decision = 'approve' then
      update public.creator_gallery_items
         set status = 'approved',
             rejection_reason = null,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             published_at = now(),
             updated_at = now()
       where id = v_grow.id;
    else
      update public.creator_gallery_items
         set status = 'rejected',
             rejection_reason = v_reason,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_grow.id;
    end if;
  end if;

  insert into public.admin_audit_log (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    p_actor_email,
    'creator_submission_' || case v_decision when 'approve' then 'approved' else 'rejected' end,
    case when v_target = 'product'
         then 'creator_design_product'
         else 'creator_gallery_item'
    end,
    p_id,
    jsonb_build_object(
      'target', v_target,
      'decision', v_decision,
      'reason', v_reason,
      'product_id', case when v_target = 'product' then v_crow.product_id else null end
    )
  );

  return jsonb_build_object(
    'target', v_target,
    'id', p_id,
    'decision', v_decision,
    'status', case v_decision when 'approve' then 'approved' else 'rejected' end,
    'product_id', case when v_target = 'product' then v_crow.product_id else null end,
    'published', v_decision = 'approve'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Grants — service-role only. anon/authenticated (creators included) can
--    never execute these over PostgREST, so there is no self-approval path
--    even if a route bug skipped its own checks.
-- ---------------------------------------------------------------------------
revoke execute on function public.creator_publish_product(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.creator_publish_product(uuid, jsonb)
  to service_role;

revoke execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text)
  to service_role;


-- ============================================================================
-- MIGRATION 12/22 — 20261112090000_fix_admin_product_performance.sql — timestamp 20261112090000
-- ============================================================================
-- Fix admin_product_performance counting non-qualifying orders.
--
-- The original definition (20261023_production_readiness.sql) filtered order
-- status inside the LEFT JOIN to orders, so order_items rows from pending /
-- cancelled orders still joined the view (o.* came back NULL) and their line
-- totals were summed into revenue. Real example from production: a product
-- with 3000 across 3 *pending* orders and 1000 in one *paid* order rendered
-- as two rows for the same product — a phantom NULL-currency row of 3000
-- above the real USD 1000 — which also crashed the admin dashboard with
-- React's "two children with the same key" error.
--
-- Items are now qualified before aggregation, so every row is a real sale in
-- a real currency. Products whose only items sit in non-qualifying orders
-- fall back to the zero row they share with never-sold products.
--
-- Column names and types are unchanged, so CREATE OR REPLACE VIEW keeps the
-- grants installed by 20261023_production_readiness.sql (service_role only).
-- Idempotent: safe to run more than once.

create or replace view public.admin_product_performance as
select
  p.id as product_id,
  p.name,
  coalesce(v.sku, '') as sku,
  o.currency,
  coalesce(sum(oi.line_total), 0) as revenue,
  coalesce(sum(oi.quantity), 0) as units_sold,
  count(distinct o.id) as order_count
from public.products p
left join public.product_variants v
  on v.product_id = p.id
  and v.is_default
  and v.deleted_at is null
left join public.order_items oi
  on oi.variant_id = v.id
  and exists (
    select 1
    from public.orders oq
    where oq.id = oi.order_id
      and oq.status in ('paid', 'processing', 'printing', 'shipped', 'delivered')
      and oq.deleted_at is null
  )
left join public.orders o
  on o.id = oi.order_id
where p.deleted_at is null
group by p.id, p.name, v.sku, o.currency;

revoke all on public.admin_product_performance from public, anon, authenticated;
grant select on public.admin_product_performance to service_role;


-- ============================================================================
-- MIGRATION 13/22 — 20261115120000_product_available_sizes_and_color_sync_guard.sql — timestamp 20261115120000
-- ============================================================================
-- Product sizes + stop the variant colour sync from wiping manual colours.
--
-- Two production bugs fixed here:
--
-- 1. SIZES DID NOT EXIST ANYWHERE.
--    products had no size column, the admin/vendor product forms had no size
--    field, and the storefront fell back to hard-coded ["One Size"] (or ring
--    sizes guessed from the product name). `available_sizes` mirrors the
--    existing `available_colors` text[] so a single product row carries the
--    options the admin actually entered.
--
-- 2. COLOURS WERE SILENTLY WIPED ON EVERY SAVE.
--    `trg_product_variants_sync_colors` (AFTER INSERT OR UPDATE OF is_active,
--    deleted_at, is_default on product_variants) calls
--    sync_product_available_colors(), which rewrote products.available_colors
--    and products.color from the variant attribute options. The default variant
--    created by the admin/vendor product APIs has no colour options, so the
--    function wrote `available_colors = '{}'` and `color = NULL` right after
--    the colours had been saved. The guard below keeps manually entered
--    colours when there is nothing to sync from.
--
-- Idempotent: safe to run more than once.

alter table public.products
  add column if not exists available_sizes text[] not null default '{}';

-- Backfill sizes from variant attribute options that already exist, so the
-- seeded catalogue starts with real sizes instead of heuristics.
update public.products p
set available_sizes = s.sizes
from (
  select
    pv.product_id,
    array_agg(distinct pav.value order by pav.value) as sizes
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  join public.product_attributes pa
    on pa.id = pav.attribute_id
   and pa.slug = 'size'
  where pv.deleted_at is null
    and pv.is_active
  group by pv.product_id
) s
where p.id = s.product_id
  and (p.available_sizes is null or cardinality(p.available_sizes) = 0);

create or replace function public.sync_product_available_colors(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_colors text[];
  v_default_color text;
begin
  select array_agg(distinct pav.value order by pav.value)
  into v_colors
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  where pv.product_id = p_product_id
    and pv.deleted_at is null
    and pv.is_active
    and pav.attribute_id = (select id from public.product_attributes where slug = 'color');

  -- Nothing to sync from (the normal case for products created in the admin
  -- form): keep the colours that were entered on the product row.
  if v_colors is null or cardinality(v_colors) = 0 then
    return;
  end if;

  select pav.value
  into v_default_color
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  where pv.product_id = p_product_id
    and pv.deleted_at is null
    and pv.is_active
    and pav.attribute_id = (select id from public.product_attributes where slug = 'color')
  order by pv.is_default desc, pv.created_at asc
  limit 1;

  update public.products
  set available_colors = v_colors,
      color = coalesce(v_default_color, color)
  where id = p_product_id;
end;
$function$;


-- ============================================================================
-- MIGRATION 14/22 — 20261116130000_custom_print_studio.sql — timestamp 20261116130000
-- ============================================================================
-- Customer Custom Print Studio — additive, customer-only schema.
--
-- Deliberately NO creator_profiles, creator roles, marketplace or second
-- checkout. Reuses the live design subsystem (user_designs / design_versions /
-- design_files), the live product/cart/checkout tables, and the existing
-- product_customizations bridge (customization_id on cart_items/order_items).
--
-- NOT APPLIED. Local file only — application requires separate approval on an
-- isolated Staging project first.

do $$
begin
  if to_regclass('public.user_designs') is null then
    raise exception 'Dependency missing: public.user_designs';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regclass('public.product_variants') is null then
    raise exception 'Dependency missing: public.product_variants';
  end if;
  if to_regclass('public.product_customizations') is null then
    raise exception 'Dependency missing: public.product_customizations';
  end if;
  if to_regclass('public.admin_audit_log') is null then
    raise exception 'Dependency missing: public.admin_audit_log';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0) Reuse the existing design subsystem: a version IS an editor snapshot.
-- ---------------------------------------------------------------------------
alter type public.design_file_format add value if not exists 'jpg';
alter type public.design_file_format add value if not exists 'webp';

alter table public.design_versions
  add column if not exists editor_state jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 1) Admin-editable mockup template catalog. Everything visual is JSON so a
--    new product/view/colour can be added without a code deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.mockup_templates (
  id              uuid primary key default gen_random_uuid(),
  template_key    text not null unique
                    check (template_key ~ '^[a-z0-9_]{2,40}$'),
  name            text not null check (char_length(name) between 1 and 80),
  name_ar         text,
  category        text not null default 'custom'
                    check (category ~ '^[a-z0-9_-]{1,40}$'),
  description     text,
  dimensions_mm   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(dimensions_mm) = 'object'),
  views           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(views) = 'array'),
  colors          jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(colors) = 'array'),
  sizes           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(sizes) = 'array'),
  body_svg        text not null default '',
  overlay_svg     text,
  texture_patterns jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(texture_patterns) = 'array'),
  texture_id      text,
  provenance      jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(provenance) = 'object'),
  /** Admin-managed photorealistic layers (real photos, print areas, blends). */
  photo_assets    jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(photo_assets) = 'array'),
  /** Real catalog product + variant used when this template is ordered. */
  store_product_id  uuid references public.products(id) on delete set null,
  store_variant_id  uuid references public.product_variants(id) on delete set null,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists mockup_templates_catalog_idx
  on public.mockup_templates (is_active, sort_order)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) Optional public sharing. A customer submits an EXISTING private design;
--    nothing becomes public until an administrator approves it.
-- ---------------------------------------------------------------------------
create table if not exists public.shared_designs (
  id              uuid primary key default gen_random_uuid(),
  design_id       uuid not null
                    references public.user_designs(id) on delete cascade,
  owner_id        uuid not null
                    references public.profiles(id) on delete cascade,
  author_display_name text not null
                    check (char_length(author_display_name) between 2 and 60),
  title           text not null check (char_length(title) between 2 and 120),
  description     text check (description is null or char_length(description) <= 2000),
  preview_path    text,
  tags            text[] not null default '{}'
                    check (cardinality(tags) <= 30),
  status          public.design_status not null default 'draft',
  rejection_reason text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  submitted_at    timestamptz,
  published_at    timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists shared_designs_design_owner_uq
  on public.shared_designs (design_id, owner_id)
  where deleted_at is null;

create index if not exists shared_designs_public_idx
  on public.shared_designs (published_at desc)
  where deleted_at is null and status = 'approved';

create index if not exists shared_designs_owner_idx
  on public.shared_designs (owner_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3) Timestamps, RLS and least privilege.
-- ---------------------------------------------------------------------------
drop trigger if exists set_mockup_templates_updated_at on public.mockup_templates;
create trigger set_mockup_templates_updated_at
  before update on public.mockup_templates
  for each row execute function public.set_updated_at();

drop trigger if exists set_shared_designs_updated_at on public.shared_designs;
create trigger set_shared_designs_updated_at
  before update on public.shared_designs
  for each row execute function public.set_updated_at();

alter table public.mockup_templates enable row level security;
alter table public.shared_designs enable row level security;

drop policy if exists mockup_templates_public_select on public.mockup_templates;
create policy mockup_templates_public_select
  on public.mockup_templates for select to anon, authenticated
  using (is_active and deleted_at is null);

-- Owners read their own submissions; everyone reads approved public designs.
drop policy if exists shared_designs_owner_select on public.shared_designs;
create policy shared_designs_owner_select
  on public.shared_designs for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists shared_designs_public_select on public.shared_designs;
create policy shared_designs_public_select
  on public.shared_designs for select to anon, authenticated
  using (status = 'approved' and deleted_at is null);

-- No INSERT/UPDATE/DELETE policy for clients: all writes are service-role
-- routes that verify ownership with the caller-scoped client first.
revoke all on public.mockup_templates from public, anon, authenticated;
grant select on public.mockup_templates to anon, authenticated;
grant all on public.mockup_templates to service_role;

revoke all on public.shared_designs from public, anon, authenticated;
grant select on public.shared_designs to anon, authenticated;
grant all on public.shared_designs to service_role;

comment on table public.shared_designs is
  'Opt-in public designs; private designs are NEVER copied here without consent.';

-- ---------------------------------------------------------------------------
-- 4) Admin-managed mockup asset bucket. Private; browser never reads directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mockup-assets',
  'mockup-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists mockup_assets_admin_insert on storage.objects;
create policy mockup_assets_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_select on storage.objects;
create policy mockup_assets_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_update on storage.objects;
create policy mockup_assets_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_delete on storage.objects;
create policy mockup_assets_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());


-- ============================================================================
-- MIGRATION 15/22 — 20261117130000_revoke_public_security_definer_execute.sql — timestamp 20261117130000
-- ============================================================================
-- ============================================================================
-- P0 SECURITY - revoke PUBLIC/anon EXECUTE on SECURITY DEFINER functions
-- Verified live (2026-11-17, ref httywgkwfqvrbuwuzutu):
--   confirm_order_payment(uuid,text,text,numeric,jsonb,text)
--     prosecdef=true, proconfig={search_path=public},
--     proacl={=X/postgres, postgres=X/postgres, service_role=X/postgres}
--     Body checks provider, amount, currency and payment-reference uniqueness,
--     but has NO auth.uid(), is_admin() or owns_order() check. Any anonymous
--     caller who knows an order UUID can call it through
--     /rest/v1/rpc/confirm_order_payment, insert a "succeeded" payment and
--     flip a pending order to paid without paying.
--     The app never calls this function (only generated TS types mention it);
--     server/webhook flows use complete_zero_total_order / pay_with_cod /
--     initiate_external_wallet_payment. service_role keeps EXECUTE.
--
--   sync_product_available_colors(uuid) and the two colour-sync trigger
--     functions are also PUBLIC/anon/authenticated executable; the direct
--     function lets an anonymous caller rewrite any product's colour fields.
--     Trigger functions are checked at CREATE TRIGGER time, not at fire time,
--     so revoking EXECUTE does not break the existing product triggers.
--
-- Local only. NOT applied to production by this audit.
-- ============================================================================

revoke execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  to service_role;

revoke execute on function public.sync_product_available_colors(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_product_available_colors(uuid)
  to service_role;

revoke execute on function public.trg_sync_colors_from_variant()
  from public, anon, authenticated;
revoke execute on function public.trg_sync_colors_from_variant_options()
  from public, anon, authenticated;

-- Verification: none of these functions may retain an unqualified "=X/" grant
-- or an anon/authenticated grant.
select p.proname, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'confirm_order_payment',
    'sync_product_available_colors',
    'trg_sync_colors_from_variant',
    'trg_sync_colors_from_variant_options'
  )
order by p.proname;


-- ============================================================================
-- MIGRATION 16/22 — 20261117140000_gift_box_bundles.sql — timestamp 20261117140000
-- ============================================================================
-- =============================================================================
-- Migration: Gift Boxes as real product-based bundles (composition + inventory)
-- Prepared:  2026-11-17
-- STATUS:    LOCAL ONLY — NOT APPLIED TO PRODUCTION. Requires explicit human
--            approval before running against any project (run it MANUALLY in
--            the Supabase SQL editor as a single script).
--            DO NOT use `supabase db push` for this repository (legacy files
--            outside the CLI history could be re-applied by a push).
--
-- WHAT THIS DOES
--   1. gift_boxes            — 1:1 marker: a product row + this row = the
--                               product is a gift box (box itself stays a
--                               normal `products` row with its own variant,
--                               stock, price, images and admin lifecycle).
--   2. gift_box_items        — normalized composition: real catalog products
--                               (+ their variant), quantity, display order,
--                               per-item note, active flag. Removing a row
--                               never touches the underlying product.
--   3. order_item_gift_box_contents — frozen composition snapshot written by
--                               `checkout()` in the same transaction as the
--                               order; later admin edits never rewrite it.
--   4. Inventory: component stock is validated and decremented inside the
--                               existing atomic `checkout()` (single
--                               transaction, one ascending lock pass over
--                               every touched variant — deadlock-free), and
--                               restocked once by the existing
--                               `trg_restock_on_order_cancel` trigger.
--   5. Cart-time guards: `add_to_cart`, `update_cart_item_quantity` and
--                               `merge_guest_cart` run an ADVISORY component
--                               availability check (no row locks — checkout
--                               remains the authoritative atomic gate).
--
-- DESIGN NOTES
--   * No second catalog: the box IS a `products` row (existing architecture).
--   * No nesting: a gift box cannot contain another gift box (DB trigger).
--   * Unavailability semantics: archived/deleted products, inactive/deleted
--     variants or insufficient stock block purchase (requirement). Hidden or
--     draft components remain purchasable inside a box (they are hidden from
--     browsing, not out of stock) — storefront links are rendered only for
--     publicly accessible components.
--   * Pre-existing behavior intentionally preserved (unrelated): live
--     `cancel_order()` restocks line items inline AND the
--     `trg_restock_on_order_cancel` trigger restocks them again on the same
--     transition. Gift box COMPONENTS are restocked only in the trigger
--     (exactly once per cancellation).
--
-- REVERSAL: drop the three new tables (order_item_gift_box_contents first for
--   FK order does not matter here — no FKs point at them), then re-apply the
--   original definitions of `add_to_cart`, `update_cart_item_quantity`,
--   `merge_guest_cart`, `checkout` and `restock_on_order_cancel` from
--   20260910/20261023/20261030 (and the archived 20260913 file for the
--   trigger function). No data is deleted by reversal except the snapshots.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tables
-- -----------------------------------------------------------------------------
create table if not exists public.gift_boxes (
  product_id uuid primary key references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_box_items (
  id uuid primary key default gen_random_uuid(),
  gift_box_product_id uuid not null references public.gift_boxes (product_id) on delete cascade,
  -- ON DELETE CASCADE: a hard-deleted product only removes the relationship
  -- row. The reverse direction (removing from a box) never touches products.
  product_id uuid not null references public.products (id) on delete cascade,
  -- ON DELETE SET NULL: a physically deleted variant keeps the membership row
  -- visible to admins; checkout treats a null/unavailable component variant as
  -- "component unavailable" and blocks the purchase instead of overselling.
  variant_id uuid references public.product_variants (id) on delete set null,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 1000),
  display_order integer not null default 0 check (display_order >= 0),
  note text check (note is null or char_length(note) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_item_gift_box_contents (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  -- Pure snapshot columns (NO FK to products/variants on purpose): historical
  -- orders must survive later catalog edits, archives and deletions.
  product_id uuid,
  variant_id uuid,
  product_name text not null,
  variant_options jsonb not null default '{}'::jsonb,
  unit_price numeric(12, 2) not null default 0,
  quantity integer not null check (quantity > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) Indexes (incl. duplicate-entry guard for the same product/variant in one
--    box; NULL variant_id is normalised to the zero uuid so NULLs conflict too)
-- -----------------------------------------------------------------------------
create unique index if not exists gift_box_items_box_product_variant_unique
  on public.gift_box_items (
    gift_box_product_id,
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists gift_box_items_box_display_order_idx
  on public.gift_box_items (gift_box_product_id, display_order);

create index if not exists gift_box_items_product_idx
  on public.gift_box_items (product_id);

create index if not exists gift_box_items_variant_idx
  on public.gift_box_items (variant_id);

create index if not exists order_item_gift_box_contents_order_item_idx
  on public.order_item_gift_box_contents (order_item_id);

-- -----------------------------------------------------------------------------
-- 3) updated_at maintenance (reuses the existing set_updated_at() helper)
-- -----------------------------------------------------------------------------
drop trigger if exists set_gift_boxes_updated_at on public.gift_boxes;
create trigger set_gift_boxes_updated_at
  before update on public.gift_boxes
  for each row execute function public.set_updated_at();

drop trigger if exists set_gift_box_items_updated_at on public.gift_box_items;
create trigger set_gift_box_items_updated_at
  before update on public.gift_box_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Membership guard: no self-reference, no nested gift boxes
-- -----------------------------------------------------------------------------
create or replace function public.enforce_gift_box_item_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.gift_box_product_id = new.product_id then
    raise exception 'A gift box cannot contain itself';
  end if;
  if exists (
    select 1 from public.gift_boxes gb where gb.product_id = new.product_id
  ) then
    raise exception 'Gift boxes cannot be nested inside other gift boxes';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_gift_box_item_rules on public.gift_box_items;
create trigger guard_gift_box_item_rules
  before insert or update on public.gift_box_items
  for each row execute function public.enforce_gift_box_item_rules();

-- Reverse direction of the same rule: a product that is already a COMPONENT
-- of some gift box must not later be registered as a gift box itself
-- (otherwise nesting could be introduced after the fact).
create or replace function public.enforce_gift_box_registration()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.gift_box_items gbi where gbi.product_id = new.product_id
  ) then
    raise exception 'This product is already a component of another gift box and cannot become a gift box itself';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_gift_box_registration on public.gift_boxes;
create trigger guard_gift_box_registration
  before insert on public.gift_boxes
  for each row execute function public.enforce_gift_box_registration();

-- -----------------------------------------------------------------------------
-- 5) RLS: public read of published boxes only; all writes go through the admin
--    API (service role). order snapshots are owner-or-admin readable.
-- -----------------------------------------------------------------------------
alter table public.gift_boxes enable row level security;
alter table public.gift_box_items enable row level security;
alter table public.order_item_gift_box_contents enable row level security;

drop policy if exists "gift_boxes_select_public_or_admin" on public.gift_boxes;
create policy "gift_boxes_select_public_or_admin"
  on public.gift_boxes for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = gift_boxes.product_id
        and p.status = 'published'
        and p.visibility = 'visible'
        and p.deleted_at is null
    )
  );

drop policy if exists "gift_box_items_select_public_or_admin" on public.gift_box_items;
create policy "gift_box_items_select_public_or_admin"
  on public.gift_box_items for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.gift_boxes gb
        join public.products p on p.id = gb.product_id
       where gb.product_id = gift_box_items.gift_box_product_id
         and p.status = 'published'
         and p.visibility = 'visible'
         and p.deleted_at is null
    )
  );

drop policy if exists "order_item_gift_box_contents_select_owner_or_admin"
  on public.order_item_gift_box_contents;
create policy "order_item_gift_box_contents_select_owner_or_admin"
  on public.order_item_gift_box_contents for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where oi.id = order_item_gift_box_contents.order_item_id
         and o.user_id = auth.uid()
    )
  );

grant select on public.gift_boxes, public.gift_box_items,
  public.order_item_gift_box_contents to anon, authenticated;
grant all on public.gift_boxes, public.gift_box_items,
  public.order_item_gift_box_contents to service_role;

-- -----------------------------------------------------------------------------
-- 6) Advisory component availability check for the cart RPCs.
--    Semantics match add_to_cart (available = stock_quantity - reserved_quantity).
--    READ-ONLY (no FOR UPDATE): checkout remains the atomic authority; these
--    guards only reject obviously-unavailable boxes early with a clear message.
-- -----------------------------------------------------------------------------
create or replace function public.gift_box_assert_components_available(
  p_box_variant_id uuid,
  p_box_quantity integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_box_product_id uuid;
  v_comp record;
  v_available integer;
begin
  if p_box_quantity is null or p_box_quantity <= 0 then
    return;
  end if;

  select pv.product_id into v_box_product_id
    from public.product_variants pv
   where pv.id = p_box_variant_id;

  if v_box_product_id is null
     or not exists (
       select 1 from public.gift_boxes gb where gb.product_id = v_box_product_id
     ) then
    return; -- not a gift box line
  end if;

  for v_comp in
    select gbi.variant_id,
           gbi.quantity * p_box_quantity as required_qty,
           p.name as product_name,
           p.deleted_at
      from public.gift_box_items gbi
      join public.products p on p.id = gbi.product_id
     where gbi.gift_box_product_id = v_box_product_id
       and gbi.is_active
  loop
    if v_comp.variant_id is null or v_comp.deleted_at is not null then
      raise exception 'Gift box contains a product that is no longer available: %',
        v_comp.product_name;
    end if;

    select pv.stock_quantity - pv.reserved_quantity
      into v_available
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = v_comp.variant_id
       and pv.is_active
       and pv.deleted_at is null
       and p.deleted_at is null;

    if v_available is null then
      raise exception 'Gift box contains a product that is no longer available: %',
        v_comp.product_name;
    end if;

    if v_available < v_comp.required_qty then
      raise exception
        'Insufficient stock for gift box content "%": only % available, % required',
        v_comp.product_name, greatest(v_available, 0), v_comp.required_qty;
    end if;
  end loop;
end;
$function$;

revoke execute on function public.gift_box_assert_components_available(uuid, integer)
  from public, anon;
grant execute on function public.gift_box_assert_components_available(uuid, integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) add_to_cart — live definition (verified 2026-11-17) + advisory component
--    check against the FINAL line quantity (existing + added).
-- -----------------------------------------------------------------------------
create or replace function public.add_to_cart(
  p_variant_id uuid,
  p_quantity integer,
  p_customization_id uuid DEFAULT NULL::uuid,
  p_session_token text DEFAULT NULL::text
)
 RETURNS cart_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
  v_price numeric(12,2);
  v_currency text;
  v_item public.cart_items;
  v_existing_id uuid;
  v_existing_qty int := 0;
  v_stock int;
  v_reserved int;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  v_cart_id := public.get_or_create_cart(p_session_token);

  select pv.price, pv.stock_quantity, pv.reserved_quantity, p.currency
    into v_price, v_stock, v_reserved, v_currency
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
   where pv.id = p_variant_id
     and pv.is_active
     and pv.deleted_at is null
     and p.deleted_at is null
   for update of pv;

  if v_price is null then
    raise exception 'Variant not found or inactive';
  end if;

  if exists (
    select 1
      from public.cart_items ci
      join public.product_variants pv2 on pv2.id = ci.variant_id
      join public.products p2 on p2.id = pv2.product_id
     where ci.cart_id = v_cart_id
       and p2.currency <> v_currency
  ) then
    raise exception 'Your cart contains items in a different currency. Please finish that order or remove those items first.';
  end if;

  update public.carts
     set currency = v_currency,
         last_activity_at = now(),
         updated_at = now()
   where id = v_cart_id;

  if p_customization_id is not null then
    if not public.owns_customization(p_customization_id) then
      raise exception 'You do not own this customization';
    end if;
    if (v_stock - v_reserved) < p_quantity then
      raise exception 'Insufficient stock: only % available', greatest(v_stock - v_reserved, 0);
    end if;
    -- Gift box components must be available for the full line quantity.
    perform public.gift_box_assert_components_available(p_variant_id, p_quantity);
    insert into public.cart_items(cart_id, variant_id, customization_id, quantity, unit_price_snapshot)
    values (v_cart_id, p_variant_id, p_customization_id, p_quantity, v_price)
    returning * into v_item;
  else
    select id, quantity into v_existing_id, v_existing_qty
      from public.cart_items
     where cart_id = v_cart_id and variant_id = p_variant_id
       and customization_id is null and not is_saved_for_later
     for update;

    if (v_stock - v_reserved) < p_quantity then
      raise exception 'Insufficient stock: only % available', greatest(v_stock - v_reserved, 0);
    end if;

    -- Component check uses the FINAL quantity after merging with the existing
    -- line (spec: quantity of each component × number of boxes in the cart).
    perform public.gift_box_assert_components_available(
      p_variant_id, coalesce(v_existing_qty, 0) + p_quantity);

    if v_existing_id is not null then
      update public.cart_items
         set quantity = quantity + p_quantity,
             unit_price_snapshot = v_price
       where id = v_existing_id
       returning * into v_item;
    else
      insert into public.cart_items(cart_id, variant_id, quantity, unit_price_snapshot)
      values (v_cart_id, p_variant_id, p_quantity, v_price)
      returning * into v_item;
    end if;
  end if;

  return v_item;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 8) update_cart_item_quantity — live definition + component check on increase
-- -----------------------------------------------------------------------------
create or replace function public.update_cart_item_quantity(
  p_cart_item_id uuid,
  p_quantity integer,
  p_session_token text DEFAULT NULL::text
)
 RETURNS cart_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cart_id uuid; v_item public.cart_items; v_stock int; v_reserved int; v_old_qty int; v_saved boolean; v_delta int; v_variant_id uuid;
begin
  if p_quantity < 0 then raise exception 'Quantity cannot be negative'; end if;
  select cart_id,quantity,is_saved_for_later into v_cart_id,v_old_qty,v_saved from public.cart_items where id=p_cart_item_id;
  if v_cart_id is null or not public.can_access_cart(v_cart_id,p_session_token) then raise exception 'Cart item not found or access denied'; end if;
  if p_quantity=0 then delete from public.cart_items where id=p_cart_item_id; return null; end if;
  if not v_saved then
    select pv.stock_quantity,pv.reserved_quantity,ci.variant_id into v_stock,v_reserved,v_variant_id from public.cart_items ci join public.product_variants pv on pv.id=ci.variant_id where ci.id=p_cart_item_id for update of pv;
    v_delta:=p_quantity-v_old_qty;
    if v_delta>0 and (v_stock-v_reserved)<v_delta then raise exception 'Insufficient stock: only % more available',greatest(v_stock-v_reserved,0); end if;
    if v_delta>0 then
      perform public.gift_box_assert_components_available(v_variant_id, p_quantity);
    end if;
  end if;
  update public.cart_items set quantity=p_quantity where id=p_cart_item_id returning * into v_item;
  return v_item;
end;$function$;

-- -----------------------------------------------------------------------------
-- 9) merge_guest_cart — live definition + advisory component check per row
-- -----------------------------------------------------------------------------
create or replace function public.merge_guest_cart(p_session_token text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_guest_cart_id uuid; v_user_cart_id uuid; v_guest_items public.cart_items[]; v_row public.cart_items; v_existing_id uuid; v_stock int; v_reserved int;
begin
  if v_uid is null then raise exception 'Must be authenticated to merge a guest cart'; end if;
  select id into v_guest_cart_id from public.carts where session_token=p_session_token and status='active';
  if v_guest_cart_id is null then return public.get_or_create_cart(); end if;
  v_user_cart_id:=public.get_or_create_cart();
  select array_agg(ci order by ci.id) into v_guest_items from public.cart_items ci where ci.cart_id=v_guest_cart_id;
  if v_guest_items is not null then
    FOREACH v_row IN ARRAY v_guest_items LOOP
      if not v_row.is_saved_for_later then
        select stock_quantity,reserved_quantity into v_stock,v_reserved from public.product_variants where id=v_row.variant_id for update;
        if v_stock is null then raise exception 'Variant not found'; end if;
        if v_reserved > v_stock then raise exception 'Insufficient stock for variant %',v_row.variant_id; end if;
        perform public.gift_box_assert_components_available(v_row.variant_id, v_row.quantity);
      end if;
    END LOOP;
  end if;
  delete from public.cart_items where cart_id=v_guest_cart_id;
  update public.carts set status='merged',merged_into_cart_id=v_user_cart_id where id=v_guest_cart_id;
  if v_guest_items is not null then
    FOREACH v_row IN ARRAY v_guest_items LOOP
      if v_row.customization_id is not null then
        insert into public.cart_items(cart_id,variant_id,customization_id,quantity,unit_price_snapshot,is_saved_for_later) values(v_user_cart_id,v_row.variant_id,v_row.customization_id,v_row.quantity,v_row.unit_price_snapshot,v_row.is_saved_for_later);
      else
        select id into v_existing_id from public.cart_items where cart_id=v_user_cart_id and variant_id=v_row.variant_id and customization_id is null and is_saved_for_later=v_row.is_saved_for_later;
        if v_existing_id is not null then update public.cart_items set quantity=quantity+v_row.quantity where id=v_existing_id;
        else insert into public.cart_items(cart_id,variant_id,quantity,unit_price_snapshot,is_saved_for_later) values(v_user_cart_id,v_row.variant_id,v_row.quantity,v_row.unit_price_snapshot,v_row.is_saved_for_later); end if;
      end if;
    END LOOP;
  end if;
  update public.carts uc set coupon_id=gc.coupon_id,coupon_code=gc.coupon_code,discount_amount=gc.discount_amount from public.carts gc where uc.id=v_user_cart_id and gc.id=v_guest_cart_id and uc.coupon_id is null and gc.coupon_id is not null;
  return v_user_cart_id;
end;$function$;

-- -----------------------------------------------------------------------------
-- 10) checkout — live definition (verified 2026-11-17) + gift box support:
--   (a) PRE-PASS: lock every variant this checkout will touch (cart lines +
--       every component of every box line) in ONE ascending pass — a globally
--       consistent acquisition order across sessions prevents deadlocks — then
--       validate AGGREGATE component stock (stock_quantity semantics, matching
--       this function's own line checks) before anything is written.
--   (b) ORDER LOOP: after the existing line decrement, decrement every active
--       component by component_qty × box_qty and freeze the composition into
--       order_item_gift_box_contents inside the same transaction.
-- -----------------------------------------------------------------------------
create or replace function public.checkout(
  p_cart_id uuid,
  p_shipping_address jsonb,
  p_billing_address jsonb DEFAULT NULL::jsonb,
  p_gift_wrap boolean DEFAULT false,
  p_gift_note text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_shipping_fee numeric DEFAULT 0,
  p_session_token text DEFAULT NULL::text
)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cart public.carts;
  v_item record;
  v_variant public.product_variants;
  v_coupon public.coupons;
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2);
  v_gift_wrap_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_order public.orders;
  v_order_item_id uuid;
  v_line_total numeric(12,2);
  v_has_active_items boolean := false;
  v_user_use_count int;
  v_currency text;
  v_currency_count int;
  -- Gift box support
  v_lock_ids uuid[] := '{}';
  v_lock_id uuid;
  v_gb record;
  v_box_product_id uuid;
begin
  if v_uid is null then
    raise exception 'Must be authenticated to checkout';
  end if;
  if p_shipping_address is null or p_shipping_address = '{}'::jsonb then
    raise exception 'A shipping address is required';
  end if;
  if p_shipping_fee < 0 then
    raise exception 'Shipping fee cannot be negative';
  end if;

  -- Shipping fees are configured in shipping_rates. Reject arbitrary client
  -- supplied fees (including a tampered free-shipping value).
  if p_shipping_fee > 0 and not exists (
    select 1 from public.shipping_rates
     where is_active
       and round(base_fee, 2) = round(p_shipping_fee, 2)
  ) then
    raise exception 'Invalid shipping fee';
  end if;

  select * into v_cart from public.carts where id = p_cart_id for update;
  if v_cart.id is null or not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Cart not found or access denied';
  end if;
  if v_cart.owner_id is distinct from v_uid then
    raise exception 'Only the cart owner can check out (guest carts must be merged after login first)';
  end if;
  if v_cart.status <> 'active' then
    raise exception 'This cart is no longer active';
  end if;

  -- ---------------------------------------------------------------------------
  -- Gift box component pre-pass: single ascending lock pass over the union of
  -- all cart-line variants and all component variants, then aggregate stock
  -- validation. Runs before any write; a failure aborts the whole checkout.
  -- ---------------------------------------------------------------------------
  select coalesce(array_agg(lock_ids.id order by lock_ids.id), '{}'::uuid[])
    into v_lock_ids
  from (
    select ci.variant_id as id
      from public.cart_items ci
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    union
    select gbi.variant_id
      from public.cart_items ci
      join public.product_variants bpv on bpv.id = ci.variant_id
      join public.gift_boxes gb on gb.product_id = bpv.product_id
      join public.gift_box_items gbi
        on gbi.gift_box_product_id = gb.product_id and gbi.is_active
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
       and gbi.variant_id is not null
  ) lock_ids;

  foreach v_lock_id in array v_lock_ids loop
    perform 1 from public.product_variants where id = v_lock_id for update;
  end loop;

  for v_gb in
    select gbi.variant_id as comp_variant_id,
           p.name as product_name,
           p.deleted_at as product_deleted_at,
           pv.id as component_row_id,
           pv.stock_quantity as component_stock,
           sum(gbi.quantity * ci.quantity) as required_qty
      from public.cart_items ci
      join public.product_variants bpv on bpv.id = ci.variant_id
      join public.gift_boxes gb on gb.product_id = bpv.product_id
      join public.gift_box_items gbi
        on gbi.gift_box_product_id = gb.product_id and gbi.is_active
      join public.products p on p.id = gbi.product_id
      left join public.product_variants pv
        on pv.id = gbi.variant_id and pv.is_active and pv.deleted_at is null
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
     group by gbi.variant_id, p.name, p.deleted_at, pv.id, pv.stock_quantity
  loop
    if v_gb.comp_variant_id is null
       or v_gb.component_row_id is null
       or v_gb.product_deleted_at is not null then
      raise exception 'Gift box contents include a product that is no longer available: %',
        v_gb.product_name;
    end if;
    if v_gb.component_stock < v_gb.required_qty then
      raise exception 'Insufficient stock for gift box contents (%): only % available, % required',
        v_gb.product_name, greatest(v_gb.component_stock, 0), v_gb.required_qty;
    end if;
  end loop;

  for v_item in
    select ci.id, ci.variant_id, ci.quantity, ci.is_gift_wrapped
    from public.cart_items ci
    where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    order by ci.variant_id
  loop
    v_has_active_items := true;

    select * into v_variant from public.product_variants where id = v_item.variant_id for update;
    if v_variant.id is null or not v_variant.is_active or v_variant.deleted_at is not null then
      raise exception 'A product in your cart is no longer available';
    end if;
    if v_variant.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock for %: only % available', v_variant.sku, v_variant.stock_quantity;
    end if;

    v_line_total := v_variant.price * v_item.quantity;
    v_subtotal := v_subtotal + v_line_total;

    if v_item.is_gift_wrapped then
      v_gift_wrap_fee := v_gift_wrap_fee + public.gift_wrap_fee();
    end if;
  end loop;

  if not v_has_active_items then
    raise exception 'Cart is empty';
  end if;

  -- One order is always in a single currency, taken from the products.
  select count(distinct p.currency), min(p.currency)
    into v_currency_count, v_currency
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    join public.products p on p.id = pv.product_id
   where ci.cart_id = p_cart_id and not ci.is_saved_for_later;

  if v_currency_count > 1 then
    raise exception 'Cart contains products in different currencies. Please order each currency separately.';
  end if;
  v_currency := coalesce(v_currency, v_cart.currency, 'USD');

  update public.carts set currency = v_currency where id = p_cart_id;

  if v_cart.coupon_id is not null then
    select * into v_coupon from public.coupons where id = v_cart.coupon_id and is_active for update;
    if v_coupon.id is null
       or (v_coupon.expires_at is not null and v_coupon.expires_at < now())
       or (v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses)
       or (v_coupon.min_order_amount is not null and v_subtotal < v_coupon.min_order_amount) then
      raise exception 'Your applied coupon is no longer valid; please remove it and try again';
    end if;

    if v_coupon.max_uses_per_user is not null then
      select count(*) into v_user_use_count
      from public.orders
      where user_id = v_uid and coupon_id = v_coupon.id and status <> 'cancelled';
      if v_user_use_count >= v_coupon.max_uses_per_user then
        raise exception 'You have already used this coupon the maximum number of times';
      end if;
    end if;

    update public.coupons set used_count = used_count + 1 where id = v_coupon.id;
  end if;

  v_tax := public.calculate_tax(v_subtotal, p_shipping_address);
  v_total := greatest(v_subtotal + v_tax + p_shipping_fee + v_gift_wrap_fee - coalesce(v_cart.discount_amount, 0), 0);

  insert into public.orders (
    user_id, cart_id, status, subtotal, tax, shipping_fee, discount_amount, gift_wrap_fee, total,
    currency, coupon_id, coupon_code, shipping_address_snapshot, billing_address_snapshot,
    gift_wrap, gift_note, customer_note
  ) values (
    v_uid, p_cart_id, 'pending', v_subtotal, v_tax, p_shipping_fee, coalesce(v_cart.discount_amount, 0), v_gift_wrap_fee, v_total,
    v_currency, v_cart.coupon_id, v_cart.coupon_code, p_shipping_address, p_billing_address,
    p_gift_wrap, p_gift_note, p_customer_note
  ) returning * into v_order;

  for v_item in
    select
      ci.id as cart_item_id, ci.variant_id, ci.customization_id, ci.quantity,
      ci.is_gift_wrapped, ci.gift_note,
      pv.sku, pv.price,
      p.name as product_name,
      (
        select jsonb_object_agg(pa.name, pav.value)
        from public.product_variant_options pvo
        join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
        join public.product_attributes pa on pa.id = pav.attribute_id
        where pvo.variant_id = pv.id
      ) as options_snapshot
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    join public.products p on p.id = pv.product_id
    where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    order by ci.variant_id
  loop
    insert into public.order_items (
      order_id, variant_id, customization_id, product_name_snapshot, sku_snapshot, options_snapshot,
      unit_price_snapshot, quantity, line_total, is_gift_wrapped, gift_note,
      printing_instructions
    ) values (
      v_order.id, v_item.variant_id, v_item.customization_id, v_item.product_name, v_item.sku, v_item.options_snapshot,
      v_item.price, v_item.quantity, v_item.price * v_item.quantity, v_item.is_gift_wrapped, v_item.gift_note,
      null
    ) returning id into v_order_item_id;

    update public.product_variants set stock_quantity = stock_quantity - v_item.quantity where id = v_item.variant_id;

    -- -----------------------------------------------------------------------
    -- Gift box: decrement component stock (component_qty × box_qty) and freeze
    -- the purchased composition for this order line — same transaction, so the
    -- snapshot can never diverge from the stock movement.
    -- -----------------------------------------------------------------------
    select pv2.product_id into v_box_product_id
      from public.product_variants pv2
     where pv2.id = v_item.variant_id;

    if v_box_product_id is not null
       and exists (
         select 1 from public.gift_boxes gb where gb.product_id = v_box_product_id
       ) then
      update public.product_variants pv
         set stock_quantity = stock_quantity - (gbi.quantity * v_item.quantity)
        from public.gift_box_items gbi
       where gbi.gift_box_product_id = v_box_product_id
         and gbi.is_active
         and gbi.variant_id = pv.id;

      insert into public.order_item_gift_box_contents (
        order_item_id, product_id, variant_id, product_name, variant_options,
        unit_price, quantity, display_order
      )
      select
        v_order_item_id, gbi.product_id, gbi.variant_id, p.name,
        coalesce((
          select jsonb_object_agg(pa.name, pav.value)
            from public.product_variant_options pvo
            join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
            join public.product_attributes pa on pa.id = pav.attribute_id
           where pvo.variant_id = gbi.variant_id
        ), '{}'::jsonb),
        coalesce(pv.price, 0), gbi.quantity, gbi.display_order
      from public.gift_box_items gbi
      join public.products p on p.id = gbi.product_id
      left join public.product_variants pv on pv.id = gbi.variant_id
      where gbi.gift_box_product_id = v_box_product_id
        and gbi.is_active
      order by gbi.display_order, p.name;
    end if;

    if v_item.customization_id is not null then
      update public.product_customizations
      set order_item_id = v_order_item_id, status = 'ordered'
      where id = v_item.customization_id;
    end if;
  end loop;

  delete from public.cart_items where cart_id = p_cart_id and not is_saved_for_later;
  update public.carts set status = 'converted' where id = p_cart_id;

  return v_order;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 11) restock_on_order_cancel — live trigger function + component restock.
--   The trigger fires exactly once per status → 'cancelled' transition (it is
--   the single choke point for every cancellation path). Components are
--   restocked here ONCE; `cancel_order()`'s pre-existing inline line restock is
--   intentionally left untouched (observed live behavior, out of scope).
-- -----------------------------------------------------------------------------
create or replace function public.restock_on_order_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.product_variants pv
  set stock_quantity = stock_quantity + oi.quantity
  from public.order_items oi
  where oi.order_id = new.id and pv.id = oi.variant_id;

  -- Gift box components: aggregate component_qty × line_qty across every
  -- gift-box line of this order and restock each component variant once.
  update public.product_variants pv
    set stock_quantity = stock_quantity + comp.required_qty
    from (
      select gbi.variant_id, sum(gbi.quantity * oi.quantity) as required_qty
        from public.order_items oi
        join public.product_variants bpv on bpv.id = oi.variant_id
        join public.gift_boxes gb on gb.product_id = bpv.product_id
        join public.gift_box_items gbi
          on gbi.gift_box_product_id = gb.product_id
         and gbi.is_active
         and gbi.variant_id is not null
       where oi.order_id = new.id
       group by gbi.variant_id
    ) comp
   where pv.id = comp.variant_id;

  return new;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 12) Verification (each returns rows when correct)
-- -----------------------------------------------------------------------------
select 'tables' AS check, count(*) AS value
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('gift_boxes', 'gift_box_items', 'order_item_gift_box_contents')
union all
select 'policies', count(*)
  from pg_policies
 where schemaname = 'public'
   and tablename in ('gift_boxes', 'gift_box_items', 'order_item_gift_box_contents')
union all
select 'component_fn', count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'gift_box_assert_components_available';


-- ============================================================================
-- MIGRATION 17/22 — 20261117150000_fix_cancel_order_double_restock.sql — timestamp 20261117150000
-- ============================================================================
﻿-- ============================================================================
-- P0 INVENTORY INTEGRITY â€” cancel_order restocks stock twice
--
-- Verified live 2026-11-17 (ref httywgkwfqvrbuwuzutu):
--   public.cancel_order() has an inline loop that does
--     update product_variants set stock_quantity = stock_quantity + oi.quantity
--   and then sets orders.status='cancelled', which fires
--     trg_restock_on_order_cancel -> restock_on_order_cancel()
--   which performs the SAME increment again. Net effect: 2x the ordered
--   quantity is returned to stock on every cancellation through the RPC.
--
-- Fix: make the trigger the SINGLE restock authority. Removing the inline loop
-- also keeps the gift-box migration (20261117140000) correct when it is later
-- applied: its trigger version restocks both line variants and components,
-- exactly once, while this function only flips statuses.
--
-- Local only. NOT applied to production by this audit.
-- Apply in a transaction, after taking a backup, and run the verification
-- query below. Rollback: re-create the previous function from
-- pg_get_functiondef() captured before applying (or restore from backup).
-- ============================================================================


create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
begin
  if not public.owns_order(p_order_id) then
    raise exception 'Order not found or access denied';
  end if;

  -- Serialise concurrent cancellations of the same order.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status not in ('pending', 'paid') then
    raise exception 'Orders can only be cancelled while pending or paid, not %', v_order.status;
  end if;

  -- Do NOT touch product_variants here. trg_restock_on_order_cancel is the
  -- single restock path (line variants today; + gift-box components once
  -- 20261117140000 is applied). Its WHEN clause also makes it one-shot.
  update public.order_items
     set status = 'cancelled'
   where order_id = p_order_id
     and status is distinct from 'cancelled';

  update public.orders
     set status = 'cancelled'
   where id = p_order_id
  returning * into v_order;

  if p_reason is not null then
    update public.order_status_history
       set note = p_reason
     where id = (
       select id from public.order_status_history
        where order_id = p_order_id
        order by created_at desc
        limit 1
     );
  end if;

  return v_order;
end;
$function$;


-- Verification (read-only): cancel_order must be false, trigger true.
select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%' as increments_stock
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cancel_order', 'restock_on_order_cancel')
order by p.proname;


-- ============================================================================
-- MIGRATION 18/22 — 20261117160000_vendor_payout_method.sql — timestamp 20261117160000
-- ============================================================================
﻿-- ============================================================================
-- P1 VENDOR PAYOUTS â€” persist the chosen method and serialise requests
--
-- Confirmed live 2026-11-17: the vendor UI sends {amount, method}, but the API
-- reads only amount, request_vendor_payout(p_store_id, p_amount) has no method
-- parameter, vendor_payout_requests has no method column, and
-- approve_vendor_payout_request() never populates vendor_payouts.payout_method.
-- The method is silently discarded. 0 requests exist today, so no data is lost.
--
-- This migration:
--   1. adds vendor_payout_requests.payout_method with the same allow-list used
--      by vendor_payouts.payout_method;
--   2. replaces request_vendor_payout with a 3-arg version (the old 2-arg
--      function must be DROPPED or calls become ambiguous), adds a per-store
--      advisory lock so concurrent requests cannot both pass the balance guard,
--      and stores the method;
--   3. teaches approve_vendor_payout_request to copy the method to the ledger.
--
-- Local only. NOT applied to production. Test on Staging first; the API route
-- ships with a compatibility fallback until this migration is applied.
-- Rollback: restore the 2-arg function from pg_get_functiondef() captured
-- before applying, drop the payout_method column, and re-grant EXECUTE.
-- ============================================================================


alter table public.vendor_payout_requests
  add column if not exists payout_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendor_payout_requests_method_check'
  ) then
    alter table public.vendor_payout_requests
      add constraint vendor_payout_requests_method_check
      check (payout_method is null or payout_method in ('bank_transfer','paypal','wallet','other'));
  end if;
end
$$;

drop function if exists public.request_vendor_payout(uuid, numeric);

create or replace function public.request_vendor_payout(
  p_store_id uuid,
  p_amount numeric,
  p_method text default null
)
returns public.vendor_payout_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_available numeric;
  v_pending numeric;
  v_method text;
  v_row public.vendor_payout_requests;
begin
  if not public.owns_store(p_store_id) then
    raise exception 'You do not own this store';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  v_method := coalesce(nullif(btrim(p_method), ''), 'bank_transfer');
  if v_method not in ('bank_transfer', 'paypal', 'wallet', 'other') then
    raise exception 'Invalid payout method: %', v_method;
  end if;

  -- The balance guard reads two tables. Serialise per store even when no
  -- earnings rows are locked, so concurrent requests cannot both pass.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select coalesce(sum(net_amount), 0) into v_available
  from (
    select net_amount from public.vendor_earnings
    where store_id = p_store_id and status = 'available'
    for update
  ) locked_earnings;

  select coalesce(sum(requested_amount), 0) into v_pending
  from public.vendor_payout_requests
  where store_id = p_store_id and status in ('pending', 'approved');

  if p_amount > (v_available - v_pending) then
    raise exception 'Requested amount % exceeds available balance of %', p_amount, (v_available - v_pending);
  end if;

  insert into public.vendor_payout_requests
    (store_id, requested_amount, requested_by, payout_method)
  values
    (p_store_id, p_amount, auth.uid(), v_method)
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.request_vendor_payout(uuid, numeric, text) from public;
grant execute on function public.request_vendor_payout(uuid, numeric, text) to authenticated, service_role;

-- Same signature as live: CREATE OR REPLACE keeps existing grants.
create or replace function public.approve_vendor_payout_request(
  p_request_id uuid,
  p_notes text default null
)
returns public.vendor_payouts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.vendor_payout_requests;
  v_payout public.vendor_payouts;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_request
  from public.vendor_payout_requests
  where id = p_request_id and status = 'pending'
  for update;
  if v_request.id is null then
    raise exception 'Payout request not found or not pending';
  end if;

  update public.vendor_payout_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         notes = coalesce(p_notes, notes)
   where id = p_request_id;

  insert into public.vendor_payouts
    (payout_request_id, store_id, amount, status, payout_method)
  values
    (p_request_id, v_request.store_id, v_request.requested_amount, 'approved', v_request.payout_method)
  returning * into v_payout;

  return v_payout;
end;
$function$;


-- Verification (read-only, run on Staging):
-- select column_name from information_schema.columns where table_schema='public'
--   and table_name='vendor_payout_requests' and column_name='payout_method';
-- select oid::regprocedure, proacl from pg_proc where proname='request_vendor_payout';
-- select payout_request_id, payout_method from public.vendor_payouts limit 10;


-- ============================================================================
-- MIGRATION 19/22 — 20261117170000_harden_financial_rls.sql — timestamp 20261117170000
-- ============================================================================
﻿-- ============================================================================
-- P1 - tighten financial RLS policies and an over-broad RPC grant
--
-- Verified live 2026-11-17: ten policies on vendor_earnings,
-- vendor_payout_requests, vendor_commissions and recently_viewed_products are
-- declared TO public (anon + authenticated) even though they guard financial
-- or private user rows. Service role bypasses RLS, and every application query
-- for these tables uses either service role or an authenticated user, so
-- narrowing to authenticated is behaviour-preserving for the app.
--
-- Also: verify_vodafone_cash_payment(...) is SECURITY DEFINER with an internal
-- is_admin() check but still carries an implicit PUBLIC EXECUTE grant. Remove
-- that implicit grant; keep authenticated and service_role.
--
-- Local only. NOT applied to production. Rollback: run the commented
-- ALTER POLICY ... TO public statements and GRANT EXECUTE ... TO public.
-- ============================================================================


-- The authoritative baseline deliberately excludes RLS policies; historical
-- migrations create only some of these names. Narrow the ones that exist and
-- skip absent ones instead of aborting the whole chain.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('recently_viewed_products','recently_viewed_insert_own'),
      ('recently_viewed_products','recently_viewed_select_owner_or_admin'),
      ('vendor_commissions','vendor_commissions_delete_admin'),
      ('vendor_commissions','vendor_commissions_insert_admin'),
      ('vendor_commissions','vendor_commissions_select_own_or_global_or_admin'),
      ('vendor_commissions','vendor_commissions_update_admin'),
      ('vendor_earnings','vendor_earnings_select_owner_or_admin'),
      ('vendor_earnings','vendor_earnings_update_admin'),
      ('vendor_payout_requests','vendor_payout_requests_select_owner_or_admin'),
      ('vendor_payout_requests','vendor_payout_requests_update_admin')
    ) as v(tbl, pol)
  loop
    if exists (
      select 1 from pg_policies
       where schemaname='public' and tablename=r.tbl and policyname=r.pol
    ) then
      execute format('alter policy %I on public.%I to authenticated', r.pol, r.tbl);
    else
      raise notice '[RLS hardening] policy %.% absent, skipping', r.tbl, r.pol;
    end if;
  end loop;
end $$;

revoke execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  from public, anon;
-- Admin API routes call this RPC with a user JWT (authenticated), so that
-- role must keep EXECUTE. service_role keeps it as well.
grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  to authenticated, service_role;


-- Verification (read-only):
-- select tablename, policyname, roles, cmd from pg_policies
--  where schemaname='public' and tablename in (...);
-- select proname, proacl from pg_proc where proname='verify_vodafone_cash_payment';

-- ROLLBACK (manual):
-- alter policy recently_viewed_insert_own on public.recently_viewed_products to public;
-- ... repeat for every policy above ...
-- grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text) to public;


-- ============================================================================
-- MIGRATION 20/22 — 20261118120000_fix_vendor_views_security_invoker.sql — timestamp 20261118120000
-- ============================================================================
-- ============================================================================
-- P0 — remove the security_definer_view advisory on the 19 public.vendor_*
-- views. Definer rights let a view bypass the caller's RLS on base tables;
-- with security_invoker=true the querying role's RLS applies, which is what
-- multi-tenant isolation requires.
--
-- Note: 20261118110000 is already used by the RLS/grants migration, so the
-- next free slot (20261118120000) is used for this file.
--
-- Local/Staging validated: npx supabase db reset + 126/126 integration tests.
-- DO NOT APPLY TO PRODUCTION without the human-approved runbook.
-- ============================================================================

do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname like 'vendor_%'
     order by c.relname
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
    execute format('revoke all on table public.%I from public, anon', v.relname);
    execute format('grant select on table public.%I to authenticated, service_role', v.relname);
  end loop;
end $$;

-- Verification (read-only):
-- select c.relname, c.reloptions from pg_class c
--  join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
-- order by c.relname;
-- All 19 rows must contain security_invoker=true.


-- ============================================================================
-- MIGRATION 21/22 — 20261118130000_vendor_order_rls.sql — timestamp 20261118130000
-- ============================================================================
-- Local/Staging only. DO NOT APPLY TO PRODUCTION without human approval.
--
-- The 19 vendor_* views now use security_invoker=true, so the caller's RLS on
-- base tables applies. Production policies on orders/order_items only allow the
-- BUYER (owns_order) or an admin. Without the policies below, a vendor sees no
-- orders from their own store unless they happened to buy them personally —
-- a functional regression that would silently empty the vendor dashboard.
--
-- These policies are scoped strictly to stores owned by the authenticated user
-- via product -> variant -> order item. They are additive (permissive OR) and
-- do not weaken buyer or admin access.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='orders'
       and policyname='vendor_store_orders_select_20261118'
  ) then
    create policy vendor_store_orders_select_20261118
      on public.orders for select to authenticated
      using (
        exists (
          select 1
            from public.order_items oi
            join public.product_variants pv on pv.id = oi.variant_id
            join public.products p on p.id = pv.product_id
            join public.stores s on s.id = p.store_id
           where oi.order_id = orders.id
             and s.owner_id = auth.uid()
             and s.deleted_at is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='order_items'
       and policyname='vendor_store_order_items_select_20261118'
  ) then
    create policy vendor_store_order_items_select_20261118
      on public.order_items for select to authenticated
      using (
        exists (
          select 1
            from public.product_variants pv
            join public.products p on p.id = pv.product_id
            join public.stores s on s.id = p.store_id
           where pv.id = order_items.variant_id
             and s.owner_id = auth.uid()
             and s.deleted_at is null
        )
      );
  end if;
end $$;

-- Verification is performed with a two-vendor/two-store rollback probe:
-- vendor A must see store A's order (buyer = unrelated customer), vendor B must
-- see none, and an unrelated customer must still see only their own order.


-- ============================================================================
-- MIGRATION 22/22 — 20261118140000_unify_checkout_hardening_with_gift_boxes.sql — timestamp 20261118140000
-- ============================================================================
-- R1 FIX — unified checkout(): Gift Boxes + hardened coupon/shipping validation.
-- Generated 2026-11-18 by merging:
--   20261030000001_checkout_coupon_shipping_hardening.sql (validation)
--   20261117140000_gift_box_bundles.sql (gift-box-aware checkout)
-- This file is the FINAL checkout definition in the deployment chain and must
-- run AFTER 20261117140000_gift_box_bundles.sql. No production SQL was executed
-- by the agent. LOCAL/STAGING VALIDATED; production apply requires human approval.
--
-- Preserved: gift-box component locking, stock validation, snapshots, discounts.
-- Preserved: coupon starts_at/expires_at/type/value/max_uses_per_user revalidation
--            and get_shipping_options() fee verification.
-- Removed:   trust in cart.discount_amount and shipping_rates.base_fee-only check.

create or replace function public.checkout(
  p_cart_id uuid,
  p_shipping_address jsonb,
  p_billing_address jsonb DEFAULT NULL::jsonb,
  p_gift_wrap boolean DEFAULT false,
  p_gift_note text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_shipping_fee numeric DEFAULT 0,
  p_session_token text DEFAULT NULL::text
)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cart public.carts;
  v_item record;
  v_variant public.product_variants;
  v_coupon public.coupons;
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2);
  v_gift_wrap_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_order public.orders;
  v_order_item_id uuid;
  v_line_total numeric(12,2);
  v_has_active_items boolean := false;
  v_user_use_count int;
  v_currency text;
  v_currency_count int;
  v_coupon_id uuid;
  v_coupon_code text;
  v_discount numeric(12,2) := 0;
  v_country text;
  -- Gift box support
  v_lock_ids uuid[] := '{}';
  v_lock_id uuid;
  v_gb record;
  v_box_product_id uuid;
begin
  if v_uid is null then
    raise exception 'Must be authenticated to checkout';
  end if;
  if p_shipping_address is null or p_shipping_address = '{}'::jsonb then
    raise exception 'A shipping address is required';
  end if;
  if p_shipping_fee < 0 then
    raise exception 'Shipping fee cannot be negative';
  end if;

  -- The shipping fee must be one of the methods actually offered for this
  -- destination and subtotal. If every method costs money, a missing/zero fee
  -- must not silently mean free shipping.
  v_country := coalesce(nullif(btrim(p_shipping_address->>'country'), ''), 'Egypt');
  if p_shipping_fee > 0 then
    if not exists (
      select 1
      from public.get_shipping_options(v_country, v_subtotal, 0) opt
      where round(opt.fee, 2) = round(p_shipping_fee, 2)
    ) then
      raise exception 'Invalid shipping fee';
    end if;
  elsif exists (
    select 1 from public.get_shipping_options(v_country, v_subtotal, 0)
  ) and not exists (
    select 1
    from public.get_shipping_options(v_country, v_subtotal, 0) opt
    where round(opt.fee, 2) = 0
  ) then
    raise exception 'Please choose a shipping method';
  end if;

  select * into v_cart from public.carts where id = p_cart_id for update;
  if v_cart.id is null or not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Cart not found or access denied';
  end if;
  if v_cart.owner_id is distinct from v_uid then
    raise exception 'Only the cart owner can check out (guest carts must be merged after login first)';
  end if;
  if v_cart.status <> 'active' then
    raise exception 'This cart is no longer active';
  end if;

  -- ---------------------------------------------------------------------------
  -- Gift box component pre-pass: single ascending lock pass over the union of
  -- all cart-line variants and all component variants, then aggregate stock
  -- validation. Runs before any write; a failure aborts the whole checkout.
  -- ---------------------------------------------------------------------------
  select coalesce(array_agg(lock_ids.id order by lock_ids.id), '{}'::uuid[])
    into v_lock_ids
  from (
    select ci.variant_id as id
      from public.cart_items ci
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    union
    select gbi.variant_id
      from public.cart_items ci
      join public.product_variants bpv on bpv.id = ci.variant_id
      join public.gift_boxes gb on gb.product_id = bpv.product_id
      join public.gift_box_items gbi
        on gbi.gift_box_product_id = gb.product_id and gbi.is_active
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
       and gbi.variant_id is not null
  ) lock_ids;

  foreach v_lock_id in array v_lock_ids loop
    perform 1 from public.product_variants where id = v_lock_id for update;
  end loop;

  for v_gb in
    select gbi.variant_id as comp_variant_id,
           p.name as product_name,
           p.deleted_at as product_deleted_at,
           pv.id as component_row_id,
           pv.stock_quantity as component_stock,
           sum(gbi.quantity * ci.quantity) as required_qty
      from public.cart_items ci
      join public.product_variants bpv on bpv.id = ci.variant_id
      join public.gift_boxes gb on gb.product_id = bpv.product_id
      join public.gift_box_items gbi
        on gbi.gift_box_product_id = gb.product_id and gbi.is_active
      join public.products p on p.id = gbi.product_id
      left join public.product_variants pv
        on pv.id = gbi.variant_id and pv.is_active and pv.deleted_at is null
     where ci.cart_id = p_cart_id and not ci.is_saved_for_later
     group by gbi.variant_id, p.name, p.deleted_at, pv.id, pv.stock_quantity
  loop
    if v_gb.comp_variant_id is null
       or v_gb.component_row_id is null
       or v_gb.product_deleted_at is not null then
      raise exception 'Gift box contents include a product that is no longer available: %',
        v_gb.product_name;
    end if;
    if v_gb.component_stock < v_gb.required_qty then
      raise exception 'Insufficient stock for gift box contents (%): only % available, % required',
        v_gb.product_name, greatest(v_gb.component_stock, 0), v_gb.required_qty;
    end if;
  end loop;

  for v_item in
    select ci.id, ci.variant_id, ci.quantity, ci.is_gift_wrapped
    from public.cart_items ci
    where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    order by ci.variant_id
  loop
    v_has_active_items := true;

    select * into v_variant from public.product_variants where id = v_item.variant_id for update;
    if v_variant.id is null or not v_variant.is_active or v_variant.deleted_at is not null then
      raise exception 'A product in your cart is no longer available';
    end if;
    if v_variant.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock for %: only % available', v_variant.sku, v_variant.stock_quantity;
    end if;

    v_line_total := v_variant.price * v_item.quantity;
    v_subtotal := v_subtotal + v_line_total;

    if v_item.is_gift_wrapped then
      v_gift_wrap_fee := v_gift_wrap_fee + public.gift_wrap_fee();
    end if;
  end loop;

  if not v_has_active_items then
    raise exception 'Cart is empty';
  end if;

  -- One order is always in a single currency, taken from the products.
  select count(distinct p.currency), min(p.currency)
    into v_currency_count, v_currency
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    join public.products p on p.id = pv.product_id
   where ci.cart_id = p_cart_id and not ci.is_saved_for_later;

  if v_currency_count > 1 then
    raise exception 'Cart contains products in different currencies. Please order each currency separately.';
  end if;
  v_currency := coalesce(v_currency, v_cart.currency, 'USD');

  update public.carts set currency = v_currency where id = p_cart_id;

  -- Re-validate and recompute the coupon instead of trusting the value stored
  -- on the cart when apply_coupon() ran.
  if v_cart.coupon_id is not null or v_cart.coupon_code is not null then
    if v_cart.coupon_id is not null then
      select * into v_coupon
      from public.coupons
      where id = v_cart.coupon_id and is_active
      for update;
    else
      select * into v_coupon
      from public.coupons
      where code = upper(btrim(v_cart.coupon_code)) and is_active
      for update;
    end if;

    if v_coupon.id is null
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.expires_at is not null and v_coupon.expires_at < now())
       or (v_coupon.max_uses is not null and coalesce(v_coupon.used_count, 0) >= v_coupon.max_uses)
       or (v_coupon.min_order_amount is not null and v_subtotal < v_coupon.min_order_amount) then
      raise exception 'Your applied coupon is no longer valid; please remove it and try again';
    end if;

    if v_coupon.type is null or v_coupon.type not in ('percentage', 'fixed') then
      raise exception 'Your applied coupon has an unsupported type; please remove it and try again';
    end if;

    if v_coupon.value is null or v_coupon.value < 0 then
      raise exception 'Your applied coupon has an invalid value; please remove it and try again';
    end if;

    if v_coupon.max_uses_per_user is not null then
      select count(*) into v_user_use_count
      from public.orders
      where user_id = v_uid and coupon_id = v_coupon.id and status <> 'cancelled';
      if v_user_use_count >= v_coupon.max_uses_per_user then
        raise exception 'You have already used this coupon the maximum number of times';
      end if;
    end if;

    if v_coupon.type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.value / 100, 2);
      if v_coupon.max_discount_amount is not null then
        v_discount := least(v_discount, v_coupon.max_discount_amount);
      end if;
    else
      v_discount := least(v_coupon.value, v_subtotal);
    end if;
    v_discount := greatest(least(coalesce(v_discount, 0), v_subtotal), 0);
    v_coupon_id := v_coupon.id;
    v_coupon_code := v_coupon.code;

    update public.coupons
       set used_count = coalesce(used_count, 0) + 1
     where id = v_coupon.id;
    update public.carts
       set coupon_id = v_coupon.id,
           coupon_code = v_coupon.code,
           discount_amount = v_discount
     where id = p_cart_id;
  else
    v_discount := 0;
    update public.carts set discount_amount = 0 where id = p_cart_id;
  end if;

  v_tax := public.calculate_tax(v_subtotal, p_shipping_address);
  v_total := greatest(v_subtotal + v_tax + p_shipping_fee + v_gift_wrap_fee - coalesce(v_discount, 0), 0);

  insert into public.orders (
    user_id, cart_id, status, subtotal, tax, shipping_fee, discount_amount, gift_wrap_fee, total,
    currency, coupon_id, coupon_code, shipping_address_snapshot, billing_address_snapshot,
    gift_wrap, gift_note, customer_note
  ) values (
    v_uid, p_cart_id, 'pending', v_subtotal, v_tax, p_shipping_fee, coalesce(v_discount, 0), v_gift_wrap_fee, v_total,
    v_currency, v_coupon_id, v_coupon_code, p_shipping_address, p_billing_address,
    p_gift_wrap, p_gift_note, p_customer_note
  ) returning * into v_order;

  for v_item in
    select
      ci.id as cart_item_id, ci.variant_id, ci.customization_id, ci.quantity,
      ci.is_gift_wrapped, ci.gift_note,
      pv.sku, pv.price,
      p.name as product_name,
      (
        select jsonb_object_agg(pa.name, pav.value)
        from public.product_variant_options pvo
        join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
        join public.product_attributes pa on pa.id = pav.attribute_id
        where pvo.variant_id = pv.id
      ) as options_snapshot
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    join public.products p on p.id = pv.product_id
    where ci.cart_id = p_cart_id and not ci.is_saved_for_later
    order by ci.variant_id
  loop
    insert into public.order_items (
      order_id, variant_id, customization_id, product_name_snapshot, sku_snapshot, options_snapshot,
      unit_price_snapshot, quantity, line_total, is_gift_wrapped, gift_note,
      printing_instructions
    ) values (
      v_order.id, v_item.variant_id, v_item.customization_id, v_item.product_name, v_item.sku, v_item.options_snapshot,
      v_item.price, v_item.quantity, v_item.price * v_item.quantity, v_item.is_gift_wrapped, v_item.gift_note,
      null
    ) returning id into v_order_item_id;

    update public.product_variants set stock_quantity = stock_quantity - v_item.quantity where id = v_item.variant_id;

    -- -----------------------------------------------------------------------
    -- Gift box: decrement component stock (component_qty × box_qty) and freeze
    -- the purchased composition for this order line — same transaction, so the
    -- snapshot can never diverge from the stock movement.
    -- -----------------------------------------------------------------------
    select pv2.product_id into v_box_product_id
      from public.product_variants pv2
     where pv2.id = v_item.variant_id;

    if v_box_product_id is not null
       and exists (
         select 1 from public.gift_boxes gb where gb.product_id = v_box_product_id
       ) then
      update public.product_variants pv
         set stock_quantity = stock_quantity - (gbi.quantity * v_item.quantity)
        from public.gift_box_items gbi
       where gbi.gift_box_product_id = v_box_product_id
         and gbi.is_active
         and gbi.variant_id = pv.id;

      insert into public.order_item_gift_box_contents (
        order_item_id, product_id, variant_id, product_name, variant_options,
        unit_price, quantity, display_order
      )
      select
        v_order_item_id, gbi.product_id, gbi.variant_id, p.name,
        coalesce((
          select jsonb_object_agg(pa.name, pav.value)
            from public.product_variant_options pvo
            join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
            join public.product_attributes pa on pa.id = pav.attribute_id
           where pvo.variant_id = gbi.variant_id
        ), '{}'::jsonb),
        coalesce(pv.price, 0), gbi.quantity, gbi.display_order
      from public.gift_box_items gbi
      join public.products p on p.id = gbi.product_id
      left join public.product_variants pv on pv.id = gbi.variant_id
      where gbi.gift_box_product_id = v_box_product_id
        and gbi.is_active
      order by gbi.display_order, p.name;
    end if;

    if v_item.customization_id is not null then
      update public.product_customizations
      set order_item_id = v_order_item_id, status = 'ordered'
      where id = v_item.customization_id;
    end if;
  end loop;

  delete from public.cart_items where cart_id = p_cart_id and not is_saved_for_later;
  update public.carts set status = 'converted' where id = p_cart_id;

  return v_order;
end;
$function$;


-- Keep the hardened ACL from 20261030000001 (CREATE OR REPLACE preserves ACLs,
-- but the explicit revoke/grant is repeated so the final state is unambiguous).
revoke execute on function public.checkout(uuid, jsonb, jsonb, boolean, text, text, numeric, text)
  from public, anon;
grant execute on function public.checkout(uuid, jsonb, jsonb, boolean, text, text, numeric, text)
  to authenticated, service_role;

-- Verification (read-only):
-- select pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure)
--        like '%v_coupon.starts_at > now()%' as hardened,
--        pg_get_functiondef('public.checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)'::regprocedure)
--        like '%gift_box_items%' as giftbox_aware;


-- ============================================================================
-- PHASE 22/22 COMPLETE — POST-DEPLOYMENT VERIFICATION
-- Review every result. All object checks must be non-null and all ACL checks false.
-- ============================================================================
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


-- ============================================================================
-- END OF PRODUCTION DEPLOYMENT SCRIPT
-- If any statement failed, DO NOT re-run blindly. See PRODUCTION_DEPLOYMENT_GUIDE.md.
-- ============================================================================
