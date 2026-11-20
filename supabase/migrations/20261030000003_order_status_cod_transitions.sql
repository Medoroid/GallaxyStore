-- COD fulfilment transitions (review only; do not apply without staging approval).
--
-- The live order-status trigger only allows `pending -> paid` and
-- `printing -> shipped`. A COD order stays `pending` until delivery, so a
-- vendor can create a shipment but the order can never move to `processing`
-- and then `shipped`.
--
-- This migration is additive: it keeps every existing transition and adds
--   pending    -> processing  (COD accepted for fulfilment)
--   paid       -> shipped     (direct fulfilment path; normally paid -> processing first)
--   processing -> shipped     (COD/standard fulfilment once all items ship)
--
-- The application still updates one step at a time and still treats a failed
-- order transition as non-fatal for the shipment itself.

create or replace function public.validate_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if old.status = new.status then return new; end if;

  allowed := case old.status
    when 'pending' then new.status in ('paid', 'processing', 'cancelled')
    when 'paid' then new.status in ('processing', 'shipped', 'cancelled', 'refunded')
    when 'processing' then new.status in ('printing', 'shipped', 'cancelled', 'refunded', 'partially_refunded')
    when 'printing' then new.status in ('shipped', 'refunded', 'partially_refunded')
    when 'shipped' then new.status in ('delivered', 'refunded', 'partially_refunded')
    when 'delivered' then new.status in ('refunded', 'partially_refunded')
    when 'partially_refunded' then new.status in ('refunded', 'partially_refunded')
    else false
  end;

  if not allowed then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

-- The live project already has a trigger that calls this function, but no
-- repository migration creates it. Install it when missing so a fresh staging
-- database enforces the same transitions instead of silently accepting any
-- status update.
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.orders'::regclass
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and p.pronamespace = 'public'::regnamespace
       and p.proname = 'validate_order_status_transition'
  ) then
    drop trigger if exists trg_validate_order_status_transition on public.orders;
    create trigger trg_validate_order_status_transition
      before update of status on public.orders
      for each row
      execute function public.validate_order_status_transition();
  end if;
end $$;

-- Trigger functions cannot be called directly, but keep the default PUBLIC
-- EXECUTE grant off the function for consistency with the other RPCs.
revoke execute on function public.validate_order_status_transition()
  from public, anon, authenticated;
