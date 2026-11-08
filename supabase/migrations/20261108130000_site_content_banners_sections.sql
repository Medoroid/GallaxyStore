-- Admin-managed storefront content: banners and sections.
--
-- Banners are image/text promos placed into named zones on a page (top strip,
-- under the hero, mid page, before the footer CTA). Sections are richer
-- content blocks (rich text, image+text, card grids, CTA) placed in the same
-- zones. Both share one lifecycle:
--   * writes go through the admin API with the service role (bypasses RLS),
--   * the public storefront reads only active rows whose schedule window is
--     open (RLS), ordered by sort_order,
--   * ordering/visibility never depends on client-supplied data.
--
-- Idempotent on purpose: this repository's migration chain cannot rebuild the
-- schema from scratch (docs/DATABASE-INTEGRITY-REPORT.md §7), so every object
-- below uses IF NOT EXISTS / OR REPLACE / drop-then-create and can be pasted
-- into the Supabase SQL editor more than once.

create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  placement text not null default 'after_hero',
  title text,
  subtitle text,
  image_url text,
  link_url text,
  button_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_banners_page_check check (page ~ '^[a-z0-9_-]{1,40}$'),
  constraint site_banners_placement_check check (
    placement in ('top_strip', 'after_hero', 'mid_page', 'before_footer')
  ),
  constraint site_banners_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  placement text not null default 'mid_page',
  section_type text not null default 'rich_text',
  eyebrow text,
  title text,
  body text,
  image_url text,
  link_url text,
  button_label text,
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_sections_page_check check (page ~ '^[a-z0-9_-]{1,40}$'),
  constraint site_sections_placement_check check (
    placement in ('after_hero', 'mid_page', 'before_footer')
  ),
  constraint site_sections_type_check check (
    section_type in ('rich_text', 'image_text', 'cards', 'cta')
  ),
  constraint site_sections_window_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create index if not exists site_banners_zone_idx
  on public.site_banners (page, placement, sort_order);

create index if not exists site_banners_active_idx
  on public.site_banners (page, placement)
  where is_active;

create index if not exists site_sections_zone_idx
  on public.site_sections (page, placement, sort_order);

create index if not exists site_sections_active_idx
  on public.site_sections (page, placement)
  where is_active;

alter table public.site_banners enable row level security;
alter table public.site_sections enable row level security;

-- Public storefront: only active rows inside their schedule window.
drop policy if exists site_banners_public_select on public.site_banners;
create policy site_banners_public_select
  on public.site_banners
  for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists site_sections_public_select on public.site_sections;
create policy site_sections_public_select
  on public.site_sections
  for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- Admins may also manage content from an authenticated browser client; the
-- admin API normally uses the service role, which bypasses RLS entirely.
drop policy if exists site_banners_admin_all on public.site_banners;
create policy site_banners_admin_all
  on public.site_banners
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_sections_admin_all on public.site_sections;
create policy site_sections_admin_all
  on public.site_sections
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Least privilege: the storefront only ever reads.
revoke all on public.site_banners from public, anon, authenticated;
grant select on public.site_banners to anon, authenticated;
grant all on public.site_banners to service_role;

revoke all on public.site_sections from public, anon, authenticated;
grant select on public.site_sections to anon, authenticated;
grant all on public.site_sections to service_role;

drop trigger if exists set_site_banners_updated_at on public.site_banners;
create trigger set_site_banners_updated_at
  before update on public.site_banners
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_site_sections_updated_at on public.site_sections;
create trigger set_site_sections_updated_at
  before update on public.site_sections
  for each row
  execute function public.set_updated_at();

-- Public storage bucket for banner/section imagery (admin uploads use the
-- service role; the storefront reads the public URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-banners',
  'site-banners',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_banners_storage_public_read on storage.objects;
create policy site_banners_storage_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'site-banners');

drop policy if exists site_banners_storage_admin_insert on storage.objects;
create policy site_banners_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'site-banners' and public.is_admin());

drop policy if exists site_banners_storage_admin_update on storage.objects;
create policy site_banners_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'site-banners' and public.is_admin());

drop policy if exists site_banners_storage_admin_delete on storage.objects;
create policy site_banners_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'site-banners' and public.is_admin());
