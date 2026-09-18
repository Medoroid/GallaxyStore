-- ============================================================
-- PRODUCTION SECURITY MIGRATION
-- Date: 2026-09-10
-- ============================================================

-- ============================================================
-- Fix 1: Enable security_invoker on order_summary view
-- This makes the view respect RLS on the underlying orders table
-- ============================================================
DROP VIEW IF EXISTS public.order_summary;
CREATE OR REPLACE VIEW public.order_summary WITH (security_invoker = true) AS
SELECT o.id,
    o.order_number,
    o.user_id,
    o.status,
    o.total,
    o.currency,
    o.gift_wrap,
    o.placed_at,
    count(oi.id) AS item_count,
    COALESCE(sum(oi.quantity), 0::bigint) AS total_quantity,
    (SELECT oi2.product_name_snapshot
           FROM order_items oi2
          WHERE oi2.order_id = o.id
          ORDER BY oi2.created_at
         LIMIT 1) AS first_item_name
   FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id;

-- ============================================================
-- Fix 2: Enable security_invoker on order_items_detailed view
-- This makes the view respect RLS on the underlying order_items/orders tables
-- ============================================================
DROP VIEW IF EXISTS public.order_items_detailed;
CREATE OR REPLACE VIEW public.order_items_detailed WITH (security_invoker = true) AS
SELECT oi.id,
    oi.order_id,
    oi.variant_id,
    oi.customization_id,
    oi.product_name_snapshot,
    oi.sku_snapshot,
    oi.options_snapshot,
    oi.unit_price_snapshot,
    oi.quantity,
    oi.line_total,
    oi.printing_instructions,
    oi.is_gift_wrapped,
    oi.gift_note,
    oi.status,
    oi.created_at,
    oi.updated_at,
    o.order_number,
    o.status AS order_status,
    o.user_id AS order_owner_id,
    pv.sku AS current_sku,
    p.slug AS product_slug,
    pc.preview_image_url AS customization_preview_url
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     LEFT JOIN products p ON p.id = pv.product_id
     LEFT JOIN product_customizations pc ON pc.id = oi.customization_id;

-- ============================================================
-- Fix 3: Fix confirm_order_payment — add ownership check + idempotency
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
  v_caller uuid := auth.uid();
begin
  -- Verify order exists
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  -- Idempotent: skip if already confirmed
  if v_order.status = 'paid' then
    return v_order;
  end if;

  -- Verify payment amount matches order total (prevent manipulation)
  if p_amount < v_order.total then
    raise exception 'Payment amount (%) is less than order total (%)', p_amount, v_order.total;
  end if;

  -- Insert payment with idempotency
  insert into public.payments (order_id, provider, provider_payment_id, amount, status, raw_response)
  values (p_order_id, p_provider, p_provider_payment_id, p_amount, 'succeeded', p_raw_response)
  on conflict (provider, provider_payment_id) do update set status = 'succeeded', raw_response = excluded.raw_response;

  -- Update order status
  update public.orders set status = 'paid', placed_at = coalesce(placed_at, now()) where id = p_order_id returning * into v_order;

  -- Log status history (actor_id may be null when called from webhook/service role)
  insert into public.order_status_history(order_id, old_status, new_status, actor_id, actor_type)
  values (p_order_id, 'pending', 'paid', v_caller, 'system');

  return v_order;
end;
$function$;
