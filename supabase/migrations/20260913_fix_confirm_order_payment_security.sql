-- ============================================================
-- SECURITY FIX: confirm_order_payment
-- Date: 2026-09-13
--
-- Vulnerability: The live function accepts any p_amount without
--   validating it against the authoritative order total. An
--   attacker with the function signature could confirm a $0
--   payment on a $500 order, or overpay to manipulate wallet
--   balances. Additionally, no audit trail is written to
--   order_status_history, and there is no row-level locking
--   to prevent race conditions.
--
-- Fixes:
--   1. Lock order row FOR UPDATE to prevent races
--   2. Validate order status is 'pending' before confirming
--   3. Validate payment amount matches order total (within $0.01)
--   4. Idempotent: return existing order if already 'paid'
--   5. Log status change to order_status_history
--
-- Signature preserved: same parameters, same return type.
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
DECLARE
  v_order orders;
BEGIN
  -- Lock the order row to prevent concurrent modifications
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent: if already paid, return without side effects
  IF v_order.status = 'paid' THEN
    RETURN v_order;
  END IF;

  -- Only pending orders can be confirmed as paid
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Order % cannot be confirmed: current status is %, expected pending',
      p_order_id, v_order.status;
  END IF;

  -- Validate payment amount matches order total (within $0.01 tolerance)
  IF abs(p_amount - v_order.total) > 0.01 THEN
    RAISE EXCEPTION 'Payment amount mismatch: expected %, got %',
      v_order.total, p_amount;
  END IF;

  -- Record the payment (idempotent on provider+provider_payment_id)
  INSERT INTO public.payments (order_id, provider, provider_payment_id, amount, status, raw_response)
  VALUES (p_order_id, p_provider, p_provider_payment_id, p_amount, 'succeeded', p_raw_response)
  ON CONFLICT (provider, provider_payment_id)
  DO UPDATE SET status = 'succeeded', raw_response = EXCLUDED.raw_response;

  -- Update order status to paid
  UPDATE public.orders
  SET status = 'paid', updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Log the status change to order_status_history
  INSERT INTO public.order_status_history (order_id, old_status, new_status, changed_by, note)
  VALUES (p_order_id, 'pending', 'paid', auth.uid(), 'Payment confirmed via ' || p_provider);

  RETURN v_order;
END;
$function$;
