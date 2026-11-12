-- ============================================================================
-- PENDING MIGRATIONS BUNDLE - run once in the Supabase SQL Editor
-- Generated: 2026-11-12 | Project: httywgkwfqvrbuwuzutu (galaxy-store)
--
-- WHY THIS FILE EXISTS:
--   supabase db push is blocked on this repo (remote history holds ~200 July
--   migrations that have no local files -> LegacyDbPushMissingLocalError), so
--   the six pending migrations below must be applied manually. Every section
--   is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING), so
--   re-running the whole bundle is safe.
--
-- HOW TO APPLY:
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file and press Run (one run, all six migrations)
--   3. The verification SELECTs at the end must all report ok / one row
--
-- CONTENTS (in dependency order):
--   1. 20261101_add_gift_box_product_type      - allows 'gift_box' request type
--   2. 20261108130000_site_content_*           - site_banners/site_sections (kills the homepage 404s)
--   3. 20261110100000_theme_management         - Theme Studio tables + theme-assets bucket
--   4. 20261110120000_creator_studio_core      - creator studio tables + buckets
--   5. 20261110160000_creator_studio_seed      - creator template seed data
--   6. 20261112090000_fix_admin_product_*      - top-products view: exclude pending orders
-- ============================================================================

-- ============================================================================
-- BEGIN 20261101_add_gift_box_product_type.sql
-- ============================================================================
-- =============================================================================
-- Migration: allow 'gift_box' product type on custom_print_requests
-- Prepared:  2026-11-01 (production remediation — A2 Gift Boxes)
-- STATUS:    LOCAL ONLY — NOT APPLIED TO PRODUCTION. Requires explicit human
--            approval before running against the production project.
--
-- WHY:       /api/gift-box inserts gift-box requests into the existing
--            custom_print_requests queue (single admin view, existing status
--            workflow, existing SELECT own-or-admin RLS policy). Until this
--            migration runs, the API falls back to product_type='other' with a
--            "[GIFT BOX REQUEST]" notes marker — the feature works either way;
--            applying this migration only removes the fallback.
--
-- HOW TO APPLY (when approved):
--   * Prefer running this file MANUALLY in the Supabase SQL editor as a single
--     script. Do NOT use `supabase db push` for this repository until the
--     legacy `create_*.sql` files are reconciled: they are outside the CLI
--     migration history and a push could attempt to re-apply them.
--   * Run the whole file at once (it is idempotent).
--
-- REVERSAL:  re-add the original CHECK without 'gift_box' (existing rows with
--            product_type='gift_box' must first be moved to 'other').
-- =============================================================================

-- 1) Drop the existing CHECK constraint (guarded: only if it exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      DROP CONSTRAINT custom_print_requests_product_type_check;
  END IF;
END $$;

-- 2) Re-create it with 'gift_box' appended. All previous values preserved.
--    (If a constraint with this name still exists with the old definition the
--    statement below would fail loudly — that is intentional, review first.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      ADD CONSTRAINT custom_print_requests_product_type_check
      CHECK (product_type = ANY (
        ARRAY['tshirt'::text, 'mug'::text, 'phonecase'::text, 'poster'::text,
              'other'::text, 'gift_box'::text]
      ));
  END IF;
END $$;

-- 3) Verification (returns one row when correct).
SELECT pg_get_constraintdef(oid) AS product_type_check_definition
FROM pg_constraint
WHERE conname = 'custom_print_requests_product_type_check'
  AND conrelid = 'public.custom_print_requests'::regclass;

-- END 20261101_add_gift_box_product_type.sql

-- ============================================================================
-- BEGIN 20261108130000_site_content_banners_sections.sql
-- ============================================================================
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

-- END 20261108130000_site_content_banners_sections.sql

-- ============================================================================
-- BEGIN 20261110100000_theme_management.sql
-- ============================================================================
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

-- END 20261110100000_theme_management.sql

-- ============================================================================
-- BEGIN 20261110120000_creator_studio_core.sql
-- ============================================================================
-- Creator Design Studio — core schema, RLS and storage (phase 2 of 10).
--
-- Reuses the live design subsystem (user_designs / design_versions /
-- design_files / design_categories — docs/DESIGN-STUDIO-PLAN.md §1.1) and adds
-- only what is genuinely missing:
--   * creator_profiles          public persona behind /creators/[username]
--                               (profiles has no public read policy, so the
--                               public persona must live elsewhere)
--   * creator_product_templates product-type catalog (8 types seeded with the
--                               mockup engine in phase 5)
--   * creator_design_products   design x product configuration, review status,
--                               generated mockups, fulfillment boundary
--   * creator_gallery_items     gallery publication
-- plus one column (design_versions.editor_state) and two enum values (jpg/webp).
--
-- Security model (plan §2 D5): the four new tables are SELECT-only under RLS.
-- Every mutation goes through API routes using the service role, which is the
-- only way to enforce the publish state machine and make self-approval
-- impossible from a client. Mirrors the payment_receipts house pattern.
--
-- Idempotent: IF NOT EXISTS / drop-then-create / on conflict everywhere, so the
-- file can be re-run safely (this repository's migration chain cannot rebuild
-- the schema from scratch — docs/DATABASE-INTEGRITY-REPORT.md §7).

-- ---------------------------------------------------------------------------
-- 0) Preflight — fail early if the live baseline this migration extends is
--    missing, instead of creating orphaned objects.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_designs') is null then
    raise exception 'Dependency missing: public.user_designs';
  end if;
  if to_regclass('public.design_versions') is null then
    raise exception 'Dependency missing: public.design_versions';
  end if;
  if to_regclass('public.design_files') is null then
    raise exception 'Dependency missing: public.design_files';
  end if;
  if to_regclass('public.design_categories') is null then
    raise exception 'Dependency missing: public.design_categories';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Dependency missing: public.profiles';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Dependency missing: public.is_admin()';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Dependency missing: public.set_updated_at()';
  end if;
  if to_regprocedure('public.owns_design(uuid)') is null then
    raise exception 'Dependency missing: public.owns_design(uuid)';
  end if;
  if to_regtype('public.design_status') is null then
    raise exception 'Dependency missing: type public.design_status';
  end if;
  if to_regtype('public.design_file_format') is null then
    raise exception 'Dependency missing: type public.design_file_format';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Upload formats: the studio accepts PNG/JPG/WebP/SVG. The enum predates
--    jpg/webp; ADD VALUE is additive. This migration never inserts rows that
--    use the new values, so running inside a transaction block is safe.
-- ---------------------------------------------------------------------------
alter type public.design_file_format add value if not exists 'jpg';
alter type public.design_file_format add value if not exists 'webp';

-- ---------------------------------------------------------------------------
-- 2) Editor persistence: a version IS an editor snapshot, so design history,
--    undo checkpoints and "resume editing later" all read this column.
-- ---------------------------------------------------------------------------
alter table public.design_versions
  add column if not exists editor_state jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3) creator_profiles — public persona only. Private account data (email,
--    phone, addresses) stays in profiles, which has no public read policy.
--    The API rejects any field outside this set (plan §5.1).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique
                  references auth.users (id) on delete cascade,
  username      text not null unique
                  constraint creator_profiles_username_check
                    check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text not null
                  constraint creator_profiles_display_name_check
                    check (char_length(display_name) between 2 and 60),
  avatar_url    text,
  bio           text
                  constraint creator_profiles_bio_check
                    check (bio is null or char_length(bio) <= 500),
  social_links  jsonb not null default '{}'::jsonb
                  constraint creator_profiles_social_links_check
                    check (jsonb_typeof(social_links) = 'object'),
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  can_publish   boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) creator_product_templates — product-type catalog. Geometry (views, print
--    areas, layers, colors, sizes) is validated server-side before insert;
--    seeded with the 8 real product types in phase 5.
-- ---------------------------------------------------------------------------
create table if not exists public.creator_product_templates (
  id              uuid primary key default gen_random_uuid(),
  template_key    text not null unique
                    constraint creator_product_templates_key_check
                      check (template_key ~ '^[a-z0-9_]{2,40}$'),
  name            text not null
                    constraint creator_product_templates_name_check
                      check (char_length(name) between 1 and 80),
  name_ar         text,
  category        text not null default 'custom'
                    constraint creator_product_templates_category_check
                      check (category ~ '^[a-z0-9_-]{1,40}$'),
  dimensions_mm   jsonb not null
                    constraint creator_product_templates_dimensions_check
                      check (jsonb_typeof(dimensions_mm) = 'object'),
  views           jsonb not null
                    constraint creator_product_templates_views_check
                      check (jsonb_typeof(views) = 'array'),
  colors          jsonb not null
                    constraint creator_product_templates_colors_check
                      check (jsonb_typeof(colors) = 'array'),
  sizes           jsonb not null
                    constraint creator_product_templates_sizes_check
                      check (jsonb_typeof(sizes) = 'array'),
  mockup_format   text not null default 'png'
                    constraint creator_product_templates_format_check
                      check (mockup_format in ('png', 'jpg', 'webp')),
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists creator_product_templates_catalog_idx
  on public.creator_product_templates (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 5) creator_design_products — one row per design x product type: independent
--    per-product transforms, colors, sizes and generated mockups, plus the
--    review state and the POD fulfillment boundary (plan §2 D8).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_design_products (
  id                  uuid primary key default gen_random_uuid(),
  design_id           uuid not null
                        references public.user_designs (id) on delete cascade,
  template_id         uuid not null
                        references public.creator_product_templates (id) on delete restrict,
  creator_profile_id  uuid not null
                        references public.creator_profiles (id) on delete cascade,
  view_states         jsonb not null default '{}'::jsonb
                        constraint creator_design_products_view_states_check
                          check (jsonb_typeof(view_states) = 'object'),
  selected_colors     text[] not null default '{}'
                        constraint creator_design_products_colors_check
                          check (cardinality(selected_colors) between 0 and 64),
  selected_sizes      text[] not null default '{}'
                        constraint creator_design_products_sizes_check
                          check (cardinality(selected_sizes) between 0 and 64),
  mockups             jsonb not null default '[]'::jsonb
                        constraint creator_design_products_mockups_check
                          check (case when jsonb_typeof(mockups) = 'array'
                                      then jsonb_array_length(mockups) <= 200
                                      else false end),
  status              public.design_status not null default 'draft',
  rejection_reason    text,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  submitted_at        timestamptz,
  product_id          uuid references public.products (id) on delete set null,
  fulfillment_mode    text not null default 'unconfigured'
                        constraint creator_design_products_fulfillment_check
                          check (fulfillment_mode in ('unconfigured', 'configured')),
  stock_buffer        integer not null default 0
                        constraint creator_design_products_stock_buffer_check
                          check (stock_buffer between 0 and 100000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- One live configuration per design per product type (duplicates are how the
-- same artwork ends up twice in the catalog).
create unique index if not exists creator_design_products_design_template_uq
  on public.creator_design_products (design_id, template_id)
  where deleted_at is null;

create index if not exists creator_design_products_profile_idx
  on public.creator_design_products (creator_profile_id, created_at desc)
  where deleted_at is null;

create index if not exists creator_design_products_product_idx
  on public.creator_design_products (product_id)
  where product_id is not null;

create index if not exists creator_design_products_status_idx
  on public.creator_design_products (status, submitted_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 6) creator_gallery_items — Option B: share artwork without selling it.
--    product_id fills in later when the same artwork becomes a store product
--    (never re-uploaded).
-- ---------------------------------------------------------------------------
create table if not exists public.creator_gallery_items (
  id                  uuid primary key default gen_random_uuid(),
  design_id           uuid not null
                        references public.user_designs (id) on delete cascade,
  owner_id            uuid not null
                        references public.profiles (id) on delete cascade,
  creator_profile_id  uuid references public.creator_profiles (id) on delete set null,
  title               text not null
                        constraint creator_gallery_items_title_check
                          check (char_length(title) between 2 and 120),
  description         text
                        constraint creator_gallery_items_description_check
                          check (description is null or char_length(description) <= 2000),
  preview_path        text,
  tags                text[] not null default '{}'
                        constraint creator_gallery_items_tags_check
                          check (cardinality(tags) between 0 and 30),
  visibility          text not null default 'public'
                        constraint creator_gallery_items_visibility_check
                          check (visibility in ('public', 'unlisted')),
  status              public.design_status not null default 'draft',
  rejection_reason    text,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  submitted_at        timestamptz,
  published_at        timestamptz,
  product_id          uuid references public.products (id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists creator_gallery_items_owner_idx
  on public.creator_gallery_items (owner_id, created_at desc)
  where deleted_at is null;

create index if not exists creator_gallery_items_profile_idx
  on public.creator_gallery_items (creator_profile_id, published_at desc)
  where deleted_at is null and status = 'approved';

create index if not exists creator_gallery_items_public_idx
  on public.creator_gallery_items (published_at desc)
  where deleted_at is null and status = 'approved' and visibility = 'public';

-- ---------------------------------------------------------------------------
-- 7) updated_at triggers (house helper)
-- ---------------------------------------------------------------------------
drop trigger if exists set_creator_profiles_updated_at on public.creator_profiles;
create trigger set_creator_profiles_updated_at
  before update on public.creator_profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_product_templates_updated_at on public.creator_product_templates;
create trigger set_creator_product_templates_updated_at
  before update on public.creator_product_templates
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_design_products_updated_at on public.creator_design_products;
create trigger set_creator_design_products_updated_at
  before update on public.creator_design_products
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_creator_gallery_items_updated_at on public.creator_gallery_items;
create trigger set_creator_gallery_items_updated_at
  before update on public.creator_gallery_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8) RLS — SELECT only. No INSERT/UPDATE/DELETE policy exists on any of these
--    tables: a client (creator or admin browser) physically cannot write them,
--    so protected approval fields and ownership are unreachable no matter what
--    the client sends. All writes happen through service-role API routes.
-- ---------------------------------------------------------------------------
alter table public.creator_profiles enable row level security;
alter table public.creator_product_templates enable row level security;
alter table public.creator_design_products enable row level security;
alter table public.creator_gallery_items enable row level security;

-- Public persona is public by design; the table stores persona fields only.
drop policy if exists creator_profiles_public_select on public.creator_profiles;
create policy creator_profiles_public_select
  on public.creator_profiles
  for select
  to anon, authenticated
  using (true);

-- Static catalog geometry (no private data); the studio filters is_active.
drop policy if exists creator_product_templates_public_select on public.creator_product_templates;
create policy creator_product_templates_public_select
  on public.creator_product_templates
  for select
  to anon, authenticated
  using (true);

-- Owner: owns_design() already returns true for admins and excludes
-- soft-deleted designs, so one policy covers both roles.
drop policy if exists creator_design_products_owner_select on public.creator_design_products;
create policy creator_design_products_owner_select
  on public.creator_design_products
  for select
  to authenticated
  using (public.owns_design(design_id));

-- Public: only configurations attached to a product that is already published
-- and visible. This is what makes the attribution embed on product cards safe.
drop policy if exists creator_design_products_public_select on public.creator_design_products;
create policy creator_design_products_public_select
  on public.creator_design_products
  for select
  to anon, authenticated
  using (
    product_id is not null
    and exists (
      select 1
        from public.products p
       where p.id = creator_design_products.product_id
         and p.status = 'published'
         and p.visibility = 'visible'
         and p.deleted_at is null
    )
  );

-- Gallery owner sees everything they own; everyone sees approved public rows.
drop policy if exists creator_gallery_items_owner_select on public.creator_gallery_items;
create policy creator_gallery_items_owner_select
  on public.creator_gallery_items
  for select
  to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists creator_gallery_items_public_select on public.creator_gallery_items;
create policy creator_gallery_items_public_select
  on public.creator_gallery_items
  for select
  to anon, authenticated
  using (status = 'approved' and visibility = 'public' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 9) Least privilege — storefront reads, service role writes.
-- ---------------------------------------------------------------------------
revoke all on public.creator_profiles from public, anon, authenticated;
grant select on public.creator_profiles to anon, authenticated;
grant all on public.creator_profiles to service_role;

revoke all on public.creator_product_templates from public, anon, authenticated;
grant select on public.creator_product_templates to anon, authenticated;
grant all on public.creator_product_templates to service_role;

revoke all on public.creator_design_products from public, anon, authenticated;
grant select on public.creator_design_products to anon, authenticated;
grant all on public.creator_design_products to service_role;

revoke all on public.creator_gallery_items from public, anon, authenticated;
grant select on public.creator_gallery_items to anon, authenticated;
grant all on public.creator_gallery_items to service_role;

-- ---------------------------------------------------------------------------
-- 10) Storage — the two buckets already exist live; make a fresh environment
--     match them and widen design-uploads to the formats the studio accepts
--     (live list lacks image/jpeg and image/webp). Size limits untouched.
--     Originals stay private; generated mockups stay public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-uploads',
  'design-uploads',
  false,
  209715200,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
    'application/pdf', 'application/postscript', 'image/vnd.adobe.photoshop',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Additive only: keep whatever else the live bucket already allows.
update storage.buckets
   set allowed_mime_types = array[
     'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
     'application/pdf', 'application/postscript', 'image/vnd.adobe.photoshop',
     'application/octet-stream'
   ]
 where id = 'design-uploads'
   and not (allowed_mime_types @> array['image/jpeg', 'image/webp']);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-previews', 'design-previews', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Owner-folder direct browser upload for originals (identical to the live
-- policies; recreated so a fresh environment behaves the same way).
drop policy if exists design_uploads_owner_insert on storage.objects;
create policy design_uploads_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'design-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists design_uploads_owner_or_admin_select on storage.objects;
create policy design_uploads_owner_or_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

drop policy if exists design_uploads_owner_or_admin_update on storage.objects;
create policy design_uploads_owner_or_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

drop policy if exists design_uploads_owner_or_admin_delete on storage.objects;
create policy design_uploads_owner_or_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'design-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or public.is_admin())
  );

-- Generated mockups are written by the API with the service role; these admin
-- policies only reproduce the live configuration for fresh environments.
drop policy if exists design_previews_admin_write on storage.objects;
create policy design_previews_admin_write
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'design-previews' and public.is_admin());

drop policy if exists design_previews_admin_update on storage.objects;
create policy design_previews_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'design-previews' and public.is_admin());

drop policy if exists design_previews_admin_delete on storage.objects;
create policy design_previews_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'design-previews' and public.is_admin());

-- END 20261110120000_creator_studio_core.sql

-- ============================================================================
-- BEGIN 20261110160000_creator_studio_template_seed.sql
-- ============================================================================
-- ===========================================================================
-- Phase 5 — seed the product-type catalog with the 8 required types.
--
-- The TypeScript registry (lib/design-studio/templates/index.ts) is the
-- RENDERING authority (it also carries the SVG body/overlay code); this seed
-- mirrors its geometry into creator_product_templates so commerce, publishing
-- and admin tooling can read the catalog from the database. Keep the two in
-- sync — a color/view that exists only here cannot be rendered, and one that
-- exists only in the registry cannot be sold.
--
-- JSON casing: SQL jsonb uses snake_case (print_area, name_ar, shade_hex) as
-- documented in the plan; the TS registry uses camelCase (printArea, nameAr,
-- shadeHex). Categories/keys satisfy the table CHECK constraints
-- (^[a-z0-9_-]{1,40}$ / ^[a-z0-9_]{2,40}$).
--
-- Idempotent: re-running never duplicates or reverts admin edits.
-- ===========================================================================

insert into public.creator_product_templates
  (template_key, name, name_ar, category, dimensions_mm, views, colors, sizes,
   mockup_format, is_active, sort_order)
values
  (
    'tshirt', 'T-Shirt', 'تيشيرت', 'apparel',
    '{"w": 560, "h": 700}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 290, "w": 300, "h": 400}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 270, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "black",   "name": "Black",        "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white",   "name": "White",        "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "heather", "name": "Heather Gray", "name_ar": "رمادي",  "hex": "#a7adb8", "shade_hex": "#828996"},
      {"key": "navy",    "name": "Navy",         "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",     "name": "Red",          "name_ar": "أحمر",   "hex": "#c62f38", "shade_hex": "#8f1f26"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 1
  ),
  (
    'hoodie', 'Hoodie', 'هودي', 'apparel',
    '{"w": 600, "h": 760}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 400, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 340, "w": 300, "h": 420}}
    ]'::jsonb,
    '[
      {"key": "charcoal", "name": "Charcoal", "name_ar": "فحمي",   "hex": "#33343d", "shade_hex": "#1a1b22"},
      {"key": "black",    "name": "Black",    "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "gray",     "name": "Gray",     "name_ar": "رمادي",  "hex": "#8f95a3", "shade_hex": "#6a7080"},
      {"key": "navy",     "name": "Navy",     "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "maroon",   "name": "Maroon",   "name_ar": "عنابي",  "hex": "#7a2e39", "shade_hex": "#541d25"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 2
  ),
  (
    'sweatshirt', 'Sweatshirt', 'سويت شيرت', 'apparel',
    '{"w": 580, "h": 720}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 330, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 300, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "ash",      "name": "Ash",           "name_ar": "رمادي فاتح", "hex": "#c9ccd3", "shade_hex": "#a4a8b2"},
      {"key": "navy",     "name": "Navy",          "name_ar": "كحلي",       "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "forest",   "name": "Forest Green",  "name_ar": "أخضر",       "hex": "#2f5541", "shade_hex": "#1d382a"},
      {"key": "black",    "name": "Black",         "name_ar": "أسود",       "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "burgundy", "name": "Burgundy",      "name_ar": "خمري",       "hex": "#6d2b36", "shade_hex": "#4a1c24"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 3
  ),
  (
    'mug', 'Coffee Mug', 'كوب قهوة', 'drinkware',
    '{"w": 120, "h": 95, "depth": 80}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 700}, "print_area": {"x": 215, "y": 200, "w": 430, "h": 300}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White", "name_ar": "أبيض",    "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "black", "name": "Black", "name_ar": "أسود",    "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",    "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر",    "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "mint",  "name": "Mint",  "name_ar": "نعناعي",  "hex": "#7fd1b9", "shade_hex": "#5aa992"}
    ]'::jsonb,
    '[
      {"key": "11oz", "name": "11 oz", "label": "11 oz"},
      {"key": "15oz", "name": "15 oz", "label": "15 oz"}
    ]'::jsonb,
    'png', true, 4
  ),
  (
    'phone_case', 'Phone Case', 'غطاء هاتف', 'tech',
    '{"w": 75, "h": 152}'::jsonb,
    '[
      {"key": "back", "label": "Back", "canvas": {"w": 600, "h": 1200}, "print_area": {"x": 64, "y": 130, "w": 472, "h": 970}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "pink",  "name": "Pink",  "name_ar": "وردي",   "hex": "#f2a8c4", "shade_hex": "#d17fa3"},
      {"key": "clear", "name": "Clear", "name_ar": "شفاف",   "hex": "#e9f3f7", "shade_hex": "#c3d8e0"}
    ]'::jsonb,
    '[
      {"key": "iphone-15",     "name": "iPhone 15",    "label": "iPhone 15"},
      {"key": "iphone-15-pro", "name": "iPhone 15 Pro", "label": "15 Pro"},
      {"key": "galaxy-s24",    "name": "Galaxy S24",   "label": "S24"}
    ]'::jsonb,
    'png', true, 5
  ),
  (
    'tote_bag', 'Tote Bag', 'حقيبة قماش', 'accessories',
    '{"w": 380, "h": 420}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}}
    ]'::jsonb,
    '[
      {"key": "natural", "name": "Natural", "name_ar": "طبيعي", "hex": "#e8dcc6", "shade_hex": "#cbb998"},
      {"key": "black",   "name": "Black",   "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",    "name": "Navy",    "name_ar": "كحلي", "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "olive",   "name": "Olive",   "name_ar": "زيتي", "hex": "#5d6b3f", "shade_hex": "#414c2a"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "15×16 in"},
      {"key": "large",    "name": "Large",    "label": "18×20 in"}
    ]'::jsonb,
    'png', true, 6
  ),
  (
    'poster', 'Art Poster', 'ملصق فني', 'wall_art',
    '{"w": 305, "h": 381}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 800, "h": 1000}, "print_area": {"x": 45, "y": 45, "w": 710, "h": 910}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White Paper",  "name_ar": "ورق أبيض",  "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "ivory", "name": "Ivory Paper",  "name_ar": "ورق عاجي",  "hex": "#f6f1e7", "shade_hex": "#ddd5c4"},
      {"key": "black", "name": "Black Paper",  "name_ar": "ورق أسود", "hex": "#16161c", "shade_hex": "#000000"}
    ]'::jsonb,
    '[
      {"key": "12x16", "name": "12 × 16 in", "label": "12×16"},
      {"key": "18x24", "name": "18 × 24 in", "label": "18×24"},
      {"key": "24x36", "name": "24 × 36 in", "label": "24×36"}
    ]'::jsonb,
    'png', true, 7
  ),
  (
    'mouse_pad', 'Mouse Pad', 'ماوس باد', 'accessories',
    '{"w": 220, "h": 220}'::jsonb,
    '[
      {"key": "front", "label": "Top", "canvas": {"w": 900, "h": 900}, "print_area": {"x": 72, "y": 72, "w": 756, "h": 756}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض", "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر", "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "blue",  "name": "Blue",  "name_ar": "أزرق", "hex": "#2f5f9e", "shade_hex": "#1f4272"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "9×9 in"},
      {"key": "xl",       "name": "Extended", "label": "12×10 in"}
    ]'::jsonb,
    'png', true, 8
  )
on conflict (template_key) do nothing;

-- END 20261110160000_creator_studio_template_seed.sql

-- ============================================================================
-- BEGIN 20261112090000_fix_admin_product_performance.sql
-- ============================================================================
-- Fix admin_product_performance counting non-qualifying orders.
--
-- The original definition (20261023_production_readiness.sql) filtered order
-- status inside the LEFT JOIN to orders, so order_items rows from pending /
-- cancelled orders still joined the view (o.* came back NULL) and their line
-- totals were summed into revenue. Real example from production: a product
-- with 3000 across 3 *pending* orders and 1000 in one *paid* order rendered
-- as two rows for the same product — a phantom NULL-currency row of 3000
-- above the real USD 1000 — which also crashed the admin dashboard with
-- React's "two children with the same key" error.
--
-- Items are now qualified before aggregation, so every row is a real sale in
-- a real currency. Products whose only items sit in non-qualifying orders
-- fall back to the zero row they share with never-sold products.
--
-- Column names and types are unchanged, so CREATE OR REPLACE VIEW keeps the
-- grants installed by 20261023_production_readiness.sql (service_role only).
-- Idempotent: safe to run more than once.

create or replace view public.admin_product_performance as
select
  p.id as product_id,
  p.name,
  coalesce(v.sku, '') as sku,
  o.currency,
  coalesce(sum(oi.line_total), 0) as revenue,
  coalesce(sum(oi.quantity), 0) as units_sold,
  count(distinct o.id) as order_count
from public.products p
left join public.product_variants v
  on v.product_id = p.id
  and v.is_default
  and v.deleted_at is null
left join public.order_items oi
  on oi.variant_id = v.id
  and exists (
    select 1
    from public.orders oq
    where oq.id = oi.order_id
      and oq.status in ('paid', 'processing', 'printing', 'shipped', 'delivered')
      and oq.deleted_at is null
  )
left join public.orders o
  on o.id = oi.order_id
where p.deleted_at is null
group by p.id, p.name, v.sku, o.currency;

revoke all on public.admin_product_performance from public, anon, authenticated;
grant select on public.admin_product_performance to service_role;

-- END 20261112090000_fix_admin_product_performance.sql

-- ============================================================================
-- VERIFICATION - run these after the bundle; every check must pass
-- ============================================================================
-- 1) All new tables exist (each value must be a name, never null):
select to_regclass('public.site_banners')               as site_banners,
       to_regclass('public.site_sections')               as site_sections,
       to_regclass('public.store_themes')                as store_themes,
       to_regclass('public.theme_assets')                as theme_assets,
       to_regclass('public.theme_settings')              as theme_settings,
       to_regclass('public.creator_profiles')            as creator_profiles,
       to_regclass('public.creator_product_templates')   as creator_templates;

-- 2) gift_box allowed + theme-assets bucket public (both must be true):
select exists (
         select 1 from pg_constraint
         where conname = 'custom_print_requests_product_type_check'
           and pg_get_constraintdef(oid) like '%gift_box%'
       ) as gift_box_enabled,
       exists (
         select 1 from storage.buckets where id = 'theme-assets'
       ) as theme_bucket_exists;

-- 3) Top-products view fixed: exactly ONE row for the ring, the paid USD 1000
--    (the phantom 3000 pending row must be gone):
select currency, revenue, units_sold
from public.admin_product_performance
where product_id = 'f9a11e67-af79-449a-9b63-43bdb6ff177e';
