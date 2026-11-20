-- Customer Custom Print Studio — additive, customer-only schema.
--
-- Deliberately NO creator_profiles, creator roles, marketplace or second
-- checkout. Reuses the live design subsystem (user_designs / design_versions /
-- design_files), the live product/cart/checkout tables, and the existing
-- product_customizations bridge (customization_id on cart_items/order_items).
--
-- NOT APPLIED. Local file only — application requires separate approval on an
-- isolated Staging project first.

do $$
begin
  if to_regclass('public.user_designs') is null then
    raise exception 'Dependency missing: public.user_designs';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'Dependency missing: public.products';
  end if;
  if to_regclass('public.product_variants') is null then
    raise exception 'Dependency missing: public.product_variants';
  end if;
  if to_regclass('public.product_customizations') is null then
    raise exception 'Dependency missing: public.product_customizations';
  end if;
  if to_regclass('public.admin_audit_log') is null then
    raise exception 'Dependency missing: public.admin_audit_log';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0) Reuse the existing design subsystem: a version IS an editor snapshot.
-- ---------------------------------------------------------------------------
alter type public.design_file_format add value if not exists 'jpg';
alter type public.design_file_format add value if not exists 'webp';

alter table public.design_versions
  add column if not exists editor_state jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 1) Admin-editable mockup template catalog. Everything visual is JSON so a
--    new product/view/colour can be added without a code deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.mockup_templates (
  id              uuid primary key default gen_random_uuid(),
  template_key    text not null unique
                    check (template_key ~ '^[a-z0-9_]{2,40}$'),
  name            text not null check (char_length(name) between 1 and 80),
  name_ar         text,
  category        text not null default 'custom'
                    check (category ~ '^[a-z0-9_-]{1,40}$'),
  description     text,
  dimensions_mm   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(dimensions_mm) = 'object'),
  views           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(views) = 'array'),
  colors          jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(colors) = 'array'),
  sizes           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(sizes) = 'array'),
  body_svg        text not null default '',
  overlay_svg     text,
  texture_patterns jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(texture_patterns) = 'array'),
  texture_id      text,
  provenance      jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(provenance) = 'object'),
  /** Admin-managed photorealistic layers (real photos, print areas, blends). */
  photo_assets    jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(photo_assets) = 'array'),
  /** Real catalog product + variant used when this template is ordered. */
  store_product_id  uuid references public.products(id) on delete set null,
  store_variant_id  uuid references public.product_variants(id) on delete set null,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists mockup_templates_catalog_idx
  on public.mockup_templates (is_active, sort_order)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) Optional public sharing. A customer submits an EXISTING private design;
--    nothing becomes public until an administrator approves it.
-- ---------------------------------------------------------------------------
create table if not exists public.shared_designs (
  id              uuid primary key default gen_random_uuid(),
  design_id       uuid not null
                    references public.user_designs(id) on delete cascade,
  owner_id        uuid not null
                    references public.profiles(id) on delete cascade,
  author_display_name text not null
                    check (char_length(author_display_name) between 2 and 60),
  title           text not null check (char_length(title) between 2 and 120),
  description     text check (description is null or char_length(description) <= 2000),
  preview_path    text,
  tags            text[] not null default '{}'
                    check (cardinality(tags) <= 30),
  status          public.design_status not null default 'draft',
  rejection_reason text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  submitted_at    timestamptz,
  published_at    timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists shared_designs_design_owner_uq
  on public.shared_designs (design_id, owner_id)
  where deleted_at is null;

create index if not exists shared_designs_public_idx
  on public.shared_designs (published_at desc)
  where deleted_at is null and status = 'approved';

create index if not exists shared_designs_owner_idx
  on public.shared_designs (owner_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3) Timestamps, RLS and least privilege.
-- ---------------------------------------------------------------------------
drop trigger if exists set_mockup_templates_updated_at on public.mockup_templates;
create trigger set_mockup_templates_updated_at
  before update on public.mockup_templates
  for each row execute function public.set_updated_at();

drop trigger if exists set_shared_designs_updated_at on public.shared_designs;
create trigger set_shared_designs_updated_at
  before update on public.shared_designs
  for each row execute function public.set_updated_at();

alter table public.mockup_templates enable row level security;
alter table public.shared_designs enable row level security;

drop policy if exists mockup_templates_public_select on public.mockup_templates;
create policy mockup_templates_public_select
  on public.mockup_templates for select to anon, authenticated
  using (is_active and deleted_at is null);

-- Owners read their own submissions; everyone reads approved public designs.
drop policy if exists shared_designs_owner_select on public.shared_designs;
create policy shared_designs_owner_select
  on public.shared_designs for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists shared_designs_public_select on public.shared_designs;
create policy shared_designs_public_select
  on public.shared_designs for select to anon, authenticated
  using (status = 'approved' and deleted_at is null);

-- No INSERT/UPDATE/DELETE policy for clients: all writes are service-role
-- routes that verify ownership with the caller-scoped client first.
revoke all on public.mockup_templates from public, anon, authenticated;
grant select on public.mockup_templates to anon, authenticated;
grant all on public.mockup_templates to service_role;

revoke all on public.shared_designs from public, anon, authenticated;
grant select on public.shared_designs to anon, authenticated;
grant all on public.shared_designs to service_role;

comment on table public.shared_designs is
  'Opt-in public designs; private designs are NEVER copied here without consent.';

-- ---------------------------------------------------------------------------
-- 4) Admin-managed mockup asset bucket. Private; browser never reads directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mockup-assets',
  'mockup-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists mockup_assets_admin_insert on storage.objects;
create policy mockup_assets_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_select on storage.objects;
create policy mockup_assets_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_update on storage.objects;
create policy mockup_assets_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());

drop policy if exists mockup_assets_admin_delete on storage.objects;
create policy mockup_assets_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'mockup-assets' and public.is_admin());
