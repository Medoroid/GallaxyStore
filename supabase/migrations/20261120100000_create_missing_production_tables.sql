-- =============================================================================
-- Migration: Create missing production tables (idempotent bootstrap)
-- Prepared:  2026-11-20
-- Source:    pg_dump of the 16 locally-existing tables absent from production.
-- Scope:     tables, constraints, indexes, RLS, policies and triggers only.
--            No production data is deleted or modified.
--            Safe to re-run: every object is guarded by IF NOT EXISTS / DO guard.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0) Trigger functions required by the gift-box tables (verbatim from approved migration)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_gift_box_item_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.gift_box_product_id = new.product_id then
    raise exception 'A gift box cannot contain itself';
  end if;
  if exists (
    select 1 from public.gift_boxes gb where gb.product_id = new.product_id
  ) then
    raise exception 'Gift boxes cannot be nested inside other gift boxes';
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_gift_box_registration()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.gift_box_items gbi where gbi.product_id = new.product_id
  ) then
    raise exception 'This product is already a component of another gift box and cannot become a gift box itself';
  end if;
  return new;
end;
$function$;


CREATE TABLE IF NOT EXISTS public.creator_design_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid NOT NULL,
    template_id uuid NOT NULL,
    creator_profile_id uuid NOT NULL,
    view_states jsonb DEFAULT '{}'::jsonb NOT NULL,
    selected_colors text[] DEFAULT '{}'::text[] NOT NULL,
    selected_sizes text[] DEFAULT '{}'::text[] NOT NULL,
    mockups jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public.design_status DEFAULT 'draft'::public.design_status NOT NULL,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    submitted_at timestamp with time zone,
    product_id uuid,
    fulfillment_mode text DEFAULT 'unconfigured'::text NOT NULL,
    stock_buffer integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT creator_design_products_colors_check CHECK (((cardinality(selected_colors) >= 0) AND (cardinality(selected_colors) <= 64))),
    CONSTRAINT creator_design_products_fulfillment_check CHECK ((fulfillment_mode = ANY (ARRAY['unconfigured'::text, 'configured'::text]))),
    CONSTRAINT creator_design_products_mockups_check CHECK (
CASE
    WHEN (jsonb_typeof(mockups) = 'array'::text) THEN (jsonb_array_length(mockups) <= 200)
    ELSE false
END),
    CONSTRAINT creator_design_products_sizes_check CHECK (((cardinality(selected_sizes) >= 0) AND (cardinality(selected_sizes) <= 64))),
    CONSTRAINT creator_design_products_stock_buffer_check CHECK (((stock_buffer >= 0) AND (stock_buffer <= 100000))),
    CONSTRAINT creator_design_products_view_states_check CHECK ((jsonb_typeof(view_states) = 'object'::text))
);

CREATE TABLE IF NOT EXISTS public.creator_gallery_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    creator_profile_id uuid,
    title text NOT NULL,
    description text,
    preview_path text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    status public.design_status DEFAULT 'draft'::public.design_status NOT NULL,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    submitted_at timestamp with time zone,
    published_at timestamp with time zone,
    product_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_gallery_items_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
    CONSTRAINT creator_gallery_items_tags_check CHECK (((cardinality(tags) >= 0) AND (cardinality(tags) <= 30))),
    CONSTRAINT creator_gallery_items_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 120))),
    CONSTRAINT creator_gallery_items_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'unlisted'::text])))
);

CREATE TABLE IF NOT EXISTS public.creator_product_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    name text NOT NULL,
    name_ar text,
    category text DEFAULT 'custom'::text NOT NULL,
    dimensions_mm jsonb NOT NULL,
    views jsonb NOT NULL,
    colors jsonb NOT NULL,
    sizes jsonb NOT NULL,
    mockup_format text DEFAULT 'png'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_product_templates_category_check CHECK ((category ~ '^[a-z0-9_-]{1,40}$'::text)),
    CONSTRAINT creator_product_templates_colors_check CHECK ((jsonb_typeof(colors) = 'array'::text)),
    CONSTRAINT creator_product_templates_dimensions_check CHECK ((jsonb_typeof(dimensions_mm) = 'object'::text)),
    CONSTRAINT creator_product_templates_format_check CHECK ((mockup_format = ANY (ARRAY['png'::text, 'jpg'::text, 'webp'::text]))),
    CONSTRAINT creator_product_templates_key_check CHECK ((template_key ~ '^[a-z0-9_]{2,40}$'::text)),
    CONSTRAINT creator_product_templates_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT creator_product_templates_sizes_check CHECK ((jsonb_typeof(sizes) = 'array'::text)),
    CONSTRAINT creator_product_templates_views_check CHECK ((jsonb_typeof(views) = 'array'::text))
);

CREATE TABLE IF NOT EXISTS public.creator_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    bio text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    can_publish boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_profiles_bio_check CHECK (((bio IS NULL) OR (char_length(bio) <= 500))),
    CONSTRAINT creator_profiles_display_name_check CHECK (((char_length(display_name) >= 2) AND (char_length(display_name) <= 60))),
    CONSTRAINT creator_profiles_social_links_check CHECK ((jsonb_typeof(social_links) = 'object'::text)),
    CONSTRAINT creator_profiles_username_check CHECK ((username ~ '^[a-z0-9_]{3,30}$'::text))
);

CREATE TABLE IF NOT EXISTS public.gift_box_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gift_box_product_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_box_items_display_order_check CHECK ((display_order >= 0)),
    CONSTRAINT gift_box_items_note_check CHECK (((note IS NULL) OR (char_length(note) <= 500))),
    CONSTRAINT gift_box_items_quantity_check CHECK (((quantity > 0) AND (quantity <= 1000)))
);

CREATE TABLE IF NOT EXISTS public.gift_boxes (
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mockup_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    name text NOT NULL,
    name_ar text,
    category text DEFAULT 'custom'::text NOT NULL,
    description text,
    dimensions_mm jsonb DEFAULT '{}'::jsonb NOT NULL,
    views jsonb DEFAULT '[]'::jsonb NOT NULL,
    colors jsonb DEFAULT '[]'::jsonb NOT NULL,
    sizes jsonb DEFAULT '[]'::jsonb NOT NULL,
    body_svg text DEFAULT ''::text NOT NULL,
    overlay_svg text,
    texture_patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
    texture_id text,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    photo_assets jsonb DEFAULT '[]'::jsonb NOT NULL,
    store_product_id uuid,
    store_variant_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT mockup_templates_category_check CHECK ((category ~ '^[a-z0-9_-]{1,40}$'::text)),
    CONSTRAINT mockup_templates_colors_check CHECK ((jsonb_typeof(colors) = 'array'::text)),
    CONSTRAINT mockup_templates_dimensions_mm_check CHECK ((jsonb_typeof(dimensions_mm) = 'object'::text)),
    CONSTRAINT mockup_templates_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT mockup_templates_photo_assets_check CHECK ((jsonb_typeof(photo_assets) = 'array'::text)),
    CONSTRAINT mockup_templates_provenance_check CHECK ((jsonb_typeof(provenance) = 'object'::text)),
    CONSTRAINT mockup_templates_sizes_check CHECK ((jsonb_typeof(sizes) = 'array'::text)),
    CONSTRAINT mockup_templates_template_key_check CHECK ((template_key ~ '^[a-z0-9_]{2,40}$'::text)),
    CONSTRAINT mockup_templates_texture_patterns_check CHECK ((jsonb_typeof(texture_patterns) = 'array'::text)),
    CONSTRAINT mockup_templates_views_check CHECK ((jsonb_typeof(views) = 'array'::text))
);

CREATE TABLE IF NOT EXISTS public.order_item_gift_box_contents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    product_id uuid,
    variant_id uuid,
    product_name text NOT NULL,
    variant_options jsonb DEFAULT '{}'::jsonb NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    quantity integer NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_item_gift_box_contents_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE IF NOT EXISTS public.shared_designs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    author_display_name text NOT NULL,
    title text NOT NULL,
    description text,
    preview_path text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status public.design_status DEFAULT 'draft'::public.design_status NOT NULL,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    submitted_at timestamp with time zone,
    published_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_designs_author_display_name_check CHECK (((char_length(author_display_name) >= 2) AND (char_length(author_display_name) <= 60))),
    CONSTRAINT shared_designs_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
    CONSTRAINT shared_designs_tags_check CHECK ((cardinality(tags) <= 30)),
    CONSTRAINT shared_designs_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 120)))
);

COMMENT ON TABLE public.shared_designs IS 'Opt-in public designs; private designs are NEVER copied here without consent.';

CREATE TABLE IF NOT EXISTS public.site_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page text DEFAULT 'home'::text NOT NULL,
    placement text DEFAULT 'after_hero'::text NOT NULL,
    title text,
    subtitle text,
    image_url text,
    link_url text,
    button_label text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_banners_page_check CHECK ((page ~ '^[a-z0-9_-]{1,40}$'::text)),
    CONSTRAINT site_banners_placement_check CHECK ((placement = ANY (ARRAY['top_strip'::text, 'after_hero'::text, 'mid_page'::text, 'before_footer'::text]))),
    CONSTRAINT site_banners_window_check CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
);

CREATE TABLE IF NOT EXISTS public.site_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page text DEFAULT 'home'::text NOT NULL,
    placement text DEFAULT 'mid_page'::text NOT NULL,
    section_type text DEFAULT 'rich_text'::text NOT NULL,
    eyebrow text,
    title text,
    body text,
    image_url text,
    link_url text,
    button_label text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_sections_page_check CHECK ((page ~ '^[a-z0-9_-]{1,40}$'::text)),
    CONSTRAINT site_sections_placement_check CHECK ((placement = ANY (ARRAY['after_hero'::text, 'mid_page'::text, 'before_footer'::text]))),
    CONSTRAINT site_sections_type_check CHECK ((section_type = ANY (ARRAY['rich_text'::text, 'image_text'::text, 'cards'::text, 'cta'::text]))),
    CONSTRAINT site_sections_window_check CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
);

CREATE TABLE IF NOT EXISTS public.store_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    category text DEFAULT 'custom'::text NOT NULL,
    preview_image text,
    theme_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    activation_mode text DEFAULT 'manual'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    is_recurring boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_themes_category_check CHECK ((category ~ '^[a-z0-9_-]{1,40}$'::text)),
    CONSTRAINT store_themes_mode_check CHECK ((activation_mode = ANY (ARRAY['manual'::text, 'scheduled'::text]))),
    CONSTRAINT store_themes_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT store_themes_slug_check CHECK ((slug ~ '^[a-z0-9-]{1,60}$'::text)),
    CONSTRAINT store_themes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'active'::text, 'archived'::text]))),
    CONSTRAINT store_themes_timezone_check CHECK (((char_length(timezone) >= 1) AND (char_length(timezone) <= 64))),
    CONSTRAINT store_themes_window_check CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
);

CREATE TABLE IF NOT EXISTS public.theme_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_id uuid NOT NULL,
    asset_type text NOT NULL,
    asset_url text NOT NULL,
    mobile_asset_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT theme_assets_type_check CHECK ((asset_type = ANY (ARRAY['background_desktop'::text, 'background_mobile'::text, 'banner_desktop'::text, 'banner_mobile'::text, 'icon'::text, 'logo'::text, 'artwork'::text]))),
    CONSTRAINT theme_assets_url_check CHECK ((char_length(asset_url) <= 2048))
);

CREATE TABLE IF NOT EXISTS public.theme_schedule_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_id uuid,
    action text NOT NULL,
    previous_theme_id uuid,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT theme_schedule_history_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'publish'::text, 'activate'::text, 'deactivate'::text, 'schedule'::text, 'archive'::text, 'delete'::text, 'override'::text, 'clear_override'::text, 'set_default'::text, 'restore_default'::text, 'restore_version'::text])))
);

CREATE TABLE IF NOT EXISTS public.theme_settings (
    id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    default_theme_id uuid,
    manual_override_theme_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT theme_settings_single_row CHECK ((id = '00000000-0000-0000-0000-000000000001'::uuid))
);

CREATE TABLE IF NOT EXISTS public.theme_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT theme_versions_version_check CHECK ((version >= 1))
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_pkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_pkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_product_templates_pkey' AND conrelid = 'public.creator_product_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_product_templates
    ADD CONSTRAINT creator_product_templates_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_product_templates_template_key_key' AND conrelid = 'public.creator_product_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_product_templates
    ADD CONSTRAINT creator_product_templates_template_key_key UNIQUE (template_key);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_profiles_pkey' AND conrelid = 'public.creator_profiles'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_profiles_user_id_key' AND conrelid = 'public.creator_profiles'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_user_id_key UNIQUE (user_id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_profiles_username_key' AND conrelid = 'public.creator_profiles'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_username_key UNIQUE (username);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_box_items_pkey' AND conrelid = 'public.gift_box_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_box_items
    ADD CONSTRAINT gift_box_items_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_boxes_pkey' AND conrelid = 'public.gift_boxes'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_boxes
    ADD CONSTRAINT gift_boxes_pkey PRIMARY KEY (product_id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mockup_templates_pkey' AND conrelid = 'public.mockup_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.mockup_templates
    ADD CONSTRAINT mockup_templates_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mockup_templates_template_key_key' AND conrelid = 'public.mockup_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.mockup_templates
    ADD CONSTRAINT mockup_templates_template_key_key UNIQUE (template_key);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_item_gift_box_contents_pkey' AND conrelid = 'public.order_item_gift_box_contents'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.order_item_gift_box_contents
    ADD CONSTRAINT order_item_gift_box_contents_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shared_designs_pkey' AND conrelid = 'public.shared_designs'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.shared_designs
    ADD CONSTRAINT shared_designs_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_banners_pkey' AND conrelid = 'public.site_banners'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.site_banners
    ADD CONSTRAINT site_banners_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_sections_pkey' AND conrelid = 'public.site_sections'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.site_sections
    ADD CONSTRAINT site_sections_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'store_themes_pkey' AND conrelid = 'public.store_themes'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_assets_pkey' AND conrelid = 'public.theme_assets'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_assets
    ADD CONSTRAINT theme_assets_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_schedule_history_pkey' AND conrelid = 'public.theme_schedule_history'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_schedule_history
    ADD CONSTRAINT theme_schedule_history_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_settings_pkey' AND conrelid = 'public.theme_settings'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_settings
    ADD CONSTRAINT theme_settings_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_versions_pkey' AND conrelid = 'public.theme_versions'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_pkey PRIMARY KEY (id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_versions_theme_version_key' AND conrelid = 'public.theme_versions'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_theme_version_key UNIQUE (theme_id, version);$stmt$;
  END IF;
END
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS creator_design_products_design_template_uq ON public.creator_design_products USING btree (design_id, template_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_design_products_product_idx ON public.creator_design_products USING btree (product_id) WHERE (product_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS creator_design_products_profile_idx ON public.creator_design_products USING btree (creator_profile_id, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_design_products_status_idx ON public.creator_design_products USING btree (status, submitted_at DESC) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS creator_gallery_items_design_owner_uq ON public.creator_gallery_items USING btree (design_id, owner_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_gallery_items_owner_idx ON public.creator_gallery_items USING btree (owner_id, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_gallery_items_profile_idx ON public.creator_gallery_items USING btree (creator_profile_id, published_at DESC) WHERE ((deleted_at IS NULL) AND (status = 'approved'::public.design_status));

CREATE INDEX IF NOT EXISTS creator_gallery_items_public_idx ON public.creator_gallery_items USING btree (published_at DESC) WHERE ((deleted_at IS NULL) AND (status = 'approved'::public.design_status) AND (visibility = 'public'::text));

CREATE INDEX IF NOT EXISTS creator_product_templates_catalog_idx ON public.creator_product_templates USING btree (is_active, sort_order);

CREATE INDEX IF NOT EXISTS gift_box_items_box_display_order_idx ON public.gift_box_items USING btree (gift_box_product_id, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS gift_box_items_box_product_variant_unique ON public.gift_box_items USING btree (gift_box_product_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS gift_box_items_product_idx ON public.gift_box_items USING btree (product_id);

CREATE INDEX IF NOT EXISTS gift_box_items_variant_idx ON public.gift_box_items USING btree (variant_id);

CREATE INDEX IF NOT EXISTS mockup_templates_catalog_idx ON public.mockup_templates USING btree (is_active, sort_order) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS order_item_gift_box_contents_order_item_idx ON public.order_item_gift_box_contents USING btree (order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS shared_designs_design_owner_uq ON public.shared_designs USING btree (design_id, owner_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS shared_designs_owner_idx ON public.shared_designs USING btree (owner_id, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS shared_designs_public_idx ON public.shared_designs USING btree (published_at DESC) WHERE ((deleted_at IS NULL) AND (status = 'approved'::public.design_status));

CREATE INDEX IF NOT EXISTS site_banners_active_idx ON public.site_banners USING btree (page, placement) WHERE is_active;

CREATE INDEX IF NOT EXISTS site_banners_zone_idx ON public.site_banners USING btree (page, placement, sort_order);

CREATE INDEX IF NOT EXISTS site_sections_active_idx ON public.site_sections USING btree (page, placement) WHERE is_active;

CREATE INDEX IF NOT EXISTS site_sections_zone_idx ON public.site_sections USING btree (page, placement, sort_order);

CREATE INDEX IF NOT EXISTS store_themes_priority_idx ON public.store_themes USING btree (priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS store_themes_status_idx ON public.store_themes USING btree (status);

CREATE INDEX IF NOT EXISTS store_themes_window_idx ON public.store_themes USING btree (starts_at, ends_at);

CREATE INDEX IF NOT EXISTS theme_assets_theme_idx ON public.theme_assets USING btree (theme_id);

CREATE INDEX IF NOT EXISTS theme_schedule_history_theme_idx ON public.theme_schedule_history USING btree (theme_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS theme_versions_theme_idx ON public.theme_versions USING btree (theme_id, version DESC);

DROP TRIGGER IF EXISTS guard_gift_box_item_rules ON public.gift_box_items;
CREATE TRIGGER guard_gift_box_item_rules BEFORE INSERT OR UPDATE ON public.gift_box_items FOR EACH ROW EXECUTE FUNCTION public.enforce_gift_box_item_rules();

DROP TRIGGER IF EXISTS guard_gift_box_registration ON public.gift_boxes;
CREATE TRIGGER guard_gift_box_registration BEFORE INSERT ON public.gift_boxes FOR EACH ROW EXECUTE FUNCTION public.enforce_gift_box_registration();

DROP TRIGGER IF EXISTS set_creator_design_products_updated_at ON public.creator_design_products;
CREATE TRIGGER set_creator_design_products_updated_at BEFORE UPDATE ON public.creator_design_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_creator_gallery_items_updated_at ON public.creator_gallery_items;
CREATE TRIGGER set_creator_gallery_items_updated_at BEFORE UPDATE ON public.creator_gallery_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_creator_product_templates_updated_at ON public.creator_product_templates;
CREATE TRIGGER set_creator_product_templates_updated_at BEFORE UPDATE ON public.creator_product_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_creator_profiles_updated_at ON public.creator_profiles;
CREATE TRIGGER set_creator_profiles_updated_at BEFORE UPDATE ON public.creator_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_gift_box_items_updated_at ON public.gift_box_items;
CREATE TRIGGER set_gift_box_items_updated_at BEFORE UPDATE ON public.gift_box_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_gift_boxes_updated_at ON public.gift_boxes;
CREATE TRIGGER set_gift_boxes_updated_at BEFORE UPDATE ON public.gift_boxes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_mockup_templates_updated_at ON public.mockup_templates;
CREATE TRIGGER set_mockup_templates_updated_at BEFORE UPDATE ON public.mockup_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_shared_designs_updated_at ON public.shared_designs;
CREATE TRIGGER set_shared_designs_updated_at BEFORE UPDATE ON public.shared_designs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_site_banners_updated_at ON public.site_banners;
CREATE TRIGGER set_site_banners_updated_at BEFORE UPDATE ON public.site_banners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_site_sections_updated_at ON public.site_sections;
CREATE TRIGGER set_site_sections_updated_at BEFORE UPDATE ON public.site_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_store_themes_updated_at ON public.store_themes;
CREATE TRIGGER set_store_themes_updated_at BEFORE UPDATE ON public.store_themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_theme_settings_updated_at ON public.theme_settings;
CREATE TRIGGER set_theme_settings_updated_at BEFORE UPDATE ON public.theme_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_creator_profile_id_fkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_creator_profile_id_fkey FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_design_id_fkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.user_designs(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_product_id_fkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_reviewed_by_fkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_design_products_template_id_fkey' AND conrelid = 'public.creator_design_products'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_design_products
    ADD CONSTRAINT creator_design_products_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.creator_product_templates(id) ON DELETE RESTRICT;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_creator_profile_id_fkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_creator_profile_id_fkey FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_design_id_fkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.user_designs(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_owner_id_fkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_product_id_fkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_gallery_items_reviewed_by_fkey' AND conrelid = 'public.creator_gallery_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_gallery_items
    ADD CONSTRAINT creator_gallery_items_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'creator_profiles_user_id_fkey' AND conrelid = 'public.creator_profiles'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.creator_profiles
    ADD CONSTRAINT creator_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_box_items_gift_box_product_id_fkey' AND conrelid = 'public.gift_box_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_box_items
    ADD CONSTRAINT gift_box_items_gift_box_product_id_fkey FOREIGN KEY (gift_box_product_id) REFERENCES public.gift_boxes(product_id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_box_items_product_id_fkey' AND conrelid = 'public.gift_box_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_box_items
    ADD CONSTRAINT gift_box_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_box_items_variant_id_fkey' AND conrelid = 'public.gift_box_items'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_box_items
    ADD CONSTRAINT gift_box_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gift_boxes_product_id_fkey' AND conrelid = 'public.gift_boxes'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.gift_boxes
    ADD CONSTRAINT gift_boxes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mockup_templates_store_product_id_fkey' AND conrelid = 'public.mockup_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.mockup_templates
    ADD CONSTRAINT mockup_templates_store_product_id_fkey FOREIGN KEY (store_product_id) REFERENCES public.products(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'mockup_templates_store_variant_id_fkey' AND conrelid = 'public.mockup_templates'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.mockup_templates
    ADD CONSTRAINT mockup_templates_store_variant_id_fkey FOREIGN KEY (store_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_item_gift_box_contents_order_item_id_fkey' AND conrelid = 'public.order_item_gift_box_contents'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.order_item_gift_box_contents
    ADD CONSTRAINT order_item_gift_box_contents_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shared_designs_design_id_fkey' AND conrelid = 'public.shared_designs'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.shared_designs
    ADD CONSTRAINT shared_designs_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.user_designs(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shared_designs_owner_id_fkey' AND conrelid = 'public.shared_designs'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.shared_designs
    ADD CONSTRAINT shared_designs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shared_designs_reviewed_by_fkey' AND conrelid = 'public.shared_designs'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.shared_designs
    ADD CONSTRAINT shared_designs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_banners_created_by_fkey' AND conrelid = 'public.site_banners'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.site_banners
    ADD CONSTRAINT site_banners_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_sections_created_by_fkey' AND conrelid = 'public.site_sections'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.site_sections
    ADD CONSTRAINT site_sections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'store_themes_created_by_fkey' AND conrelid = 'public.store_themes'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_assets_theme_id_fkey' AND conrelid = 'public.theme_assets'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_assets
    ADD CONSTRAINT theme_assets_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_schedule_history_performed_by_fkey' AND conrelid = 'public.theme_schedule_history'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_schedule_history
    ADD CONSTRAINT theme_schedule_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_schedule_history_previous_theme_id_fkey' AND conrelid = 'public.theme_schedule_history'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_schedule_history
    ADD CONSTRAINT theme_schedule_history_previous_theme_id_fkey FOREIGN KEY (previous_theme_id) REFERENCES public.store_themes(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_schedule_history_theme_id_fkey' AND conrelid = 'public.theme_schedule_history'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_schedule_history
    ADD CONSTRAINT theme_schedule_history_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_settings_default_theme_id_fkey' AND conrelid = 'public.theme_settings'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_settings
    ADD CONSTRAINT theme_settings_default_theme_id_fkey FOREIGN KEY (default_theme_id) REFERENCES public.store_themes(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_settings_manual_override_theme_id_fkey' AND conrelid = 'public.theme_settings'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_settings
    ADD CONSTRAINT theme_settings_manual_override_theme_id_fkey FOREIGN KEY (manual_override_theme_id) REFERENCES public.store_themes(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_versions_created_by_fkey' AND conrelid = 'public.theme_versions'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'theme_versions_theme_id_fkey' AND conrelid = 'public.theme_versions'::regclass
  ) THEN
    EXECUTE $stmt$ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.creator_design_products ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_design_products' AND policyname='creator_design_products_owner_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_design_products_owner_select ON public.creator_design_products FOR SELECT TO authenticated USING (public.owns_design(design_id));$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_design_products' AND policyname='creator_design_products_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_design_products_public_select ON public.creator_design_products FOR SELECT TO authenticated, anon USING (((product_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = creator_design_products.product_id) AND (p.status = 'published'::public.product_status) AND (p.visibility = 'visible'::public.product_visibility) AND (p.deleted_at IS NULL))))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.creator_gallery_items ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_gallery_items' AND policyname='creator_gallery_items_owner_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_gallery_items_owner_select ON public.creator_gallery_items FOR SELECT TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_gallery_items' AND policyname='creator_gallery_items_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_gallery_items_public_select ON public.creator_gallery_items FOR SELECT TO authenticated, anon USING (((status = 'approved'::public.design_status) AND (visibility = 'public'::text) AND (deleted_at IS NULL)));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.creator_product_templates ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_product_templates' AND policyname='creator_product_templates_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_product_templates_public_select ON public.creator_product_templates FOR SELECT TO authenticated, anon USING (true);$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='creator_profiles' AND policyname='creator_profiles_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY creator_profiles_public_select ON public.creator_profiles FOR SELECT TO authenticated, anon USING (true);$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.gift_box_items ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='gift_box_items' AND policyname='gift_box_items_select_public_or_admin'
  ) THEN
    EXECUTE $stmt$CREATE POLICY gift_box_items_select_public_or_admin ON public.gift_box_items FOR SELECT TO authenticated, anon USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.gift_boxes gb
     JOIN public.products p ON ((p.id = gb.product_id)))
  WHERE ((gb.product_id = gift_box_items.gift_box_product_id) AND (p.status = 'published'::public.product_status) AND (p.visibility = 'visible'::public.product_visibility) AND (p.deleted_at IS NULL))))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.gift_boxes ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='gift_boxes' AND policyname='gift_boxes_select_public_or_admin'
  ) THEN
    EXECUTE $stmt$CREATE POLICY gift_boxes_select_public_or_admin ON public.gift_boxes FOR SELECT TO authenticated, anon USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = gift_boxes.product_id) AND (p.status = 'published'::public.product_status) AND (p.visibility = 'visible'::public.product_visibility) AND (p.deleted_at IS NULL))))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.mockup_templates ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='mockup_templates' AND policyname='mockup_templates_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY mockup_templates_public_select ON public.mockup_templates FOR SELECT TO authenticated, anon USING ((is_active AND (deleted_at IS NULL)));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.order_item_gift_box_contents ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='order_item_gift_box_contents' AND policyname='order_item_gift_box_contents_select_owner_or_admin'
  ) THEN
    EXECUTE $stmt$CREATE POLICY order_item_gift_box_contents_select_owner_or_admin ON public.order_item_gift_box_contents FOR SELECT TO authenticated USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.id = order_item_gift_box_contents.order_item_id) AND (o.user_id = auth.uid()))))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.shared_designs ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='shared_designs' AND policyname='shared_designs_owner_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY shared_designs_owner_select ON public.shared_designs FOR SELECT TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='shared_designs' AND policyname='shared_designs_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY shared_designs_public_select ON public.shared_designs FOR SELECT TO authenticated, anon USING (((status = 'approved'::public.design_status) AND (deleted_at IS NULL)));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='site_banners' AND policyname='site_banners_admin_all'
  ) THEN
    EXECUTE $stmt$CREATE POLICY site_banners_admin_all ON public.site_banners TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='site_banners' AND policyname='site_banners_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY site_banners_public_select ON public.site_banners FOR SELECT TO authenticated, anon USING ((is_active AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='site_sections' AND policyname='site_sections_admin_all'
  ) THEN
    EXECUTE $stmt$CREATE POLICY site_sections_admin_all ON public.site_sections TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='site_sections' AND policyname='site_sections_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY site_sections_public_select ON public.site_sections FOR SELECT TO authenticated, anon USING ((is_active AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.store_themes ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='store_themes' AND policyname='store_themes_admin_all'
  ) THEN
    EXECUTE $stmt$CREATE POLICY store_themes_admin_all ON public.store_themes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());$stmt$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='store_themes' AND policyname='store_themes_public_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY store_themes_public_select ON public.store_themes FOR SELECT TO authenticated, anon USING ((status = ANY (ARRAY['active'::text, 'scheduled'::text])));$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.theme_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.theme_schedule_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='theme_settings' AND policyname='theme_settings_admin_select'
  ) THEN
    EXECUTE $stmt$CREATE POLICY theme_settings_admin_select ON public.theme_settings FOR SELECT TO authenticated USING (public.is_admin());$stmt$;
  END IF;
END
$guard$;

ALTER TABLE public.theme_versions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 9) Grants (verbatim from approved migrations)
-- -----------------------------------------------------------------------------
grant select on public.store_themes to anon, authenticated;
grant all on public.store_themes to service_role;
grant select on public.theme_settings to authenticated;
grant all on public.theme_settings to service_role;
grant all on public.theme_versions to service_role;
grant all on public.theme_schedule_history to service_role;
grant all on public.theme_assets to service_role;

grant select on public.creator_profiles to anon, authenticated;
grant all on public.creator_profiles to service_role;
grant select on public.creator_product_templates to anon, authenticated;
grant all on public.creator_product_templates to service_role;
grant select on public.creator_design_products to anon, authenticated;
grant all on public.creator_design_products to service_role;
grant select on public.creator_gallery_items to anon, authenticated;
grant all on public.creator_gallery_items to service_role;

grant select on public.site_banners to anon, authenticated;
grant all on public.site_banners to service_role;
grant select on public.site_sections to anon, authenticated;
grant all on public.site_sections to service_role;

grant select on public.mockup_templates to anon, authenticated;
grant all on public.mockup_templates to service_role;
grant select on public.shared_designs to anon, authenticated;
grant all on public.shared_designs to service_role;

grant select on public.gift_boxes, public.gift_box_items,
  public.order_item_gift_box_contents to anon, authenticated;
grant all on public.gift_boxes, public.gift_box_items,
  public.order_item_gift_box_contents to service_role;

