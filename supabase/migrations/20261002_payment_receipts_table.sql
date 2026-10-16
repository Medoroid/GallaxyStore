-- 20261002_payment_receipts_table.sql
-- Create a separate table for payment receipts to track all submission attempts.

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  transfer_reference text not null,
  payer_phone text not null,
  receipt_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for payment_receipts
alter table public.payment_receipts enable row level security;

create policy "Users can view their own receipts" on public.payment_receipts
  for select to authenticated
  using (user_id = auth.uid());

create policy "Admins can view all receipts" on public.payment_receipts
  for all to authenticated
  using (public.is_admin());

-- Update submit_vodafone_cash_receipt to use the new table
create or replace function public.submit_vodafone_cash_receipt(
  p_order_id uuid,
  p_payer_phone text,
  p_transfer_reference text,
  p_receipt_path text
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment_id uuid;
  v_receipt_id uuid;
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

  -- Ensure the transfer reference hasn't been used by another order's approved/pending receipt
  if exists (
    select 1 from public.payment_receipts
     where provider = 'vodafone_cash'
       and transfer_reference = v_reference
       and payment_id not in (select id from public.payments where order_id = p_order_id)
       and status in ('pending', 'approved')
  ) then
    raise exception 'That transfer reference is already used by another order';
  end if;

  -- Create or get the base payment record
  select id into v_payment_id
    from public.payments
   where order_id = p_order_id
     and provider = 'vodafone_cash'
   limit 1;

  if v_payment_id is null then
    insert into public.payments
      (order_id, provider, amount, currency, status)
    values
      (p_order_id, 'vodafone_cash', v_order.total, v_order.currency, 'pending')
    returning id into v_payment_id;
  else
    -- If a previous payment was marked failed/rejected, reset to pending
    update public.payments
       set status = 'pending',
           updated_at = now()
     where id = v_payment_id;
  end if;

  -- Insert the new receipt attempt
  insert into public.payment_receipts
    (payment_id, user_id, provider, transfer_reference, payer_phone, receipt_url)
  values
    (v_payment_id, v_uid, 'vodafone_cash', v_reference, v_phone, v_path)
  returning id into v_receipt_id;

  return (select pr from public.payment_receipts pr where pr.id = v_receipt_id);
end;
$$;

-- Update verify function to act on the receipt and sync to payment/order
create or replace function public.verify_vodafone_cash_payment(
  p_receipt_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.payment_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.payment_receipts;
  v_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select * into v_receipt from public.payment_receipts where id = p_receipt_id for update;

  if v_receipt.id is null then
    raise exception 'Receipt not found';
  end if;

  if v_receipt.status <> 'pending' then
    raise exception 'Receipt is already %', v_receipt.status;
  end if;

  -- Update receipt
  update public.payment_receipts
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_notes = p_note,
         verified_by = auth.uid(),
         verified_at = now(),
         updated_at = now()
   where id = p_receipt_id;

  -- Update payment
  update public.payments
     set status = case when p_approve then 'succeeded' else 'failed' end,
         provider_payment_id = case when p_approve then v_receipt.transfer_reference else provider_payment_id end,
         updated_at = now()
   where id = v_receipt.payment_id
   returning order_id into v_order_id;

  -- If approved, update order
  if p_approve then
    update public.orders
       set status = 'paid'
     where id = v_order_id
       and status = 'pending';
  end if;

  return (select pr from public.payment_receipts pr where pr.id = p_receipt_id);
end;
$$;
