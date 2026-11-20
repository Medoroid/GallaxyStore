-- LOCAL/STAGING VERIFICATION ONLY — never run on Production.
-- Minimal, self-contained schema that reproduces the audited live objects,
-- then applies the corrective migrations and ASSERTs the results.
-- Run: npx supabase db query --local --file supabase/manual-review/06_local_staging_p0_verification.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- fixtures
create table if not exists public.profiles (
  id uuid primary key, role text not null default 'customer', deleted_at timestamptz
);
create table if not exists public.stores (
  id uuid primary key, owner_id uuid not null, status text not null default 'approved'
);
create table if not exists public.product_variants (
  id uuid primary key, stock_quantity integer not null default 0
);
create table if not exists public.products (
  id uuid primary key, color text, available_colors text[] not null default '{}'
);
create table if not exists public.orders (
  id uuid primary key, user_id uuid not null, status text not null default 'pending',
  total numeric not null default 0, currency text not null default 'USD', created_at timestamptz default now()
);
create table if not exists public.order_items (
  id uuid primary key, order_id uuid not null, variant_id uuid, quantity integer not null,
  status text not null default 'paid'
);
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(), order_id uuid not null, note text, created_at timestamptz default now()
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null, provider text not null,
  provider_payment_id text not null, amount numeric not null, currency text not null,
  status text not null, created_at timestamptz default now(),
  unique (provider, provider_payment_id)
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
                 and p.role in ('admin','superadmin') and p.deleted_at is null);
$$;
create or replace function public.owns_order(p_order_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.orders o where o.id = p_order_id and o.user_id = auth.uid());
$$;
create or replace function public.owns_store(p_store_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = auth.uid());
$$;
grant execute on function public.is_admin(), public.owns_order(uuid), public.owns_store(uuid) to anon, authenticated, service_role;

-- ------------------------------------------------ LIVE-SHAPE "before" objects
-- cancel_order with the double restock (inline loop + trigger)
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders language plpgsql security definer set search_path = public as $fn$
declare v_order public.orders; v_item record;
begin
  if not public.owns_order(p_order_id) then raise exception 'Order not found or access denied'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status not in ('pending','paid') then raise exception 'Orders can only be cancelled while pending or paid, not %', v_order.status; end if;
  for v_item in select id, variant_id, quantity from public.order_items where order_id = p_order_id loop
    if v_item.variant_id is not null then
      update public.product_variants set stock_quantity = stock_quantity + v_item.quantity where id = v_item.variant_id;
    end if;
    update public.order_items set status = 'cancelled' where id = v_item.id;
  end loop;
  update public.orders set status = 'cancelled' where id = p_order_id returning * into v_order;
  if p_reason is not null then
    update public.order_status_history set note = p_reason
    where id = (select id from public.order_status_history where order_id = p_order_id order by created_at desc limit 1);
  end if;
  return v_order;
end; $fn$;

create or replace function public.restock_on_order_cancel() returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.product_variants pv set stock_quantity = stock_quantity + oi.quantity
  from public.order_items oi where oi.order_id = new.id and pv.id = oi.variant_id;
  return new;
end; $fn$;
drop trigger if exists trg_restock_on_order_cancel on public.orders;
create trigger trg_restock_on_order_cancel after update of status on public.orders
for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
execute function public.restock_on_order_cancel();

-- Publicly executable payment confirmation (live shape)
create or replace function public.confirm_order_payment(
  p_order_id uuid, p_provider text, p_provider_payment_id text, p_amount numeric,
  p_raw_response jsonb default null, p_currency text default null
) returns public.orders language plpgsql security definer set search_path = public as $fn$
declare v_order public.orders;
begin
  if p_provider not in ('stripe','paymob','cod','wallet') then raise exception 'bad provider'; end if;
  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then raise exception 'reference required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if p_currency is not null and upper(p_currency) <> upper(v_order.currency) then raise exception 'currency mismatch'; end if;
  if abs(p_amount - v_order.total) > 0.01 then raise exception 'amount mismatch'; end if;
  insert into public.payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response, captured_at)
  values (p_order_id, p_provider::text, p_provider_payment_id, p_amount, v_order.currency, 'succeeded', p_raw_response, now())
  on conflict (provider, provider_payment_id) do update set status = 'succeeded';
  update public.orders set status = 'paid' where id = p_order_id and status = 'pending' returning * into v_order;
  if v_order.id is null then select * into v_order from public.orders where id = p_order_id; end if;
  return v_order;
end; $fn$;
grant all on function public.confirm_order_payment(uuid,text,text,numeric,jsonb,text) to public;

create or replace function public.sync_product_available_colors(p_product_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update public.products set available_colors = '{}' where id = p_product_id;
end; $fn$;
grant all on function public.sync_product_available_colors(uuid) to public;

create or replace function public.trg_sync_colors_from_variant() returns trigger language plpgsql security definer set search_path = public as $fn$
begin return new; end; $fn$;
create or replace function public.trg_sync_colors_from_variant_options() returns trigger language plpgsql security definer set search_path = public as $fn$
begin return new; end; $fn$;
grant all on function public.trg_sync_colors_from_variant(), public.trg_sync_colors_from_variant_options() to public;

create table if not exists public.recently_viewed_products (
  id uuid primary key default gen_random_uuid(), user_id uuid, session_token text
);
create table if not exists public.vendor_commissions (
  id uuid primary key default gen_random_uuid(), store_id uuid, amount numeric default 0
);
alter table public.recently_viewed_products enable row level security;
alter table public.vendor_commissions enable row level security;
drop policy if exists recently_viewed_insert_own on public.recently_viewed_products;
create policy recently_viewed_insert_own on public.recently_viewed_products for insert to public with check (true);
drop policy if exists recently_viewed_select_owner_or_admin on public.recently_viewed_products;
create policy recently_viewed_select_owner_or_admin on public.recently_viewed_products for select to public using (public.is_admin());
drop policy if exists vendor_commissions_delete_admin on public.vendor_commissions;
create policy vendor_commissions_delete_admin on public.vendor_commissions for delete to public using (public.is_admin());
drop policy if exists vendor_commissions_insert_admin on public.vendor_commissions;
create policy vendor_commissions_insert_admin on public.vendor_commissions for insert to public with check (public.is_admin());
drop policy if exists vendor_commissions_select_own_or_global_or_admin on public.vendor_commissions;
create policy vendor_commissions_select_own_or_global_or_admin on public.vendor_commissions for select to public using (public.owns_store(store_id) or public.is_admin());
drop policy if exists vendor_commissions_update_admin on public.vendor_commissions;
create policy vendor_commissions_update_admin on public.vendor_commissions for update to public using (public.is_admin());

create or replace function public.verify_vodafone_cash_payment(
  p_order_id uuid, p_approve boolean, p_note text default null
) returns public.payments language plpgsql security definer set search_path = public as $fn$
declare v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into v_payment from public.payments where order_id = p_order_id limit 1;
  return v_payment;
end; $fn$;
grant all on function public.verify_vodafone_cash_payment(uuid,boolean,text) to public;

-- -------------------------------------------------------- payout live shape
create table if not exists public.vendor_earnings (
  id uuid primary key default gen_random_uuid(), store_id uuid not null,
  net_amount numeric not null, status text not null
);
create table if not exists public.vendor_payout_requests (
  id uuid primary key default gen_random_uuid(), store_id uuid not null,
  requested_amount numeric not null, status text not null default 'pending',
  requested_by uuid, reviewed_by uuid, reviewed_at timestamptz,
  rejection_reason text, notes text, created_at timestamptz default now()
);
create table if not exists public.vendor_payouts (
  id uuid primary key default gen_random_uuid(), payout_request_id uuid not null,
  store_id uuid not null, amount numeric not null, status text not null,
  payout_method text, provider_reference text, created_at timestamptz default now(),
  constraint vendor_payouts_payout_method_check check (payout_method is null or payout_method in ('bank_transfer','paypal','wallet','other'))
);
create or replace function public.request_vendor_payout(p_store_id uuid, p_amount numeric)
returns public.vendor_payout_requests language plpgsql security definer set search_path = public as $fn$
declare v_available numeric; v_pending numeric; v_row public.vendor_payout_requests;
begin
  if not public.owns_store(p_store_id) then raise exception 'You do not own this store'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select coalesce(sum(net_amount),0) into v_available from public.vendor_earnings
   where store_id = p_store_id and status = 'available';
  select coalesce(sum(requested_amount),0) into v_pending from public.vendor_payout_requests
   where store_id = p_store_id and status in ('pending','approved');
  if p_amount > (v_available - v_pending) then raise exception 'Requested amount exceeds available balance'; end if;
  insert into public.vendor_payout_requests (store_id, requested_amount, requested_by)
  values (p_store_id, p_amount, auth.uid()) returning * into v_row;
  return v_row;
end; $fn$;
grant execute on function public.request_vendor_payout(uuid,numeric) to authenticated, service_role;

create or replace function public.approve_vendor_payout_request(p_request_id uuid, p_notes text default null)
returns public.vendor_payouts language plpgsql security definer set search_path = public as $fn$
declare v_request public.vendor_payout_requests; v_payout public.vendor_payouts;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_request from public.vendor_payout_requests where id = p_request_id and status = 'pending' for update;
  if v_request.id is null then raise exception 'Payout request not found or not pending'; end if;
  update public.vendor_payout_requests set status='approved', reviewed_by=auth.uid(), reviewed_at=now(), notes=coalesce(p_notes, notes) where id=p_request_id;
  insert into public.vendor_payouts (payout_request_id, store_id, amount, status)
  values (p_request_id, v_request.store_id, v_request.requested_amount, 'approved') returning * into v_payout;
  return v_payout;
end; $fn$;
grant execute on function public.approve_vendor_payout_request(uuid,text) to authenticated, service_role;

-- RLS policies in their pre-fix shape
alter table public.vendor_payout_requests enable row level security;
alter table public.vendor_earnings enable row level security;
drop policy if exists vendor_payout_requests_select_owner_or_admin on public.vendor_payout_requests;
create policy vendor_payout_requests_select_owner_or_admin on public.vendor_payout_requests
  for select to public using (public.owns_store(store_id) or public.is_admin());
drop policy if exists vendor_payout_requests_update_admin on public.vendor_payout_requests;
create policy vendor_payout_requests_update_admin on public.vendor_payout_requests
  for update to public using (public.is_admin());
drop policy if exists vendor_earnings_select_owner_or_admin on public.vendor_earnings;
create policy vendor_earnings_select_owner_or_admin on public.vendor_earnings
  for select to public using (public.owns_store(store_id) or public.is_admin());
drop policy if exists vendor_earnings_update_admin on public.vendor_earnings;
create policy vendor_earnings_update_admin on public.vendor_earnings for update to public using (public.is_admin());

grant select, insert, update on public.vendor_payout_requests, public.vendor_earnings, public.vendor_payouts to authenticated;
grant execute on function public.cancel_order(uuid,text), public.restock_on_order_cancel(), public.confirm_order_payment(uuid,text,text,numeric,jsonb,text), public.sync_product_available_colors(uuid) to authenticated;

-- -------------------------------------------------- ASSERT pre-fix baseline
do $$
begin
  -- Idempotent rerun: after the first application the grant is already gone.
  if (select proacl::text like '%=X/%' from pg_proc where proname='confirm_order_payment') then
    raise notice 'BASELINE: confirm_order_payment is PUBLIC executable (expected on first run)';
  end if;
  if (select pg_get_functiondef(oid) ilike '%stock_quantity = stock_quantity +%'
          from pg_proc where proname='cancel_order') then
    raise notice 'BASELINE: cancel_order still contains the inline restock';
  end if;
end $$;

-- ----------------------------------------------------------- APPLY THE FIXES
\i supabase/migrations/20261117130000_revoke_public_security_definer_execute.sql
\i supabase/migrations/20261117150000_fix_cancel_order_double_restock.sql
\i supabase/migrations/20261117160000_vendor_payout_method.sql
\i supabase/migrations/20261117170000_harden_financial_rls.sql

-- ------------------------------------------------------- POST-FIX ASSERTIONS
do $$
declare v_acl text; v_roles text;
begin
  if has_function_privilege('anon', 'public.verify_vodafone_cash_payment(uuid,boolean,text)', 'EXECUTE') then
    raise exception 'SEC-07 FAILED: anon can call verify_vodafone_cash_payment';
  end if;

  if has_function_privilege('anon', 'public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)', 'EXECUTE') then
    raise exception 'SEC-01 FAILED: anon/authenticated still executable';
  end if;

  if (select pg_get_functiondef(oid) ilike '%stock_quantity = stock_quantity +%'
      from pg_proc where proname='cancel_order') then
    raise exception 'INV-01 FAILED: cancel_order still restocks inline';
  end if;
  if not (select pg_get_functiondef(oid) ilike '%stock_quantity = stock_quantity +%'
      from pg_proc where proname='restock_on_order_cancel') then
    raise exception 'INV-01 FAILED: trigger no longer restocks';
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='vendor_payout_requests' and column_name='payout_method') then
    raise exception 'PAY-01 FAILED: payout_method missing';
  end if;
  if not exists (select 1 from pg_proc where proname='request_vendor_payout' and pronargs=3) then
    raise exception 'PAY-01 FAILED: 3-arg RPC missing';
  end if;

  select roles::text into v_roles from pg_policies
   where schemaname='public' and policyname='vendor_payout_requests_select_owner_or_admin';
  if v_roles = '{public}' then
    raise exception 'SEC-06 FAILED: policy still TO public';
  end if;
end $$;

-- --------------------------------------------------------------- RUNTIME TEST
do $$
declare
  v_variant uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_store uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_req uuid;
  v_after int;
  v_stock_before int := 8;  -- mirrors stock AFTER the order reserved 2 units
begin
  -- inventory: stock 10, order qty 2
  insert into public.profiles (id, role) values (v_customer,'customer'),(v_vendor,'vendor'),(v_admin,'admin');
  insert into public.stores (id, owner_id) values (v_store, v_vendor);
  insert into public.product_variants (id, stock_quantity) values (v_variant, v_stock_before);
  insert into public.orders (id, user_id, status, total) values (v_order, v_customer, 'paid', 25);
  insert into public.order_items (id, order_id, variant_id, quantity, status) values (v_item, v_order, v_variant, 2, 'paid');

  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform public.cancel_order(v_order, 'staging test');
  select stock_quantity into v_after from public.product_variants where id = v_variant;
  if v_after <> 10 then raise exception 'INV-01 RUNTIME FAILED: expected stock 10, got %', v_after; end if;

  begin
    perform public.cancel_order(v_order, 'repeat');
    raise exception 'INV-01 RUNTIME FAILED: repeated cancel should fail';
  exception when others then
    if sqlerrm like 'INV-01%' then raise; end if;
  end;
  select stock_quantity into v_after from public.product_variants where id = v_variant;
  if v_after <> 10 then raise exception 'INV-01 RUNTIME FAILED: repeated cancel changed stock to %', v_after; end if;

  -- payout method persistence + admin decision
  insert into public.vendor_earnings (store_id, net_amount, status) values (v_store, 100, 'available');
  perform set_config('request.jwt.claim.sub', v_vendor::text, true);
  select id into v_req from public.request_vendor_payout(v_store, 25, 'paypal');
  if not exists (select 1 from public.vendor_payout_requests where id = v_req and payout_method = 'paypal') then
    raise exception 'PAY-01 RUNTIME FAILED: method not persisted';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.approve_vendor_payout_request(v_req, 'staging approval');
  if not exists (select 1 from public.vendor_payouts where payout_request_id = v_req and payout_method = 'paypal') then
    raise exception 'PAY-01 RUNTIME FAILED: method not copied to ledger';
  end if;
  begin
    perform public.approve_vendor_payout_request(v_req, 'double');
    raise exception 'PAY-01 RUNTIME FAILED: double approval should fail';
  exception when others then
    if sqlerrm like 'PAY-01%' then raise; end if;
  end;
end $$;

-- Anon permission is asserted in the DO block above and additionally verified
-- from a separate connection with `set role anon` (see the audit log/CLI run).
select has_function_privilege('anon', 'public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)', 'EXECUTE') as anon_can_call_payment;

select 'LOCAL_STAGING_P0_ALL_CHECKS_PASSED' as result;
