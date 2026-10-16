-- reconcile_payments() runs every 15 minutes from pg_cron and used to mark
-- EVERY pending payment as failed after 24h. That broke two real flows:
--   * Cash on delivery: nothing is charged online, so a COD payment is meant
--     to stay pending until delivery — customers were getting a
--     "Payment failed" notification for orders they never paid for.
--   * Vodafone Cash: the receipt is verified manually by an admin, with no
--     deadline — the sweep turned the payment into "Rejected" and hid the
--     Confirm/Reject buttons in the admin panel.
-- Only real gateway payments (Stripe / Paymob) can time out now.
-- Run this in the Supabase SQL Editor.

create or replace function public.reconcile_payments()
returns table(order_id uuid, old_payment_status text, new_payment_status text, action text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  with computed as (
    select o.id as oid, o.status::text as old_status, o.total,
      coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id and p.status = 'succeeded'), 0) as paid
    from public.orders o
    where o.deleted_at is null and o.status = 'pending'
  )
  update public.orders o
  set status = 'paid'
  from computed c
  where o.id = c.oid and c.total > 0 and c.paid >= c.total
  returning o.id, c.old_status, 'paid'::text, 'payment_status_corrected'::text;

  -- Only gateway payments really expire. COD, wallet and Vodafone Cash are
  -- settled outside the payment page and must never be auto-failed.
  update public.payments
  set status = 'failed', failure_code = 'timeout',
      failure_message = 'Auto-failed by reconciliation: no confirmation within 24h'
  where status in ('pending', 'processing')
    and provider in ('stripe', 'paymob')
    and created_at < now() - interval '24 hours';
end;
$$;

-- Backfill: undo the damage already done to COD payments that are still
-- awaiting delivery (their orders are still pending / not yet delivered).
update public.payments
set status = 'pending',
    failure_code = null,
    failure_message = null,
    updated_at = now()
where provider = 'cod'
  and status = 'failed'
  and failure_code = 'timeout'
  and exists (
    select 1 from public.orders o
    where o.id = payments.order_id
      and o.status in ('pending', 'paid', 'processing', 'printing', 'shipped')
  );
