-- =============================================================================
-- 06_harden_view_exposure.sql  —  APPROVAL-GATED. DO NOT APPLY WITHOUT EXPLICIT
--                                  OWNER APPROVAL. Never apply to production
--                                  without review + backup + a rollback plan.
--
-- Prepared: 2026-11-01 (Phase Five — read-only database review)
-- Evidence: docs/DATABASE-INTEGRITY-REPORT.md
--
-- WHY THIS EXISTS
--   All 41 public views are owned by `postgres` (BYPASSRLS) and are NOT
--   security_invoker views, so they execute with owner rights and bypass the
--   caller's row-level security. The only protections are (a) table GRANTS on
--   the view and (b) WHERE guards inside the view body.
--
--   Static analysis (grants + view bodies + owner semantics, verified against
--   live catalog) found:
--
--   GROUP A — anon-exposed + unguarded sensitive views (no WHERE guard, anon
--            has SELECT): order_summary, order_items_detailed,
--            shipment_tracking, wishlist_items_detailed, notification_summary,
--            low_stock_variants.  None of them is queried anywhere in the app
--            codebase (grep-verified) -> REVOKE is zero-risk for features.
--            5 admin_* views are already guarded by WHERE is_admin() (anon
--            sees 0 rows) but are revoked as defense-in-depth (no consumer).
--            order_item_print_files: authed-exposed + unguarded, no consumer
--            -> revoke from authenticated (anon already has no grant).
--
--   GROUP B — 9 vendor_* views are authed-selectable with NO per-store guard
--            (cross-tenant analytics leak: any signed-in user can read every
--            store's revenue/customers/refunds). The app queries 6 of them via
--            app/api/vendor/stats/route.js **with the caller's own token and
--            .eq("store_id", own_store)**, so adding owns_store(store_id) is
--            pass-through for legitimate callers and blocks everyone else.
--            A service_role escape hatch is included for future server-side
--            jobs (service_role sends role=service_role JWT claims).
--
--   GROUP C — cart_totals / cart_items_detailed are authed-selectable and
--            UNGUARDED, but they ARE used by the app (app/api/cart GET,
--            app/api/orders, app/api/checkout/preview — always with a valid
--            user JWT and .eq("cart_id", own cart); guests never touch these
--            views because anon has no grant and guest flows use SECURITY
--            DEFINER RPCs). Converting them to security_invoker makes the
--            underlying tables' owner-or-admin RLS policies apply, which
--            matches exactly how the app queries them. All underlying tables
--            (carts, cart_items, products, product_variants,
--            product_customizations, product_images) have SELECT grants for
--            anon+authenticated and SELECT policies for authenticated, so the
--            conversion cannot produce permission errors.
--
--   NOT TOUCHED (by design):
--     * storefront_products, reviews_detailed, mv_trending_products — public
--       storefront data by design.
--     * 10 GUARDED vendor_* views (WHERE owns_store(...)) — needed by the app.
--     * 6 admin_* views with NO grants (admin_customers_overview,
--       admin_daily_sales, admin_inventory_status, admin_orders_overview,
--       admin_product_performance, admin_reviews_moderation_queue) — already
--       inaccessible to anon/authenticated.
--
-- BEFORE APPLYING (pre-flight, read-only):
--   1. Re-run the app-usage grep to confirm no new consumers appeared:
--        rg '\.from\("(order_summary|order_items_detailed|shipment_tracking|wishlist_items_detailed|notification_summary|low_stock_variants|order_item_print_files)"\)' app lib
--      (must return no matches outside generated types)
--   2. Take a backup / schema snapshot (DR requirement — still blocked pending
--      approval for `supabase db dump --linked`).
--   3. Apply to a staging/test copy first if available.
--
-- AFTER APPLYING: run the verification block at the bottom of this file.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION A — REVOKE view exposure (zero app consumers; grep-verified 2026-11-01)
-- -----------------------------------------------------------------------------

-- A1. Order / shipment / wishlist / notification / stock detail (anon + authed)
REVOKE SELECT ON public.order_summary          FROM anon, authenticated;
REVOKE SELECT ON public.order_items_detailed   FROM anon, authenticated;
REVOKE SELECT ON public.shipment_tracking      FROM anon, authenticated;
REVOKE SELECT ON public.wishlist_items_detailed FROM anon, authenticated;
REVOKE SELECT ON public.notification_summary   FROM anon, authenticated;
REVOKE SELECT ON public.low_stock_variants     FROM anon, authenticated;

-- A2. Admin analytics views — already WHERE is_admin()-guarded (anon sees 0
--     rows), revoked as defense-in-depth; admin UI reads these through
--     /api/admin/* server routes (service_role), not PostgREST.
REVOKE SELECT ON public.admin_coupon_performance     FROM anon, authenticated;
REVOKE SELECT ON public.admin_customer_ltv           FROM anon, authenticated;
REVOKE SELECT ON public.admin_design_moderation_queue FROM anon, authenticated;
REVOKE SELECT ON public.admin_mv_coupon_performance  FROM anon, authenticated;
REVOKE SELECT ON public.admin_printing_queue         FROM anon, authenticated;

-- A3. Order print files (authed-exposed + unguarded; no app consumer)
REVOKE SELECT ON public.order_item_print_files FROM authenticated;


-- -----------------------------------------------------------------------------
-- SECTION B — Guard the 9 unguarded vendor_* views with owns_store(store_id)
--   Guard expression = store owner OR admin (is_admin) OR service_role claims.
--   Column lists are unchanged (CREATE OR REPLACE compatibility) — only WHERE
--   predicates were added.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vendor_average_order_value AS
 SELECT store_id,
    count(DISTINCT order_id) AS orders_count,
    sum(line_total) AS total_revenue,
        CASE
            WHEN count(DISTINCT order_id) > 0 THEN round(sum(line_total) / count(DISTINCT order_id)::numeric, 2)
            ELSE 0::numeric
        END AS avg_order_value
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
    AND ( owns_store(store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id;

CREATE OR REPLACE VIEW public.vendor_best_customers AS
 SELECT voi.store_id,
    voi.customer_id,
    pr.full_name AS customer_name,
    count(DISTINCT voi.order_id) AS orders_count,
    sum(voi.line_total) AS total_spent
   FROM vendor_order_items voi
     JOIN profiles pr ON pr.id = voi.customer_id
  WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
    AND ( owns_store(voi.store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY voi.store_id, voi.customer_id, pr.full_name;

CREATE OR REPLACE VIEW public.vendor_customer_retention AS
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
  WHERE ( owns_store(t.store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id;

CREATE OR REPLACE VIEW public.vendor_monthly_stats AS
 SELECT store_id,
    date_trunc('month'::text, placed_at)::date AS month,
    count(DISTINCT order_id) AS orders_count,
    sum(line_total) AS revenue,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
    AND ( owns_store(store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id, (date_trunc('month'::text, placed_at)::date);

CREATE OR REPLACE VIEW public.vendor_pending_shipments AS
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
  WHERE sh.status <> ALL (ARRAY['delivered'::shipment_status, 'cancelled'::shipment_status, 'returned'::shipment_status])
    AND ( owns_store(voi.store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' );

CREATE OR REPLACE VIEW public.vendor_refund_rate AS
 SELECT store_id,
    count(DISTINCT order_item_id) AS total_items,
    count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status])) AS refunded_items,
        CASE
            WHEN count(DISTINCT order_item_id) > 0 THEN round(count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status]))::numeric / count(DISTINCT order_item_id)::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END AS refund_rate_pct
   FROM vendor_order_items
  WHERE ( owns_store(store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id;

CREATE OR REPLACE VIEW public.vendor_revenue_over_time AS
 SELECT store_id,
    date_trunc('day'::text, placed_at)::date AS sale_date,
    sum(line_total) AS revenue,
    count(DISTINCT order_id) AS orders_count,
    sum(quantity) AS units_sold
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
    AND ( owns_store(store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id, (date_trunc('day'::text, placed_at)::date);

CREATE OR REPLACE VIEW public.vendor_sales_by_category AS
 SELECT voi.store_id,
    c.id AS category_id,
    c.name AS category_name,
    sum(voi.quantity) AS units_sold,
    sum(voi.line_total) AS revenue
   FROM vendor_order_items voi
     JOIN products p ON p.id = voi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
  WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
    AND ( owns_store(voi.store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY voi.store_id, c.id, c.name;

CREATE OR REPLACE VIEW public.vendor_top_products AS
 SELECT store_id,
    product_id,
    max(product_name_snapshot) AS product_name,
    sum(quantity) AS units_sold,
    sum(line_total) AS revenue
   FROM vendor_order_items
  WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
    AND ( owns_store(store_id)
          OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' )
  GROUP BY store_id, product_id;


-- -----------------------------------------------------------------------------
-- SECTION C — Cart views: enforce the caller's RLS (owner-or-admin) instead of
--   trusting an unguarded owner-rights view. The app always queries these with
--   the cart owner's JWT (app/api/cart GET, app/api/orders,
--   app/api/checkout/preview) and .eq("cart_id"/…, own cart); guest flows use
--   SECURITY DEFINER RPCs and anon has no grant on these views, so nothing
--   legitimate changes. service_role keeps full access (BYPASSRLS).
--   ROLLBACK: ALTER VIEW … SET (security_invoker = false);
-- -----------------------------------------------------------------------------

ALTER VIEW public.cart_totals         SET (security_invoker = true);
ALTER VIEW public.cart_items_detailed SET (security_invoker = true);


-- =============================================================================
-- POST-APPLY VERIFICATION (read-only)
-- =============================================================================

-- 1) Section A: every grant check below must return FALSE.
SELECT has_table_privilege('anon', 'public.order_summary', 'SELECT')            AS should_be_false_1,
       has_table_privilege('anon', 'public.order_items_detailed', 'SELECT')     AS should_be_false_2,
       has_table_privilege('anon', 'public.shipment_tracking', 'SELECT')        AS should_be_false_3,
       has_table_privilege('anon', 'public.wishlist_items_detailed', 'SELECT')  AS should_be_false_4,
       has_table_privilege('anon', 'public.notification_summary', 'SELECT')     AS should_be_false_5,
       has_table_privilege('anon', 'public.low_stock_variants', 'SELECT')       AS should_be_false_6,
       has_table_privilege('authenticated', 'public.order_item_print_files', 'SELECT') AS should_be_false_7,
       has_table_privilege('anon', 'public.admin_customer_ltv', 'SELECT')       AS should_be_false_8;

-- 2) Section C: cart views must report security_invoker = true.
SELECT relname, relrowsecurity AS security_invoker_enabled
FROM pg_class
WHERE oid IN ('public.cart_totals'::regclass, 'public.cart_items_detailed'::regclass);

-- 3) Section B: without JWT claims these return 0 rows (expected — the guard
--    sees no owner/service_role). To inspect as a DBA in psql, first run:
--       SET request.jwt.claims = '{"role":"service_role"}';
--    then re-run the counts; with a vendor JWT only that store's rows appear.
SELECT count(*) AS vendor_top_products_rows_without_claims FROM public.vendor_top_products;

-- 4) End-to-end: log in as a vendor -> /vendor dashboard loads; log in as a
--    customer -> cart page loads; guest -> cart RPC flows unaffected; admin ->
--    /api/admin/* stats unaffected (service_role).


-- =============================================================================
-- ROLLBACK (uncomment only to revert; requires owner approval as well)
-- =============================================================================

-- -- Section A
-- GRANT SELECT ON public.order_summary          TO anon, authenticated;
-- GRANT SELECT ON public.order_items_detailed   TO anon, authenticated;
-- GRANT SELECT ON public.shipment_tracking      TO anon, authenticated;
-- GRANT SELECT ON public.wishlist_items_detailed TO anon, authenticated;
-- GRANT SELECT ON public.notification_summary   TO anon, authenticated;
-- GRANT SELECT ON public.low_stock_variants     TO anon, authenticated;
-- GRANT SELECT ON public.admin_coupon_performance     TO anon, authenticated;
-- GRANT SELECT ON public.admin_customer_ltv           TO anon, authenticated;
-- GRANT SELECT ON public.admin_design_moderation_queue TO anon, authenticated;
-- GRANT SELECT ON public.admin_mv_coupon_performance  TO anon, authenticated;
-- GRANT SELECT ON public.admin_printing_queue         TO anon, authenticated;
-- GRANT SELECT ON public.order_item_print_files TO authenticated;

-- -- Section C
-- ALTER VIEW public.cart_totals         SET (security_invoker = false);
-- ALTER VIEW public.cart_items_detailed SET (security_invoker = false);

-- -- Section B: original definitions (captured 2026-11-01 from pg_get_viewdef)
-- CREATE OR REPLACE VIEW public.vendor_average_order_value AS
--  SELECT store_id, count(DISTINCT order_id) AS orders_count, sum(line_total) AS total_revenue,
--         CASE WHEN count(DISTINCT order_id) > 0 THEN round(sum(line_total) / count(DISTINCT order_id)::numeric, 2) ELSE 0::numeric END AS avg_order_value
--    FROM vendor_order_items
--   WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
--   GROUP BY store_id;
-- CREATE OR REPLACE VIEW public.vendor_best_customers AS
--  SELECT voi.store_id, voi.customer_id, pr.full_name AS customer_name, count(DISTINCT voi.order_id) AS orders_count, sum(voi.line_total) AS total_spent
--    FROM vendor_order_items voi JOIN profiles pr ON pr.id = voi.customer_id
--   WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
--   GROUP BY voi.store_id, voi.customer_id, pr.full_name;
-- CREATE OR REPLACE VIEW public.vendor_customer_retention AS
--  SELECT store_id, count(DISTINCT customer_id) AS total_customers,
--         count(DISTINCT customer_id) FILTER (WHERE order_count > 1) AS returning_customers,
--         CASE WHEN count(DISTINCT customer_id) > 0 THEN round(count(DISTINCT customer_id) FILTER (WHERE order_count > 1)::numeric / count(DISTINCT customer_id)::numeric * 100::numeric, 2) ELSE 0::numeric END AS retention_rate_pct
--    FROM ( SELECT store_id, customer_id, count(DISTINCT order_id) AS order_count
--            FROM vendor_order_items
--           WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
--           GROUP BY store_id, customer_id) t
--   GROUP BY store_id;
-- CREATE OR REPLACE VIEW public.vendor_monthly_stats AS
--  SELECT store_id, date_trunc('month'::text, placed_at)::date AS month, count(DISTINCT order_id) AS orders_count, sum(line_total) AS revenue, sum(quantity) AS units_sold
--    FROM vendor_order_items
--   WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
--   GROUP BY store_id, (date_trunc('month'::text, placed_at)::date);
-- CREATE OR REPLACE VIEW public.vendor_pending_shipments AS
--  SELECT DISTINCT sh.id AS shipment_id, sh.order_id, sh.status, sh.tracking_number, sh.carrier,
--         sh.estimated_delivery_date_min, sh.estimated_delivery_date_max, sh.created_at, voi.store_id
--    FROM shipments sh JOIN shipment_items shi ON shi.shipment_id = sh.id
--    JOIN vendor_order_items voi ON voi.order_item_id = shi.order_item_id
--   WHERE sh.status <> ALL (ARRAY['delivered'::shipment_status, 'cancelled'::shipment_status, 'returned'::shipment_status]);
-- CREATE OR REPLACE VIEW public.vendor_refund_rate AS
--  SELECT store_id, count(DISTINCT order_item_id) AS total_items,
--         count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status])) AS refunded_items,
--         CASE WHEN count(DISTINCT order_item_id) > 0 THEN round(count(DISTINCT order_item_id) FILTER (WHERE item_status = ANY (ARRAY['returned'::order_item_status, 'refunded'::order_item_status]))::numeric / count(DISTINCT order_item_id)::numeric * 100::numeric, 2) ELSE 0::numeric END AS refund_rate_pct
--    FROM vendor_order_items GROUP BY store_id;
-- CREATE OR REPLACE VIEW public.vendor_revenue_over_time AS
--  SELECT store_id, date_trunc('day'::text, placed_at)::date AS sale_date, sum(line_total) AS revenue,
--         count(DISTINCT order_id) AS orders_count, sum(quantity) AS units_sold
--    FROM vendor_order_items
--   WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
--   GROUP BY store_id, (date_trunc('day'::text, placed_at)::date);
-- CREATE OR REPLACE VIEW public.vendor_sales_by_category AS
--  SELECT voi.store_id, c.id AS category_id, c.name AS category_name, sum(voi.quantity) AS units_sold, sum(voi.line_total) AS revenue
--    FROM vendor_order_items voi JOIN products p ON p.id = voi.product_id
--    LEFT JOIN categories c ON c.id = p.category_id
--   WHERE voi.order_deleted_at IS NULL AND voi.order_status <> 'cancelled'::order_status
--   GROUP BY voi.store_id, c.id, c.name;
-- CREATE OR REPLACE VIEW public.vendor_top_products AS
--  SELECT store_id, product_id, max(product_name_snapshot) AS product_name, sum(quantity) AS units_sold, sum(line_total) AS revenue
--    FROM vendor_order_items
--   WHERE order_deleted_at IS NULL AND order_status <> 'cancelled'::order_status
--   GROUP BY store_id, product_id;
