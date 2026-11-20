-- P2 — remove indexes proven byte-identical by pg_indexes (read-only check,
-- 2026-11-18, production ref httywgkwfqvrbuwuzutu). Local only, NOT applied.
--
-- Dropped pairs (same table, same columns, same predicate):
--   order_items:              idx_order_items_order        == order_items_order_idx
--   recently_viewed_products: idx_recently_viewed_session_product == idx_rvp_session_product
--   recently_viewed_products: idx_recently_viewed_user_product    == idx_rvp_user_product
--   reviews:                  idx_reviews_product          == reviews_product_status_idx
--
-- NOT dropped: payments.idx_payments_provider_ref (provider_payment_id) and
-- payments.payments_provider_ref_uidx (provider, provider_payment_id) have
-- different leading columns and different purposes.
--
-- Rollback: the CREATE INDEX statements at the bottom of this file.
-- Apply on Staging first; capture EXPLAIN (ANALYZE, BUFFERS) for the relevant
-- queries before and after. Use CONCURRENTLY on production if approved.

begin;

drop index if exists public.idx_order_items_order;
drop index if exists public.idx_recently_viewed_session_product;
drop index if exists public.idx_recently_viewed_user_product;
drop index if exists public.idx_reviews_product;

commit;

-- Verification (read-only):
-- select tablename, indexname, indexdef from pg_indexes
--  where schemaname='public' and tablename in (...);

-- ROLLBACK (manual):
-- create index concurrently idx_order_items_order on public.order_items (order_id);
-- create index concurrently idx_recently_viewed_session_product
--   on public.recently_viewed_products (session_token, product_id) where session_token is not null;
-- create index concurrently idx_recently_viewed_user_product
--   on public.recently_viewed_products (user_id, product_id) where user_id is not null;
-- create index concurrently idx_reviews_product
--   on public.reviews (product_id, status) where deleted_at is null;
