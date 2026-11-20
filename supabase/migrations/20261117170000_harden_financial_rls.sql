-- ============================================================================
-- P1 - tighten financial RLS policies and an over-broad RPC grant
--
-- Verified live 2026-11-17: ten policies on vendor_earnings,
-- vendor_payout_requests, vendor_commissions and recently_viewed_products are
-- declared TO public (anon + authenticated) even though they guard financial
-- or private user rows. Service role bypasses RLS, and every application query
-- for these tables uses either service role or an authenticated user, so
-- narrowing to authenticated is behaviour-preserving for the app.
--
-- Also: verify_vodafone_cash_payment(...) is SECURITY DEFINER with an internal
-- is_admin() check but still carries an implicit PUBLIC EXECUTE grant. Remove
-- that implicit grant; keep authenticated and service_role.
--
-- Local only. NOT applied to production. Rollback: run the commented
-- ALTER POLICY ... TO public statements and GRANT EXECUTE ... TO public.
-- ============================================================================


-- The authoritative baseline deliberately excludes RLS policies; historical
-- migrations create only some of these names. Narrow the ones that exist and
-- skip absent ones instead of aborting the whole chain.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('recently_viewed_products','recently_viewed_insert_own'),
      ('recently_viewed_products','recently_viewed_select_owner_or_admin'),
      ('vendor_commissions','vendor_commissions_delete_admin'),
      ('vendor_commissions','vendor_commissions_insert_admin'),
      ('vendor_commissions','vendor_commissions_select_own_or_global_or_admin'),
      ('vendor_commissions','vendor_commissions_update_admin'),
      ('vendor_earnings','vendor_earnings_select_owner_or_admin'),
      ('vendor_earnings','vendor_earnings_update_admin'),
      ('vendor_payout_requests','vendor_payout_requests_select_owner_or_admin'),
      ('vendor_payout_requests','vendor_payout_requests_update_admin')
    ) as v(tbl, pol)
  loop
    if exists (
      select 1 from pg_policies
       where schemaname='public' and tablename=r.tbl and policyname=r.pol
    ) then
      execute format('alter policy %I on public.%I to authenticated', r.pol, r.tbl);
    else
      raise notice '[RLS hardening] policy %.% absent, skipping', r.tbl, r.pol;
    end if;
  end loop;
end $$;

revoke execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  from public, anon;
-- Admin API routes call this RPC with a user JWT (authenticated), so that
-- role must keep EXECUTE. service_role keeps it as well.
grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  to authenticated, service_role;


-- Verification (read-only):
-- select tablename, policyname, roles, cmd from pg_policies
--  where schemaname='public' and tablename in (...);
-- select proname, proacl from pg_proc where proname='verify_vodafone_cash_payment';

-- ROLLBACK (manual):
-- alter policy recently_viewed_insert_own on public.recently_viewed_products to public;
-- ... repeat for every policy above ...
-- grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text) to public;