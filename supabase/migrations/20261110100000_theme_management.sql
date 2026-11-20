-- Theme Management System: store_themes, theme_assets, theme_settings,
-- theme_schedule_history, theme_versions + the public theme-assets bucket.
--
-- STATUS: PREPARED, NOT APPLIED. Production is read-only by policy — the owner
-- must review and apply this file (Supabase SQL editor or `supabase db push`)
-- before Theme Studio can persist anything. Until then every theme read
-- degrades gracefully to the built-in Galaxy Store default
-- (see lib/themes/server.ts), so the storefront is unaffected.
--
-- Lifecycle:
--   * writes go through the admin Theme Studio API with the service role
--     (verifyAdmin -> getServiceRoleClient), which bypasses RLS;
--   * anon may only ever see published rows (status active/scheduled);
--   * theme_versions is append-only: every publish/activate stores a snapshot
--     that can be compared and restored;
--   * theme_schedule_history records every lifecycle action for auditing.
--
-- Idempotent on purpose (IF NOT EXISTS / OR REPLACE / drop-then-create), like
-- the rest of this migration chain: safe to paste into the SQL editor more
-- than once. Never edit an already-applied migration — add a new file instead.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.store_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  category text not null default 'custom',
  preview_image text,
  theme_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  priority integer not null default 0,
  activation_mode text not null default 'manual',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  is_recurring boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_themes_slug_check check (slug ~ '^[a-z0-9-]{1,60}$'),
  constraint store_themes_category_check check (category ~ '^[a-z0-9_-]{1,40}$'),
  constraint store_themes_name_check check (char_length(name) between 1 and 100),
  constraint store_themes_status_check check (
    status in ('draft', 'scheduled', 'active', 'archived')
  ),
  constraint store_themes_mode_check check (
    activation_mode in ('manual', 'scheduled')
  ),
  constraint store_themes_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),
  constraint store_themes_timezone_check check (char_length(timezone) between 1 and 64)
);

create table if not exists public.theme_assets (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.store_themes (id) on delete cascade,
  asset_type text not null,
  asset_url text not null,
  mobile_asset_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint theme_assets_type_check check (
    asset_type in (
      'background_desktop', 'background_mobile',
      'banner_desktop', 'banner_mobile',
      'icon', 'logo', 'artwork'
    )
  ),
  constraint theme_assets_url_check check (char_length(asset_url) <= 2048)
);

-- Single-row settings table: id is fixed so the admin API can upsert it.
create table if not exists public.theme_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  default_theme_id uuid references public.store_themes (id) on delete set null,
  manual_override_theme_id uuid references public.store_themes (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint theme_settings_single_row check (
    id = '00000000-0000-0000-0000-000000000001'
  )
);

create table if not exists public.theme_schedule_history (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid references public.store_themes (id) on delete set null,
  action text not null,
  previous_theme_id uuid references public.store_themes (id) on delete set null,
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now(),
  constraint theme_schedule_history_action_check check (
    action in (
      'create', 'update', 'publish', 'activate', 'deactivate', 'schedule',
      'archive', 'delete', 'override', 'clear_override', 'set_default',
      'restore_default', 'restore_version'
    )
  )
);

create table if not exists public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.store_themes (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint theme_versions_version_check check (version >= 1),
  constraint theme_versions_theme_version_key unique (theme_id, version)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists store_themes_status_idx
  on public.store_themes (status);

create index if not exists store_themes_window_idx
  on public.store_themes (starts_at, ends_at);

create index if not exists store_themes_priority_idx
  on public.store_themes (priority desc, updated_at desc);

create index if not exists theme_versions_theme_idx
  on public.theme_versions (theme_id, version desc);

create index if not exists theme_schedule_history_theme_idx
  on public.theme_schedule_history (theme_id, performed_at desc);

create index if not exists theme_assets_theme_idx
  on public.theme_assets (theme_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.store_themes enable row level security;
alter table public.theme_assets enable row level security;
alter table public.theme_settings enable row level security;
alter table public.theme_schedule_history enable row level security;
alter table public.theme_versions enable row level security;

-- Storefront: published themes only. Drafts/archived rows are never visible
-- to anon (the resolution engine reads with the service role anyway).
drop policy if exists store_themes_public_select on public.store_themes;
create policy store_themes_public_select
  on public.store_themes
  for select
  to anon, authenticated
  using (status in ('active', 'scheduled'));

drop policy if exists store_themes_admin_all on public.store_themes;
create policy store_themes_admin_all
  on public.store_themes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Settings: admins may read from a browser client; all writes happen through
-- the service-role API. anon has no policy and no grant — invisible.
drop policy if exists theme_settings_admin_select on public.theme_settings;
create policy theme_settings_admin_select
  on public.theme_settings
  for select
  to authenticated
  using (public.is_admin());

-- theme_versions / theme_schedule_history / theme_assets intentionally have
-- NO client policies: snapshots, audit history and asset rows are only ever
-- touched by the service role (they are not public data; the images themselves
-- are served from a public storage bucket via their URLs).

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

revoke all on public.store_themes from public, anon, authenticated;
grant select on public.store_themes to anon, authenticated;
grant all on public.store_themes to service_role;

revoke all on public.theme_settings from public, anon, authenticated;
grant select on public.theme_settings to authenticated;
grant all on public.theme_settings to service_role;

revoke all on public.theme_versions from public, anon, authenticated;
grant all on public.theme_versions to service_role;

revoke all on public.theme_schedule_history from public, anon, authenticated;
grant all on public.theme_schedule_history to service_role;

revoke all on public.theme_assets from public, anon, authenticated;
grant all on public.theme_assets to service_role;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_store_themes_updated_at on public.store_themes;
create trigger set_store_themes_updated_at
  before update on public.store_themes
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_theme_settings_updated_at on public.theme_settings;
create trigger set_theme_settings_updated_at
  before update on public.theme_settings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Singleton settings row
-- ---------------------------------------------------------------------------

insert into public.theme_settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: public theme-assets bucket (backgrounds, banners, decorations).
-- Mirrors the site-banners bucket: public read, is_admin() writes only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'theme-assets',
  'theme-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists theme_assets_storage_public_read on storage.objects;
create policy theme_assets_storage_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'theme-assets');

drop policy if exists theme_assets_storage_admin_insert on storage.objects;
create policy theme_assets_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'theme-assets' and public.is_admin());

drop policy if exists theme_assets_storage_admin_update on storage.objects;
create policy theme_assets_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'theme-assets' and public.is_admin());

drop policy if exists theme_assets_storage_admin_delete on storage.objects;
create policy theme_assets_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'theme-assets' and public.is_admin());
