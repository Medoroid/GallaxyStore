-- ============================================================================
-- P0 — remove the security_definer_view advisory on the 19 public.vendor_*
-- views. Definer rights let a view bypass the caller's RLS on base tables;
-- with security_invoker=true the querying role's RLS applies, which is what
-- multi-tenant isolation requires.
--
-- Note: 20261118110000 is already used by the RLS/grants migration, so the
-- next free slot (20261118120000) is used for this file.
--
-- Local/Staging validated: npx supabase db reset + 126/126 integration tests.
-- DO NOT APPLY TO PRODUCTION without the human-approved runbook.
-- ============================================================================

do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname like 'vendor_%'
     order by c.relname
  loop
    execute format('alter view public.%I set (security_invoker = true)', v.relname);
    execute format('revoke all on table public.%I from public, anon', v.relname);
    execute format('grant select on table public.%I to authenticated, service_role', v.relname);
  end loop;
end $$;

-- Verification (read-only):
-- select c.relname, c.reloptions from pg_class c
--  join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and c.relkind='v' and c.relname like 'vendor_%'
-- order by c.relname;
-- All 19 rows must contain security_invoker=true.
