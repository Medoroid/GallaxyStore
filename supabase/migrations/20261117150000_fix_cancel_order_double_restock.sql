-- ============================================================================
-- P0 INVENTORY INTEGRITY â€” cancel_order restocks stock twice
--
-- Verified live 2026-11-17 (ref httywgkwfqvrbuwuzutu):
--   public.cancel_order() has an inline loop that does
--     update product_variants set stock_quantity = stock_quantity + oi.quantity
--   and then sets orders.status='cancelled', which fires
--     trg_restock_on_order_cancel -> restock_on_order_cancel()
--   which performs the SAME increment again. Net effect: 2x the ordered
--   quantity is returned to stock on every cancellation through the RPC.
--
-- Fix: make the trigger the SINGLE restock authority. Removing the inline loop
-- also keeps the gift-box migration (20261117140000) correct when it is later
-- applied: its trigger version restocks both line variants and components,
-- exactly once, while this function only flips statuses.
--
-- Local only. NOT applied to production by this audit.
-- Apply in a transaction, after taking a backup, and run the verification
-- query below. Rollback: re-create the previous function from
-- pg_get_functiondef() captured before applying (or restore from backup).
-- ============================================================================


create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
begin
  if not public.owns_order(p_order_id) then
    raise exception 'Order not found or access denied';
  end if;

  -- Serialise concurrent cancellations of the same order.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status not in ('pending', 'paid') then
    raise exception 'Orders can only be cancelled while pending or paid, not %', v_order.status;
  end if;

  -- Do NOT touch product_variants here. trg_restock_on_order_cancel is the
  -- single restock path (line variants today; + gift-box components once
  -- 20261117140000 is applied). Its WHEN clause also makes it one-shot.
  update public.order_items
     set status = 'cancelled'
   where order_id = p_order_id
     and status is distinct from 'cancelled';

  update public.orders
     set status = 'cancelled'
   where id = p_order_id
  returning * into v_order;

  if p_reason is not null then
    update public.order_status_history
       set note = p_reason
     where id = (
       select id from public.order_status_history
        where order_id = p_order_id
        order by created_at desc
        limit 1
     );
  end if;

  return v_order;
end;
$function$;


-- Verification (read-only): cancel_order must be false, trigger true.
select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%stock_quantity = stock_quantity +%' as increments_stock
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cancel_order', 'restock_on_order_cancel')
order by p.proname;