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
