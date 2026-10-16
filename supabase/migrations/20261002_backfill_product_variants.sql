-- Backfill: أى منتج منشور من غير أي variant نشط بيعطله عن الشراء
-- (cart route بيرمى "This product is currently unavailable").
-- المخزون الافتراضى هنا 100 — عدّله ليناسبك قبل التشغيل.
-- شغّل الملف ده في Supabase SQL Editor.

insert into public.product_variants (product_id, sku, price, stock_quantity, is_default, is_active)
select
  p.id,
  coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          lower(coalesce(nullif(p.slug, ''), p.name)),
          '[^a-z0-9]+', '-', 'g'
        ),
        '^-+|-+$', '', 'g'
      ),
      ''
    ) || '-',
    'PRODUCT-'
  ) || left(p.id::text, 8),
  p.base_price,
  100,
  true,
  true
from public.products p
where p.deleted_at is null
  and not exists (
    select 1
    from public.product_variants v
    where v.product_id = p.id
      and v.is_active
      and v.deleted_at is null
  )
on conflict (sku) do nothing;

-- تأكيد النتيجة: المفروض مفيش منتج من غير variant نشط
select p.id, p.name, p.status,
       (select count(*) from product_variants v
         where v.product_id = p.id and v.is_active and v.deleted_at is null) as active_variants
from public.products p
where p.deleted_at is null
order by active_variants, p.name;
