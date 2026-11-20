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
