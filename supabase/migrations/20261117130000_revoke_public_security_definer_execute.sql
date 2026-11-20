-- ============================================================================
-- P0 SECURITY - revoke PUBLIC/anon EXECUTE on SECURITY DEFINER functions
-- Verified live (2026-11-17, ref httywgkwfqvrbuwuzutu):
--   confirm_order_payment(uuid,text,text,numeric,jsonb,text)
--     prosecdef=true, proconfig={search_path=public},
--     proacl={=X/postgres, postgres=X/postgres, service_role=X/postgres}
--     Body checks provider, amount, currency and payment-reference uniqueness,
--     but has NO auth.uid(), is_admin() or owns_order() check. Any anonymous
--     caller who knows an order UUID can call it through
--     /rest/v1/rpc/confirm_order_payment, insert a "succeeded" payment and
--     flip a pending order to paid without paying.
--     The app never calls this function (only generated TS types mention it);
--     server/webhook flows use complete_zero_total_order / pay_with_cod /
--     initiate_external_wallet_payment. service_role keeps EXECUTE.
--
--   sync_product_available_colors(uuid) and the two colour-sync trigger
--     functions are also PUBLIC/anon/authenticated executable; the direct
--     function lets an anonymous caller rewrite any product's colour fields.
--     Trigger functions are checked at CREATE TRIGGER time, not at fire time,
--     so revoking EXECUTE does not break the existing product triggers.
--
-- Local only. NOT applied to production by this audit.
-- ============================================================================

revoke execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, numeric, jsonb, text)
  to service_role;

revoke execute on function public.sync_product_available_colors(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_product_available_colors(uuid)
  to service_role;

revoke execute on function public.trg_sync_colors_from_variant()
  from public, anon, authenticated;
revoke execute on function public.trg_sync_colors_from_variant_options()
  from public, anon, authenticated;

-- Verification: none of these functions may retain an unqualified "=X/" grant
-- or an anon/authenticated grant.
select p.proname, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'confirm_order_payment',
    'sync_product_available_colors',
    'trg_sync_colors_from_variant',
    'trg_sync_colors_from_variant_options'
  )
order by p.proname;
