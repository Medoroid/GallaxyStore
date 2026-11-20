-- ============================================================================
-- PHASE 1.1 / CD-3 — SINGLE SOURCE OF TRUTH FOR CREATOR TEMPLATE GEOMETRY
-- Local/staging only. Additive, idempotent, data-preserving.
--
-- Problem: the admin template editor writes views/colors/sizes JSONB into
-- creator_product_templates, but the studio/mockup renderer read a hardcoded
-- TypeScript registry. Two competing sources of truth meant edits had no effect.
--
-- Solution: the live, mutable columns become the ADMIN DRAFT. A new published
-- snapshot (published_* + geometry_version) is what every consumer reads.
-- Promotion happens only through the explicit admin publish endpoint.
-- ============================================================================

alter table public.creator_product_templates
  add column if not exists published_dimensions_mm jsonb,
  add column if not exists published_views jsonb,
  add column if not exists published_colors jsonb,
  add column if not exists published_sizes jsonb,
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists geometry_version integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_templates_published_views_check'
  ) then
    alter table public.creator_product_templates
      add constraint creator_templates_published_views_check
      check (published_views is null or jsonb_typeof(published_views) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_templates_published_colors_check'
  ) then
    alter table public.creator_product_templates
      add constraint creator_templates_published_colors_check
      check (published_colors is null or jsonb_typeof(published_colors) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_templates_published_sizes_check'
  ) then
    alter table public.creator_product_templates
      add constraint creator_templates_published_sizes_check
      check (published_sizes is null or jsonb_typeof(published_sizes) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_templates_published_dims_check'
  ) then
    alter table public.creator_product_templates
      add constraint creator_templates_published_dims_check
      check (published_dimensions_mm is null or jsonb_typeof(published_dimensions_mm) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_templates_geometry_version_check'
  ) then
    alter table public.creator_product_templates
      add constraint creator_templates_geometry_version_check
      check (geometry_version > 0);
  end if;
end
$$;

-- Backfill the 8 seeded templates once. Idempotent: only rows without a
-- published snapshot are touched. Draft edits are never overwritten.
update public.creator_product_templates
   set published_dimensions_mm = dimensions_mm,
       published_views = views,
       published_colors = colors,
       published_sizes = sizes,
       is_published = true,
       published_at = coalesce(published_at, now()),
       geometry_version = 1
 where published_views is null
   and views is not null
   and colors is not null
   and sizes is not null;

comment on column public.creator_product_templates.views is
  'ADMIN DRAFT geometry. Editable via /api/admin/creator-templates. Never read by the renderer.';
comment on column public.creator_product_templates.published_views is
  'PUBLISHED geometry snapshot. The single source of truth for studio, mockups and publishing.';
