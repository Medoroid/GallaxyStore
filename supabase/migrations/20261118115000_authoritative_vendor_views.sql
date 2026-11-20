-- ============================================================================
-- Generated from PRODUCTION catalog read-only (project ref httywgkwfqvrbuwuzutu)
-- on 2026-11-18.  LOCAL / STAGING ONLY.  NO DATA IS COPIED (schema only).
--
-- The 19 public.vendor_* views and their 5 mv_vendor_* materialized views exist
-- in production but were excluded from the catalog-derived local baseline.  As
-- a result 20261118120000_fix_vendor_views_security_invoker.sql is a no-op
-- locally.  This file restores faithful local copies so that migration can be
-- exercised.  It MUST sort before 20261118120000.
--
-- Production view options: security_barrier=true (no security_invoker yet).
-- 20261118120000 adds security_invoker=true to all 19 views.
--
-- Dependencies (from pg_depend / pg_get_viewdef, all present in the local
-- baseline except the objects created below):
--   tables:  order_items, orders, product_variants, products,
--            product_customizations, profiles, print_jobs, user_designs,
--            product_customization_layers, shipments, shipment_items,
--            categories, stores
--   enums:   order_status, order_item_status, design_status, shipment_status
--   funcs:   public.owns_store(uuid), auth.uid()  (both already local)
--   views:   vendor_order_items is the base for 12 other vendor_* views and
--            for 3 mv_vendor_* matviews
--   matviews: mv_vendor_daily_sales, mv_vendor_inventory_status,
--            mv_vendor_monthly_sales, mv_vendor_print_stats,
--            mv_vendor_top_products
--   refresh: public.refresh_vendor_dashboard_views() already exists locally
--            (20261023_production_readiness.sql); re-asserted below, verbatim,
--            so the matviews remain refreshable in a fresh local stack.
--
-- Recreated object count: 19 views + 5 materialized views + 5 unique indexes.
-- Do NOT apply to production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Base view: vendor_order_items  (every other sales view builds on it)
-- ---------------------------------------------------------------------------
create or replace view public.vendor_order_items with (security_barrier=true) as
 SELECT oi.id AS order_item_id,
    oi.order_id,
    oi.quantity,
    oi.line_total,
    oi.unit_price_snapshot,
    oi.status AS item_status,
    oi.customization_id,
    oi.variant_id,
    oi.product_name_snapshot,
    oi.sku_snapshot,
    oi.created_at,
    COALESCE(pv.product_id, pc.product_id) AS product_id,
    COALESCE(p1.store_id, p2.store_id) AS store_id,
    o.order_number,
    o.status AS order_status,
    o.user_id AS customer_id,
    o.placed_at,
    o.deleted_at AS order_deleted_at
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     LEFT JOIN products p1 ON p1.id = pv.product_id
     LEFT JOIN product_customizations pc ON pc.id = oi.customization_id
     LEFT JOIN products p2 ON p2.id = pc.product_id
  WHERE COALESCE(p1.store_id, p2.store_id) IS NOT NULL AND owns_store(COALESCE(p1.store_id, p2.store_id));

-- ---------------------------------------------------------------------------
-- 2. Sales views built directly on vendor_order_items / base tables
-- ---------------------------------------------------------------------------
create or replace view public.vendor_average_order_value with (security_barrier=true) as
 SELECT store_id,
    count(DISTINCT order_id) AS orders_count,
    sum(line_total) AS total_revenue,
        CASE
            WHEN count(DISTINCT order_id) > 0 THEN round(sum(line_total) / count(DISTINCT order_id)::numeric, 2)
            ELSE 0::numeric
        END AS avg_order_value
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id;

create or replace view public.vendor_best_customers with (security_barrier=true) as
 SELECT voi.store_id,
    voi.customer_id,
    pr.full_name AS customer_name,
    count(DISTINCT voi.order_id) AS orders_count,
    sum(voi.line_total) AS total_spent
   FROM vendor_order_items voi
     JOIN profiles pr ON pr.id = voi.customer_id
  WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
  GROUP BY voi.store_id, voi.customer_id, pr.full_name;

create or replace view public.vendor_conversion_metrics with (security_barrier=true) as
 SELECT p.store_id,
    p.id AS product_id,
    p.name AS product_name,
    p.view_count,
    COALESCE(sales.units_sold, 0::bigint) AS units_sold,
    COALESCE(sales.orders_count, 0::bigint) AS orders_count,
        CASE
            WHEN p.view_count > 0 THEN round(COALESCE(sales.orders_count, 0::bigint)::numeric / p.view_count::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END AS conversion_rate_pct
   FROM products p
     LEFT JOIN ( SELECT vendor_order_items.product_id,
            sum(vendor_order_items.quantity) AS units_sold,
            count(DISTINCT vendor_order_items.order_id) AS orders_count
           FROM vendor_order_items
          WHERE vendor_order_items.order_deleted_at IS NULL AND vendor_order_items.order_status <> 'cancelled'::order_status
          GROUP BY vendor_order_items.product_id) sales ON sales.product_id = p.id
  WHERE p.store_id IS NOT NULL AND owns_store(p.store_id);

create or replace view public.vendor_customer_retention with (security_barrier=true) as
 SELECT store_id,
    count(DISTINCT customer_id) AS total_customers,
    count(DISTINCT customer_id) FILTER (WHERE order_count > 1) AS returning_customers,
        CASE
            WHEN count(DISTINCT customer_id) > 0 THEN round(count(DISTINCT customer_id) FILTER (WHERE order_count > 1)::numeric / count(DISTINCT customer_id)::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END AS retention_rate_pct
   FROM ( SELECT vendor_order_items.store_id,
            vendor_order_items.customer_id,
            count(DISTINCT vendor_order_items.order_id) AS order_count
           FROM vendor_order_items
          WHERE vendor_order_items.order_deleted_at IS NULL AND vendor_order_items.order_status <> 'cancelled'::order_status
          GROUP BY vendor_order_items.store_id, vendor_order_items.customer_id) t
  GROUP BY store_id;

create or replace view public.vendor_dashboard_overview with (security_barrier=true) as
 SELECT s.id AS store_id,
    s.name AS store_name,
    s.status AS store_status,
    COALESCE(rev.total_revenue, 0::numeric) AS total_revenue,
    COALESCE(rev.total_orders, 0::bigint) AS total_orders,
    COALESCE(pq.pending_print_jobs, 0::bigint) AS pending_print_jobs,
    COALESCE(lsv.low_stock_count, 0::bigint) AS low_stock_count,
    COALESCE(pdz.pending_designs, 0::bigint) AS pending_designs,
    COALESCE(psh.pending_shipments, 0::bigint) AS pending_shipments
   FROM stores s
     LEFT JOIN LATERAL ( SELECT sum(voi.line_total) AS total_revenue,
            count(DISTINCT voi.order_id) AS total_orders
           FROM vendor_order_items voi
          WHERE voi.store_id = s.id AND voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status) rev ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS pending_print_jobs
           FROM print_jobs pj
          WHERE pj.store_id = s.id AND (pj.status <> ALL (ARRAY['completed'::text, 'failed'::text]))) pq ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS low_stock_count
           FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
          WHERE p.store_id = s.id AND pv.deleted_at IS NULL AND p.deleted_at IS NULL AND pv.is_active AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, p.low_stock_threshold)) lsv ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT ud.id) AS pending_designs
           FROM user_designs ud
             JOIN product_customization_layers pcl ON pcl.design_id = ud.id
             JOIN product_customizations pc ON pc.id = pcl.customization_id
             JOIN products p ON p.id = pc.product_id
          WHERE p.store_id = s.id AND ud.status = 'pending_review'::design_status) pdz ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT sh.id) AS pending_shipments
           FROM shipments sh
             JOIN shipment_items shi ON shi.shipment_id = sh.id
             JOIN vendor_order_items voi2 ON voi2.order_item_id = shi.order_item_id
          WHERE voi2.store_id = s.id AND (sh.status <> ALL (ARRAY['delivered'::shipment_status, 'cancelled'::shipment_status, 'returned'::shipment_status]))) psh ON true
  WHERE owns_store(s.id);

create or replace view public.vendor_monthly_stats with (security_barrier=true) as
 SELECT store_id,
    date_trunc('month'::text, placed_at)::date AS month,
    count(DISTINCT order_id) AS orders_count,
    sum(line_total) AS revenue,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, (date_trunc('month'::text, placed_at)::date);

create or replace view public.vendor_pending_designs with (security_barrier=true) as
 SELECT DISTINCT ud.id AS design_id,
    ud.title,
    ud.status,
    ud.owner_id,
    ud.created_at,
    p.store_id,
    p.id AS product_id,
    p.name AS product_name
   FROM user_designs ud
     JOIN product_customization_layers pcl ON pcl.design_id = ud.id
     JOIN product_customizations pc ON pc.id = pcl.customization_id
     JOIN products p ON p.id = pc.product_id
  WHERE ud.status = 'pending_review'::design_status AND owns_store(p.store_id);

create or replace view public.vendor_pending_shipments with (security_barrier=true) as
 SELECT DISTINCT sh.id AS shipment_id,
    sh.order_id,
    sh.status,
    sh.tracking_number,
    sh.carrier,
    sh.estimated_delivery_date_min,
    sh.estimated_delivery_date_max,
    sh.created_at,
    voi.store_id
   FROM shipments sh
     JOIN shipment_items shi ON shi.shipment_id = sh.id
     JOIN vendor_order_items voi ON voi.order_item_id = shi.order_item_id
  WHERE sh.status <> ALL (ARRAY['delivered'::shipment_status, 'cancelled'::shipment_status, 'returned'::shipment_status]);

create or replace view public.vendor_printing_queue with (security_barrier=true) as
 SELECT pj.id AS print_job_id,
    pj.order_item_id,
    pj.status,
    pj.assigned_to,
    pj.reprint_count,
    pj.started_at,
    pj.completed_at,
    pj.notes,
    pj.created_at,
    pj.updated_at,
    oi.product_name_snapshot,
    oi.sku_snapshot,
    oi.quantity,
    oi.printing_instructions,
    o.order_number,
    o.placed_at,
    pj.store_id
   FROM print_jobs pj
     JOIN order_items oi ON oi.id = pj.order_item_id
     JOIN orders o ON o.id = oi.order_id
  WHERE owns_store(pj.store_id);

create or replace view public.vendor_refund_rate with (security_barrier=true) as
 SELECT store_id,
    count(DISTINCT order_item_id) AS total_items,
    count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status])) AS refunded_items,
        CASE
            WHEN count(DISTINCT order_item_id) > 0 THEN round(count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status]))::numeric / count(DISTINCT order_item_id)::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END AS refund_rate_pct
   FROM vendor_order_items
  GROUP BY store_id;

create or replace view public.vendor_revenue_over_time with (security_barrier=true) as
 SELECT store_id,
    date_trunc('day'::text, placed_at)::date AS sale_date,
    sum(line_total) AS revenue,
    count(DISTINCT order_id) AS orders_count,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, (date_trunc('day'::text, placed_at)::date);

create or replace view public.vendor_sales_by_category with (security_barrier=true) as
 SELECT voi.store_id,
    c.id AS category_id,
    c.name AS category_name,
    sum(voi.quantity) AS units_sold,
    sum(voi.line_total) AS revenue
   FROM vendor_order_items voi
     JOIN products p ON p.id = voi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
  WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
  GROUP BY voi.store_id, c.id, c.name;

create or replace view public.vendor_top_products with (security_barrier=true) as
 SELECT store_id,
    product_id,
    max(product_name_snapshot) AS product_name,
    sum(quantity) AS units_sold,
    sum(line_total) AS revenue
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, product_id;

-- ---------------------------------------------------------------------------
-- 3. Materialized views (production definitions, verbatim)
-- ---------------------------------------------------------------------------
create materialized view if not exists public.mv_vendor_daily_sales as
 SELECT store_id,
    date_trunc('day'::text, placed_at)::date AS sale_date,
    count(DISTINCT order_id) AS order_count,
    sum(line_total) AS revenue,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, (date_trunc('day'::text, placed_at)::date);

create materialized view if not exists public.mv_vendor_inventory_status as
 SELECT p.store_id,
    pv.id AS variant_id,
    pv.sku,
    p.id AS product_id,
    p.name AS product_name,
    pv.stock_quantity,
    pv.reserved_quantity,
    pv.stock_quantity - pv.reserved_quantity AS available_stock,
    COALESCE(pv.low_stock_threshold, p.low_stock_threshold) AS low_stock_threshold,
    pv.stock_quantity <= COALESCE(pv.low_stock_threshold, p.low_stock_threshold) AS is_low_stock
   FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
  WHERE p.store_id IS NOT NULL AND pv.deleted_at IS NULL AND p.deleted_at IS NULL;

create materialized view if not exists public.mv_vendor_monthly_sales as
 SELECT store_id,
    date_trunc('month'::text, placed_at)::date AS sale_month,
    count(DISTINCT order_id) AS order_count,
    sum(line_total) AS revenue,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, (date_trunc('month'::text, placed_at)::date);

create materialized view if not exists public.mv_vendor_print_stats as
 SELECT store_id,
    count(*) FILTER (WHERE status = 'queued'::text) AS queued_count,
    count(*) FILTER (WHERE status = 'assigned'::text) AS assigned_count,
    count(*) FILTER (WHERE status = 'printing'::text) AS printing_count,
    count(*) FILTER (WHERE status = 'quality_check'::text) AS quality_check_count,
    count(*) FILTER (WHERE status = 'completed'::text) AS completed_count,
    count(*) FILTER (WHERE status = 'failed'::text) AS failed_count,
    count(*) FILTER (WHERE status = 'reprint'::text) AS reprint_status_count,
    count(*) AS total_jobs,
    sum(reprint_count) AS total_reprint_attempts,
    avg(EXTRACT(epoch FROM completed_at - started_at)) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_completion_seconds
   FROM print_jobs pj
  WHERE store_id IS NOT NULL
  GROUP BY store_id;

create materialized view if not exists public.mv_vendor_top_products as
 SELECT store_id,
    product_id,
    max(product_name_snapshot) AS product_name,
    sum(quantity) AS units_sold,
    sum(line_total) AS revenue
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
  GROUP BY store_id, product_id;

-- Production unique indexes (required by REFRESH MATERIALIZED VIEW CONCURRENTLY)
create unique index if not exists mv_vendor_daily_sales_uidx
  on public.mv_vendor_daily_sales using btree (store_id, sale_date);
create unique index if not exists mv_vendor_inventory_status_uidx
  on public.mv_vendor_inventory_status using btree (variant_id);
create unique index if not exists mv_vendor_monthly_sales_uidx
  on public.mv_vendor_monthly_sales using btree (store_id, sale_month);
create unique index if not exists mv_vendor_print_stats_uidx
  on public.mv_vendor_print_stats using btree (store_id);
create unique index if not exists mv_vendor_top_products_uidx
  on public.mv_vendor_top_products using btree (store_id, product_id);

-- ---------------------------------------------------------------------------
-- 4. Matview-backed views (last: they depend on the matviews above)
-- ---------------------------------------------------------------------------
create or replace view public.vendor_mv_daily_sales with (security_barrier=true) as
 SELECT store_id,
    sale_date,
    order_count,
    revenue,
    units_sold
   FROM mv_vendor_daily_sales
  WHERE ( SELECT owns_store(mv_vendor_daily_sales.store_id) AS owns_store);

create or replace view public.vendor_mv_inventory_status with (security_barrier=true) as
 SELECT store_id,
    variant_id,
    sku,
    product_id,
    product_name,
    stock_quantity,
    reserved_quantity,
    available_stock,
    low_stock_threshold,
    is_low_stock
   FROM mv_vendor_inventory_status
  WHERE ( SELECT owns_store(mv_vendor_inventory_status.store_id) AS owns_store);

create or replace view public.vendor_mv_monthly_sales with (security_barrier=true) as
 SELECT store_id,
    sale_month,
    order_count,
    revenue,
    units_sold
   FROM mv_vendor_monthly_sales
  WHERE ( SELECT owns_store(mv_vendor_monthly_sales.store_id) AS owns_store);

create or replace view public.vendor_mv_print_stats with (security_barrier=true) as
 SELECT store_id,
    queued_count,
    assigned_count,
    printing_count,
    quality_check_count,
    completed_count,
    failed_count,
    reprint_status_count,
    total_jobs,
    total_reprint_attempts,
    avg_completion_seconds
   FROM mv_vendor_print_stats
  WHERE ( SELECT owns_store(mv_vendor_print_stats.store_id) AS owns_store);

create or replace view public.vendor_mv_top_products with (security_barrier=true) as
 SELECT store_id,
    product_id,
    product_name,
    units_sold,
    revenue
   FROM mv_vendor_top_products
  WHERE ( SELECT owns_store(mv_vendor_top_products.store_id) AS owns_store);

-- ---------------------------------------------------------------------------
-- 5. Refresh helper (verbatim from production; also present locally from
--    20261023_production_readiness.sql).  Re-asserted so a fresh local stack
--    can refresh all five matviews.  CREATE OR REPLACE preserves its ACL.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_vendor_dashboard_views()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  begin
    refresh materialized view concurrently public.mv_vendor_daily_sales;
    refresh materialized view concurrently public.mv_vendor_inventory_status;
    refresh materialized view concurrently public.mv_vendor_monthly_sales;
    refresh materialized view concurrently public.mv_vendor_print_stats;
    refresh materialized view concurrently public.mv_vendor_top_products;
  exception
    when others then
      refresh materialized view public.mv_vendor_daily_sales;
      refresh materialized view public.mv_vendor_inventory_status;
      refresh materialized view public.mv_vendor_monthly_sales;
      refresh materialized view public.mv_vendor_print_stats;
      refresh materialized view public.mv_vendor_top_products;
  end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Production ACLs (idempotent).  20261118120000 re-asserts the view ACLs.
-- ---------------------------------------------------------------------------
do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
  loop
    execute format('revoke all on table public.%I from public, anon', v.relname);
    execute format('grant select on table public.%I to authenticated', v.relname);
    execute format('grant all on table public.%I to service_role', v.relname);
  end loop;

  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='m' and c.relname like 'mv_vendor_%'
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v.relname);
    execute format('grant all on table public.%I to service_role', v.relname);
  end loop;
end $$;

-- Verification (read-only), after 20261118120000 has run:
-- select count(*) as vendor_views from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%';  -- expect 19
-- select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
--  and c.reloptions @> array['security_invoker=true']::text[] order by c.relname;  -- expect 19
