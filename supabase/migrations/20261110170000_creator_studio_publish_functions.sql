-- Creator Design Studio — publishing + admin review functions (phase 7 of 10).
--
-- Two SERVICE-ROLE-ONLY RPCs (plan D11): supabase-js cannot span a transaction
-- across calls, so every multi-statement operation lives here in ONE
-- transaction:
--
--   creator_publish_product(uuid, jsonb)
--     First publish of a configured product row: creates the store product as
--     status='draft' / visibility='hidden' / store_id=null (plan D9 — never
--     publicly purchasable before admin approval), its single default variant
--     (stock = 0 while fulfillment is 'unconfigured', else `stock_buffer` —
--     plan D8), and its images derived from the row's generated mockups; then
--     links product_id and moves the row to pending_review. A re-submission
--     after rejection UPDATES that same product (never a second one — plan
--     §5.6 duplicate guard: the create branch is guarded by `product_id is
--     null` and every other path updates).
--
--   admin_review_creator_submission(text, uuid, text, text, uuid, text)
--     One transaction for the decision: submission row + product flip + stock
--     + admin_audit_log. Creators can never execute either function (REVOKE
--     below) and the admin API route sits behind verifyAdmin — no
--     self-approval path exists.
--
-- Additive and idempotent (create or replace / if not exists). Depends on
-- 20261110120000_creator_studio_core.sql (the four studio tables) and on the
-- baseline products / product_variants / product_images / admin_audit_log
-- schema. The API route surfaces a missing function as an honest 503.

-- ---------------------------------------------------------------------------
-- 0) Preflight — fail loudly and immediately if the schema is not ready
--    (same pattern as the core migration).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.creator_profiles') is null then
    raise exception 'Dependency missing: public.creator_profiles';
  end if;
  if to_regclass('public.creator_product_templates') is null then
    raise exception 'Dependency missing: public.creator_product_templates';
  end if;
  if to_regclass('public.creator_design_products') is null then
    raise exception 'Dependency missing: public.creator_design_products';
  end if;
  if to_regclass('public.creator_gallery_items') is null then
    raise exception 'Dependency missing: public.creator_gallery_items';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regclass('public.product_variants') is null then
    raise exception 'Dependency missing: public.product_variants';
  end if;
  if to_regclass('public.product_images') is null then
    raise exception 'Dependency missing: public.product_images';
  end if;
  if to_regclass('public.categories') is null then
    raise exception 'Dependency missing: public.categories';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Dependency missing: public.profiles';
  end if;
  if to_regclass('public.admin_audit_log') is null then
    raise exception 'Dependency missing: public.admin_audit_log';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) One gallery submission per design per owner. The API route does a
--    read-before-insert for the friendly idempotent path; this index is the
--    race backstop so two concurrent submits can never create duplicates.
-- ---------------------------------------------------------------------------
create unique index if not exists creator_gallery_items_design_owner_uq
  on public.creator_gallery_items (design_id, owner_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) creator_publish_product — publish one configured product row.
--    Raised errors are namespaced `publish:<code>`; the API route maps them
--    to house error codes (see app/api/designs/[id]/publish/route.js).
-- ---------------------------------------------------------------------------
create or replace function public.creator_publish_product(
  p_design_product_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row        public.creator_design_products%rowtype;
  v_profile    public.creator_profiles%rowtype;
  v_product_id uuid;
  v_name       text;
  v_base       text;
  v_slug       text;
  v_slug_seq   integer := 1;
  v_price      numeric;
  v_compare    numeric := null;
  v_currency   text;
  v_desc       text;
  v_short      text;
  v_category   uuid := null;
  v_images     text[] := '{}';
  v_stock      integer;
begin
  -- Lock the submission row: concurrent publishes serialize here, so a double
  -- submit can never create two store products (the loser sees pending_review
  -- after the winner's transaction commits).
  select * into v_row
    from public.creator_design_products
   where id = p_design_product_id
     and deleted_at is null
     for update;

  if not found then
    raise exception 'publish:design_product_not_found';
  end if;

  if v_row.status = 'pending_review' then
    raise exception 'publish:already_submitted';
  elsif v_row.status not in ('draft', 'rejected') then
    -- approved / archived are not publishable states.
    raise exception 'publish:invalid_status';
  end if;

  -- Publishing permission is admin-managed (plan: creators never self-grant).
  select * into v_profile
    from public.creator_profiles
   where id = v_row.creator_profile_id;

  if not found or not v_profile.can_publish then
    raise exception 'publish:publish_disabled';
  end if;

  -- Payload: already validated by the pure API-route module; re-checked here
  -- because this function is the transactional authority (service-role-only).
  v_name := nullif(trim(coalesce(p_payload ->> 'name', '')), '');
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'publish:invalid_name';
  end if;

  begin
    v_price := (p_payload ->> 'base_price')::numeric;
  exception when others then
    raise exception 'publish:invalid_price';
  end;
  if v_price is null or v_price < 0 or v_price > 99999999 then
    raise exception 'publish:invalid_price';
  end if;

  if p_payload ? 'compare_at_price' and p_payload ->> 'compare_at_price' is not null then
    begin
      v_compare := (p_payload ->> 'compare_at_price')::numeric;
    exception when others then
      raise exception 'publish:invalid_price';
    end;
    -- Same rule as the admin path (parseProductPayload): only a compare-at
    -- ABOVE the base price is meaningful; anything else is dropped.
    if v_compare is not null and (v_compare <= v_price or v_compare > 99999999) then
      v_compare := null;
    end if;
  end if;

  v_currency := upper(coalesce(
    nullif(trim(coalesce(p_payload ->> 'currency', '')), ''),
    'EGP'
  ));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'publish:invalid_currency';
  end if;

  v_desc := nullif(trim(coalesce(p_payload ->> 'description', '')), '');
  if v_desc is not null and char_length(v_desc) > 5000 then
    raise exception 'publish:invalid_description';
  end if;

  v_short := nullif(trim(coalesce(p_payload ->> 'short_description', '')), '');
  if v_short is not null and char_length(v_short) > 1000 then
    raise exception 'publish:invalid_description';
  end if;

  if p_payload ->> 'category_id' is not null then
    begin
      v_category := (p_payload ->> 'category_id')::uuid;
    exception when others then
      raise exception 'publish:invalid_category';
    end;
    if not exists (
      select 1
        from public.categories c
       where c.id = v_category
         and c.is_active
         and c.deleted_at is null
    ) then
      raise exception 'publish:invalid_category';
    end if;
  end if;

  -- Images are server-built public design-previews URLs of this row's
  -- mockups (cap 12 = MAX_PRODUCT_IMAGES). A store listing never ships
  -- without a real preview — the route enforces this before calling in.
  if jsonb_typeof(coalesce(p_payload -> 'images', 'null'::jsonb)) = 'array' then
    select coalesce(array_agg(s.value order by s.ord), '{}'::text[])
      into v_images
      from (
        select t.value, t.ord
          from jsonb_array_elements_text(p_payload -> 'images') with ordinality as t(value, ord)
         where t.ord <= 12
           and length(t.value) <= 2048
      ) s;
  end if;

  if coalesce(array_length(v_images, 1), 0) = 0 then
    raise exception 'publish:no_mockups';
  end if;

  -- Plan D8: unconfigured fulfillment must stay at zero stock so the existing
  -- checkout gate fails honestly instead of claiming manufacturability.
  v_stock := case
    when v_row.fulfillment_mode = 'configured'
      then greatest(coalesce(v_row.stock_buffer, 0), 0)
    else 0
  end;

  if v_row.product_id is null then
    -- First submission: create the store product as an invisible draft (D9).
    v_base := trim(both '-' from regexp_replace(lower(trim(v_name)), '[^a-z0-9]+', '-', 'g'));
    if coalesce(v_base, '') = '' then
      v_base := 'product';
    end if;

    v_slug := v_base;
    while exists (select 1 from public.products p where p.slug = v_slug) loop
      v_slug_seq := v_slug_seq + 1;
      if v_slug_seq > 1000 then
        v_slug := v_base || '-' || floor(random() * 1000000000)::text;
        exit;
      end if;
      v_slug := v_base || '-' || v_slug_seq::text;
    end loop;

    insert into public.products (
      name, slug, short_description, description, category_id, brand_id, store_id,
      status, visibility, is_featured, base_price, compare_at_price, currency,
      color, available_colors, published_at, created_at, updated_at
    ) values (
      v_name, v_slug, v_short, v_desc, v_category, null, null,
      'draft', 'hidden', false, v_price, v_compare, v_currency,
      null, '{}'::text[], null, now(), now()
    )
    returning id into v_product_id;

    insert into public.product_variants (
      product_id, sku, price, compare_at_price, stock_quantity,
      is_active, is_default, created_at, updated_at
    ) values (
      v_product_id,
      upper(left(v_slug || '-' || replace(v_product_id::text, '-', ''), 120)),
      v_price, v_compare, v_stock,
      true, true, now(), now()
    );
  else
    -- Re-submission after rejection: reuse the SAME listing (plan §5.6 —
    -- never a second product for one configuration row) and keep it hidden
    -- until the admin approves it again.
    v_product_id := null;
    update public.products
       set name = v_name,
           short_description = v_short,
           description = v_desc,
           category_id = v_category,
           base_price = v_price,
           compare_at_price = v_compare,
           currency = v_currency,
           status = 'draft',
           visibility = 'hidden',
           published_at = null,
           updated_at = now()
     where id = v_row.product_id
       and deleted_at is null
     returning id into v_product_id;

    if v_product_id is null then
      raise exception 'publish:invalid_status';
    end if;

    update public.product_variants
       set price = v_price,
           compare_at_price = v_compare,
           stock_quantity = v_stock,
           is_active = true,
           updated_at = now()
     where product_id = v_product_id
       and is_default
       and deleted_at is null;
  end if;

  -- Product images: replace with the row's current mockups (the first one is
  -- the primary image, mirroring replaceProductImages in lib/product-admin).
  delete from public.product_images
   where product_id = v_product_id;

  insert into public.product_images (product_id, storage_path, alt_text, is_primary, sort_order)
  select v_product_id, u.image, null, u.ord = 1, u.ord - 1
    from unnest(v_images) with ordinality as u(image, ord);

  -- Link + submit: one transaction, one authoritative state change.
  update public.creator_design_products
     set product_id = v_product_id,
         status = 'pending_review',
         rejection_reason = null,
         submitted_at = now(),
         updated_at = now()
   where id = v_row.id;

  return v_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) admin_review_creator_submission — approve/reject one pending submission.
--    Raised errors are namespaced `review:<code>` (mapped by the admin route
--    in a later phase). The actor parameters feed admin_audit_log without a
--    dependency on auth.users; they default to null so the function is also
--    callable from SQL tooling.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_creator_submission(
  p_target text,
  p_id uuid,
  p_decision text,
  p_reason text,
  p_actor_id uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target   text := lower(coalesce(p_target, ''));
  v_decision text := lower(coalesce(p_decision, ''));
  v_reason   text := nullif(trim(coalesce(p_reason, '')), '');
  v_reviewer uuid := null;
  v_crow     public.creator_design_products%rowtype;
  v_grow     public.creator_gallery_items%rowtype;
  v_product_id uuid;
begin
  if v_target not in ('product', 'gallery') then
    raise exception 'review:invalid_target';
  end if;
  if v_decision not in ('approve', 'reject') then
    raise exception 'review:invalid_decision';
  end if;
  if v_decision = 'reject' and v_reason is null then
    raise exception 'review:reason_required';
  end if;

  -- reviewed_by must reference public.profiles; only record an actor that
  -- actually has one (audit still keeps actor_id + actor_email verbatim).
  if p_actor_id is not null and exists (
    select 1 from public.profiles where id = p_actor_id
  ) then
    v_reviewer := p_actor_id;
  end if;

  if v_target = 'product' then
    select * into v_crow
      from public.creator_design_products
     where id = p_id
       and deleted_at is null
       for update;

    if not found then
      raise exception 'review:not_found';
    end if;
    if v_crow.status <> 'pending_review' then
      raise exception 'review:invalid_status';
    end if;

    if v_decision = 'approve' then
      if v_crow.product_id is null then
        raise exception 'review:product_missing';
      end if;

      select id into v_product_id
        from public.products
       where id = v_crow.product_id
         and deleted_at is null;

      if v_product_id is null then
        raise exception 'review:product_missing';
      end if;

      update public.creator_design_products
         set status = 'approved',
             rejection_reason = null,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_crow.id;

      update public.products
         set status = 'published',
             visibility = 'visible',
             published_at = now(),
             updated_at = now()
       where id = v_product_id;

      -- Plan D8 at approval time: stock follows the fulfillment boundary.
      update public.product_variants
         set stock_quantity = case
               when v_crow.fulfillment_mode = 'configured'
                 then greatest(coalesce(v_crow.stock_buffer, 0), 0)
               else 0
             end,
             is_active = true,
             updated_at = now()
       where product_id = v_product_id
         and is_default
         and deleted_at is null;
    else
      update public.creator_design_products
         set status = 'rejected',
             rejection_reason = v_reason,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_crow.id;

      -- A rejection can never leave a publicly visible listing behind.
      update public.products
         set status = 'draft',
             visibility = 'hidden',
             updated_at = now()
       where id = v_crow.product_id
         and (status <> 'draft' or visibility <> 'hidden');
    end if;
  else
    select * into v_grow
      from public.creator_gallery_items
     where id = p_id
       and deleted_at is null
       for update;

    if not found then
      raise exception 'review:not_found';
    end if;
    if v_grow.status <> 'pending_review' then
      raise exception 'review:invalid_status';
    end if;

    if v_decision = 'approve' then
      update public.creator_gallery_items
         set status = 'approved',
             rejection_reason = null,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             published_at = now(),
             updated_at = now()
       where id = v_grow.id;
    else
      update public.creator_gallery_items
         set status = 'rejected',
             rejection_reason = v_reason,
             reviewed_by = v_reviewer,
             reviewed_at = now(),
             updated_at = now()
       where id = v_grow.id;
    end if;
  end if;

  insert into public.admin_audit_log (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    p_actor_email,
    'creator_submission_' || case v_decision when 'approve' then 'approved' else 'rejected' end,
    case when v_target = 'product'
         then 'creator_design_product'
         else 'creator_gallery_item'
    end,
    p_id,
    jsonb_build_object(
      'target', v_target,
      'decision', v_decision,
      'reason', v_reason,
      'product_id', case when v_target = 'product' then v_crow.product_id else null end
    )
  );

  return jsonb_build_object(
    'target', v_target,
    'id', p_id,
    'decision', v_decision,
    'status', case v_decision when 'approve' then 'approved' else 'rejected' end,
    'product_id', case when v_target = 'product' then v_crow.product_id else null end,
    'published', v_decision = 'approve'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Grants — service-role only. anon/authenticated (creators included) can
--    never execute these over PostgREST, so there is no self-approval path
--    even if a route bug skipped its own checks.
-- ---------------------------------------------------------------------------
revoke execute on function public.creator_publish_product(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.creator_publish_product(uuid, jsonb)
  to service_role;

revoke execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_review_creator_submission(text, uuid, text, text, uuid, text)
  to service_role;
