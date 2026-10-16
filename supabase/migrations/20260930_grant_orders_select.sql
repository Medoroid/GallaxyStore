-- 20260930: public.orders had no SELECT grant for the `authenticated` role
-- (INSERT/UPDATE/DELETE were granted, SELECT was not).
-- Effect: every user-scoped query on orders failed with
--         "permission denied for table orders" (SQLSTATE 42501),
--         so GET /api/orders answered 403 and /orders showed an empty list.
--
-- RLS stays enabled; orders_select_owner_or_admin (owns_order) still limits
-- each authenticated user to their own rows.

GRANT SELECT ON public.orders TO authenticated;
