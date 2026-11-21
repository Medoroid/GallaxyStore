-- Storefront facets: list every active category/brand, not only those that
-- already have published products. Newly created empty categories must be
-- visible in the filter sidebar immediately.
--
-- Counts still reflect only published + visible products (and the active text
-- search / selected category), so the numbers remain honest. When a search
-- query is present, empty categories are hidden again to avoid noise.

create or replace function public.get_search_facets(
  p_query text default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tsquery tsquery;
  v_categories jsonb;
  v_brands jsonb;
begin
  if p_query is not null and btrim(p_query) <> '' then
    v_tsquery := websearch_to_tsquery('english', p_query);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('category_id', c.id, 'name', c.name, 'count', coalesce(x.cnt, 0))
      order by c.sort_order asc nulls last, c.name asc
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c
  left join (
    select p.category_id, count(*) as cnt
    from public.products p
    where p.status = 'published'
      and p.visibility = 'visible'
      and p.deleted_at is null
      and (v_tsquery is null or p.search_vector @@ v_tsquery)
      and p.category_id is not null
    group by p.category_id
  ) x on x.category_id = c.id
  where c.is_active
    and c.deleted_at is null
    and (v_tsquery is null or coalesce(x.cnt, 0) > 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object('brand_id', b.id, 'name', b.name, 'count', coalesce(x.cnt, 0))
      order by b.name asc
    ),
    '[]'::jsonb
  )
  into v_brands
  from public.brands b
  left join (
    select p.brand_id, count(*) as cnt
    from public.products p
    where p.status = 'published'
      and p.visibility = 'visible'
      and p.deleted_at is null
      and (v_tsquery is null or p.search_vector @@ v_tsquery)
      and (p_category_id is null or p.category_id = p_category_id)
      and p.brand_id is not null
    group by p.brand_id
  ) x on x.brand_id = b.id
  where b.is_active
    and b.deleted_at is null
    and (v_tsquery is null or coalesce(x.cnt, 0) > 0);

  return jsonb_build_object('categories', v_categories, 'brands', v_brands);
end;
$function$;
