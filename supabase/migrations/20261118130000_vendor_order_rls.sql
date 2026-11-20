-- Local/Staging only. DO NOT APPLY TO PRODUCTION without human approval.
--
-- The 19 vendor_* views now use security_invoker=true, so the caller's RLS on
-- base tables applies. Production policies on orders/order_items only allow the
-- BUYER (owns_order) or an admin. Without the policies below, a vendor sees no
-- orders from their own store unless they happened to buy them personally —
-- a functional regression that would silently empty the vendor dashboard.
--
-- These policies are scoped strictly to stores owned by the authenticated user
-- via product -> variant -> order item. They are additive (permissive OR) and
-- do not weaken buyer or admin access.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='orders'
       and policyname='vendor_store_orders_select_20261118'
  ) then
    create policy vendor_store_orders_select_20261118
      on public.orders for select to authenticated
      using (
        exists (
          select 1
            from public.order_items oi
            join public.product_variants pv on pv.id = oi.variant_id
            join public.products p on p.id = pv.product_id
            join public.stores s on s.id = p.store_id
           where oi.order_id = orders.id
             and s.owner_id = auth.uid()
             and s.deleted_at is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='order_items'
       and policyname='vendor_store_order_items_select_20261118'
  ) then
    create policy vendor_store_order_items_select_20261118
      on public.order_items for select to authenticated
      using (
        exists (
          select 1
            from public.product_variants pv
            join public.products p on p.id = pv.product_id
            join public.stores s on s.id = p.store_id
           where pv.id = order_items.variant_id
             and s.owner_id = auth.uid()
             and s.deleted_at is null
        )
      );
  end if;
end $$;

-- Verification is performed with a two-vendor/two-store rollback probe:
-- vendor A must see store A's order (buyer = unrelated customer), vendor B must
-- see none, and an unrelated customer must still see only their own order.
