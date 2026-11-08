-- Administrative audit trail.
--
-- Role changes, store moderation, order/payment decisions and refund state
-- changes are recorded here. The table is service-role only: admins read it
-- through a server API, never directly from the browser.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id);

alter table public.admin_audit_log enable row level security;

-- No policies: anon/authenticated must not read or write the audit trail.
revoke all on public.admin_audit_log from public, anon, authenticated;
grant all on public.admin_audit_log to service_role;
