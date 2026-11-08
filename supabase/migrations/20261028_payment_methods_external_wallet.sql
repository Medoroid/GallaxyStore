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
