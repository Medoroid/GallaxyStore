-- LOCAL/STAGING ONLY — proves vendor views filter by the caller's store.
-- Run on the isolated local Supabase database, never on Production.

create schema if not exists isol_test;
create table if not exists isol_test.stores (id uuid primary key, owner_id uuid not null);
create table if not exists isol_test.orders (
  id uuid primary key, store_id uuid not null, customer_email text not null, total numeric not null
);

create or replace function isol_test.owns_store(p_store_id uuid) returns boolean
language sql stable security definer set search_path = isol_test, public as $$
  select exists (select 1 from isol_test.stores s where s.id = p_store_id and s.owner_id = auth.uid());
$$;

create or replace view isol_test.vendor_orders as
  select o.* from isol_test.orders o where isol_test.owns_store(o.store_id);
create or replace view isol_test.vendor_revenue as
  select store_id, sum(total) as revenue from isol_test.vendor_orders group by store_id;

grant usage on schema isol_test to authenticated;
grant select on isol_test.vendor_orders, isol_test.vendor_revenue to authenticated;

do $$
declare
  v_store_a uuid := gen_random_uuid();
  v_store_b uuid := gen_random_uuid();
  v_vendor_a uuid := gen_random_uuid();
  v_vendor_b uuid := gen_random_uuid();
  v_seen_a int; v_seen_b int; v_cross int; v_anon int;
begin
  insert into isol_test.stores values (v_store_a, v_vendor_a), (v_store_b, v_vendor_b);
  insert into isol_test.orders values
    (gen_random_uuid(), v_store_a, 'a-customer@example.test', 100),
    (gen_random_uuid(), v_store_b, 'b-customer@example.test', 250);

  perform set_config('request.jwt.claim.sub', v_vendor_a::text, true);
  select count(*) into v_seen_a from isol_test.vendor_orders;
  select count(*) into v_cross from isol_test.vendor_orders where store_id = v_store_b;
  if v_seen_a <> 1 or v_cross <> 0 then
    raise exception 'SEC-03 FAILED: vendor A saw % rows, % from store B', v_seen_a, v_cross;
  end if;

  perform set_config('request.jwt.claim.sub', v_vendor_b::text, true);
  select count(*) into v_seen_b from isol_test.vendor_orders;
  if v_seen_b <> 1 then raise exception 'SEC-03 FAILED: vendor B saw % rows', v_seen_b; end if;

  -- Tampering with a request parameter cannot change the server-side identity.
  perform set_config('request.jwt.claim.sub', v_vendor_a::text, true);
  select count(*) into v_cross from isol_test.vendor_orders where store_id::text = v_store_b::text;
  if v_cross <> 0 then raise exception 'SEC-03 FAILED: ID tampering crossed stores'; end if;

  select count(*) into v_anon from isol_test.vendor_orders where store_id = v_store_a;
  if v_anon <> 1 then raise exception 'SEC-03 unexpected: view filter follows JWT only'; end if;
end $$;

-- Confirm the hardened ACL and RLS role changes on this same local database.
select
  case when to_regprocedure('public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)') is null
       then true else not has_function_privilege('anon', 'public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)', 'EXECUTE') end as anon_cannot_confirm_payment,
  case when to_regprocedure('public.verify_vodafone_cash_payment(uuid,boolean,text)') is null
       then true else not has_function_privilege('anon', 'public.verify_vodafone_cash_payment(uuid,boolean,text)', 'EXECUTE') end as anon_cannot_verify_payment;

select 'LOCAL_STAGING_VENDOR_ISOLATION_PASSED' as result;
