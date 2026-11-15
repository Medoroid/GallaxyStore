-- Product sizes + stop the variant colour sync from wiping manual colours.
--
-- Two production bugs fixed here:
--
-- 1. SIZES DID NOT EXIST ANYWHERE.
--    products had no size column, the admin/vendor product forms had no size
--    field, and the storefront fell back to hard-coded ["One Size"] (or ring
--    sizes guessed from the product name). `available_sizes` mirrors the
--    existing `available_colors` text[] so a single product row carries the
--    options the admin actually entered.
--
-- 2. COLOURS WERE SILENTLY WIPED ON EVERY SAVE.
--    `trg_product_variants_sync_colors` (AFTER INSERT OR UPDATE OF is_active,
--    deleted_at, is_default on product_variants) calls
--    sync_product_available_colors(), which rewrote products.available_colors
--    and products.color from the variant attribute options. The default variant
--    created by the admin/vendor product APIs has no colour options, so the
--    function wrote `available_colors = '{}'` and `color = NULL` right after
--    the colours had been saved. The guard below keeps manually entered
--    colours when there is nothing to sync from.
--
-- Idempotent: safe to run more than once.

alter table public.products
  add column if not exists available_sizes text[] not null default '{}';

-- Backfill sizes from variant attribute options that already exist, so the
-- seeded catalogue starts with real sizes instead of heuristics.
update public.products p
set available_sizes = s.sizes
from (
  select
    pv.product_id,
    array_agg(distinct pav.value order by pav.value) as sizes
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  join public.product_attributes pa
    on pa.id = pav.attribute_id
   and pa.slug = 'size'
  where pv.deleted_at is null
    and pv.is_active
  group by pv.product_id
) s
where p.id = s.product_id
  and (p.available_sizes is null or cardinality(p.available_sizes) = 0);

create or replace function public.sync_product_available_colors(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_colors text[];
  v_default_color text;
begin
  select array_agg(distinct pav.value order by pav.value)
  into v_colors
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  where pv.product_id = p_product_id
    and pv.deleted_at is null
    and pv.is_active
    and pav.attribute_id = (select id from public.product_attributes where slug = 'color');

  -- Nothing to sync from (the normal case for products created in the admin
  -- form): keep the colours that were entered on the product row.
  if v_colors is null or cardinality(v_colors) = 0 then
    return;
  end if;

  select pav.value
  into v_default_color
  from public.product_variants pv
  join public.product_variant_options pvo on pvo.variant_id = pv.id
  join public.product_attribute_values pav on pav.id = pvo.attribute_value_id
  where pv.product_id = p_product_id
    and pv.deleted_at is null
    and pv.is_active
    and pav.attribute_id = (select id from public.product_attributes where slug = 'color')
  order by pv.is_default desc, pv.created_at asc
  limit 1;

  update public.products
  set available_colors = v_colors,
      color = coalesce(v_default_color, color)
  where id = p_product_id;
end;
$function$;
