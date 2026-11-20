-- Generated from production catalog read-only 2026-11-18; local/staging only; no data
-- Source: Supabase project ref httywgkwfqvrbuwuzutu (PostgreSQL 17.6), introspected with
--         SELECT-only queries against pg_catalog / information_schema / pg_get_functiondef /
--         pg_get_viewdef / pg_get_constraintdef / pg_indexes / storage.*.
-- Purpose: authoritative schema baseline. Apply to a FRESH local/staging database BEFORE the
--         49 existing supabase/migrations/*.sql files so those migrations can layer on top.
--
-- Idempotency: CREATE EXTENSION IF NOT EXISTS, guarded CREATE TYPE, CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION/VIEW, guarded index/trigger/bucket creation.
-- Assumes a clean public schema. No INSERT/COPY of business data. No secrets/keys.
-- Deliberately NOT included: RLS policies (created by later migrations), GRANTs (later migrations),
--   storage.objects policies (names/definitions are recorded in the recovery report),
--   matviews and their refresh functions, notification/log/derived-table functions and triggers,
--   analytics/reporting views, the _seed_report helper table, and all row data.

set search_path = public, extensions;

-- ============================================================================
-- 1. EXTENSIONS (production: 6 in extensions, 2 in pg_catalog, 1 in vault)
--    Only the four that the schema actually depends on are created here.
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists ltree with schema extensions;

-- ============================================================================
-- 2. SEQUENCES (public, production count = 2; _seed_report_id_seq excluded)
-- ============================================================================
create sequence if not exists public.order_number_seq;

-- ============================================================================
-- 3. ENUM TYPES (13 in production)
-- ============================================================================
do $$ begin create type public.app_role as enum ('customer','vendor','admin');
exception when duplicate_object then null; end $$;
do $$ begin create type public.design_file_format as enum ('png','svg','pdf','ai','psd');
exception when duplicate_object then null; end $$;
do $$ begin create type public.design_status as enum ('draft','pending_review','approved','rejected','archived');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_item_status as enum ('pending','processing','printed','shipped','delivered','cancelled','returned','refunded');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('pending','paid','processing','printing','shipped','delivered','cancelled','refunded','partially_refunded');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_provider as enum ('stripe','paymob','cod','wallet','vodafone_cash');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_transaction_status as enum ('pending','processing','succeeded','failed','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin create type public.product_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin create type public.product_visibility as enum ('visible','hidden');
exception when duplicate_object then null; end $$;
do $$ begin create type public.refund_status as enum ('pending','processing','completed','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.return_status as enum ('requested','approved','rejected','item_received','completed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.review_status as enum ('pending','approved','rejected','hidden');
exception when duplicate_object then null; end $$;
do $$ begin create type public.shipment_status as enum ('pending','label_created','picked_up','in_transit','out_for_delivery','delivered','failed_delivery','returned','cancelled');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 4. TABLES (75 of 76 production public tables; _seed_report helper excluded)
--    Columns, NOT NULL, DEFAULTs, PRIMARY KEY, UNIQUE and CHECK are reproduced
--    verbatim from the live catalog. FOREIGN KEYs are added in section 5.
-- ============================================================================

create table if not exists public.addresses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  label text,
  full_name text not null,
  phone text,
  line1 text not null,
  line2 text,
  city text not null,
  state text,
  postal_code text not null,
  country text not null,
  is_default boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint addresses_pkey primary key (id),
  constraint addresses_country_check check ((char_length(country) = 2))
);

create table if not exists public.admin_audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  constraint admin_audit_log_pkey primary key (id)
);

create table if not exists public.admin_users (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  role text default 'admin'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint admin_users_pkey primary key (id),
  constraint admin_users_user_id_key unique (user_id),
  constraint admin_users_role_check check ((role = any (array['admin'::text, 'super_admin'::text])))
);

create table if not exists public.brands (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  description text,
  logo_url text,
  website_url text,
  is_active boolean default true not null,
  seo_title text,
  seo_description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint brands_pkey primary key (id),
  constraint brands_slug_key unique (slug)
);

create table if not exists public.cart_items (
  id uuid default gen_random_uuid() not null,
  cart_id uuid not null,
  variant_id uuid not null,
  customization_id uuid,
  quantity integer not null,
  unit_price_snapshot numeric(12,2) not null,
  is_saved_for_later boolean default false not null,
  reserved_until timestamptz,
  added_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  is_gift_wrapped boolean default false not null,
  gift_note text,
  color text,
  size text,
  constraint cart_items_pkey primary key (id),
  constraint cart_items_cart_variant_color_size_unique unique (cart_id, variant_id, color, size),
  constraint customization_single_cart_item unique (customization_id),
  constraint cart_items_quantity_check check ((quantity > 0)),
  constraint cart_items_unit_price_snapshot_check check ((unit_price_snapshot >= (0)::numeric))
);

create table if not exists public.carts (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  session_token text,
  status text default 'active'::text not null,
  currency text default 'USD'::text not null,
  coupon_id uuid,
  coupon_code text,
  discount_amount numeric(12,2) default 0 not null,
  merged_into_cart_id uuid,
  last_activity_at timestamptz default now() not null,
  expires_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint carts_pkey primary key (id),
  constraint carts_session_token_key unique (session_token),
  constraint carts_discount_amount_check check ((discount_amount >= (0)::numeric)),
  constraint carts_status_check check ((status = any (array['active'::text, 'merged'::text, 'abandoned'::text, 'converted'::text]))),
  constraint exactly_one_identity check ((((owner_id is not null) and (session_token is null)) or ((owner_id is null) and (session_token is not null))))
);

create table if not exists public.categories (
  id uuid default gen_random_uuid() not null,
  parent_id uuid,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  icon text,
  path extensions.ltree,
  level integer default 0 not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  seo_title text,
  seo_description text,
  seo_keywords text[],
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint categories_pkey primary key (id),
  constraint categories_slug_key unique (slug),
  constraint category_not_own_parent check ((parent_id is distinct from id))
);

create table if not exists public.collections (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  is_active boolean default true not null,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer default 0 not null,
  seo_title text,
  seo_description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint collections_pkey primary key (id),
  constraint collections_slug_key unique (slug),
  constraint collection_date_order check (((starts_at is null) or (ends_at is null) or (starts_at < ends_at)))
);

create table if not exists public.coupons (
  id uuid default gen_random_uuid() not null,
  code text not null,
  type text not null,
  value numeric(10,2) not null,
  min_order_amount numeric(12,2),
  max_discount_amount numeric(12,2),
  max_uses integer,
  max_uses_per_user integer,
  used_count integer default 0 not null,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint coupons_pkey primary key (id),
  constraint coupons_code_key unique (code),
  constraint coupon_date_order check (((starts_at is null) or (expires_at is null) or (starts_at < expires_at))),
  constraint coupon_percentage_max_100 check (((type <> 'percentage'::text) or (value <= (100)::numeric))),
  constraint coupons_max_discount_amount_check check (((max_discount_amount is null) or (max_discount_amount >= (0)::numeric))),
  constraint coupons_max_uses_check check (((max_uses is null) or (max_uses > 0))),
  constraint coupons_max_uses_per_user_check check (((max_uses_per_user is null) or (max_uses_per_user > 0))),
  constraint coupons_min_order_amount_check check (((min_order_amount is null) or (min_order_amount >= (0)::numeric))),
  constraint coupons_type_check check ((type = any (array['percentage'::text, 'fixed'::text]))),
  constraint coupons_used_count_check check ((used_count >= 0)),
  constraint coupons_value_check check ((value > (0)::numeric))
);

create table if not exists public.custom_print_requests (
  id uuid default gen_random_uuid() not null,
  request_number text default ((('CP-'::text || to_char(now(), 'YYYY'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) not null,
  user_id uuid,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  product_type text not null,
  size text,
  color text,
  custom_text text,
  notes text,
  design_path text not null,
  design_mime text,
  status text default 'new'::text not null,
  quoted_amount numeric(12,2),
  currency text default 'USD'::text not null,
  admin_notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint custom_print_requests_pkey primary key (id),
  constraint custom_print_requests_request_number_key unique (request_number),
  constraint custom_print_requests_currency_check check ((currency ~ '^[A-Z]{3}$'::text)),
  constraint custom_print_requests_product_type_check check ((product_type = any (array['tshirt'::text, 'mug'::text, 'phonecase'::text, 'poster'::text, 'other'::text]))),
  constraint custom_print_requests_quoted_amount_check check (((quoted_amount is null) or (quoted_amount >= (0)::numeric))),
  constraint custom_print_requests_status_check check ((status = any (array['new'::text, 'reviewing'::text, 'quoted'::text, 'accepted'::text, 'in_production'::text, 'completed'::text, 'cancelled'::text])))
);

create table if not exists public.design_categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  description text,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint design_categories_pkey primary key (id),
  constraint design_categories_slug_key unique (slug)
);

create table if not exists public.design_files (
  id uuid default gen_random_uuid() not null,
  version_id uuid not null,
  file_format design_file_format not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  width_px integer,
  height_px integer,
  dpi integer,
  color_mode text,
  has_transparent_background boolean,
  checksum_sha256 text,
  is_primary boolean default false not null,
  scan_status text default 'pending'::text not null,
  scanned_at timestamptz,
  created_at timestamptz default now() not null,
  constraint design_files_pkey primary key (id),
  constraint design_files_color_mode_check check (((color_mode is null) or (color_mode = any (array['RGB'::text, 'CMYK'::text, 'Grayscale'::text, 'Indexed'::text, 'Duotone'::text, 'Lab'::text])))),
  constraint design_files_dpi_check check (((dpi is null) or (dpi > 0))),
  constraint design_files_file_size_bytes_check check (((file_size_bytes > 0) and (file_size_bytes <= 209715200))),
  constraint design_files_height_px_check check (((height_px is null) or (height_px > 0))),
  constraint design_files_scan_status_check check ((scan_status = any (array['pending'::text, 'clean'::text, 'flagged'::text, 'error'::text]))),
  constraint design_files_width_px_check check (((width_px is null) or (width_px > 0))),
  constraint raster_requires_dimensions check (((file_format <> all (array['png'::design_file_format, 'psd'::design_file_format])) or ((width_px is not null) and (height_px is not null) and (dpi is not null))))
);

create table if not exists public.design_status_history (
  id uuid default gen_random_uuid() not null,
  design_id uuid not null,
  version_id uuid,
  old_status design_status,
  new_status design_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz default now() not null,
  constraint design_status_history_pkey primary key (id)
);

create table if not exists public.design_versions (
  id uuid default gen_random_uuid() not null,
  design_id uuid not null,
  version_number integer not null,
  status design_status default 'draft'::design_status not null,
  is_current boolean default false not null,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint design_versions_pkey primary key (id),
  constraint version_number_unique unique (design_id, version_number),
  constraint design_versions_version_number_check check ((version_number > 0))
);

create table if not exists public.fonts (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  family text not null,
  category text not null,
  storage_path text not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint fonts_pkey primary key (id),
  constraint fonts_slug_key unique (slug),
  constraint fonts_category_check check ((category = any (array['sans-serif'::text, 'serif'::text, 'script'::text, 'display'::text, 'monospace'::text])))
);

create table if not exists public.gallery_images (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  image_url text not null,
  category text default 'custom-prints'::text,
  is_featured boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint gallery_images_pkey primary key (id)
);

create table if not exists public.notification_deliveries (
  id uuid default gen_random_uuid() not null,
  notification_id uuid not null,
  channel text not null,
  status text default 'pending'::text not null,
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now() not null,
  claimed_at timestamptz,
  constraint notification_deliveries_pkey primary key (id),
  constraint notification_deliveries_channel_check check ((channel = any (array['email'::text, 'push'::text, 'in_app'::text, 'sms'::text]))),
  constraint notification_deliveries_status_check check ((status = any (array['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);

create table if not exists public.notification_preferences (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  category text not null,
  email_enabled boolean default true not null,
  push_enabled boolean default true not null,
  in_app_enabled boolean default true not null,
  sms_enabled boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint notification_preferences_pkey primary key (id),
  constraint prefs_unique_user_category unique (user_id, category),
  constraint notification_preferences_category_check check ((category = any (array['order_updates'::text, 'payment_updates'::text, 'printing_status'::text, 'design_approval'::text, 'shipping_updates'::text, 'marketing'::text, 'vendor_orders'::text, 'vendor_designs'::text, 'vendor_inventory'::text, 'vendor_payouts'::text])))
);

create table if not exists public.notification_templates (
  id uuid default gen_random_uuid() not null,
  event_type text not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint notification_templates_pkey primary key (id),
  constraint templates_unique_event_channel unique (event_type, channel),
  constraint notification_templates_channel_check check ((channel = any (array['email'::text, 'push'::text, 'in_app'::text, 'sms'::text])))
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  category text not null,
  event_type text not null,
  title text not null,
  body text,
  data jsonb default '{}'::jsonb not null,
  is_read boolean default false not null,
  read_at timestamptz,
  created_at timestamptz default now() not null,
  constraint notifications_pkey primary key (id)
);

create table if not exists public.order_item_status_history (
  id uuid default gen_random_uuid() not null,
  order_item_id uuid not null,
  old_status order_item_status,
  new_status order_item_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz default now() not null,
  constraint order_item_status_history_pkey primary key (id)
);

create table if not exists public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  variant_id uuid,
  customization_id uuid,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  options_snapshot jsonb,
  unit_price_snapshot numeric(12,2) not null,
  quantity integer not null,
  line_total numeric(12,2) not null,
  printing_instructions text,
  is_gift_wrapped boolean default false not null,
  gift_note text,
  status order_item_status default 'pending'::order_item_status not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint order_items_pkey primary key (id),
  constraint line_total_matches check ((line_total = (unit_price_snapshot * (quantity)::numeric))),
  constraint order_items_line_total_check check ((line_total >= (0)::numeric)),
  constraint order_items_quantity_check check ((quantity > 0)),
  constraint order_items_unit_price_snapshot_check check ((unit_price_snapshot >= (0)::numeric))
);

create table if not exists public.order_status_history (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  old_status order_status,
  new_status order_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz default now() not null,
  constraint order_status_history_pkey primary key (id)
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  order_number text not null,
  user_id uuid not null,
  cart_id uuid,
  status order_status default 'pending'::order_status not null,
  subtotal numeric(12,2) not null,
  tax numeric(12,2) default 0 not null,
  shipping_fee numeric(12,2) default 0 not null,
  discount_amount numeric(12,2) default 0 not null,
  gift_wrap_fee numeric(12,2) default 0 not null,
  total numeric(12,2) not null,
  currency text default 'USD'::text not null,
  coupon_id uuid,
  coupon_code text,
  shipping_address_snapshot jsonb not null,
  billing_address_snapshot jsonb,
  gift_wrap boolean default false not null,
  gift_note text,
  customer_note text,
  internal_note text,
  placed_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  shipping_method_id uuid,
  constraint orders_pkey primary key (id),
  constraint orders_order_number_key unique (order_number),
  constraint orders_discount_amount_check check ((discount_amount >= (0)::numeric)),
  constraint orders_gift_wrap_fee_check check ((gift_wrap_fee >= (0)::numeric)),
  constraint orders_shipping_fee_check check ((shipping_fee >= (0)::numeric)),
  constraint orders_subtotal_check check ((subtotal >= (0)::numeric)),
  constraint orders_tax_check check ((tax >= (0)::numeric)),
  constraint orders_total_check check ((total >= (0)::numeric)),
  constraint total_matches_components check ((total = ((((subtotal + tax) + shipping_fee) + gift_wrap_fee) - discount_amount)))
);

create table if not exists public.payment_events (
  id uuid default gen_random_uuid() not null,
  provider payment_provider not null,
  event_type text not null,
  provider_event_id text,
  payment_id uuid,
  payload jsonb not null,
  signature_verified boolean default false not null,
  processed boolean default false not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz default now() not null,
  constraint payment_events_pkey primary key (id),
  constraint unique_provider_event unique (provider, provider_event_id)
);

create table if not exists public.payment_logs (
  id uuid default gen_random_uuid() not null,
  payment_id uuid not null,
  event text not null,
  old_status text,
  new_status text,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz default now() not null,
  constraint payment_logs_pkey primary key (id)
);

create table if not exists public.payment_receipts (
  id uuid default gen_random_uuid() not null,
  payment_id uuid not null,
  user_id uuid not null,
  provider text default 'vodafone_cash'::text not null,
  transfer_reference text not null,
  payer_phone text not null,
  receipt_url text not null,
  status text default 'pending'::text not null,
  admin_notes text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint payment_receipts_pkey primary key (id),
  constraint payment_receipts_reference_not_blank check ((length(btrim(transfer_reference)) > 0)),
  constraint payment_receipts_status_check check ((status = any (array['pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])))
);

create table if not exists public.payment_retries (
  id uuid default gen_random_uuid() not null,
  payment_id uuid not null,
  attempt_number integer not null,
  status payment_transaction_status not null,
  provider_response jsonb,
  error_message text,
  attempted_at timestamptz default now() not null,
  constraint payment_retries_pkey primary key (id),
  constraint unique_payment_attempt unique (payment_id, attempt_number),
  constraint payment_retries_attempt_number_check check ((attempt_number > 0))
);

create table if not exists public.payments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  provider payment_provider not null,
  status payment_transaction_status default 'pending'::payment_transaction_status not null,
  amount numeric(12,2) not null,
  currency text default 'USD'::text not null,
  provider_payment_id text,
  provider_customer_id text,
  client_secret text,
  idempotency_key text,
  failure_code text,
  failure_message text,
  raw_response jsonb,
  attempt_number integer default 1 not null,
  authorized_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint payments_pkey primary key (id),
  constraint payments_idempotency_key_key unique (idempotency_key),
  constraint payments_amount_check check ((amount > (0)::numeric)),
  constraint payments_attempt_number_check check ((attempt_number > 0)),
  constraint succeeded_needs_provider_ref check (((status <> 'succeeded'::payment_transaction_status) or (provider = any (array['cod'::payment_provider, 'wallet'::payment_provider])) or (provider_payment_id is not null)))
);

create table if not exists public.payout_transactions (
  id uuid default gen_random_uuid() not null,
  payout_id uuid not null,
  vendor_earning_id uuid not null,
  amount numeric not null,
  created_at timestamptz default now() not null,
  constraint payout_transactions_pkey primary key (id),
  constraint payout_transactions_payout_id_vendor_earning_id_key unique (payout_id, vendor_earning_id),
  constraint payout_transactions_amount_check check ((amount > (0)::numeric))
);

create table if not exists public.pickup_locations (
  id uuid default gen_random_uuid() not null,
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text,
  postal_code text,
  country text not null,
  phone text,
  opening_hours jsonb,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint pickup_locations_pkey primary key (id),
  constraint pickup_locations_country_check check ((char_length(country) = 2))
);

create table if not exists public.print_jobs (
  id uuid default gen_random_uuid() not null,
  order_item_id uuid not null,
  status text default 'queued'::text not null,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  store_id uuid,
  assigned_to uuid,
  reprint_count integer default 0 not null,
  printer_id uuid,
  attempt_number integer default 1 not null,
  max_attempts integer default 5 not null,
  next_retry_at timestamptz,
  last_error text,
  timeout_at timestamptz,
  constraint print_jobs_pkey primary key (id),
  constraint print_jobs_order_item_id_key unique (order_item_id),
  constraint print_jobs_attempt_number_check check ((attempt_number > 0)),
  constraint print_jobs_max_attempts_check check ((max_attempts > 0)),
  constraint print_jobs_status_check check ((status = any (array['queued'::text, 'assigned'::text, 'printing'::text, 'quality_check'::text, 'completed'::text, 'failed'::text, 'reprint'::text, 'dead_letter'::text])))
);

create table if not exists public.printers (
  id uuid default gen_random_uuid() not null,
  store_id uuid,
  name text not null,
  status text default 'online'::text not null,
  last_heartbeat_at timestamptz,
  offline_threshold_seconds integer default 120 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint printers_pkey primary key (id),
  constraint printers_offline_threshold_seconds_check check ((offline_threshold_seconds > 0)),
  constraint printers_status_check check ((status = any (array['online'::text, 'offline'::text, 'maintenance'::text])))
);

create table if not exists public.product_attribute_values (
  id uuid default gen_random_uuid() not null,
  attribute_id uuid not null,
  value text not null,
  slug text not null,
  color_hex text,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  constraint product_attribute_values_pkey primary key (id),
  constraint attribute_value_unique unique (attribute_id, slug),
  constraint product_attribute_values_color_hex_check check (((color_hex is null) or (color_hex ~ '^#[0-9A-Fa-f]{6}$'::text)))
);

create table if not exists public.product_attributes (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  input_type text default 'select'::text not null,
  is_variant_defining boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint product_attributes_pkey primary key (id),
  constraint product_attributes_slug_key unique (slug),
  constraint product_attributes_input_type_check check ((input_type = any (array['select'::text, 'color'::text, 'text'::text])))
);

create table if not exists public.product_collection_items (
  collection_id uuid not null,
  product_id uuid not null,
  sort_order integer default 0 not null,
  constraint product_collection_items_pkey primary key (collection_id, product_id)
);

create table if not exists public.product_customization_areas (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  variant_id uuid,
  name text not null,
  slug text not null,
  mockup_image_url text,
  canvas_width_px integer not null,
  canvas_height_px integer not null,
  printing_area_x numeric(8,2) default 0 not null,
  printing_area_y numeric(8,2) default 0 not null,
  printing_area_width numeric(8,2) not null,
  printing_area_height numeric(8,2) not null,
  safe_area_x numeric(8,2) not null,
  safe_area_y numeric(8,2) not null,
  safe_area_width numeric(8,2) not null,
  safe_area_height numeric(8,2) not null,
  bleed_mm numeric(6,2) default 3 not null,
  dpi integer default 300 not null,
  max_layers integer default 10 not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint product_customization_areas_pkey primary key (id),
  constraint area_unique_slug_per_product unique (product_id, slug),
  constraint printing_area_within_canvas check ((((printing_area_x + printing_area_width) <= (canvas_width_px)::numeric) and ((printing_area_y + printing_area_height) <= (canvas_height_px)::numeric))),
  constraint product_customization_areas_bleed_mm_check check ((bleed_mm >= (0)::numeric)),
  constraint product_customization_areas_canvas_height_px_check check ((canvas_height_px > 0)),
  constraint product_customization_areas_canvas_width_px_check check ((canvas_width_px > 0)),
  constraint product_customization_areas_dpi_check check ((dpi > 0)),
  constraint product_customization_areas_max_layers_check check ((max_layers > 0)),
  constraint product_customization_areas_printing_area_height_check check ((printing_area_height > (0)::numeric)),
  constraint product_customization_areas_printing_area_width_check check ((printing_area_width > (0)::numeric)),
  constraint product_customization_areas_printing_area_x_check check ((printing_area_x >= (0)::numeric)),
  constraint product_customization_areas_printing_area_y_check check ((printing_area_y >= (0)::numeric)),
  constraint product_customization_areas_safe_area_height_check check ((safe_area_height > (0)::numeric)),
  constraint product_customization_areas_safe_area_width_check check ((safe_area_width > (0)::numeric)),
  constraint safe_area_within_printing_area check (((safe_area_x >= printing_area_x) and (safe_area_y >= printing_area_y) and ((safe_area_x + safe_area_width) <= (printing_area_x + printing_area_width)) and ((safe_area_y + safe_area_height) <= (printing_area_y + printing_area_height))))
);

create table if not exists public.product_customization_layers (
  id uuid default gen_random_uuid() not null,
  customization_id uuid not null,
  area_id uuid not null,
  layer_type text not null,
  z_index integer default 0 not null,
  position_x numeric(8,2) default 0 not null,
  position_y numeric(8,2) default 0 not null,
  rotation_deg numeric(6,2) default 0 not null,
  scale numeric(6,3) default 1 not null,
  width_px numeric(8,2),
  height_px numeric(8,2),
  opacity numeric(3,2) default 1 not null,
  is_locked boolean default false not null,
  text_content text,
  font_id uuid,
  font_size numeric(6,2),
  text_color text,
  text_align text,
  design_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint product_customization_layers_pkey primary key (id),
  constraint image_layer_fields check (((layer_type <> 'image'::text) or ((design_id is not null) and (text_content is null) and (font_id is null) and (font_size is null) and (text_color is null)))),
  constraint product_customization_layers_font_size_check check (((font_size is null) or (font_size > (0)::numeric))),
  constraint product_customization_layers_height_px_check check (((height_px is null) or (height_px > (0)::numeric))),
  constraint product_customization_layers_layer_type_check check ((layer_type = any (array['text'::text, 'image'::text]))),
  constraint product_customization_layers_opacity_check check (((opacity >= (0)::numeric) and (opacity <= (1)::numeric))),
  constraint product_customization_layers_rotation_deg_check check (((rotation_deg >= ('-360'::integer)::numeric) and (rotation_deg <= (360)::numeric))),
  constraint product_customization_layers_scale_check check ((scale > (0)::numeric)),
  constraint product_customization_layers_text_align_check check (((text_align is null) or (text_align = any (array['left'::text, 'center'::text, 'right'::text])))),
  constraint product_customization_layers_text_color_check check (((text_color is null) or (text_color ~ '^#[0-9A-Fa-f]{6}$'::text))),
  constraint product_customization_layers_width_px_check check (((width_px is null) or (width_px > (0)::numeric))),
  constraint text_layer_fields check (((layer_type <> 'text'::text) or ((text_content is not null) and (font_id is not null) and (font_size is not null) and (text_color is not null) and (design_id is null))))
);

create table if not exists public.product_customizations (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  name text default 'Untitled design'::text not null,
  status text default 'draft'::text not null,
  preview_image_url text,
  preview_settings jsonb default '{"zoom": 1, "background": "#ffffff", "show_safe_area": true, "show_bleed_area": false}'::jsonb not null,
  cart_item_id uuid,
  order_item_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint product_customizations_pkey primary key (id),
  constraint product_customizations_status_check check ((status = any (array['draft'::text, 'ready'::text, 'ordered'::text])))
);

create table if not exists public.product_images (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  variant_id uuid,
  storage_path text not null,
  alt_text text,
  sort_order integer default 0 not null,
  is_primary boolean default false not null,
  created_at timestamptz default now() not null,
  constraint product_images_pkey primary key (id)
);

create table if not exists public.product_tags (
  product_id uuid not null,
  tag_id uuid not null,
  constraint product_tags_pkey primary key (product_id, tag_id)
);

create table if not exists public.product_variant_options (
  variant_id uuid not null,
  attribute_value_id uuid not null,
  constraint product_variant_options_pkey primary key (variant_id, attribute_value_id)
);

create table if not exists public.product_variants (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  sku text not null,
  barcode text,
  price numeric(12,2) not null,
  compare_at_price numeric(12,2),
  stock_quantity integer default 0 not null,
  reserved_quantity integer default 0 not null,
  low_stock_threshold integer,
  weight_grams integer,
  length_cm numeric(8,2),
  width_cm numeric(8,2),
  height_cm numeric(8,2),
  image_url text,
  is_active boolean default true not null,
  is_default boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint product_variants_pkey primary key (id),
  constraint product_variants_sku_key unique (sku),
  constraint product_variants_compare_at_price_check check (((compare_at_price is null) or (compare_at_price >= (0)::numeric))),
  constraint product_variants_height_cm_check check (((height_cm is null) or (height_cm >= (0)::numeric))),
  constraint product_variants_length_cm_check check (((length_cm is null) or (length_cm >= (0)::numeric))),
  constraint product_variants_low_stock_threshold_check check (((low_stock_threshold is null) or (low_stock_threshold >= 0))),
  constraint product_variants_price_check check ((price >= (0)::numeric)),
  constraint product_variants_reserved_quantity_check check ((reserved_quantity >= 0)),
  constraint product_variants_stock_quantity_check check ((stock_quantity >= 0)),
  constraint product_variants_weight_grams_check check (((weight_grams is null) or (weight_grams >= 0))),
  constraint product_variants_width_cm_check check (((width_cm is null) or (width_cm >= (0)::numeric)))
);

create table if not exists public.products (
  id uuid default gen_random_uuid() not null,
  store_id uuid,
  brand_id uuid,
  category_id uuid,
  name text not null,
  slug text not null,
  short_description text,
  description text,
  status product_status default 'draft'::product_status not null,
  visibility product_visibility default 'visible'::product_visibility not null,
  is_featured boolean default false not null,
  base_price numeric(12,2) not null,
  compare_at_price numeric(12,2),
  currency text default 'USD'::text not null,
  weight_grams integer,
  length_cm numeric(8,2),
  width_cm numeric(8,2),
  height_cm numeric(8,2),
  low_stock_threshold integer default 5 not null,
  specifications jsonb default '{}'::jsonb not null,
  seo_title text,
  seo_description text,
  seo_keywords text[],
  avg_rating numeric(3,2) default 0 not null,
  rating_count integer default 0 not null,
  view_count bigint default 0 not null,
  search_vector tsvector,
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  color text,
  available_colors text[] default '{}'::text[] not null,
  constraint products_pkey primary key (id),
  constraint products_slug_key unique (slug),
  constraint products_avg_rating_check check (((avg_rating >= (0)::numeric) and (avg_rating <= (5)::numeric))),
  constraint products_base_price_check check ((base_price >= (0)::numeric)),
  constraint products_compare_at_price_check check (((compare_at_price is null) or (compare_at_price >= (0)::numeric))),
  constraint products_currency_check check ((char_length(currency) = 3)),
  constraint products_height_cm_check check (((height_cm is null) or (height_cm >= (0)::numeric))),
  constraint products_length_cm_check check (((length_cm is null) or (length_cm >= (0)::numeric))),
  constraint products_low_stock_threshold_check check ((low_stock_threshold >= 0)),
  constraint products_rating_count_check check ((rating_count >= 0)),
  constraint products_view_count_check check ((view_count >= 0)),
  constraint products_weight_grams_check check (((weight_grams is null) or (weight_grams >= 0))),
  constraint products_width_cm_check check (((width_cm is null) or (width_cm >= (0)::numeric)))
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text,
  avatar_url text,
  phone text,
  role app_role default 'customer'::app_role not null,
  default_address_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint profiles_pkey primary key (id),
  constraint phone_format check (((phone is null) or (phone ~ '^\+?[0-9\s\-()]{6,20}$'::text)))
);

create table if not exists public.push_devices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  platform text not null,
  push_token text not null,
  device_name text,
  is_active boolean default true not null,
  last_used_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  constraint push_devices_pkey primary key (id),
  constraint push_devices_push_token_key unique (push_token),
  constraint push_devices_platform_check check ((platform = any (array['ios'::text, 'android'::text, 'web'::text])))
);

create table if not exists public.recently_viewed_products (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  session_token text,
  product_id uuid not null,
  view_count integer default 1 not null,
  first_viewed_at timestamptz default now() not null,
  last_viewed_at timestamptz default now() not null,
  constraint recently_viewed_products_pkey primary key (id),
  constraint recently_viewed_exactly_one_identity check ((((user_id is not null) and (session_token is null)) or ((user_id is null) and (session_token is not null)))),
  constraint recently_viewed_products_view_count_check check ((view_count > 0))
);

create table if not exists public.refunds (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  return_id uuid,
  payment_id uuid,
  amount numeric(12,2) not null,
  reason text not null,
  status refund_status default 'pending'::refund_status not null,
  provider_refund_id text,
  processed_by uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint refunds_pkey primary key (id),
  constraint refunds_amount_check check ((amount > (0)::numeric))
);

create table if not exists public.return_items (
  id uuid default gen_random_uuid() not null,
  return_id uuid not null,
  order_item_id uuid not null,
  quantity integer not null,
  reason text,
  condition text,
  created_at timestamptz default now() not null,
  constraint return_items_pkey primary key (id),
  constraint return_items_condition_check check (((condition is null) or (condition = any (array['unopened'::text, 'opened'::text, 'damaged'::text, 'defective'::text, 'wrong_item'::text])))),
  constraint return_items_quantity_check check ((quantity > 0))
);

create table if not exists public.returns (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  requested_by uuid not null,
  reason text not null,
  status return_status default 'requested'::return_status not null,
  resolution_note text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint returns_pkey primary key (id)
);

create table if not exists public.review_media (
  id uuid default gen_random_uuid() not null,
  review_id uuid not null,
  media_type text not null,
  storage_path text not null,
  thumbnail_path text,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  constraint review_media_pkey primary key (id),
  constraint review_media_media_type_check check ((media_type = any (array['image'::text, 'video'::text])))
);

create table if not exists public.review_replies (
  id uuid default gen_random_uuid() not null,
  review_id uuid not null,
  parent_reply_id uuid,
  user_id uuid not null,
  body text not null,
  is_seller_reply boolean default false not null,
  status text default 'visible'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint review_replies_pkey primary key (id),
  constraint review_replies_status_check check ((status = any (array['visible'::text, 'hidden'::text])))
);

create table if not exists public.review_reports (
  id uuid default gen_random_uuid() not null,
  review_id uuid not null,
  reported_by uuid not null,
  reason text not null,
  details text,
  status text default 'pending'::text not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null,
  constraint review_reports_pkey primary key (id),
  constraint review_reports_unique_per_user unique (review_id, reported_by),
  constraint review_reports_reason_check check ((reason = any (array['spam'::text, 'offensive'::text, 'fake'::text, 'irrelevant'::text, 'other'::text]))),
  constraint review_reports_status_check check ((status = any (array['pending'::text, 'reviewed'::text, 'dismissed'::text])))
);

create table if not exists public.review_votes (
  id uuid default gen_random_uuid() not null,
  review_id uuid not null,
  user_id uuid not null,
  vote_type text not null,
  created_at timestamptz default now() not null,
  constraint review_votes_pkey primary key (id),
  constraint review_votes_unique_per_user unique (review_id, user_id),
  constraint review_votes_vote_type_check check ((vote_type = any (array['helpful'::text, 'not_helpful'::text])))
);

create table if not exists public.reviews (
  id uuid default gen_random_uuid() not null,
  product_id uuid not null,
  order_item_id uuid,
  user_id uuid not null,
  rating integer not null,
  title text,
  body text,
  is_verified_purchase boolean default false not null,
  status review_status default 'pending'::review_status not null,
  helpful_count integer default 0 not null,
  not_helpful_count integer default 0 not null,
  report_count integer default 0 not null,
  moderated_by uuid,
  moderated_at timestamptz,
  moderation_note text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint reviews_pkey primary key (id),
  constraint review_unique_per_product_user unique (product_id, user_id),
  constraint reviews_helpful_count_check check ((helpful_count >= 0)),
  constraint reviews_not_helpful_count_check check ((not_helpful_count >= 0)),
  constraint reviews_rating_check check (((rating >= 1) and (rating <= 5))),
  constraint reviews_report_count_check check ((report_count >= 0))
);

create table if not exists public.search_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  session_token text,
  query text not null,
  normalized_query text generated always as (lower(btrim(query))) stored,
  result_count integer default 0 not null,
  clicked_product_id uuid,
  created_at timestamptz default now() not null,
  constraint search_logs_pkey primary key (id)
);

create table if not exists public.shipment_items (
  id uuid default gen_random_uuid() not null,
  shipment_id uuid not null,
  order_item_id uuid not null,
  quantity integer not null,
  constraint shipment_items_pkey primary key (id),
  constraint shipment_items_quantity_check check ((quantity > 0))
);

create table if not exists public.shipment_status_history (
  id uuid default gen_random_uuid() not null,
  shipment_id uuid not null,
  old_status shipment_status,
  new_status shipment_status not null,
  note text,
  changed_by uuid,
  created_at timestamptz default now() not null,
  constraint shipment_status_history_pkey primary key (id)
);

create table if not exists public.shipments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  shipping_method_id uuid not null,
  pickup_location_id uuid,
  status shipment_status default 'pending'::shipment_status not null,
  carrier text,
  tracking_number text,
  tracking_url text,
  shipping_fee_charged numeric(10,2) default 0 not null,
  weight_grams integer,
  estimated_delivery_date_min date,
  estimated_delivery_date_max date,
  actual_delivery_date date,
  shipped_at timestamptz,
  delivered_at timestamptz,
  recipient_signature text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint shipments_pkey primary key (id),
  constraint shipments_shipping_fee_charged_check check ((shipping_fee_charged >= (0)::numeric)),
  constraint shipments_weight_grams_check check (((weight_grams is null) or (weight_grams >= 0)))
);

create table if not exists public.shipping_methods (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  type text not null,
  carrier text,
  description text,
  requires_address boolean default true not null,
  min_delivery_days integer default 0 not null,
  max_delivery_days integer not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint shipping_methods_pkey primary key (id),
  constraint shipping_methods_slug_key unique (slug),
  constraint shipping_methods_check check ((max_delivery_days >= min_delivery_days)),
  constraint shipping_methods_min_delivery_days_check check ((min_delivery_days >= 0)),
  constraint shipping_methods_type_check check ((type = any (array['standard'::text, 'express'::text, 'pickup'::text])))
);

create table if not exists public.shipping_rates (
  id uuid default gen_random_uuid() not null,
  zone_id uuid not null,
  method_id uuid not null,
  base_fee numeric(10,2) default 0 not null,
  per_kg_fee numeric(10,2) default 0 not null,
  free_shipping_threshold numeric(12,2),
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint shipping_rates_pkey primary key (id),
  constraint shipping_rate_unique_zone_method unique (zone_id, method_id),
  constraint shipping_rates_base_fee_check check ((base_fee >= (0)::numeric)),
  constraint shipping_rates_free_shipping_threshold_check check (((free_shipping_threshold is null) or (free_shipping_threshold >= (0)::numeric))),
  constraint shipping_rates_per_kg_fee_check check ((per_kg_fee >= (0)::numeric))
);

create table if not exists public.shipping_zones (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  countries text[] default '{}'::text[] not null,
  is_default boolean default false not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint shipping_zones_pkey primary key (id),
  constraint shipping_zones_slug_key unique (slug)
);

create table if not exists public.sms_numbers (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  phone_number text not null,
  is_verified boolean default false not null,
  verification_code text,
  verification_expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint sms_numbers_pkey primary key (id),
  constraint sms_numbers_user_id_key unique (user_id)
);

create table if not exists public.store_settings (
  key text not null,
  value jsonb default '{}'::jsonb not null,
  is_public boolean default false not null,
  updated_by uuid,
  updated_at timestamptz default now() not null,
  constraint store_settings_pkey primary key (key)
);

create table if not exists public.stores (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text not null,
  slug text not null,
  description text,
  logo_url text,
  status text default 'pending'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint stores_pkey primary key (id),
  constraint stores_slug_unique unique (slug),
  constraint stores_status_check check ((status = any (array['pending'::text, 'approved'::text, 'suspended'::text, 'rejected'::text])))
);

create table if not exists public.tags (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint tags_pkey primary key (id),
  constraint tags_slug_key unique (slug)
);

create table if not exists public.user_designs (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  category_id uuid,
  title text not null,
  slug text not null,
  description text,
  status design_status default 'draft'::design_status not null,
  is_public boolean default false not null,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  download_count bigint default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint user_designs_pkey primary key (id),
  constraint user_designs_slug_key unique (slug),
  constraint user_designs_download_count_check check ((download_count >= 0))
);

create table if not exists public.vendor_commissions (
  id uuid default gen_random_uuid() not null,
  store_id uuid,
  rate_percent numeric not null,
  is_active boolean default true not null,
  effective_from timestamptz default now() not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint vendor_commissions_pkey primary key (id),
  constraint vendor_commissions_rate_percent_check check (((rate_percent >= (0)::numeric) and (rate_percent <= (100)::numeric)))
);

create table if not exists public.vendor_earnings (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null,
  gross_amount numeric not null,
  commission_rate numeric not null,
  commission_amount numeric not null,
  net_amount numeric not null,
  currency text default 'USD'::text not null,
  status text default 'available'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint vendor_earnings_pkey primary key (id),
  constraint vendor_earnings_order_item_id_key unique (order_item_id),
  constraint vendor_earnings_commission_amount_check check ((commission_amount >= (0)::numeric)),
  constraint vendor_earnings_commission_rate_check check (((commission_rate >= (0)::numeric) and (commission_rate <= (100)::numeric))),
  constraint vendor_earnings_gross_amount_check check ((gross_amount >= (0)::numeric)),
  constraint vendor_earnings_net_amount_check check ((net_amount >= (0)::numeric)),
  constraint vendor_earnings_status_check check ((status = any (array['pending'::text, 'available'::text, 'paid'::text, 'reversed'::text])))
);

create table if not exists public.vendor_payout_requests (
  id uuid default gen_random_uuid() not null,
  store_id uuid not null,
  requested_amount numeric not null,
  status text default 'pending'::text not null,
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint vendor_payout_requests_pkey primary key (id),
  constraint vendor_payout_requests_requested_amount_check check ((requested_amount > (0)::numeric)),
  constraint vendor_payout_requests_status_check check ((status = any (array['pending'::text, 'approved'::text, 'paid'::text, 'rejected'::text])))
);

create table if not exists public.vendor_payouts (
  id uuid default gen_random_uuid() not null,
  payout_request_id uuid,
  store_id uuid not null,
  amount numeric not null,
  currency text default 'USD'::text not null,
  status text default 'pending'::text not null,
  payout_method text,
  provider_reference text,
  processed_by uuid,
  processed_at timestamptz,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint vendor_payouts_pkey primary key (id),
  constraint vendor_payouts_amount_check check ((amount > (0)::numeric)),
  constraint vendor_payouts_payout_method_check check (((payout_method is null) or (payout_method = any (array['bank_transfer'::text, 'paypal'::text, 'wallet'::text, 'other'::text])))),
  constraint vendor_payouts_status_check check ((status = any (array['pending'::text, 'approved'::text, 'paid'::text, 'rejected'::text])))
);

create table if not exists public.wallet_transactions (
  id uuid default gen_random_uuid() not null,
  wallet_id uuid not null,
  type text not null,
  amount numeric(12,2) not null,
  reason text not null,
  order_id uuid,
  payment_id uuid,
  created_by uuid,
  balance_after numeric(12,2) not null,
  created_at timestamptz default now() not null,
  constraint wallet_transactions_pkey primary key (id),
  constraint wallet_transactions_amount_check check ((amount > (0)::numeric)),
  constraint wallet_transactions_type_check check ((type = any (array['credit'::text, 'debit'::text])))
);

create table if not exists public.wallets (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  balance numeric(12,2) default 0 not null,
  currency text default 'USD'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint wallets_pkey primary key (id),
  constraint wallets_user_id_key unique (user_id),
  constraint wallets_balance_check check ((balance >= (0)::numeric))
);

create table if not exists public.wishlist_items (
  id uuid default gen_random_uuid() not null,
  wishlist_id uuid not null,
  variant_id uuid not null,
  customization_id uuid,
  note text,
  sort_order integer default 0 not null,
  added_at timestamptz default now() not null,
  constraint wishlist_items_pkey primary key (id),
  constraint wishlist_item_customization_unique unique (customization_id)
);

create table if not exists public.wishlists (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text default 'My Wishlist'::text not null,
  slug text not null,
  description text,
  visibility text default 'private'::text not null,
  share_token text default encode(extensions.gen_random_bytes(16), 'hex'::text) not null,
  is_default boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  constraint wishlists_pkey primary key (id),
  constraint wishlist_slug_unique_per_owner unique (owner_id, slug),
  constraint wishlists_share_token_key unique (share_token),
  constraint wishlists_visibility_check check ((visibility = any (array['private'::text, 'unlisted'::text, 'public'::text])))
);

-- ============================================================================
-- 5. FOREIGN KEYS (132 in production) - added after all tables exist
-- ============================================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('public.addresses','addresses_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.admin_audit_log','admin_audit_log_actor_id_fkey',$d$FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL$d$),
    ('public.admin_users','admin_users_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$d$),
    ('public.cart_items','cart_items_cart_id_fkey',$d$FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE$d$),
    ('public.cart_items','cart_items_customization_id_fkey',$d$FOREIGN KEY (customization_id) REFERENCES product_customizations(id) ON DELETE RESTRICT$d$),
    ('public.cart_items','cart_items_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT$d$),
    ('public.carts','carts_coupon_id_fkey',$d$FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL$d$),
    ('public.carts','carts_merged_into_cart_id_fkey',$d$FOREIGN KEY (merged_into_cart_id) REFERENCES carts(id) ON DELETE SET NULL$d$),
    ('public.carts','carts_owner_id_fkey',$d$FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.categories','categories_parent_id_fkey',$d$FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT$d$),
    ('public.custom_print_requests','custom_print_requests_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL$d$),
    ('public.design_files','design_files_version_id_fkey',$d$FOREIGN KEY (version_id) REFERENCES design_versions(id) ON DELETE CASCADE$d$),
    ('public.design_status_history','design_status_history_changed_by_fkey',$d$FOREIGN KEY (changed_by) REFERENCES profiles(id)$d$),
    ('public.design_status_history','design_status_history_design_id_fkey',$d$FOREIGN KEY (design_id) REFERENCES user_designs(id) ON DELETE CASCADE$d$),
    ('public.design_status_history','design_status_history_version_id_fkey',$d$FOREIGN KEY (version_id) REFERENCES design_versions(id) ON DELETE CASCADE$d$),
    ('public.design_versions','design_versions_design_id_fkey',$d$FOREIGN KEY (design_id) REFERENCES user_designs(id) ON DELETE CASCADE$d$),
    ('public.design_versions','design_versions_reviewed_by_fkey',$d$FOREIGN KEY (reviewed_by) REFERENCES profiles(id)$d$),
    ('public.order_item_status_history','order_item_status_history_changed_by_fkey',$d$FOREIGN KEY (changed_by) REFERENCES profiles(id)$d$),
    ('public.order_item_status_history','order_item_status_history_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE$d$),
    ('public.order_items','order_items_customization_id_fkey',$d$FOREIGN KEY (customization_id) REFERENCES product_customizations(id) ON DELETE SET NULL$d$),
    ('public.order_items','order_items_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE$d$),
    ('public.order_items','order_items_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL$d$),
    ('public.order_status_history','order_status_history_changed_by_fkey',$d$FOREIGN KEY (changed_by) REFERENCES profiles(id)$d$),
    ('public.order_status_history','order_status_history_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE$d$),
    ('public.orders','orders_cart_id_fkey',$d$FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL$d$),
    ('public.orders','orders_coupon_id_fkey',$d$FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL$d$),
    ('public.orders','orders_shipping_method_id_fkey',$d$FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE SET NULL$d$),
    ('public.orders','orders_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT$d$),
    ('public.payment_events','payment_events_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL$d$),
    ('public.payment_logs','payment_logs_created_by_fkey',$d$FOREIGN KEY (created_by) REFERENCES profiles(id)$d$),
    ('public.payment_logs','payment_logs_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE$d$),
    ('public.payment_receipts','payment_receipts_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE$d$),
    ('public.payment_receipts','payment_receipts_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE$d$),
    ('public.payment_receipts','payment_receipts_verified_by_fkey',$d$FOREIGN KEY (verified_by) REFERENCES auth.users(id)$d$),
    ('public.payment_retries','payment_retries_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE$d$),
    ('public.payments','payments_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT$d$),
    ('public.payout_transactions','payout_transactions_payout_id_fkey',$d$FOREIGN KEY (payout_id) REFERENCES vendor_payouts(id) ON DELETE CASCADE$d$),
    ('public.payout_transactions','payout_transactions_vendor_earning_id_fkey',$d$FOREIGN KEY (vendor_earning_id) REFERENCES vendor_earnings(id)$d$),
    ('public.print_jobs','print_jobs_assigned_to_fkey',$d$FOREIGN KEY (assigned_to) REFERENCES profiles(id)$d$),
    ('public.print_jobs','print_jobs_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE$d$),
    ('public.print_jobs','print_jobs_printer_id_fkey',$d$FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE SET NULL$d$),
    ('public.print_jobs','print_jobs_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id)$d$),
    ('public.printers','printers_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE$d$),
    ('public.product_attribute_values','product_attribute_values_attribute_id_fkey',$d$FOREIGN KEY (attribute_id) REFERENCES product_attributes(id) ON DELETE CASCADE$d$),
    ('public.product_collection_items','product_collection_items_collection_id_fkey',$d$FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE$d$),
    ('public.product_collection_items','product_collection_items_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.product_customization_areas','product_customization_areas_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.product_customization_areas','product_customization_areas_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE$d$),
    ('public.product_customization_layers','product_customization_layers_area_id_fkey',$d$FOREIGN KEY (area_id) REFERENCES product_customization_areas(id) ON DELETE RESTRICT$d$),
    ('public.product_customization_layers','product_customization_layers_customization_id_fkey',$d$FOREIGN KEY (customization_id) REFERENCES product_customizations(id) ON DELETE CASCADE$d$),
    ('public.product_customization_layers','product_customization_layers_design_id_fkey',$d$FOREIGN KEY (design_id) REFERENCES user_designs(id) ON DELETE RESTRICT$d$),
    ('public.product_customization_layers','product_customization_layers_font_id_fkey',$d$FOREIGN KEY (font_id) REFERENCES fonts(id) ON DELETE RESTRICT$d$),
    ('public.product_customizations','fk_customization_cart_item',$d$FOREIGN KEY (cart_item_id) REFERENCES cart_items(id) ON DELETE SET NULL$d$),
    ('public.product_customizations','fk_customization_order_item',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL$d$),
    ('public.product_customizations','product_customizations_owner_id_fkey',$d$FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.product_customizations','product_customizations_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT$d$),
    ('public.product_customizations','product_customizations_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT$d$),
    ('public.product_images','product_images_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.product_images','product_images_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE$d$),
    ('public.product_tags','product_tags_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.product_tags','product_tags_tag_id_fkey',$d$FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE$d$),
    ('public.product_variant_options','product_variant_options_attribute_value_id_fkey',$d$FOREIGN KEY (attribute_value_id) REFERENCES product_attribute_values(id) ON DELETE RESTRICT$d$),
    ('public.product_variant_options','product_variant_options_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE$d$),
    ('public.product_variants','product_variants_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.products','products_brand_id_fkey',$d$FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL$d$),
    ('public.products','products_category_id_fkey',$d$FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL$d$),
    ('public.products','products_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT$d$),
    ('public.profiles','fk_profiles_default_address',$d$FOREIGN KEY (default_address_id) REFERENCES addresses(id) ON DELETE SET NULL$d$),
    ('public.profiles','profiles_id_fkey',$d$FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE$d$),
    ('public.notification_deliveries','notification_deliveries_notification_id_fkey',$d$FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE$d$),
    ('public.notification_preferences','notification_preferences_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.notifications','notifications_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.push_devices','push_devices_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.recently_viewed_products','recently_viewed_products_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.recently_viewed_products','recently_viewed_products_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.refunds','refunds_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT$d$),
    ('public.refunds','refunds_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL$d$),
    ('public.refunds','refunds_processed_by_fkey',$d$FOREIGN KEY (processed_by) REFERENCES profiles(id)$d$),
    ('public.refunds','refunds_return_id_fkey',$d$FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE SET NULL$d$),
    ('public.return_items','return_items_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT$d$),
    ('public.return_items','return_items_return_id_fkey',$d$FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE$d$),
    ('public.returns','returns_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT$d$),
    ('public.returns','returns_requested_by_fkey',$d$FOREIGN KEY (requested_by) REFERENCES profiles(id)$d$),
    ('public.review_media','review_media_review_id_fkey',$d$FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE$d$),
    ('public.review_replies','review_replies_parent_reply_id_fkey',$d$FOREIGN KEY (parent_reply_id) REFERENCES review_replies(id) ON DELETE CASCADE$d$),
    ('public.review_replies','review_replies_review_id_fkey',$d$FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE$d$),
    ('public.review_replies','review_replies_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.review_reports','review_reports_reported_by_fkey',$d$FOREIGN KEY (reported_by) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.review_reports','review_reports_review_id_fkey',$d$FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE$d$),
    ('public.review_reports','review_reports_reviewed_by_fkey',$d$FOREIGN KEY (reviewed_by) REFERENCES profiles(id)$d$),
    ('public.review_votes','review_votes_review_id_fkey',$d$FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE$d$),
    ('public.review_votes','review_votes_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.reviews','reviews_moderated_by_fkey',$d$FOREIGN KEY (moderated_by) REFERENCES profiles(id)$d$),
    ('public.reviews','reviews_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL$d$),
    ('public.reviews','reviews_product_id_fkey',$d$FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE$d$),
    ('public.reviews','reviews_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.search_logs','search_logs_clicked_product_id_fkey',$d$FOREIGN KEY (clicked_product_id) REFERENCES products(id) ON DELETE SET NULL$d$),
    ('public.search_logs','search_logs_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL$d$),
    ('public.shipment_items','shipment_items_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT$d$),
    ('public.shipment_items','shipment_items_shipment_id_fkey',$d$FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE$d$),
    ('public.shipment_status_history','shipment_status_history_changed_by_fkey',$d$FOREIGN KEY (changed_by) REFERENCES profiles(id)$d$),
    ('public.shipment_status_history','shipment_status_history_shipment_id_fkey',$d$FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE$d$),
    ('public.shipments','shipments_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT$d$),
    ('public.shipments','shipments_pickup_location_id_fkey',$d$FOREIGN KEY (pickup_location_id) REFERENCES pickup_locations(id) ON DELETE RESTRICT$d$),
    ('public.shipments','shipments_shipping_method_id_fkey',$d$FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE RESTRICT$d$),
    ('public.shipping_rates','shipping_rates_method_id_fkey',$d$FOREIGN KEY (method_id) REFERENCES shipping_methods(id) ON DELETE CASCADE$d$),
    ('public.shipping_rates','shipping_rates_zone_id_fkey',$d$FOREIGN KEY (zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE$d$),
    ('public.sms_numbers','sms_numbers_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.store_settings','store_settings_updated_by_fkey',$d$FOREIGN KEY (updated_by) REFERENCES auth.users(id)$d$),
    ('public.stores','stores_owner_id_fkey',$d$FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE RESTRICT$d$),
    ('public.user_designs','user_designs_category_id_fkey',$d$FOREIGN KEY (category_id) REFERENCES design_categories(id) ON DELETE SET NULL$d$),
    ('public.user_designs','user_designs_owner_id_fkey',$d$FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.user_designs','user_designs_reviewed_by_fkey',$d$FOREIGN KEY (reviewed_by) REFERENCES profiles(id)$d$),
    ('public.vendor_commissions','vendor_commissions_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE$d$),
    ('public.vendor_earnings','vendor_earnings_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id)$d$),
    ('public.vendor_earnings','vendor_earnings_order_item_id_fkey',$d$FOREIGN KEY (order_item_id) REFERENCES order_items(id)$d$),
    ('public.vendor_earnings','vendor_earnings_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE$d$),
    ('public.vendor_payout_requests','vendor_payout_requests_requested_by_fkey',$d$FOREIGN KEY (requested_by) REFERENCES profiles(id)$d$),
    ('public.vendor_payout_requests','vendor_payout_requests_reviewed_by_fkey',$d$FOREIGN KEY (reviewed_by) REFERENCES profiles(id)$d$),
    ('public.vendor_payout_requests','vendor_payout_requests_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE$d$),
    ('public.vendor_payouts','vendor_payouts_payout_request_id_fkey',$d$FOREIGN KEY (payout_request_id) REFERENCES vendor_payout_requests(id)$d$),
    ('public.vendor_payouts','vendor_payouts_processed_by_fkey',$d$FOREIGN KEY (processed_by) REFERENCES profiles(id)$d$),
    ('public.vendor_payouts','vendor_payouts_store_id_fkey',$d$FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE$d$),
    ('public.wallet_transactions','wallet_transactions_created_by_fkey',$d$FOREIGN KEY (created_by) REFERENCES profiles(id)$d$),
    ('public.wallet_transactions','wallet_transactions_order_id_fkey',$d$FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL$d$),
    ('public.wallet_transactions','wallet_transactions_payment_id_fkey',$d$FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL$d$),
    ('public.wallet_transactions','wallet_transactions_wallet_id_fkey',$d$FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE$d$),
    ('public.wallets','wallets_user_id_fkey',$d$FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE$d$),
    ('public.wishlist_items','wishlist_items_customization_id_fkey',$d$FOREIGN KEY (customization_id) REFERENCES product_customizations(id) ON DELETE RESTRICT$d$),
    ('public.wishlist_items','wishlist_items_variant_id_fkey',$d$FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE$d$),
    ('public.wishlist_items','wishlist_items_wishlist_id_fkey',$d$FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE$d$),
    ('public.wishlists','wishlists_owner_id_fkey',$d$FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE$d$)
  ) as v(tbl, conname, def)
  loop
    if not exists (select 1 from pg_constraint where conrelid = r.tbl::regclass and conname = r.conname) then
      execute format('alter table %s add constraint %I %s', r.tbl, r.conname, r.def);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 6. INDEXES (321 in production; definitions below cover the 45 foundational
--    tables. Constraint-backed PK/UNIQUE indexes are already created above and
--    are intentionally skipped here.)
-- ============================================================================
create unique index if not exists idx_addresses_one_default on public.addresses using btree (user_id) where (is_default and (deleted_at is null));
create index if not exists idx_addresses_user on public.addresses using btree (user_id) where (deleted_at is null);
create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log using btree (created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log using btree (entity_type, entity_id);
create index if not exists idx_brands_active on public.brands using btree (is_active) where (deleted_at is null);
create index if not exists idx_brands_name_trgm on public.brands using gin (name extensions.gin_trgm_ops);
create index if not exists idx_cart_items_cart on public.cart_items using btree (cart_id);
create index if not exists idx_cart_items_reserved_until on public.cart_items using btree (reserved_until) where (reserved_until is not null);
create index if not exists idx_cart_items_saved_for_later on public.cart_items using btree (cart_id) where is_saved_for_later;
create unique index if not exists idx_cart_items_unique_plain_line on public.cart_items using btree (cart_id, variant_id, is_saved_for_later) where (customization_id is null);
create index if not exists idx_cart_items_variant on public.cart_items using btree (variant_id);
create index if not exists idx_carts_coupon_id on public.carts using btree (coupon_id);
create index if not exists idx_carts_expires_at on public.carts using btree (expires_at) where (status = 'active'::text);
create index if not exists idx_carts_merged_into_cart_id on public.carts using btree (merged_into_cart_id);
create index if not exists idx_carts_owner_active on public.carts using btree (owner_id) where (status = 'active'::text);
create index if not exists idx_carts_session_active on public.carts using btree (session_token) where (status = 'active'::text);
create index if not exists idx_categories_active on public.categories using btree (is_active) where (deleted_at is null);
create index if not exists idx_categories_name_trgm on public.categories using gin (name extensions.gin_trgm_ops);
create index if not exists idx_categories_parent on public.categories using btree (parent_id) where (deleted_at is null);
create index if not exists idx_categories_path_gist on public.categories using gist (path);
create index if not exists idx_coupons_active on public.coupons using btree (is_active);
create unique index if not exists idx_files_checksum on public.design_files using btree (checksum_sha256) where (checksum_sha256 is not null);
create index if not exists idx_files_scan_status on public.design_files using btree (scan_status) where (scan_status <> 'clean'::text);
create index if not exists idx_files_version on public.design_files using btree (version_id);
create index if not exists idx_design_versions_reviewed_by on public.design_versions using btree (reviewed_by);
create index if not exists idx_versions_current on public.design_versions using btree (design_id) where is_current;
create index if not exists idx_versions_design on public.design_versions using btree (design_id);
create index if not exists idx_versions_status on public.design_versions using btree (status);
create index if not exists idx_notifications_user_all on public.notifications using btree (user_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications using btree (user_id, created_at desc) where (not is_read);
create index if not exists idx_order_items_customization on public.order_items using btree (customization_id) where (customization_id is not null);
create index if not exists idx_order_items_order on public.order_items using btree (order_id);
create index if not exists idx_order_items_status on public.order_items using btree (status);
create index if not exists idx_order_items_variant on public.order_items using btree (variant_id) where (variant_id is not null);
create index if not exists order_items_order_idx on public.order_items using btree (order_id);
create index if not exists idx_order_status_history_changed_by on public.order_status_history using btree (changed_by);
create index if not exists idx_order_status_history_order on public.order_status_history using btree (order_id, created_at desc);
create index if not exists idx_orders_cart_id on public.orders using btree (cart_id);
create index if not exists idx_orders_coupon_id on public.orders using btree (coupon_id);
create index if not exists idx_orders_placed_at on public.orders using btree (placed_at desc);
create index if not exists idx_orders_status on public.orders using btree (status);
create index if not exists idx_orders_user on public.orders using btree (user_id) where (deleted_at is null);
create index if not exists orders_shipping_method_id_idx on public.orders using btree (shipping_method_id);
create index if not exists orders_user_placed_idx on public.orders using btree (user_id, coalesce(placed_at, created_at) desc);
create index if not exists idx_payment_events_payment on public.payment_events using btree (payment_id) where (payment_id is not null);
create index if not exists idx_payment_events_unprocessed on public.payment_events using btree (received_at) where (not processed);
create index if not exists payment_receipts_payment_idx on public.payment_receipts using btree (payment_id);
create unique index if not exists payment_receipts_reference_uidx on public.payment_receipts using btree (provider, transfer_reference) where (status = any (array['pending'::text, 'approved'::text]));
create index if not exists payment_receipts_user_idx on public.payment_receipts using btree (user_id);
create index if not exists idx_payments_order on public.payments using btree (order_id);
create index if not exists idx_payments_provider_ref on public.payments using btree (provider_payment_id) where (provider_payment_id is not null);
create index if not exists idx_payments_status on public.payments using btree (status);
create unique index if not exists payments_provider_ref_uidx on public.payments using btree (provider, provider_payment_id) where (provider_payment_id is not null);
create index if not exists idx_collection_items_product on public.product_collection_items using btree (product_id);
create index if not exists idx_images_product on public.product_images using btree (product_id);
create index if not exists idx_images_variant on public.product_images using btree (variant_id) where (variant_id is not null);
create index if not exists idx_product_tags_tag on public.product_tags using btree (tag_id);
create index if not exists idx_variant_options_value on public.product_variant_options using btree (attribute_value_id);
create index if not exists idx_variants_active on public.product_variants using btree (is_active) where (deleted_at is null);
create index if not exists idx_variants_product on public.product_variants using btree (product_id) where (deleted_at is null);
create index if not exists idx_variants_stock on public.product_variants using btree (product_id, stock_quantity) where (deleted_at is null);
create index if not exists idx_products_active_published on public.products using btree (id) where ((status = 'published'::product_status) and (deleted_at is null));
create index if not exists idx_products_brand on public.products using btree (brand_id) where (deleted_at is null);
create index if not exists idx_products_category on public.products using btree (category_id) where (deleted_at is null);
create index if not exists idx_products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index if not exists idx_products_search_vector on public.products using gin (search_vector);
create index if not exists idx_products_store on public.products using btree (store_id) where (deleted_at is null);
create index if not exists idx_products_storefront on public.products using btree (status, visibility, is_featured) where (deleted_at is null);
create index if not exists products_status_visibility_idx on public.products using btree (status, visibility) where (deleted_at is null);
create index if not exists idx_profiles_default_address_id on public.profiles using btree (default_address_id);
create index if not exists idx_profiles_deleted_at on public.profiles using btree (deleted_at) where (deleted_at is not null);
create index if not exists idx_profiles_role on public.profiles using btree (role) where (deleted_at is null);
create index if not exists idx_recently_viewed_products_product_id on public.recently_viewed_products using btree (product_id);
create unique index if not exists idx_recently_viewed_session_product on public.recently_viewed_products using btree (session_token, product_id) where (session_token is not null);
create index if not exists idx_recently_viewed_session_recent on public.recently_viewed_products using btree (session_token, last_viewed_at desc) where (session_token is not null);
create unique index if not exists idx_recently_viewed_user_product on public.recently_viewed_products using btree (user_id, product_id) where (user_id is not null);
create index if not exists idx_recently_viewed_user_recent on public.recently_viewed_products using btree (user_id, last_viewed_at desc) where (user_id is not null);
create unique index if not exists idx_rvp_session_product on public.recently_viewed_products using btree (session_token, product_id) where (session_token is not null);
create unique index if not exists idx_rvp_user_product on public.recently_viewed_products using btree (user_id, product_id) where (user_id is not null);
create index if not exists idx_refunds_order on public.refunds using btree (order_id);
create index if not exists idx_refunds_payment on public.refunds using btree (payment_id) where (payment_id is not null);
create index if not exists idx_refunds_processed_by on public.refunds using btree (processed_by);
create index if not exists idx_refunds_return on public.refunds using btree (return_id) where (return_id is not null);
create index if not exists idx_return_items_order_item on public.return_items using btree (order_item_id);
create index if not exists idx_return_items_return on public.return_items using btree (return_id);
create index if not exists idx_returns_order on public.returns using btree (order_id);
create index if not exists idx_returns_requested_by on public.returns using btree (requested_by);
create index if not exists idx_returns_status on public.returns using btree (status);
create index if not exists idx_review_media_review on public.review_media using btree (review_id);
create index if not exists idx_review_replies_parent on public.review_replies using btree (parent_reply_id) where (parent_reply_id is not null);
create index if not exists idx_review_replies_review on public.review_replies using btree (review_id) where (deleted_at is null);
create index if not exists idx_review_replies_user_id on public.review_replies using btree (user_id);
create index if not exists idx_review_reports_reported_by on public.review_reports using btree (reported_by);
create index if not exists idx_review_reports_review on public.review_reports using btree (review_id);
create index if not exists idx_review_reports_reviewed_by on public.review_reports using btree (reviewed_by);
create index if not exists idx_review_reports_status on public.review_reports using btree (status);
create index if not exists idx_review_votes_review on public.review_votes using btree (review_id);
create index if not exists idx_review_votes_user_id on public.review_votes using btree (user_id);
create index if not exists idx_reviews_moderated_by on public.reviews using btree (moderated_by);
create index if not exists idx_reviews_order_item_id on public.reviews using btree (order_item_id);
create index if not exists idx_reviews_pending_reports on public.reviews using btree (report_count) where (report_count > 0);
create index if not exists idx_reviews_product on public.reviews using btree (product_id, status) where (deleted_at is null);
create index if not exists idx_reviews_status on public.reviews using btree (status);
create index if not exists idx_reviews_user on public.reviews using btree (user_id) where (deleted_at is null);
create index if not exists reviews_product_status_idx on public.reviews using btree (product_id, status) where (deleted_at is null);
create index if not exists idx_shipping_methods_active on public.shipping_methods using btree (is_active) where (deleted_at is null);
create index if not exists idx_shipping_methods_type on public.shipping_methods using btree (type);
create index if not exists idx_shipping_rates_method on public.shipping_rates using btree (method_id);
create index if not exists idx_shipping_rates_zone on public.shipping_rates using btree (zone_id);
create index if not exists idx_shipping_zones_countries on public.shipping_zones using gin (countries);
create unique index if not exists idx_shipping_zones_one_default on public.shipping_zones using btree (is_default) where (is_default and (deleted_at is null));
create index if not exists idx_stores_owner_id on public.stores using btree (owner_id) where (deleted_at is null);
create index if not exists idx_stores_status on public.stores using btree (status) where (deleted_at is null);
create index if not exists idx_designs_category on public.user_designs using btree (category_id) where (deleted_at is null);
create index if not exists idx_designs_owner on public.user_designs using btree (owner_id) where (deleted_at is null);
create index if not exists idx_designs_public_gallery on public.user_designs using btree (created_at desc) where (is_public and (status = 'approved'::design_status) and (deleted_at is null));
create index if not exists idx_designs_status on public.user_designs using btree (status) where (deleted_at is null);
create index if not exists idx_user_designs_reviewed_by on public.user_designs using btree (reviewed_by);
create unique index if not exists vendor_commissions_global_active_uidx on public.vendor_commissions using btree (((store_id is null))) where (is_active and (store_id is null));
create unique index if not exists vendor_commissions_store_active_uidx on public.vendor_commissions using btree (store_id) where (is_active and (store_id is not null));
create index if not exists vendor_earnings_order_idx on public.vendor_earnings using btree (order_id);
create index if not exists vendor_earnings_store_status_idx on public.vendor_earnings using btree (store_id, status);
create index if not exists idx_vendor_payout_requests_requested_by on public.vendor_payout_requests using btree (requested_by);
create index if not exists idx_vendor_payout_requests_reviewed_by on public.vendor_payout_requests using btree (reviewed_by);
create index if not exists vendor_payout_requests_store_status_idx on public.vendor_payout_requests using btree (store_id, status);
create index if not exists idx_vendor_payouts_processed_by on public.vendor_payouts using btree (processed_by);
create index if not exists vendor_payouts_request_idx on public.vendor_payouts using btree (payout_request_id);
create index if not exists vendor_payouts_store_status_idx on public.vendor_payouts using btree (store_id, status);
create unique index if not exists idx_wishlist_items_unique_plain on public.wishlist_items using btree (wishlist_id, variant_id) where (customization_id is null);
create index if not exists idx_wishlist_items_variant on public.wishlist_items using btree (variant_id);
create index if not exists idx_wishlist_items_wishlist on public.wishlist_items using btree (wishlist_id);
create unique index if not exists idx_wishlists_one_default on public.wishlists using btree (owner_id) where (is_default and (deleted_at is null));
create index if not exists idx_wishlists_owner on public.wishlists using btree (owner_id) where (deleted_at is null);
create index if not exists idx_wishlists_visibility on public.wishlists using btree (visibility) where (deleted_at is null);

-- ============================================================================
-- 7. FOUNDATIONAL FUNCTIONS (31 of 180 production functions)
--    Verbatim pg_get_functiondef output, including SECURITY DEFINER and
--    SET search_path settings. Signatures/argument names preserved.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.slugify(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_vendor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'vendor' and deleted_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid() and deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.owns_store(target_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.stores
    where id = target_store_id
      and owner_id = auth.uid()
      and deleted_at is null
  ) or public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.owns_order(target_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.is_admin() then true
    else exists (select 1 from public.orders where id = target_order_id and user_id = auth.uid())
  end;
$function$;

CREATE OR REPLACE FUNCTION public.owns_product(target_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.is_admin() then true
    else exists (
      select 1 from public.products p
      join public.stores s on s.id = p.store_id
      where p.id = target_product_id
        and s.owner_id = auth.uid()
        and s.deleted_at is null
    )
  end;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_cart(p_cart_id uuid, p_session_token text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.carts
    where id = p_cart_id
      and (
        (owner_id is not null and owner_id = auth.uid())
        or (session_token is not null and p_session_token is not null and session_token = p_session_token)
        or public.is_admin()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.calculate_tax(p_subtotal numeric, p_shipping_address jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select 0::numeric
$function$;

CREATE OR REPLACE FUNCTION public.gift_wrap_fee()
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select 4.99::numeric $function$;

CREATE OR REPLACE FUNCTION public.get_shipping_options(p_country text, p_order_subtotal numeric DEFAULT 0, p_weight_grams integer DEFAULT 0)
 RETURNS TABLE(method_id uuid, method_name text, method_type text, carrier text, fee numeric, min_delivery_days integer, max_delivery_days integer, is_free boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_zone_id uuid;
begin
  select id into v_zone_id from public.shipping_zones
  where is_active and deleted_at is null and p_country = any(countries)
  limit 1;

  if v_zone_id is null then
    select id into v_zone_id from public.shipping_zones
    where is_active and deleted_at is null and is_default
    limit 1;
  end if;

  if v_zone_id is null then
    return;
  end if;

  return query
  select
    sm.id, sm.name, sm.type, sm.carrier,
    case
      when sr.free_shipping_threshold is not null and p_order_subtotal >= sr.free_shipping_threshold then 0::numeric
      else round(sr.base_fee + sr.per_kg_fee * (p_weight_grams / 1000.0), 2)
    end as fee,
    sm.min_delivery_days, sm.max_delivery_days,
    (sr.free_shipping_threshold is not null and p_order_subtotal >= sr.free_shipping_threshold) as is_free
  from public.shipping_rates sr
  join public.shipping_methods sm on sm.id = sr.method_id
  where sr.zone_id = v_zone_id
    and sr.is_active and sm.is_active and sm.deleted_at is null
  order by sm.sort_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  brand_name text;
  category_name text;
begin
  select name into brand_name from public.brands where id = new.brand_id;
  select name into category_name from public.categories where id = new.category_id;

  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(brand_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category_name, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.seo_keywords, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'D');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_products(p_query text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_min_rating numeric DEFAULT NULL::numeric, p_in_stock_only boolean DEFAULT false, p_sort text DEFAULT 'relevance'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 24)
 RETURNS TABLE(product_id uuid, slug text, name text, short_description text, brand_name text, category_name text, primary_image text, min_price numeric, max_price numeric, avg_rating numeric, rating_count integer, in_stock boolean, is_featured boolean, relevance real, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_offset int := greatest(p_page - 1, 0) * p_page_size;
  v_tsquery tsquery;
begin
  if p_query is not null and btrim(p_query) <> '' then
    v_tsquery := websearch_to_tsquery('english', p_query);
  end if;

  return query
  with matched as (
    select
      p.id, p.slug, p.name, p.short_description, p.is_featured, p.avg_rating, p.rating_count,
      b.name as brand_name, c.name as category_name,
      (
        select pi.storage_path from public.product_images pi
        where pi.product_id = p.id and pi.variant_id is null
        order by pi.is_primary desc, pi.sort_order asc limit 1
      ) as primary_image,
      min(pv.price) as min_price, max(pv.price) as max_price,
      bool_or(pv.stock_quantity - pv.reserved_quantity > 0) as in_stock,
      case when v_tsquery is not null then ts_rank(p.search_vector, v_tsquery) else 0 end as relevance
    from public.products p
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
    left join public.product_variants pv on pv.product_id = p.id and pv.deleted_at is null and pv.is_active
    where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
      and (v_tsquery is null or p.search_vector @@ v_tsquery)
      and (
        p_category_id is null or exists (
          select 1 from public.categories cc
          where cc.id = p.category_id and cc.path <@ (select path from public.categories where id = p_category_id)
        )
      )
      and (p_brand_id is null or p.brand_id = p_brand_id)
    group by p.id, p.slug, p.name, p.short_description, p.is_featured, p.avg_rating, p.rating_count, b.name, c.name
    having (p_min_price is null or min(pv.price) >= p_min_price)
       and (p_max_price is null or min(pv.price) <= p_max_price)
       and (p_min_rating is null or p.avg_rating >= p_min_rating)
       and (not p_in_stock_only or bool_or(pv.stock_quantity - pv.reserved_quantity > 0))
  ),
  counted as (
    select matched.*, count(*) over () as total_count from matched
  )
  select counted.id, counted.slug, counted.name, counted.short_description, counted.brand_name, counted.category_name,
         counted.primary_image, counted.min_price, counted.max_price, counted.avg_rating, counted.rating_count,
         counted.in_stock, counted.is_featured, counted.relevance, counted.total_count
  from counted
  order by
    case when p_sort = 'relevance' and v_tsquery is not null then counted.relevance end desc nulls last,
    case when p_sort = 'price_asc' then counted.min_price end asc nulls last,
    case when p_sort = 'price_desc' then counted.max_price end desc nulls last,
    case when p_sort = 'rating' then counted.avg_rating end desc nulls last,
    case when p_sort = 'popularity' then counted.rating_count end desc nulls last,
    counted.is_featured desc, counted.name asc
  offset v_offset limit p_page_size;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_search_suggestions(p_prefix text, p_limit integer DEFAULT 8)
 RETURNS TABLE(suggestion text, type text, ref_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
    select p.name as suggestion, 'product'::text as type, p.id as ref_id
    from public.products p
    where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
      and p.name ilike p_prefix || '%'
    union all
    select b.name, 'brand', b.id from public.brands b where b.is_active and b.name ilike p_prefix || '%'
    union all
    select c.name, 'category', c.id from public.categories c where c.is_active and c.deleted_at is null and c.name ilike p_prefix || '%'
  ) suggestions
  order by length(suggestion), suggestion
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_search_facets(p_query text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tsquery tsquery;
  v_categories jsonb;
  v_brands jsonb;
begin
  if p_query is not null and btrim(p_query) <> '' then
    v_tsquery := websearch_to_tsquery('english', p_query);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('category_id', c.id, 'name', c.name, 'count', x.cnt) order by x.cnt desc), '[]'::jsonb)
  into v_categories
  from (
    select p.category_id, count(*) as cnt
    from public.products p
    where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
      and (v_tsquery is null or p.search_vector @@ v_tsquery)
      and p.category_id is not null
    group by p.category_id
  ) x
  join public.categories c on c.id = x.category_id;

  select coalesce(jsonb_agg(jsonb_build_object('brand_id', b.id, 'name', b.name, 'count', x.cnt) order by x.cnt desc), '[]'::jsonb)
  into v_brands
  from (
    select p.brand_id, count(*) as cnt
    from public.products p
    where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
      and (v_tsquery is null or p.search_vector @@ v_tsquery)
      and (p_category_id is null or p.category_id = p_category_id)
      and p.brand_id is not null
    group by p.brand_id
  ) x
  join public.brands b on b.id = x.brand_id;

  return jsonb_build_object('categories', v_categories, 'brands', v_brands);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_popular_searches(p_limit integer DEFAULT 10, p_days integer DEFAULT 30)
 RETURNS TABLE(query text, search_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select normalized_query, count(*)
  from public.search_logs
  where created_at > now() - (p_days || ' days')::interval
    and normalized_query <> ''
    and result_count > 0
  group by normalized_query
  order by count(*) desc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.log_search(p_query text, p_result_count integer DEFAULT 0, p_session_token text DEFAULT NULL::text, p_clicked_product_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.search_logs (
    user_id,
    session_token,
    query,
    result_count,
    clicked_product_id
  )
  VALUES (
    auth.uid(),
    p_session_token,
    p_query,
    p_result_count,
    p_clicked_product_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    'customer' -- every new signup starts as a customer; role upgrades are an explicit admin action
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_default_wishlist_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.wishlists (owner_id, name, is_default, visibility)
  values (new.id, 'My Wishlist', true, 'private');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_default_wishlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_default then
    update public.wishlists set is_default = false
    where owner_id = new.owner_id and id <> new.id and is_default = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_generate_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_col text := TG_ARGV[0];
  base_slug text;
  candidate text;
  suffix int := 0;
  slug_exists boolean;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base_slug := public.slugify(to_jsonb(new) ->> source_col);
  else
    base_slug := public.slugify(new.slug);
  end if;

  if base_slug = '' then
    base_slug := 'item';
  end if;

  candidate := base_slug;
  loop
    execute format(
      'select exists (select 1 from %I.%I where slug = $1 and id <> $2)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) into slug_exists using candidate, new.id;
    exit when not slug_exists;
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_generate_wishlist_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  base_slug text;
  candidate text;
  suffix int := 0;
  slug_exists boolean;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base_slug := public.slugify(new.name);
  else
    base_slug := public.slugify(new.slug);
  end if;
  if base_slug = '' then base_slug := 'wishlist'; end if;

  candidate := base_slug;
  loop
    select exists (
      select 1 from public.wishlists where owner_id = new.owner_id and slug = candidate and id <> new.id
    ) into slug_exists;
    exit when not slug_exists;
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_product_published_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'published' and new.published_at is null
     and (TG_OP = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.order_number is null or btrim(new.order_number) = '' then
    new.order_number := 'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_default_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_default then
    update public.product_variants
    set is_default = false
    where product_id = new.product_id and id <> new.id and is_default = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_default_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_default then
    update public.addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_current_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_current then
    update public.design_versions
    set is_current = false
    where design_id = new.design_id and id <> new.id and is_current = true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed boolean := false;
begin
  if old.status = new.status then return new; end if;

  allowed := case old.status
    when 'pending' then new.status in ('paid', 'cancelled')
    when 'paid' then new.status in ('processing', 'cancelled', 'refunded')
    when 'processing' then new.status in ('printing', 'cancelled', 'refunded', 'partially_refunded')
    when 'printing' then new.status in ('shipped', 'refunded', 'partially_refunded')
    when 'shipped' then new.status in ('delivered', 'refunded', 'partially_refunded')
    when 'delivered' then new.status in ('refunded', 'partially_refunded')
    when 'partially_refunded' then new.status in ('refunded', 'partially_refunded')
    else false
  end;

  if not allowed then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restock_on_order_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.product_variants pv
  set stock_quantity = stock_quantity + oi.quantity
  from public.order_items oi
  where oi.order_id = new.id and pv.id = oi.variant_id;
  return new;
end;
$function$;

-- ============================================================================
-- 8. FOUNDATIONAL VIEWS (11 of 51 production views/matviews)
--    Verbatim pg_get_viewdef output. Reporting/admin/vendor analytics views and
--    all 10 materialized views are intentionally excluded (later migrations).
-- ============================================================================

create or replace view public.cart_items_detailed as
 SELECT ci.id,
    ci.cart_id,
    ci.variant_id,
    ci.customization_id,
    ci.quantity,
    ci.unit_price_snapshot,
    ci.unit_price_snapshot * ci.quantity::numeric AS line_total,
    ci.is_saved_for_later,
    ci.reserved_until,
    ci.added_at,
    ci.color,
    ci.size,
    pv.sku,
    pv.price AS current_price,
    ci.unit_price_snapshot <> pv.price AS price_changed_since_added,
    pv.stock_quantity,
    pv.reserved_quantity,
    pv.stock_quantity - pv.reserved_quantity AS available_stock,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    pc.name AS customization_name,
    pc.preview_image_url AS customization_preview_url,
    COALESCE(( SELECT pi.storage_path
           FROM product_images pi
          WHERE pi.variant_id = ci.variant_id
          ORDER BY pi.is_primary DESC, pi.sort_order
         LIMIT 1), ( SELECT pi.storage_path
           FROM product_images pi
          WHERE pi.product_id = p.id AND pi.variant_id IS NULL
          ORDER BY pi.is_primary DESC, pi.sort_order
         LIMIT 1)) AS product_image
   FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     JOIN products p ON p.id = pv.product_id
     LEFT JOIN product_customizations pc ON pc.id = ci.customization_id;

create or replace view public.cart_totals as
 SELECT c.id AS cart_id,
    c.owner_id,
    c.status,
    c.currency,
    c.coupon_id,
    c.coupon_code,
    c.discount_amount,
    count(*) FILTER (WHERE NOT ci.is_saved_for_later) AS item_count,
    COALESCE(sum(ci.quantity) FILTER (WHERE NOT ci.is_saved_for_later), 0::bigint) AS total_quantity,
    COALESCE(sum(ci.unit_price_snapshot * ci.quantity::numeric) FILTER (WHERE NOT ci.is_saved_for_later), 0::numeric) AS subtotal,
    GREATEST(COALESCE(sum(ci.unit_price_snapshot * ci.quantity::numeric) FILTER (WHERE NOT ci.is_saved_for_later), 0::numeric) - c.discount_amount, 0::numeric) AS total,
    count(*) FILTER (WHERE ci.is_saved_for_later) AS saved_for_later_count
   FROM carts c
     LEFT JOIN cart_items ci ON ci.cart_id = c.id
  GROUP BY c.id;

create or replace view public.low_stock_variants as
 SELECT pv.id AS variant_id,
    pv.sku,
    pv.stock_quantity,
    pv.reserved_quantity,
    COALESCE(pv.low_stock_threshold, p.low_stock_threshold) AS threshold,
    p.id AS product_id,
    p.name AS product_name,
    p.store_id
   FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
  WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL AND pv.is_active AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, p.low_stock_threshold);

create or replace view public.notification_summary as
 SELECT user_id,
    count(*) FILTER (WHERE NOT is_read) AS unread_count,
    count(*) AS total_count,
    max(created_at) AS latest_at
   FROM notifications
  GROUP BY user_id;

create or replace view public.order_item_print_files as
 SELECT oi.id AS order_item_id,
    oi.order_id,
    oi.product_name_snapshot,
    oi.sku_snapshot,
    oi.quantity,
    oi.printing_instructions,
    pcl.id AS layer_id,
    pcl.layer_type,
    pcl.z_index,
    pcl.position_x,
    pcl.position_y,
    pcl.rotation_deg,
    pcl.scale,
    pcl.text_content,
    pcl.font_size,
    pcl.text_color,
    df.storage_path AS design_file_path,
    df.file_format,
    df.dpi,
    df.width_px,
    df.height_px,
    pca.name AS print_area_name,
    pca.printing_area_width,
    pca.printing_area_height,
    pca.dpi AS area_dpi,
    pca.bleed_mm
   FROM order_items oi
     JOIN product_customizations pc ON pc.id = oi.customization_id
     JOIN product_customization_layers pcl ON pcl.customization_id = pc.id
     JOIN product_customization_areas pca ON pca.id = pcl.area_id
     LEFT JOIN design_versions dv ON dv.design_id = pcl.design_id AND dv.is_current
     LEFT JOIN design_files df ON df.version_id = dv.id AND df.is_primary;

create or replace view public.order_items_detailed as
 SELECT oi.id,
    oi.order_id,
    oi.variant_id,
    oi.customization_id,
    oi.product_name_snapshot,
    oi.sku_snapshot,
    oi.options_snapshot,
    oi.unit_price_snapshot,
    oi.quantity,
    oi.line_total,
    oi.printing_instructions,
    oi.is_gift_wrapped,
    oi.gift_note,
    oi.status,
    oi.created_at,
    oi.updated_at,
    o.order_number,
    o.status AS order_status,
    o.user_id AS order_owner_id,
    pv.sku AS current_sku,
    p.slug AS product_slug,
    pc.preview_image_url AS customization_preview_url
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_variants pv ON pv.id = oi.variant_id
     LEFT JOIN products p ON p.id = pv.product_id
     LEFT JOIN product_customizations pc ON pc.id = oi.customization_id;

create or replace view public.order_summary as
 SELECT o.id,
    o.order_number,
    o.user_id,
    o.status,
    o.total,
    o.currency,
    o.gift_wrap,
    o.placed_at,
    count(oi.id) AS item_count,
    COALESCE(sum(oi.quantity), 0::bigint) AS total_quantity,
    ( SELECT oi2.product_name_snapshot
           FROM order_items oi2
          WHERE oi2.order_id = o.id
          ORDER BY oi2.created_at
         LIMIT 1) AS first_item_name
   FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id;

create or replace view public.reviews_detailed as
 SELECT r.id,
    r.product_id,
    r.order_item_id,
    r.user_id,
    r.rating,
    r.title,
    r.body,
    r.is_verified_purchase,
    r.status,
    r.helpful_count,
    r.not_helpful_count,
    r.report_count,
    r.moderated_by,
    r.moderated_at,
    r.moderation_note,
    r.created_at,
    r.updated_at,
    r.deleted_at,
    p.full_name AS reviewer_name,
    p.avatar_url AS reviewer_avatar_url,
    ( SELECT count(*) AS count
           FROM review_media rm
          WHERE rm.review_id = r.id) AS media_count,
    ( SELECT count(*) AS count
           FROM review_replies rr
          WHERE rr.review_id = r.id AND rr.status = 'visible'::text AND rr.deleted_at IS NULL) AS reply_count
   FROM reviews r
     LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.status = 'approved'::review_status AND r.deleted_at IS NULL;

create or replace view public.shipment_tracking as
 SELECT s.id AS shipment_id,
    s.order_id,
    s.status,
    s.carrier,
    s.tracking_number,
    s.tracking_url,
    s.estimated_delivery_date_min,
    s.estimated_delivery_date_max,
    s.actual_delivery_date,
    s.shipped_at,
    s.delivered_at,
    sm.name AS method_name,
    sm.type AS method_type,
    pl.name AS pickup_location_name,
    pl.address_line1 AS pickup_address_line1,
    pl.city AS pickup_city,
    count(si.id) AS item_count
   FROM shipments s
     JOIN shipping_methods sm ON sm.id = s.shipping_method_id
     LEFT JOIN pickup_locations pl ON pl.id = s.pickup_location_id
     LEFT JOIN shipment_items si ON si.shipment_id = s.id
  GROUP BY s.id, sm.name, sm.type, pl.name, pl.address_line1, pl.city;

create or replace view public.storefront_products as
 SELECT p.id,
    p.slug,
    p.name,
    p.short_description,
    p.status,
    p.visibility,
    p.is_featured,
    p.avg_rating,
    p.rating_count,
    p.currency,
    b.name AS brand_name,
    b.slug AS brand_slug,
    c.name AS category_name,
    c.slug AS category_slug,
    min(pv.price) AS min_price,
    max(pv.price) AS max_price,
    bool_or((pv.stock_quantity - pv.reserved_quantity) > 0) AS in_stock,
    ( SELECT pi.storage_path
           FROM product_images pi
          WHERE pi.product_id = p.id AND pi.variant_id IS NULL
          ORDER BY pi.is_primary DESC, pi.sort_order
         LIMIT 1) AS primary_image
   FROM products p
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL AND pv.is_active
  WHERE p.status = 'published'::product_status AND p.visibility = 'visible'::product_visibility AND p.deleted_at IS NULL
  GROUP BY p.id, b.name, b.slug, c.name, c.slug;

create or replace view public.wishlist_items_detailed as
 SELECT wi.id,
    wi.wishlist_id,
    wi.variant_id,
    wi.customization_id,
    wi.note,
    wi.sort_order,
    wi.added_at,
    pv.sku,
    pv.price,
    (pv.stock_quantity - pv.reserved_quantity) > 0 AS in_stock,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    pc.name AS customization_name,
    pc.preview_image_url AS customization_preview_url
   FROM wishlist_items wi
     JOIN product_variants pv ON pv.id = wi.variant_id
     JOIN products p ON p.id = pv.product_id
     LEFT JOIN product_customizations pc ON pc.id = wi.customization_id;

-- ============================================================================
-- 9. TRIGGERS (foundational subset; only those whose functions are in section 7)
--    Notification/log/derived-table triggers are created by later migrations.
-- ============================================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('public.addresses','set_addresses_updated_at',$d$CREATE TRIGGER set_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.addresses','guard_single_default_address',$d$CREATE TRIGGER guard_single_default_address BEFORE INSERT OR UPDATE OF is_default ON public.addresses FOR EACH ROW WHEN (new.is_default) EXECUTE FUNCTION public.enforce_single_default_address()$d$),
    ('public.profiles','set_profiles_updated_at',$d$CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.profiles','create_default_wishlist_trigger',$d$CREATE TRIGGER create_default_wishlist_trigger AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_default_wishlist_for_new_user()$d$),
    ('public.profiles','create_wallet_trigger',$d$CREATE TRIGGER create_wallet_trigger AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_user()$d$),
    ('public.stores','set_stores_updated_at',$d$CREATE TRIGGER set_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.products','set_products_updated_at',$d$CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.products','set_published_at',$d$CREATE TRIGGER set_published_at BEFORE INSERT OR UPDATE OF status ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_product_published_at()$d$),
    ('public.products','slug_products',$d$CREATE TRIGGER slug_products BEFORE INSERT OR UPDATE OF name, slug ON public.products FOR EACH ROW EXECUTE FUNCTION public.auto_generate_slug('name')$d$),
    ('public.products','update_search_vector',$d$CREATE TRIGGER update_search_vector BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_product_search_vector()$d$),
    ('public.product_variants','set_variants_updated_at',$d$CREATE TRIGGER set_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.product_variants','guard_single_default_variant',$d$CREATE TRIGGER guard_single_default_variant AFTER INSERT OR UPDATE OF is_default ON public.product_variants FOR EACH ROW WHEN (new.is_default) EXECUTE FUNCTION public.enforce_single_default_variant()$d$),
    ('public.carts','set_carts_updated_at',$d$CREATE TRIGGER set_carts_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.cart_items','set_cart_items_updated_at',$d$CREATE TRIGGER set_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.orders','set_orders_updated_at',$d$CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.orders','guard_order_status_transition',$d$CREATE TRIGGER guard_order_status_transition BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_status_transition()$d$),
    ('public.orders','set_order_number',$d$CREATE TRIGGER set_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number()$d$),
    ('public.orders','trg_restock_on_order_cancel',$d$CREATE TRIGGER trg_restock_on_order_cancel AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN (((new.status = 'cancelled'::order_status) AND (old.status IS DISTINCT FROM 'cancelled'::order_status))) EXECUTE FUNCTION public.restock_on_order_cancel()$d$),
    ('public.order_items','set_order_items_updated_at',$d$CREATE TRIGGER set_order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.payments','set_payments_updated_at',$d$CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.reviews','set_reviews_updated_at',$d$CREATE TRIGGER set_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.design_versions','set_design_versions_updated_at',$d$CREATE TRIGGER set_design_versions_updated_at BEFORE UPDATE ON public.design_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.design_versions','guard_single_current_version',$d$CREATE TRIGGER guard_single_current_version AFTER INSERT OR UPDATE OF is_current ON public.design_versions FOR EACH ROW WHEN (new.is_current) EXECUTE FUNCTION public.enforce_single_current_version()$d$),
    ('public.user_designs','set_user_designs_updated_at',$d$CREATE TRIGGER set_user_designs_updated_at BEFORE UPDATE ON public.user_designs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.user_designs','slug_user_designs',$d$CREATE TRIGGER slug_user_designs BEFORE INSERT OR UPDATE OF title, slug ON public.user_designs FOR EACH ROW EXECUTE FUNCTION public.auto_generate_slug('title')$d$),
    ('public.wishlists','set_wishlists_updated_at',$d$CREATE TRIGGER set_wishlists_updated_at BEFORE UPDATE ON public.wishlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('public.wishlists','slug_wishlists',$d$CREATE TRIGGER slug_wishlists BEFORE INSERT OR UPDATE OF name, slug ON public.wishlists FOR EACH ROW EXECUTE FUNCTION public.auto_generate_wishlist_slug()$d$),
    ('public.wishlists','guard_single_default_wishlist',$d$CREATE TRIGGER guard_single_default_wishlist BEFORE INSERT OR UPDATE OF is_default ON public.wishlists FOR EACH ROW WHEN (new.is_default) EXECUTE FUNCTION public.enforce_single_default_wishlist()$d$),
    ('public.vendor_payout_requests','trg_vendor_payout_requests_updated_at',$d$CREATE TRIGGER trg_vendor_payout_requests_updated_at BEFORE UPDATE ON public.vendor_payout_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()$d$),
    ('auth.users','on_auth_user_created',$d$CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()$d$),
    ('auth.users','on_auth_user_created_wishlist',$d$CREATE TRIGGER on_auth_user_created_wishlist AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_default_wishlist_for_new_user()$d$),
    ('auth.users','on_auth_user_created_wallet',$d$CREATE TRIGGER on_auth_user_created_wallet AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_user()$d$)
  ) as v(tbl, trg, def)
  loop
    execute format('drop trigger if exists %I on %s', r.trg, r.tbl);
    execute r.def;
  end loop;
end $$;

-- ============================================================================
-- 10. STORAGE BUCKETS (10 in production; no files/objects/data are copied)
--     storage.objects RLS policies are intentionally NOT recreated here;
--     their names and role/cmd definitions are recorded in the recovery report.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars','avatars',true,5242880,array['image/png','image/jpeg','image/webp','image/gif']),
  ('custom-print-designs','custom-print-designs',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf']),
  ('customization-previews','customization-previews',true,10485760,array['image/png','image/jpeg','image/webp']),
  ('design-previews','design-previews',true,5242880,array['image/png','image/jpeg','image/webp']),
  ('design-uploads','design-uploads',false,209715200,array['image/png','image/svg+xml','application/pdf','application/postscript','image/vnd.adobe.photoshop','application/octet-stream']),
  ('fonts','fonts',true,10485760,array['font/woff2','font/woff','font/ttf','application/font-woff','application/octet-stream']),
  ('gallery-images','gallery-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('payment-receipts','payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']),
  ('product-images','product-images',true,10485760,array['image/png','image/jpeg','image/webp','image/gif','image/avif']),
  ('review-media','review-media',true,52428800,array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

-- End of authoritative baseline. Next: apply supabase/migrations/*.sql in timestamp order.

-- Foundational helper functions restored from the live catalog (read-only):
-- some historical migrations use them in preflight checks before creating them.
create or replace function public.owns_design(target_design_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select case
    when public.is_admin() then true
    else exists (
      select 1 from public.user_designs
       where id = target_design_id and owner_id = auth.uid() and deleted_at is null
    )
  end;
$fn$;

create or replace function public.owns_product(target_product_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select case
    when public.is_admin() then true
    else exists (
      select 1 from public.products p
        join public.stores s on s.id = p.store_id
       where p.id = target_product_id
         and s.owner_id = auth.uid()
         and s.deleted_at is null
    )
  end;
$fn$;

create or replace function public.set_design_version_number()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare next_num int;
begin
  select coalesce(max(version_number), 0) + 1 into next_num
    from public.design_versions where design_id = new.design_id;
  new.version_number := next_num;
  if next_num = 1 then new.is_current := true; end if;
  return new;
end;
$fn$;

-- Trigger helper functions used by the colour-sync triggers (restored from
-- the live catalog; the revocation migration needs these signatures to exist).
create or replace function public.trg_sync_colors_from_variant()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  perform public.sync_product_available_colors(coalesce(new.product_id, old.product_id));
  return null;
end;
$fn$;

create or replace function public.trg_sync_colors_from_variant_options()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_product_id uuid;
begin
  select product_id into v_product_id
    from public.product_variants
   where id = coalesce(new.variant_id, old.variant_id);
  if v_product_id is not null then
    perform public.sync_product_available_colors(v_product_id);
  end if;
  return null;
end;
$fn$;

-- ============================================================================
-- 13 RPC functions restored verbatim from the live production catalog
--   (project ref httywgkwfqvrbuwuzutu, PostgreSQL 17.6) via SELECT-only
--   pg_get_functiondef on 2026-11-18. Added for local/staging integration-test
--   parity so the local schema exposes the same callable RPCs as production.
--   Safe on a fresh DB: these objects are absent locally. Local/staging only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_or_create_cart(p_session_token text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cart_id uuid;
begin
  if v_uid is not null then
    select id into v_cart_id from public.carts where owner_id = v_uid and status = 'active' order by created_at desc limit 1;
    if v_cart_id is null then
      insert into public.carts (owner_id) values (v_uid) returning id into v_cart_id;
    end if;
  else
    if p_session_token is null or btrim(p_session_token) = '' then
      raise exception 'A session token is required for guest carts';
    end if;
    select id into v_cart_id from public.carts where session_token = p_session_token and status = 'active';
    if v_cart_id is null then
      insert into public.carts (session_token) values (p_session_token) returning id into v_cart_id;
    end if;
  end if;
  return v_cart_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_cart_item(p_cart_item_id uuid, p_session_token text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
begin
  select cart_id into v_cart_id from public.cart_items where id = p_cart_item_id;
  if v_cart_id is null or not public.can_access_cart(v_cart_id, p_session_token) then
    raise exception 'Cart item not found or access denied';
  end if;
  delete from public.cart_items where id = p_cart_item_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_for_later(p_cart_item_id uuid, p_session_token text DEFAULT NULL::text)
 RETURNS cart_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cart_id uuid;
  v_item public.cart_items;
begin
  select cart_id into v_cart_id from public.cart_items where id = p_cart_item_id;
  if v_cart_id is null or not public.can_access_cart(v_cart_id, p_session_token) then
    raise exception 'Cart item not found or access denied';
  end if;
  update public.cart_items set is_saved_for_later = true where id = p_cart_item_id returning * into v_item;
  return v_item;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_coupon(p_cart_id uuid, p_session_token text DEFAULT NULL::text)
 RETURNS carts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cart public.carts;
begin
  if not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Cart not found or access denied';
  end if;
  update public.carts set coupon_id = null, coupon_code = null, discount_amount = 0 where id = p_cart_id returning * into v_cart;
  return v_cart;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_coupon(p_cart_id uuid, p_code text, p_session_token text DEFAULT NULL::text)
 RETURNS carts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coupon public.coupons;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_cart public.carts;
  v_uid uuid := auth.uid();
  v_user_use_count int;
begin
  if not public.can_access_cart(p_cart_id, p_session_token) then
    raise exception 'Cart not found or access denied';
  end if;

  select * into v_coupon from public.coupons where code = upper(btrim(p_code)) and is_active;
  if v_coupon.id is null then
    raise exception 'Invalid or inactive coupon code';
  end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at > now() then
    raise exception 'This coupon is not active yet';
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    raise exception 'This coupon has expired';
  end if;
  if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
    raise exception 'This coupon has reached its usage limit';
  end if;

  if v_coupon.max_uses_per_user is not null and v_uid is not null then
    select count(*) into v_user_use_count
    from public.orders
    where user_id = v_uid and coupon_id = v_coupon.id and status <> 'cancelled';
    if v_user_use_count >= v_coupon.max_uses_per_user then
      raise exception 'You have already used this coupon the maximum number of times';
    end if;
  end if;

  select coalesce(sum(unit_price_snapshot * quantity), 0) into v_subtotal
  from public.cart_items where cart_id = p_cart_id and not is_saved_for_later;

  if v_coupon.min_order_amount is not null and v_subtotal < v_coupon.min_order_amount then
    raise exception 'This cart does not meet the minimum order amount of % for this coupon', v_coupon.min_order_amount;
  end if;

  if v_coupon.type = 'percentage' then
    v_discount := round(v_subtotal * v_coupon.value / 100, 2);
    if v_coupon.max_discount_amount is not null then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
  else
    v_discount := least(v_coupon.value, v_subtotal);
  end if;

  update public.carts
  set coupon_id = v_coupon.id, coupon_code = v_coupon.code, discount_amount = v_discount
  where id = p_cart_id
  returning * into v_cart;

  return v_cart;
end;
$function$;

CREATE OR REPLACE FUNCTION public.track_product_view(p_product_id uuid, p_session_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    insert into public.recently_viewed_products (user_id, product_id, view_count, last_viewed_at)
    values (v_uid, p_product_id, 1, now())
    on conflict (user_id, product_id) where user_id is not null
    do update set view_count = public.recently_viewed_products.view_count + 1, last_viewed_at = now();
  else
    if p_session_token is null or btrim(p_session_token) = '' then
      raise exception 'A session token is required to track views as a guest';
    end if;
    insert into public.recently_viewed_products (session_token, product_id, view_count, last_viewed_at)
    values (p_session_token, p_product_id, 1, now())
    on conflict (session_token, product_id) where session_token is not null
    do update set view_count = public.recently_viewed_products.view_count + 1, last_viewed_at = now();
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_recently_viewed(p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 RETURNS TABLE(product_id uuid, slug text, name text, primary_image text, min_price numeric, last_viewed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  return query
  select
    p.id, p.slug, p.name,
    (select pi.storage_path from public.product_images pi where pi.product_id = p.id and pi.variant_id is null order by pi.is_primary desc, pi.sort_order asc limit 1),
    (select min(pv.price) from public.product_variants pv where pv.product_id = p.id and pv.deleted_at is null and pv.is_active),
    rv.last_viewed_at
  from public.recently_viewed_products rv
  join public.products p on p.id = rv.product_id
  where p.status = 'published' and p.visibility = 'visible' and p.deleted_at is null
    and (
      (v_uid is not null and rv.user_id = v_uid)
      or (v_uid is null and p_session_token is not null and rv.session_token = p_session_token)
    )
  order by rv.last_viewed_at desc
  limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_return_request(p_order_id uuid, p_items jsonb, p_reason text)
 RETURNS returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_return public.returns;
  v_item jsonb;
begin
  if not public.owns_order(p_order_id) then
    raise exception 'Order not found or access denied';
  end if;
  perform 1 from public.orders where id = p_order_id and status in ('paid', 'processing', 'printing', 'shipped', 'delivered');
  if not found then
    raise exception 'This order is not eligible for a return';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required for a return request';
  end if;

  insert into public.returns (order_id, requested_by, reason) values (p_order_id, auth.uid(), p_reason) returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.return_items (return_id, order_item_id, quantity, reason, condition)
    values (
      v_return.id,
      (v_item ->> 'order_item_id')::uuid,
      (v_item ->> 'quantity')::int,
      v_item ->> 'reason',
      v_item ->> 'condition'
    );
  end loop;

  return v_return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_vendor_payout_request(p_request_id uuid, p_reason text)
 RETURNS vendor_payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.vendor_payout_requests;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.vendor_payout_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
  where id = p_request_id and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payout request not found or not pending';
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vote_review(p_review_id uuid, p_vote_type text)
 RETURNS review_votes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing_type text;
  v_result public.review_votes;
begin
  if v_uid is null then raise exception 'Must be authenticated'; end if;
  if p_vote_type not in ('helpful', 'not_helpful') then raise exception 'Invalid vote_type'; end if;
  if not exists (select 1 from public.reviews where id = p_review_id and status = 'approved') then
    raise exception 'Review not found or not visible';
  end if;

  select vote_type into v_existing_type from public.review_votes where review_id = p_review_id and user_id = v_uid;

  if v_existing_type is null then
    insert into public.review_votes (review_id, user_id, vote_type) values (p_review_id, v_uid, p_vote_type)
    returning * into v_result;
  elsif v_existing_type = p_vote_type then
    delete from public.review_votes where review_id = p_review_id and user_id = v_uid;
    return null;
  else
    update public.review_votes set vote_type = p_vote_type where review_id = p_review_id and user_id = v_uid
    returning * into v_result;
  end if;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_review(p_review_id uuid, p_reason text, p_details text DEFAULT NULL::text)
 RETURNS review_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_report_id uuid;
begin
  if v_uid is null then raise exception 'Must be authenticated'; end if;
  if not exists (select 1 from public.reviews where id = p_review_id) then
    raise exception 'Review not found';
  end if;

  insert into public.review_reports (review_id, reported_by, reason, details)
  values (p_review_id, v_uid, p_reason, p_details)
  on conflict (review_id, reported_by) do update set details = coalesce(excluded.details, public.review_reports.details)
  returning id into v_report_id;

  return (select r from public.review_reports r where r.id = v_report_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id uuid, p_body text, p_parent_reply_id uuid DEFAULT NULL::uuid)
 RETURNS review_replies
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_reply_id uuid;
begin
  if v_uid is null then raise exception 'Must be authenticated'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Reply body cannot be empty'; end if;
  if not exists (select 1 from public.reviews where id = p_review_id and status = 'approved') then
    raise exception 'Review not found or not visible';
  end if;
  if p_parent_reply_id is not null and not exists (select 1 from public.review_replies where id = p_parent_reply_id and review_id = p_review_id) then
    raise exception 'Parent reply not found on this review';
  end if;

  insert into public.review_replies (review_id, parent_reply_id, user_id, body)
  values (p_review_id, p_parent_reply_id, v_uid, p_body)
  returning id into v_reply_id;

  return (select rr from public.review_replies rr where rr.id = v_reply_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.moderate_review(p_review_id uuid, p_new_status review_status, p_note text DEFAULT NULL::text)
 RETURNS reviews
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  update public.reviews
  set status = p_new_status, moderated_by = auth.uid(), moderated_at = now(), moderation_note = coalesce(p_note, moderation_note)
  where id = p_review_id;

  if not found then raise exception 'Review not found'; end if;

  -- resolve any pending reports once the review has been moderated
  update public.review_reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now()
  where review_id = p_review_id and status = 'pending';

  return (select r from public.reviews r where r.id = p_review_id);
end;
$function$;

