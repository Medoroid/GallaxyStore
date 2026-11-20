-- ROLLBACK PROCEDURES — READ THIS FILE, DO NOT RUN IT BLINDLY.
-- Primary rollback = restore the backup taken before deployment (schema + data + storage).
-- Every statement below is COMMENTED OUT on purpose; a human must uncomment only the
-- exact reversal needed, after approval, and must run postcheck again.

-- 0) Before deployment, capture definitions for anything that will be replaced:
-- select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public'
--    and p.proname in ('confirm_order_payment','verify_vodafone_cash_payment',
--                      'request_vendor_payout','approve_vendor_payout_request',
--                      'cancel_order','restock_on_order_cancel');

-- 1) P0 security grants: DO NOT roll these back in normal circumstances.
-- Re-enabling anon EXECUTE on payment functions reopens a critical vulnerability.
-- If a human explicitly accepts the risk, the exact GRANT must be written by hand.

-- 2) cancel_order double-restock fix — restore the captured pre-fix function
-- from the backup/snapshot (placeholder only):
-- create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
-- returns public.orders language plpgsql security definer set search_path to 'public'
-- as $fn$ <PASTE_CAPTURED_DEFINITION_HERE> $fn$;

-- 3) Vendor payout 3-arg RPC — restore captured 2-arg definition and grants:
-- drop function if exists public.request_vendor_payout(uuid, numeric, text);
-- create or replace function public.request_vendor_payout(p_store_id uuid, p_amount numeric)
-- returns public.vendor_payout_requests language plpgsql security definer
-- set search_path to 'public' as $fn$ <PASTE_CAPTURED_DEFINITION_HERE> $fn$;
-- grant execute on function public.request_vendor_payout(uuid, numeric)
--   to authenticated, service_role;

-- 4) Financial RLS hardening — widen a specific policy back to public (only if required):
-- alter policy vendor_earnings_select_owner_or_admin on public.vendor_earnings to public;
-- ...repeat only for the exact policy that must be reverted.

-- 5) Vendor views security_invoker — reset a specific view (not all blindly):
-- alter view public.vendor_order_items reset (security_invoker);

-- 6) Duplicate-index cleanup — recreate the exact dropped index, concurrently:
-- create index concurrently idx_order_items_order on public.order_items (order_id);
-- create index concurrently idx_recently_viewed_session_product
--   on public.recently_viewed_products (session_token, product_id) where session_token is not null;
-- create index concurrently idx_recently_viewed_user_product
--   on public.recently_viewed_products (user_id, product_id) where user_id is not null;
-- create index concurrently idx_reviews_product
--   on public.reviews (product_id, status) where deleted_at is null;

-- 7) After any rollback: re-run 02_POSTCHECK.sql and record the output.
