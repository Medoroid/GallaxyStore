-- =============================================================================
-- 05 — checkout(): weight-aware shipping fee validation (B6)
-- =============================================================================
-- STATUS: PREPARED LOCALLY — REQUIRES EXPLICIT OWNER APPROVAL BEFORE APPLYING
-- TO PRODUCTION. This file only rewrites the `public.checkout` function; it
-- contains no INSERT/UPDATE/DELETE of business data.
--
-- WHY
--   The live checkout() validates `p_shipping_fee` against
--   `shipping_rates.base_fee` ONLY. The quote surfaces compute
--   `fee = base_fee + per_kg_fee * (weight/1000.0)` via get_shipping_options(),
--   so as soon as a package has a non-zero weight the quoted fee would be
--   rejected with 'Invalid shipping fee'. This migration makes the RPC accept
--   exactly what get_shipping_options() returns for the same destination,
--   subtotal and package weight — the same rule the API routes use.
--
-- APPLY SEQUENCE (see docs/STORE-SETTINGS-CHECKLIST.md §6):
--   1. Apply this migration (after backing up the current function definition).
--   2. Only then set SHIPPING_CALCULATE_WEIGHT=true in the deployment env.
--   3. If the flag is enabled first, any cart with a known weight fails
--      checkout with 'Invalid shipping fee' — do NOT enable early.
--
-- KEEP IN SYNC WITH (the three surfaces quote with the same rules):
--   - lib/shippingCountry.ts  — country name -> ISO code map (mirrored below
--                               in the v_country CASE block; a mismatch makes
--                               the RPC validate against a different zone's
--                               fees than the routes quoted).
--   - lib/shippingWeight.ts   — weight rule (variant.weight_grams ??
--                               product.weight_grams ?? 0) * quantity, capped
--                               at MAX_ORDER_WEIGHT_GRAMS = 200000, negatives
--                               treated as 0.
--
-- BEHAVIOURAL CHANGES (only these; everything else in the body is unchanged):
--   1. v_country + v_weight_grams declarations added.
--   2. Destination normalisation added (mirrors normaliseCountryCode()).
--   3. The early base_fee-only fee validation REMOVED from the top of the
--      function (it ran before the cart was read, so weight was unknowable).
--   4. Weight accumulated inside the existing cart item loop.
--   5. Fee validation moved to AFTER the loop and now checks the fee against
--      get_shipping_options(v_country, v_subtotal, v_weight_grams).
--      (Security is preserved: the fee must still equal a configured option
--      fee for this destination — a tampered fee is still rejected.)
-- =============================================================================

-- STEP 0 — BACKUP (run before applying; store the output for DR):
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'checkout';

-- STEP 1 — PREVIEW (read-only): see the fees this function will accept for
-- the checkout form's destinations. With the flag off (weight 0) these equal
-- the zone base_fees; with a weight they include the per-kg component.
--   select * from public.get_shipping_options('EG', 40, 0);     -- Egypt, under free threshold
--   select * from public.get_shipping_options('EG', 100, 1500); -- Egypt, 1.5 kg, over threshold
--   select * from public.get_shipping_options('SA', 40, 0);     -- unknown zone -> default zone

-- STEP 2 — APPLY:
CREATE OR REPLACE FUNCTION public.checkout(
  p_cart_id uuid,
  p_shipping_address jsonb,
  p_billing_address jsonb DEFAULT NULL::jsonb,
  p_gift_wrap boolean DEFAULT false,
  p_gift_note text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_shipping_fee numeric DEFAULT 0,
  p_session_token text DEFAULT NULL::text
)
RETURNS public.orders
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
  -- B6 — package weight (grams) and normalised destination zone code.
  v_weight_grams integer := 0;
  v_country text;
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

  -- B6/B4 — normalise the destination to the ISO code shipping_zones uses.
  -- MUST stay in sync with lib/shippingCountry.ts (name map FIRST, then
  -- 2-letter uppercase, else unchanged): the API routes quote with that map,
  -- so a divergence here would validate against a different zone's fees than
  -- the customer was shown. Empty country mirrors the /api/orders fallback
  -- ("EG" = the checkout form default).
  v_country := trim(coalesce(p_shipping_address->>'country', ''));
  if v_country = '' then
    v_country := 'EG';
  else
    v_country := coalesce(
      case lower(v_country)
        when 'egypt' then 'EG'
        when 'saudi arabia' then 'SA'
        when 'uae' then 'AE'
        when 'united arab emirates' then 'AE'
        when 'kuwait' then 'KW'
        when 'qatar' then 'QA'
        when 'bahrain' then 'BH'
        when 'oman' then 'OM'
        when 'jordan' then 'JO'
        when 'united states' then 'US'
        when 'united states of america' then 'US'
        when 'usa' then 'US'
        when 'canada' then 'CA'
        when 'united kingdom' then 'GB'
        when 'uk' then 'GB'
        when 'great britain' then 'GB'
      end,
      case when v_country ~ '^[A-Za-z]{2}$' then upper(v_country) else v_country end
    );
  end if;

  -- NOTE (B6): the old base_fee-only fee validation that used to live here
  -- was removed on purpose — it could not know the package weight before the
  -- cart was read. The weight-aware equivalent runs after the item loop below.

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

    -- B6 — package weight, SAME rule as lib/shippingWeight.ts:
    -- (variant.weight_grams ?? product.weight_grams ?? 0) * quantity.
    -- NULL counts as 0; negatives are clamped to 0; coalesce() short-circuits
    -- so the product lookup only runs when the variant has no weight.
    v_weight_grams := v_weight_grams + (
      greatest(coalesce(
        v_variant.weight_grams,
        (select p.weight_grams from public.products p where p.id = v_variant.product_id),
        0
      ), 0) * v_item.quantity
    );

    if v_item.is_gift_wrapped then
      v_gift_wrap_fee := v_gift_wrap_fee + public.gift_wrap_fee();
    end if;
  end loop;

  if not v_has_active_items then
    raise exception 'Cart is empty';
  end if;

  -- B6 — cap at MAX_ORDER_WEIGHT_GRAMS (lib/shippingWeight.ts) so a tampered
  -- cart cannot inflate the per-kg component without bound.
  v_weight_grams := least(greatest(v_weight_grams, 0), 200000);

  -- B6 — validate the fee against the destination's live options computed
  -- with the real package weight. This replaces the old base_fee-only check;
  -- a fee that does not match any configured option for this destination,
  -- subtotal and weight is still rejected ('Invalid shipping fee'), so a
  -- tampered or stale quote cannot be charged. With weight 0 the options are
  -- exactly the zone base_fees (or 0 for free shipping), i.e. the same values
  -- the pre-migration function accepted.
  if p_shipping_fee > 0 and not exists (
    select 1
    from public.get_shipping_options(v_country, v_subtotal, v_weight_grams) opt
    where round(opt.fee, 2) = round(p_shipping_fee, 2)
  ) then
    raise exception 'Invalid shipping fee';
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
$function$;

-- STEP 3 — VERIFY:
--   a) Confirm the definition changed and the new validation is present:
--        select pg_get_functiondef(p.oid)
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public' and p.proname = 'checkout';
--      Expect: v_weight_grams declaration, the v_country CASE block, weight
--      accumulation in the item loop, and the get_shipping_options()-based fee
--      validation — and NO validation against shipping_rates.base_fee.
--   b) Confirm quotes still work with the flag OFF (weight 0): place a test
--      order and check orders.shipping_fee equals the quoted option fee.
--   c) Only after (a)+(b) pass, set SHIPPING_CALCULATE_WEIGHT=true, then place
--      a test order containing a product with weight_grams set and confirm the
--      per-kg component is charged and checkout succeeds.
--   d) Confirm a tampered fee is still rejected: temporarily POST /api/orders
--      with a shipping_method_id whose fee does not match (or edit the fee in
--      the request) and expect HTTP 400 / 'Invalid shipping fee'.
-- =============================================================================
