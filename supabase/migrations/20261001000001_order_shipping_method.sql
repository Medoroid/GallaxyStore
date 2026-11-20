-- Delivery method chosen at checkout ("nature of the order": express vs standard).
-- Run this in the Supabase SQL Editor (or `supabase db push`).

alter table public.orders
  add column if not exists shipping_method_id uuid
  references public.shipping_methods (id)
  on delete set null;

create index if not exists orders_shipping_method_id_idx
  on public.orders (shipping_method_id);

-- Backfill orders that already have a shipment carrying the method.
update public.orders o
   set shipping_method_id = s.shipping_method_id
  from (
        select distinct on (order_id) order_id, shipping_method_id
          from public.shipments
         where shipping_method_id is not null
         order by order_id, created_at desc
       ) s
 where o.id = s.order_id
   and o.shipping_method_id is null;

-- orders UPDATE is admin-only in RLS, so the customer cannot write this
-- column directly — expose a owner-checked SECURITY DEFINER setter instead.
create or replace function public.set_order_shipping_method(
  p_order_id uuid,
  p_shipping_method_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.orders where id = p_order_id;

  if v_owner is null then
    raise exception 'Order not found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Not your order';
  end if;

  update public.orders
     set shipping_method_id = p_shipping_method_id,
         updated_at = now()
   where id = p_order_id;
end;
$$;

grant execute on function public.set_order_shipping_method(uuid, uuid) to authenticated;
revoke execute on function public.set_order_shipping_method(uuid, uuid) from anon;
