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
