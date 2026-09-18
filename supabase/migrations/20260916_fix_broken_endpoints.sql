-- ============================================================
-- FIX: get_recommended_products — ambiguous column reference
-- Root cause: CTE "deduped" used bare "product_id" which PG
-- couldn't distinguish from the parameter p_product_id.
-- Fix: alias CTE columns as rec_product_id everywhere.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_recommended_products(p_product_id uuid, p_limit integer DEFAULT 8)
 RETURNS TABLE(product_id uuid, slug text, name text, primary_image text, min_price numeric, avg_rating numeric, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category_id uuid;
begin
  select category_id into v_category_id from public.products where id = p_product_id;

  return query
  with co_purchased as (
    select oi2.variant_id as other_variant_id, count(distinct oi1.order_id) as co_count
    from public.order_items oi1
    join public.order_items oi2 on oi2.order_id = oi1.order_id and oi2.id <> oi1.id
    join public.product_variants pv1 on pv1.id = oi1.variant_id
    where pv1.product_id = p_product_id
    group by oi2.variant_id
  ),
  ranked as (
    select pv.product_id as rec_product_id, sum(cp.co_count)::numeric as score, 1 as priority, 'frequently_bought_together'::text as reason
    from co_purchased cp
    join public.product_variants pv on pv.id = cp.other_variant_id
    where pv.product_id <> p_product_id
    group by pv.product_id

    union all

    select p.id as rec_product_id, (p.rating_count * p.avg_rating)::numeric, 2, 'same_category'::text
    from public.products p
    where p.category_id = v_category_id and p.id <> p_product_id
      and p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
  ),
  deduped as (
    select distinct on (r.rec_product_id) r.rec_product_id, r.score, r.priority, r.reason
    from ranked r
    order by r.rec_product_id, r.priority asc, r.score desc
  )
  select p.id, p.slug, p.name,
    (select pi.storage_path from public.product_images pi where pi.product_id = p.id and pi.variant_id is null order by pi.is_primary desc, pi.sort_order asc limit 1),
    (select min(pv2.price) from public.product_variants pv2 where pv2.product_id = p.id and pv2.deleted_at is null and pv2.is_active),
    p.avg_rating,
    d.reason
  from deduped d
  join public.products p on p.id = d.rec_product_id
  where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
  order by d.priority asc, d.score desc
  limit p_limit;
end;
$function$;


-- ============================================================
-- CREATE: gallery_images table (was completely missing)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gallery_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  category text DEFAULT 'custom-prints',
  is_featured boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gallery images are viewable by everyone"
  ON public.gallery_images FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert gallery images"
  ON public.gallery_images FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "Admins can update gallery images"
  ON public.gallery_images FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "Admins can delete gallery images"
  ON public.gallery_images FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );
