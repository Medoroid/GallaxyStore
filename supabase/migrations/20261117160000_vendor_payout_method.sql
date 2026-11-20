-- ============================================================================
-- P1 VENDOR PAYOUTS â€” persist the chosen method and serialise requests
--
-- Confirmed live 2026-11-17: the vendor UI sends {amount, method}, but the API
-- reads only amount, request_vendor_payout(p_store_id, p_amount) has no method
-- parameter, vendor_payout_requests has no method column, and
-- approve_vendor_payout_request() never populates vendor_payouts.payout_method.
-- The method is silently discarded. 0 requests exist today, so no data is lost.
--
-- This migration:
--   1. adds vendor_payout_requests.payout_method with the same allow-list used
--      by vendor_payouts.payout_method;
--   2. replaces request_vendor_payout with a 3-arg version (the old 2-arg
--      function must be DROPPED or calls become ambiguous), adds a per-store
--      advisory lock so concurrent requests cannot both pass the balance guard,
--      and stores the method;
--   3. teaches approve_vendor_payout_request to copy the method to the ledger.
--
-- Local only. NOT applied to production. Test on Staging first; the API route
-- ships with a compatibility fallback until this migration is applied.
-- Rollback: restore the 2-arg function from pg_get_functiondef() captured
-- before applying, drop the payout_method column, and re-grant EXECUTE.
-- ============================================================================


alter table public.vendor_payout_requests
  add column if not exists payout_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendor_payout_requests_method_check'
  ) then
    alter table public.vendor_payout_requests
      add constraint vendor_payout_requests_method_check
      check (payout_method is null or payout_method in ('bank_transfer','paypal','wallet','other'));
  end if;
end
$$;

drop function if exists public.request_vendor_payout(uuid, numeric);

create or replace function public.request_vendor_payout(
  p_store_id uuid,
  p_amount numeric,
  p_method text default null
)
returns public.vendor_payout_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_available numeric;
  v_pending numeric;
  v_method text;
  v_row public.vendor_payout_requests;
begin
  if not public.owns_store(p_store_id) then
    raise exception 'You do not own this store';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  v_method := coalesce(nullif(btrim(p_method), ''), 'bank_transfer');
  if v_method not in ('bank_transfer', 'paypal', 'wallet', 'other') then
    raise exception 'Invalid payout method: %', v_method;
  end if;

  -- The balance guard reads two tables. Serialise per store even when no
  -- earnings rows are locked, so concurrent requests cannot both pass.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select coalesce(sum(net_amount), 0) into v_available
  from (
    select net_amount from public.vendor_earnings
    where store_id = p_store_id and status = 'available'
    for update
  ) locked_earnings;

  select coalesce(sum(requested_amount), 0) into v_pending
  from public.vendor_payout_requests
  where store_id = p_store_id and status in ('pending', 'approved');

  if p_amount > (v_available - v_pending) then
    raise exception 'Requested amount % exceeds available balance of %', p_amount, (v_available - v_pending);
  end if;

  insert into public.vendor_payout_requests
    (store_id, requested_amount, requested_by, payout_method)
  values
    (p_store_id, p_amount, auth.uid(), v_method)
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.request_vendor_payout(uuid, numeric, text) from public;
grant execute on function public.request_vendor_payout(uuid, numeric, text) to authenticated, service_role;

-- Same signature as live: CREATE OR REPLACE keeps existing grants.
create or replace function public.approve_vendor_payout_request(
  p_request_id uuid,
  p_notes text default null
)
returns public.vendor_payouts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.vendor_payout_requests;
  v_payout public.vendor_payouts;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_request
  from public.vendor_payout_requests
  where id = p_request_id and status = 'pending'
  for update;
  if v_request.id is null then
    raise exception 'Payout request not found or not pending';
  end if;

  update public.vendor_payout_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         notes = coalesce(p_notes, notes)
   where id = p_request_id;

  insert into public.vendor_payouts
    (payout_request_id, store_id, amount, status, payout_method)
  values
    (p_request_id, v_request.store_id, v_request.requested_amount, 'approved', v_request.payout_method)
  returning * into v_payout;

  return v_payout;
end;
$function$;


-- Verification (read-only, run on Staging):
-- select column_name from information_schema.columns where table_schema='public'
--   and table_name='vendor_payout_requests' and column_name='payout_method';
-- select oid::regprocedure, proacl from pg_proc where proname='request_vendor_payout';
-- select payout_request_id, payout_method from public.vendor_payouts limit 10;