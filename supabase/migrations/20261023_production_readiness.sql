-- ============================================================================
-- 20261023_production_readiness.sql
-- Reconciliation migration for Gallaxy Store.
--
-- Additive / data-preserving. No table is dropped. The only dropped objects are
-- broken admin *views* (which hold no data) that were re-created with correct
-- column names and without the auth.uid()-dependent is_admin() filter that made
-- them return zero rows for service-role callers.
--
-- Apply with `supabase db push` or through the authenticated SQL channel.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Orders: shipping method persistence (20261001 was never applied)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipping_method_id uuid
  references public.shipping_methods (id)
  on delete set null;

create index if not exists orders_shipping_method_id_idx
  on public.orders (shipping_method_id);

update public.orders o
   set shipping_method_id = s.shipping_method_id
  from (
        select distinct on (order_id) order_id, shipping_method_id
          from public.shipments
         where shipping_method_id is not null
         order by order_id, created_at desc
       ) s
 where o.id = s.order_id
   and o.shipping_method_id is null;

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
  v_owner uuid;
begin
  select user_id into v_owner from public.orders where id = p_order_id;

  if v_owner is null then
    raise exception 'Order not found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Not your order';
  end if;

  if p_shipping_method_id is not null
     and not exists (
       select 1 from public.shipping_methods
        where id = p_shipping_method_id and is_active and deleted_at is null
     ) then
    raise exception 'Invalid shipping method';
  end if;

  update public.orders
     set shipping_method_id = p_shipping_method_id,
         updated_at = now()
   where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Payment receipts (Vodafone Cash)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'vodafone_cash',
  transfer_reference text not null,
  payer_phone text not null,
  receipt_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  admin_notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_receipts_reference_not_blank
    check (length(btrim(transfer_reference)) > 0)
);

create index if not exists payment_receipts_payment_idx
  on public.payment_receipts (payment_id);
create index if not exists payment_receipts_user_idx
  on public.payment_receipts (user_id);
create unique index if not exists payment_receipts_reference_uidx
  on public.payment_receipts (provider, transfer_reference)
  where status in ('pending', 'approved');

alter table public.payment_receipts enable row level security;

drop policy if exists "Users can view their own receipts" on public.payment_receipts;
create policy "Users can view their own receipts"
  on public.payment_receipts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can view all receipts" on public.payment_receipts;
create policy "Admins can view all receipts"
  on public.payment_receipts
  for select to authenticated
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policies: all writes go through the SECURITY DEFINER
-- functions below, so a customer can never mark a receipt verified.

-- ---------------------------------------------------------------------------
-- 3. Payments: stop the same provider reference from paying two orders
-- ---------------------------------------------------------------------------
create unique index if not exists payments_provider_ref_uidx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Store settings (real, persisted, server-only writes)
-- ---------------------------------------------------------------------------
create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;

drop policy if exists "Public settings are readable" on public.store_settings;
create policy "Public settings are readable"
  on public.store_settings
  for select to anon, authenticated
  using (is_public = true);

-- ---------------------------------------------------------------------------
-- 5. Storage buckets and policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-images',
  'gallery-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_receipts_owner_insert on storage.objects;
create policy payment_receipts_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists payment_receipts_owner_select on storage.objects;
create policy payment_receipts_owner_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists payment_receipts_owner_delete on storage.objects;
create policy payment_receipts_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists gallery_images_public_select on storage.objects;
create policy gallery_images_public_select
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'gallery-images');

drop policy if exists gallery_images_admin_insert on storage.objects;
create policy gallery_images_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery-images' and public.is_admin());

drop policy if exists gallery_images_admin_update on storage.objects;
create policy gallery_images_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery-images' and public.is_admin());

drop policy if exists gallery_images_admin_delete on storage.objects;
create policy gallery_images_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Vodafone Cash submission (customer) and verification (admin)
-- ---------------------------------------------------------------------------
create or replace function public.submit_vodafone_cash_receipt(
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
  if v_reference is null or length(v_reference) < 4 then
    raise exception 'A valid transfer reference is required';
  end if;
  if v_path is null or v_path not like v_uid::text || '/%' then
    raise exception 'Invalid receipt path';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null or v_order.user_id <> v_uid then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  -- The same transfer can never pay two different orders.
  if exists (
    select 1
      from public.payment_receipts pr
      join public.payments p on p.id = pr.payment_id
     where pr.provider = 'vodafone_cash'
       and pr.transfer_reference = v_reference
       and p.order_id <> p_order_id
       and pr.status in ('pending', 'approved')
  ) then
    raise exception 'That transfer reference is already used by another order';
  end if;

  if exists (
    select 1 from public.payments
     where order_id = p_order_id and provider = 'vodafone_cash' and status = 'succeeded'
  ) then
    raise exception 'This order is already paid';
  end if;

  select id into v_payment_id
    from public.payments
   where order_id = p_order_id and provider = 'vodafone_cash'
   order by created_at desc
   limit 1;

  if v_payment_id is null then
    insert into public.payments
      (order_id, provider, amount, currency, status, attempt_number, raw_response)
    values
      (p_order_id, 'vodafone_cash', v_order.total, v_order.currency, 'pending', 1,
       jsonb_build_object(
         'payer_phone', v_phone,
         'receipt_path', v_path,
         'uploaded_at', now()
       ))
    returning id into v_payment_id;
  else
    -- A new attempt supersedes any pending receipt and clears a rejection.
    update public.payment_receipts
       set status = 'superseded', updated_at = now()
     where payment_id = v_payment_id and status = 'pending';

    update public.payments
       set status = 'pending',
           failure_code = null,
           failure_message = null,
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
    (v_payment_id, v_uid, 'vodafone_cash', v_reference, v_phone, v_path, 'pending')
  returning * into v_receipt;

  return v_receipt;
end;
$$;

create or replace function public.verify_vodafone_cash_payment(
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

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  select * into v_payment
    from public.payments
   where order_id = p_order_id and provider = 'vodafone_cash'
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is null then
    raise exception 'No Vodafone Cash payment found for this order';
  end if;

  if v_payment.status = 'succeeded' then
    if p_approve then
      return (select pr from public.payment_receipts pr
               where pr.payment_id = v_payment.id and pr.status = 'approved'
               order by pr.created_at desc limit 1);
    end if;
    raise exception 'Payment is already approved';
  end if;

  select * into v_receipt
    from public.payment_receipts
   where payment_id = v_payment.id and status = 'pending'
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
           captured_at = now(),
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'payer_phone', v_receipt.payer_phone,
             'receipt_path', v_receipt.receipt_url,
             'verified_at', now(),
             'verify_note', p_note,
             'rejected', false
           ),
           updated_at = now()
     where id = v_payment.id;

    update public.orders
       set status = 'paid'
     where id = p_order_id
       and status = 'pending';
  else
    update public.payments
       set status = 'failed',
           failed_at = now(),
           failure_message = coalesce(p_note, 'Receipt rejected by administrator'),
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
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

-- ---------------------------------------------------------------------------
-- 7. Admin dashboard views (no is_admin() filter; service_role only)
-- ---------------------------------------------------------------------------
drop view if exists public.admin_orders_overview;
create view public.admin_orders_overview as
select
  o.id,
  o.order_number,
  o.user_id,
  p.full_name as customer_name,
  o.status,
  o.subtotal,
  o.shipping_fee,
  o.discount_amount,
  o.total,
  o.currency,
  coalesce(o.placed_at, o.created_at) as placed_at,
  (select count(*) from public.order_items oi where oi.order_id = o.id) as items_count,
  (select pm.status::text from public.payments pm
    where pm.order_id = o.id
    order by (pm.status = 'succeeded') desc, pm.created_at desc
    limit 1) as payment_status,
  (select pm.provider::text from public.payments pm
    where pm.order_id = o.id
    order by (pm.status = 'succeeded') desc, pm.created_at desc
    limit 1) as payment_provider
from public.orders o
left join public.profiles p on p.id = o.user_id
where o.deleted_at is null;

drop view if exists public.admin_customers_overview;
create view public.admin_customers_overview as
select
  p.id,
  p.full_name,
  p.role,
  p.created_at as joined_at,
  coalesce(o.order_count, 0) as order_count,
  coalesce(o.total_spent, 0) as total_spent,
  o.last_order_at
from public.profiles p
left join (
  select
    o.user_id,
    count(*) as order_count,
    sum(case when o.status in ('paid','processing','printing','shipped','delivered') then o.total else 0 end) as total_spent,
    max(coalesce(o.placed_at, o.created_at)) as last_order_at
  from public.orders o
  where o.deleted_at is null
  group by o.user_id
) o on o.user_id = p.id
where p.deleted_at is null;

drop view if exists public.admin_product_performance;
create view public.admin_product_performance as
select
  p.id as product_id,
  p.name,
  coalesce(v.sku, '') as sku,
  o.currency,
  coalesce(sum(oi.line_total), 0) as revenue,
  coalesce(sum(oi.quantity), 0) as units_sold,
  count(distinct o.id) as order_count
from public.products p
left join public.product_variants v on v.product_id = p.id and v.is_default and v.deleted_at is null
left join public.order_items oi on oi.variant_id = v.id
left join public.orders o on o.id = oi.order_id
  and o.status in ('paid','processing','printing','shipped','delivered')
  and o.deleted_at is null
where p.deleted_at is null
group by p.id, p.name, v.sku, o.currency;

drop view if exists public.admin_daily_sales;
create view public.admin_daily_sales as
select
  (coalesce(o.placed_at, o.created_at))::date as sale_date,
  o.currency,
  sum(o.total) as gross_revenue,
  count(*) as order_count
from public.orders o
where o.deleted_at is null
  and o.status in ('paid','processing','printing','shipped','delivered')
group by (coalesce(o.placed_at, o.created_at))::date, o.currency;

drop view if exists public.admin_inventory_status;
create view public.admin_inventory_status as
select
  p.id as product_id,
  p.name as product_name,
  v.id as variant_id,
  v.sku,
  v.sku as variant_sku,
  v.stock_quantity,
  v.reserved_quantity,
  coalesce(v.low_stock_threshold, p.low_stock_threshold, 5) as low_stock_threshold,
  (v.stock_quantity - v.reserved_quantity) <= coalesce(v.low_stock_threshold, p.low_stock_threshold, 5) as is_low_stock
from public.product_variants v
join public.products p on p.id = v.product_id
where v.deleted_at is null
  and p.deleted_at is null;

drop view if exists public.admin_reviews_moderation_queue;
create view public.admin_reviews_moderation_queue as
select
  r.id,
  r.product_id,
  p.name as product_name,
  r.user_id,
  pr.full_name as reviewer_name,
  pr.full_name as author_name,
  r.rating,
  r.title,
  r.body,
  r.status,
  r.is_verified_purchase,
  r.moderation_note,
  r.created_at
from public.reviews r
left join public.products p on p.id = r.product_id
left join public.profiles pr on pr.id = r.user_id
where r.deleted_at is null;

revoke all on public.admin_orders_overview from anon, authenticated;
revoke all on public.admin_customers_overview from anon, authenticated;
revoke all on public.admin_product_performance from anon, authenticated;
revoke all on public.admin_daily_sales from anon, authenticated;
revoke all on public.admin_inventory_status from anon, authenticated;
revoke all on public.admin_reviews_moderation_queue from anon, authenticated;

grant select on public.admin_orders_overview to service_role;
grant select on public.admin_customers_overview to service_role;
grant select on public.admin_product_performance to service_role;
grant select on public.admin_daily_sales to service_role;
grant select on public.admin_inventory_status to service_role;
grant select on public.admin_reviews_moderation_queue to service_role;

-- ---------------------------------------------------------------------------
-- 8. Materialized view refresh helpers
-- ---------------------------------------------------------------------------
create or replace function public.refresh_admin_dashboard_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_daily_sales;
  refresh materialized view concurrently public.mv_product_performance;
  refresh materialized view concurrently public.mv_customer_ltv;
  refresh materialized view concurrently public.mv_coupon_performance;
  refresh materialized view concurrently public.mv_trending_products;
exception
  when others then
    -- CONCURRENTLY needs a unique index and cannot run inside some transactions.
    -- Fall back to a blocking refresh so the dashboard never stays stale silently.
    refresh materialized view public.mv_daily_sales;
    refresh materialized view public.mv_product_performance;
    refresh materialized view public.mv_customer_ltv;
    refresh materialized view public.mv_coupon_performance;
    refresh materialized view public.mv_trending_products;
end;
$$;

create or replace function public.refresh_vendor_dashboard_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    refresh materialized view concurrently public.mv_vendor_daily_sales;
    refresh materialized view concurrently public.mv_vendor_inventory_status;
    refresh materialized view concurrently public.mv_vendor_monthly_sales;
    refresh materialized view concurrently public.mv_vendor_print_stats;
    refresh materialized view concurrently public.mv_vendor_top_products;
  exception
    when others then
      refresh materialized view public.mv_vendor_daily_sales;
      refresh materialized view public.mv_vendor_inventory_status;
      refresh materialized view public.mv_vendor_monthly_sales;
      refresh materialized view public.mv_vendor_print_stats;
      refresh materialized view public.mv_vendor_top_products;
  end;
end;
$$;

revoke all on function public.refresh_admin_dashboard_views() from anon, authenticated;
revoke all on function public.refresh_vendor_dashboard_views() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Currency consistency: a cart is single-currency
-- ---------------------------------------------------------------------------
create or replace function public.add_to_cart(
  p_variant_id uuid,
  p_quantity integer,
  p_customization_id uuid default null,
  p_session_token text default null
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cart_id uuid;
  v_price numeric(12,2);
  v_currency text;
  v_item public.cart_items;
  v_existing_id uuid;
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
    insert into public.cart_items(cart_id, variant_id, customization_id, quantity, unit_price_snapshot)
    values (v_cart_id, p_variant_id, p_customization_id, p_quantity, v_price)
    returning * into v_item;
  else
    select id into v_existing_id
      from public.cart_items
     where cart_id = v_cart_id and variant_id = p_variant_id
       and customization_id is null and not is_saved_for_later
     for update;

    if (v_stock - v_reserved) < p_quantity then
      raise exception 'Insufficient stock: only % available', greatest(v_stock - v_reserved, 0);
    end if;

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
$$;

create or replace function public.checkout(
  p_cart_id uuid,
  p_shipping_address jsonb,
  p_billing_address jsonb default null,
  p_gift_wrap boolean default false,
  p_gift_note text default null,
  p_customer_note text default null,
  p_shipping_fee numeric default 0,
  p_session_token text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 10. Trusted payment confirmation (amount + currency + reference ownership)
-- ---------------------------------------------------------------------------
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
  if p_provider not in ('stripe', 'paymob', 'cod', 'wallet') then
    raise exception 'Provider % cannot be confirmed through this function', p_provider;
  end if;
  v_provider := p_provider::public.payment_provider;

  if p_provider_payment_id is null or length(btrim(p_provider_payment_id)) = 0 then
    raise exception 'A provider payment id is required';
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

  insert into public.payments
    (order_id, provider, provider_payment_id, amount, currency, status, raw_response, captured_at)
  values
    (p_order_id, v_provider, p_provider_payment_id, p_amount, v_order.currency, 'succeeded', p_raw_response, now())
  on conflict (provider, provider_payment_id) do update
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

-- ---------------------------------------------------------------------------
-- 11. Function grants
-- ---------------------------------------------------------------------------
grant execute on function public.set_order_shipping_method(uuid, uuid) to authenticated;
revoke execute on function public.set_order_shipping_method(uuid, uuid) from anon;

grant execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text) to authenticated;
revoke execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text) from anon;

grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text) to authenticated;
revoke execute on function public.verify_vodafone_cash_payment(uuid, boolean, text) from anon;

grant execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text) to service_role;
revoke execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Useful indexes
-- ---------------------------------------------------------------------------
create index if not exists orders_user_placed_idx
  on public.orders (user_id, coalesce(placed_at, created_at) desc);
create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists reviews_product_status_idx
  on public.reviews (product_id, status) where deleted_at is null;
create index if not exists products_status_visibility_idx
  on public.products (status, visibility) where deleted_at is null;
