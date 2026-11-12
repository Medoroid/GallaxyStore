-- Fix admin_product_performance counting non-qualifying orders.
--
-- The original definition (20261023_production_readiness.sql) filtered order
-- status inside the LEFT JOIN to orders, so order_items rows from pending /
-- cancelled orders still joined the view (o.* came back NULL) and their line
-- totals were summed into revenue. Real example from production: a product
-- with 3000 across 3 *pending* orders and 1000 in one *paid* order rendered
-- as two rows for the same product — a phantom NULL-currency row of 3000
-- above the real USD 1000 — which also crashed the admin dashboard with
-- React's "two children with the same key" error.
--
-- Items are now qualified before aggregation, so every row is a real sale in
-- a real currency. Products whose only items sit in non-qualifying orders
-- fall back to the zero row they share with never-sold products.
--
-- Column names and types are unchanged, so CREATE OR REPLACE VIEW keeps the
-- grants installed by 20261023_production_readiness.sql (service_role only).
-- Idempotent: safe to run more than once.

create or replace view public.admin_product_performance as
select
  p.id as product_id,
  p.name,
  coalesce(v.sku, '') as sku,
  o.currency,
  coalesce(sum(oi.line_total), 0) as revenue,
  coalesce(sum(oi.quantity), 0) as units_sold,
  count(distinct o.id) as order_count
from public.products p
left join public.product_variants v
  on v.product_id = p.id
  and v.is_default
  and v.deleted_at is null
left join public.order_items oi
  on oi.variant_id = v.id
  and exists (
    select 1
    from public.orders oq
    where oq.id = oi.order_id
      and oq.status in ('paid', 'processing', 'printing', 'shipped', 'delivered')
      and oq.deleted_at is null
  )
left join public.orders o
  on o.id = oi.order_id
where p.deleted_at is null
group by p.id, p.name, v.sku, o.currency;

revoke all on public.admin_product_performance from public, anon, authenticated;
grant select on public.admin_product_performance to service_role;
