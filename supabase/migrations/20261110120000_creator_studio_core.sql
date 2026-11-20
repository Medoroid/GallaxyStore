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
