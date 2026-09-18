-- Migration: Fix cart stock validation, search normalization, reviews filtering
-- Safe: Uses CREATE OR REPLACE, no destructive changes
-- NOTE: This migration was created BEFORE the live database was updated.
--       The live database has MORE SECURE versions with FOR UPDATE row locking.
--       This file now reflects the ACTUAL live database state as of 2026-09-10.
--       Do NOT re-apply — the functions are already correct in production.

-- ============================================================
-- Fix 1: add_to_cart — row-locked stock validation with upsert
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_to_cart(
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
  v_item public.cart_items;
  v_existing_id uuid;
  v_stock int;
  v_reserved int;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  v_cart_id := public.get_or_create_cart(p_session_token);

  select price, stock_quantity, reserved_quantity
  into v_price, v_stock, v_reserved
  from public.product_variants
  where id = p_variant_id and is_active and deleted_at is null
  for update;

  if v_price is null then
    raise exception 'Variant not found or inactive';
  end if;

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
    where cart_id = v_cart_id
      and variant_id = p_variant_id
      and customization_id is null
      and not is_saved_for_later
    for update;

    if (v_stock - v_reserved) < p_quantity then
      raise exception 'Insufficient stock: only % available', greatest(v_stock - v_reserved, 0);
    end if;

    if v_existing_id is not null then
      update public.cart_items
      set quantity = quantity + p_quantity, unit_price_snapshot = v_price
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

-- ============================================================
-- Fix 2: update_cart_item_quantity — delete on qty=0 + stock check
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_cart_item_quantity(
  p_cart_item_id uuid,
  p_quantity integer,
  p_session_token text DEFAULT NULL::text
)
RETURNS cart_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
  v_item public.cart_items;
  v_stock int;
  v_reserved int;
  v_old_qty int;
  v_saved boolean;
  v_delta int;
begin
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  select cart_id, quantity, is_saved_for_later
  into v_cart_id, v_old_qty, v_saved
  from public.cart_items
  where id = p_cart_item_id;

  if v_cart_id is null or not public.can_access_cart(v_cart_id, p_session_token) then
    raise exception 'Cart item not found or access denied';
  end if;

  if p_quantity = 0 then
    delete from public.cart_items where id = p_cart_item_id;
    return null;
  end if;

  if not v_saved then
    select pv.stock_quantity, pv.reserved_quantity
    into v_stock, v_reserved
    from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id
    where ci.id = p_cart_item_id
    for update of pv;

    v_delta := p_quantity - v_old_qty;
    if v_delta > 0 and (v_stock - v_reserved) < v_delta then
      raise exception 'Insufficient stock: only % more available', greatest(v_stock - v_reserved, 0);
    end if;
  end if;

  update public.cart_items set quantity = p_quantity where id = p_cart_item_id returning * into v_item;
  return v_item;
end;
$function$;

-- ============================================================
-- Fix 3: merge_guest_cart — pre-validates stock with FOR UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_guest_cart(
  p_session_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guest_cart_id uuid;
  v_user_cart_id uuid;
  v_guest_items public.cart_items[];
  v_row public.cart_items;
  v_existing_id uuid;
  v_stock int;
  v_reserved int;
begin
  if v_uid is null then
    raise exception 'Must be authenticated to merge a guest cart';
  end if;

  select id into v_guest_cart_id
  from public.carts
  where session_token = p_session_token and status = 'active';

  if v_guest_cart_id is null then
    return public.get_or_create_cart();
  end if;

  v_user_cart_id := public.get_or_create_cart();

  select array_agg(ci order by ci.id) into v_guest_items
  from public.cart_items ci
  where ci.cart_id = v_guest_cart_id;

  if v_guest_items is not null then
    foreach v_row in array v_guest_items loop
      if not v_row.is_saved_for_later then
        select stock_quantity, reserved_quantity
        into v_stock, v_reserved
        from public.product_variants
        where id = v_row.variant_id
        for update;

        if v_stock is null then
          raise exception 'Variant not found';
        end if;
        if v_reserved > v_stock then
          raise exception 'Insufficient stock for variant %', v_row.variant_id;
        end if;
      end if;
    end loop;
  end if;

  delete from public.cart_items where cart_id = v_guest_cart_id;
  update public.carts set status = 'merged', merged_into_cart_id = v_user_cart_id where id = v_guest_cart_id;

  if v_guest_items is not null then
    foreach v_row in array v_guest_items loop
      if v_row.customization_id is not null then
        insert into public.cart_items(cart_id, variant_id, customization_id, quantity, unit_price_snapshot, is_saved_for_later)
        values (v_user_cart_id, v_row.variant_id, v_row.customization_id, v_row.quantity, v_row.unit_price_snapshot, v_row.is_saved_for_later);
      else
        select id into v_existing_id
        from public.cart_items
        where cart_id = v_user_cart_id
          and variant_id = v_row.variant_id
          and customization_id is null
          and is_saved_for_later = v_row.is_saved_for_later;

        if v_existing_id is not null then
          update public.cart_items set quantity = quantity + v_row.quantity where id = v_existing_id;
        else
          insert into public.cart_items(cart_id, variant_id, quantity, unit_price_snapshot, is_saved_for_later)
          values (v_user_cart_id, v_row.variant_id, v_row.quantity, v_row.unit_price_snapshot, v_row.is_saved_for_later);
        end if;
      end if;
    end loop;
  end if;

  update public.carts uc
  set coupon_id = gc.coupon_id, coupon_code = gc.coupon_code, discount_amount = gc.discount_amount
  from public.carts gc
  where uc.id = v_user_cart_id
    and gc.id = v_guest_cart_id
    and uc.coupon_id is null
    and gc.coupon_id is not null;

  return v_user_cart_id;
end;
$function$;

-- ============================================================
-- Fix 4: log_search — skip empty queries
-- normalized_query is a GENERATED COLUMN (lower(btrim(query))),
-- so we do NOT insert it explicitly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_search(
  p_query text,
  p_result_count integer DEFAULT 0,
  p_session_token text DEFAULT NULL::text,
  p_clicked_product_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  insert into public.search_logs(user_id, session_token, query, result_count, clicked_product_id)
  values (auth.uid(), p_session_token, p_query, p_result_count, p_clicked_product_id);
end;
$function$;

-- ============================================================
-- Fix 5: reviews_detailed — filter approved only, LEFT JOIN profiles
-- ============================================================
CREATE OR REPLACE VIEW public.reviews_detailed AS
SELECT r.id,
    r.product_id,
    r.order_item_id,
    r.user_id,
    r.rating,
    r.title,
    r.body,
    r.is_verified_purchase,
    r.status,
    r.helpful_count,
    r.not_helpful_count,
    r.report_count,
    r.moderated_by,
    r.moderated_at,
    r.moderation_note,
    r.created_at,
    r.updated_at,
    r.deleted_at,
    p.full_name AS reviewer_name,
    p.avatar_url AS reviewer_avatar_url,
    (SELECT count(*) AS count FROM review_media rm WHERE rm.review_id = r.id) AS media_count,
    (SELECT count(*) AS count FROM review_replies rr WHERE rr.review_id = r.id AND rr.status = 'visible'::text AND rr.deleted_at IS NULL) AS reply_count
FROM reviews r
  LEFT JOIN profiles p ON p.id = r.user_id
WHERE r.status = 'approved'::review_status AND r.deleted_at IS NULL;
