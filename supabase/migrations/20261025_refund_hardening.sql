-- Refund hardening:
--  * issuing a refund only records a pending refund; it never claims money moved
--  * duplicate/over-refund checks include pending + processing + completed rows
--  * refund completion/failure is restricted to the service role
--  * return status changes require an administrator

create or replace function public.issue_refund(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_return_id uuid default null,
  p_payment_id uuid default null
)
returns public.refunds
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_refund public.refunds;
  v_order public.orders;
  v_reserved numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A refund reason is required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  -- Count pending and processing refunds too: otherwise several pending refunds
  -- can be created that would together exceed the order total.
  select coalesce(sum(amount), 0) into v_reserved
  from public.refunds
  where order_id = p_order_id
    and status in ('pending', 'processing', 'completed');

  if v_reserved + p_amount > v_order.total then
    raise exception 'Refund amount exceeds order total (already reserved %, order total %)',
      v_reserved, v_order.total;
  end if;

  insert into public.refunds (order_id, return_id, payment_id, amount, reason, status, processed_by)
  values (p_order_id, p_return_id, p_payment_id, p_amount, trim(p_reason), 'pending', auth.uid())
  returning * into v_refund;

  return v_refund;
end;
$function$;

create or replace function public.mark_refund_completed(
  p_refund_id uuid,
  p_payment_reference text default null
)
returns public.refunds
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_refund public.refunds;
  v_order public.orders;
  v_total_refunded numeric(12,2);
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then raise exception 'Refund not found'; end if;
  if v_refund.status = 'completed' then
    return v_refund;
  end if;
  if v_refund.status not in ('pending', 'processing') then
    raise exception 'Only pending or processing refunds can be completed';
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  select coalesce(sum(amount), 0) into v_total_refunded
  from public.refunds where order_id = v_refund.order_id and status = 'completed';

  if v_total_refunded + v_refund.amount > v_order.total then
    raise exception 'Completing this refund would exceed the order total (already completed %, this refund %, order total %)',
      v_total_refunded, v_refund.amount, v_order.total;
  end if;

  update public.refunds
  set status = 'completed',
      provider_refund_id = coalesce(p_payment_reference, provider_refund_id),
      updated_at = now()
  where id = p_refund_id
  returning * into v_refund;

  update public.orders
  set status = case
    when v_total_refunded + v_refund.amount >= v_order.total then 'refunded'::public.order_status
    else 'partially_refunded'::public.order_status
  end
  where id = v_refund.order_id;

  return v_refund;
end;
$function$;

create or replace function public.mark_refund_failed(
  p_refund_id uuid,
  p_reason text default null
)
returns public.refunds
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then raise exception 'Refund not found'; end if;
  if v_refund.status = 'completed' then
    raise exception 'A completed refund cannot be marked failed';
  end if;
  if v_refund.status = 'failed' then
    return v_refund;
  end if;

  update public.refunds
  set status = 'failed', updated_at = now()
  where id = p_refund_id
  returning * into v_refund;

  return v_refund;
end;
$function$;

create or replace function public.update_return_status(
  p_return_id uuid,
  p_new_status public.return_status,
  p_resolution_note text default null
)
returns public.returns
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_return public.returns;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.returns
  set status = p_new_status,
      resolution_note = coalesce(p_resolution_note, resolution_note)
  where id = p_return_id
  returning * into v_return;

  if v_return.id is null then
    raise exception 'Return not found';
  end if;
  return v_return;
end;
$function$;

-- Completion/failure are finance actions: only the server (service role) may
-- call them. Issuing a request stays available to authenticated admins and is
-- guarded by is_admin() inside the function.
revoke all on function public.mark_refund_completed(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_refund_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_completed(uuid, text) to service_role;
grant execute on function public.mark_refund_failed(uuid, text) to service_role;

revoke all on function public.issue_refund(uuid, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.issue_refund(uuid, numeric, text, uuid, uuid) to authenticated, service_role;
