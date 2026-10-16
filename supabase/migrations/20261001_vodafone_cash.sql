-- Vodafone Cash (manual transfer + receipt verification) payment flow.
-- Run this in the Supabase SQL Editor (or `supabase db push`).

-- 1) New payment provider ----------------------------------------------------
alter type public.payment_provider
  add value if not exists 'vodafone_cash';

-- 2) Private bucket for transfer receipts ------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipt upload own folder" on storage.objects;
create policy "receipt upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt readable by owner" on storage.objects;
create policy "receipt readable by owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipt readable by admin" on storage.objects;
create policy "receipt readable by admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-receipts' and public.is_admin());

-- 3) Customer submits phone + transfer reference + receipt -------------------
create or replace function public.submit_vodafone_cash_receipt(
  p_order_id uuid,
  p_payer_phone text,
  p_transfer_reference text,
  p_receipt_path text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment_id uuid;
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  v_phone text := nullif(trim(coalesce(p_payer_phone, '')), '');
  v_path text := nullif(trim(coalesce(p_receipt_path, '')), '');
begin
  if v_uid is null then
    raise exception 'Must be authenticated';
  end if;

  if v_phone is null then
    raise exception 'Payer phone is required';
  end if;
  if v_reference is null then
    raise exception 'Transfer reference is required';
  end if;
  if v_path is null then
    raise exception 'Receipt image is required';
  end if;

  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null or v_order.user_id <> v_uid then
    raise exception 'Order not found or access denied';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order is not awaiting payment';
  end if;

  if exists (
    select 1 from public.payments
     where provider = 'vodafone_cash'
       and provider_payment_id = v_reference
       and order_id <> p_order_id
  ) then
    raise exception 'That transfer reference is already used by another order';
  end if;

  select id into v_payment_id
    from public.payments
   where order_id = p_order_id
     and provider = 'vodafone_cash'
   limit 1;

  if v_payment_id is null then
    insert into public.payments
      (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
    values
      (p_order_id, 'vodafone_cash', v_reference, v_order.total, v_order.currency, 'pending',
       jsonb_build_object(
         'payer_phone', v_phone,
         'receipt_path', v_path,
         'uploaded_at', now()
       ))
    returning id into v_payment_id;
  else
    update public.payments
       set provider_payment_id = v_reference,
           amount = v_order.total,
           currency = v_order.currency,
           status = 'pending',
           raw_response = jsonb_build_object(
             'payer_phone', v_phone,
             'receipt_path', v_path,
             'uploaded_at', now()
           ),
           updated_at = now()
     where id = v_payment_id;
  end if;

  return (select p from public.payments p where p.id = v_payment_id);
end;
$$;

grant execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text)
  to authenticated;
revoke execute on function public.submit_vodafone_cash_receipt(uuid, text, text, text)
  from anon;

-- 4) Admin verifies the transfer ---------------------------------------------
create or replace function public.verify_vodafone_cash_payment(
  p_order_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  select * into v_payment
    from public.payments
   where order_id = p_order_id
     and provider = 'vodafone_cash'
   order by created_at desc
   limit 1;

  if v_payment.id is null then
    raise exception 'No Vodafone Cash payment found for this order';
  end if;

  if p_approve then
    update public.payments
       set status = 'succeeded',
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'verified_by', auth.uid(),
             'verified_at', now(),
             'verify_note', p_note
           ),
           updated_at = now()
     where id = v_payment.id;

    -- The trigger sync_order_payment_status() usually flips the order already;
    -- this is a guarded fallback so we never attempt an illegal transition
    -- (e.g. pending -> paid when the order already moved to 'processing').
    update public.orders
       set status = 'paid'
     where id = p_order_id
       and status = 'pending';

    select * into v_order from public.orders where id = p_order_id;
  else
    update public.payments
       set status = 'failed',
           raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
             'verified_by', auth.uid(),
             'verified_at', now(),
             'verify_note', p_note,
             'rejected', true
           ),
           updated_at = now()
     where id = v_payment.id;
  end if;

  return v_order;
end;
$$;

grant execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  to authenticated;
revoke execute on function public.verify_vodafone_cash_payment(uuid, boolean, text)
  from anon;
