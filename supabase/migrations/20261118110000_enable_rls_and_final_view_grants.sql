-- Final local/staging schema parity: production has RLS enabled on all 76
-- public tables (verified read-only 2026-11-18). The catalog-derived baseline
-- restores policies but not the relrowsecurity flag; enable it explicitly here,
-- after all feature migrations, so no later migration can leave a table open.
-- Also re-assert the production view ACLs at the very end of the chain: some
-- historical migrations re-grant SELECT on the cart views to anon.

do $$
declare t record;
begin
  for t in
    select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    if not (
      select relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = t.schemaname and c.relname = t.tablename
    ) then
      execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    end if;
  end loop;
end $$;

-- Production ACLs: anon has no SELECT on these views.
revoke all on table public.cart_items_detailed from public, anon;
revoke all on table public.cart_totals from public, anon;
grant select on table public.cart_items_detailed to authenticated, service_role;
grant select on table public.cart_totals to authenticated, service_role;

-- Production views are security_invoker: the caller's RLS on carts/cart_items
-- must decide visibility, not the view owner's privileges.
alter view public.cart_items_detailed set (security_invoker = true);
alter view public.cart_totals set (security_invoker = true);

-- Verification (read-only):
-- select count(*) filter (where relrowsecurity) as rls_on,
--        count(*) filter (where not relrowsecurity) as rls_off
-- from pg_class c join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relkind='r';
-- select has_table_privilege('anon','public.cart_items_detailed','SELECT') as anon_cart;
