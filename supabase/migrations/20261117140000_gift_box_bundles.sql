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
