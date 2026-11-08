-- Checkout hardening (review only; do not apply without staging approval).
--
-- Problems in the live `checkout` function:
--   1. It trusts `carts.discount_amount` (set by `apply_coupon` at an earlier
--      time) instead of re-validating and recomputing the coupon at checkout.
--      A coupon can expire or hit its limit between apply and checkout, and a
--      stale cart value can be written into the order.
--   2. It never checks `coupons.starts_at`.
--   3. It only checks that a positive shipping fee equals *some* active
--      `shipping_rates.base_fee`; it does not check that the fee is available
--      for the destination. A direct RPC caller can also pass 0 even when the
--      destination has paid methods.
--
-- This replacement keeps the existing signature and RPC contract. It is
-- intentionally additive for the application: the app already resolves the
-- shipping method and fee server-side before calling checkout.
--
-- Dependencies the checkout body calls at runtime:
--   * get_shipping_options(text, numeric, integer) -> method_id (uuid), fee (numeric)
--   * gift_wrap_fee()                              -> numeric
--   * calculate_tax(numeric, jsonb)                -> numeric
--   * can_access_cart(uuid, text)                  -> boolean
--   * public.coupons with the current column set   -> type/value/max_uses/...
-- The live project has all of them (verified read-only), but no repository
-- migration defines gift_wrap_fee, and the archived 20260913 file defines an
-- older coupons shape (discount_type/usage_limit) that this function cannot
-- use. Fail the migration early with a clear dependency error instead of
-- installing a checkout() that only breaks when a customer places an order.
do $$
begin
  if to_regprocedure('public.get_shipping_options(text, numeric, integer)') is null then
    raise exception 'Dependency missing: public.get_shipping_options(text, numeric, integer)';
  end if;
  if to_regprocedure('public.gift_wrap_fee()') is null then
    raise exception 'Dependency missing: public.gift_wrap_fee()';
  end if;
  if to_regprocedure('public.calculate_tax(numeric, jsonb)') is null then
    raise exception 'Dependency missing: public.calculate_tax(numeric, jsonb)';
  end if;
  if to_regprocedure('public.can_access_cart(uuid, text)') is null then
    raise exception 'Dependency missing: public.can_access_cart(uuid, text)';
  end if;
  if to_regclass('public.coupons') is null then
    raise exception 'Dependency missing: public.coupons';
  end if;
  if (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'coupons'
       and column_name in ('type', 'value', 'max_uses', 'max_uses_per_user', 'starts_at')
  ) <> 5 then
    raise exception 'Dependency missing: public.coupons columns (type, value, max_uses, max_uses_per_user, starts_at)';
  end if;
end $$;

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
  v_coupon_id uuid;
  v_coupon_code text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
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
  v_country text;
begin
  if v_uid is null then
    raise exception 'Must be authenticated to checkout';
  end if;
  if p_shipping_address is null or p_shipping_address = '{}'::jsonb then
    raise exception 'A shipping address is required';
  end if;

  p_shipping_fee := coalesce(p_shipping_fee, 0);
  if p_shipping_fee < 0 then
    raise exception 'Shipping fee cannot be negative';
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
  v_total := greatest(v_subtotal + v_tax + p_shipping_fee + v_gift_wrap_fee - v_discount, 0);

  insert into public.orders (
    user_id, cart_id, status, subtotal, tax, shipping_fee, discount_amount, gift_wrap_fee, total,
    currency, coupon_id, coupon_code, shipping_address_snapshot, billing_address_snapshot,
    gift_wrap, gift_note, customer_note
  ) values (
    v_uid, p_cart_id, 'pending', v_subtotal, v_tax, p_shipping_fee, v_discount, v_gift_wrap_fee, v_total,
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

revoke execute on function public.checkout(uuid, jsonb, jsonb, boolean, text, text, numeric, text)
  from public, anon;
grant execute on function public.checkout(uuid, jsonb, jsonb, boolean, text, text, numeric, text)
  to authenticated, service_role;
