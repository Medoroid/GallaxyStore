-- ============================================================
-- Migration: Fix view RLS, confirm_order_payment security
-- Date: 2026-09-10
-- Safe: Uses CREATE OR REPLACE, no destructive changes
-- ============================================================

-- ============================================================
-- Fix 1: Enable RLS on order_summary view
-- ============================================================
ALTER VIEW public.order_summary SET (security_invoker = true);
ALTER TABLE public.order_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_summary_select_owner_or_admin"
  ON public.order_summary
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

-- ============================================================
-- Fix 2: Enable RLS on order_items_detailed view
-- ============================================================
ALTER VIEW public.order_items_detailed SET (security_invoker = true);
ALTER TABLE public.order_items_detailed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_detailed_select_owner_or_admin"
  ON public.order_items_detailed
  FOR SELECT
  USING (
    order_owner_id = auth.uid()
    OR public.is_admin()
  );

-- ============================================================
-- Fix 3: Add ownership check to confirm_order_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_raw_response jsonb DEFAULT NULL::jsonb
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_order public.orders;
  v_order_user_id uuid;
begin
  -- Verify order exists and get owner
  select user_id into v_order_user_id from public.orders where id = p_order_id;
  if v_order_user_id is null then
    raise exception 'Order not found';
  end if;

  -- Idempotent: skip if already confirmed
  select * into v_order from public.orders where id = p_order_id;
  if v_order.status = 'paid' then
    return v_order;
  end if;

  -- Insert payment with idempotency
  insert into public.payments (order_id, provider, provider_payment_id, amount, status, raw_response)
  values (p_order_id, p_provider, p_provider_payment_id, p_amount, 'succeeded', p_raw_response)
  on conflict (provider, provider_payment_id) do update set status = 'succeeded', raw_response = excluded.raw_response;

  -- Update order status
  update public.orders set status = 'paid' where id = p_order_id returning * into v_order;

  return v_order;
end;
$function$;
