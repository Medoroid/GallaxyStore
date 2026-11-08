-- =============================================================================
-- Galaxy Store — local development / E2E seed
-- Applied by `supabase start` (first boot) and `supabase db reset`.
-- Idempotent: every statement is ON CONFLICT DO NOTHING, so re-running is safe
-- even when migrations already seed part of this data.
--
-- Scope: minimal catalog (brands/categories/products/variants) + shipping
-- methods/zones/rates so guest E2E flows (products, search, filters, cart,
-- shipping display) have realistic data. NO user/customer data is seeded.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
INSERT INTO public.brands (id, name, slug, description, is_active, created_at, updated_at)
VALUES ('11111111-1111-1111-1111-111111111101', 'Galaxy Wear', 'galaxy-wear',
        'Local seed brand', true, now(), now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (id, name, slug, description, is_active, sort_order, level, created_at, updated_at)
VALUES ('11111111-1111-1111-1111-111111111201', 'T-Shirts', 't-shirts',
        'Local seed category', true, 1, 0, now(), now()),
       ('11111111-1111-1111-1111-111111111202', 'Mugs', 'mugs',
        'Local seed category', true, 2, 0, now(), now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Products (published + visible so storefront_products exposes them)
-- ---------------------------------------------------------------------------
INSERT INTO public.products
  (id, brand_id, category_id, name, slug, short_description, description,
   status, visibility, is_featured, base_price, currency, weight_grams,
   avg_rating, rating_count, view_count, published_at, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111301', '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111201',
   'Classic Galaxy Tee', 'classic-galaxy-tee',
   'Soft cotton tee with the Galaxy print', 'A comfortable 100% cotton t-shirt.',
   'published', 'visible', true, 450, 'EGP', 250, 4.5, 12, 132, now(), now(), now()),
  ('11111111-1111-1111-1111-111111111302', '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111201',
   'Galaxy Hoodie', 'galaxy-hoodie',
   'Warm fleece hoodie for cold nights', 'Heavyweight hoodie with front pocket.',
   'published', 'visible', false, 850, 'EGP', 550, 4.2, 7, 64, now(), now(), now()),
  ('11111111-1111-1111-1111-111111111303', '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111202',
   'Galaxy Logo Mug', 'galaxy-logo-mug',
   'Ceramic mug with the Galaxy logo', 'Dishwasher-safe 330ml ceramic mug.',
   'published', 'visible', true, 250, 'EGP', 350, 4.8, 21, 210, now(), now(), now()),
  ('11111111-1111-1111-1111-111111111304', '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111202',
   'Galaxy Poster', 'galaxy-poster',
   'Glossy A3 poster of the nebula', 'Printed on 200gsm gloss paper.',
   'published', 'visible', false, 180, 'EGP', 120, 4.1, 4, 38, now(), now(), now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Product variants (in stock, one default per product)
-- ---------------------------------------------------------------------------
INSERT INTO public.product_variants
  (id, product_id, sku, price, stock_quantity, reserved_quantity, low_stock_threshold,
   weight_grams, is_active, is_default, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111401', '11111111-1111-1111-1111-111111111301', 'TEE-M-BLK', 450, 25, 0, 5, 250, true, true,  now(), now()),
  ('11111111-1111-1111-1111-111111111402', '11111111-1111-1111-1111-111111111301', 'TEE-L-BLK', 450, 18, 0, 5, 270, true, false, now(), now()),
  ('11111111-1111-1111-1111-111111111403', '11111111-1111-1111-1111-111111111302', 'HDL-M-GRY', 850, 12, 0, 3, 550, true, true,  now(), now()),
  ('11111111-1111-1111-1111-111111111404', '11111111-1111-1111-1111-111111111303', 'MUG-330-WHT', 250, 40, 0, 8, 350, true, true,  now(), now()),
  ('11111111-1111-1111-1111-111111111405', '11111111-1111-1111-1111-111111111304', 'PST-A3-GLS', 180, 30, 0, 6, 120, true, true,  now(), now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Shipping (mirrors the reference data shape: standard/express methods,
-- domestic default zone + international zone, one rate per zone x method)
-- ---------------------------------------------------------------------------
INSERT INTO public.shipping_methods
  (id, name, slug, type, carrier, description, requires_address, min_delivery_days, max_delivery_days, is_active, sort_order, created_at, updated_at)
VALUES
  ('ac000000-0000-0000-0000-000000000001', 'Standard Shipping', 'standard-shipping', 'standard', 'USPS',
   'Standard delivery', true, 3, 5, true, 1, now(), now()),
  ('ac000000-0000-0000-0000-000000000002', 'Express Shipping', 'express-shipping', 'express', 'UPS',
   'Express delivery', true, 1, 2, true, 2, now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.shipping_zones (id, name, slug, countries, is_default, is_active, created_at, updated_at)
VALUES
  ('ab000000-0000-0000-0000-000000000001', 'Domestic US', 'domestic-us', ARRAY['US'], true,  true, now(), now()),
  ('ab000000-0000-0000-0000-000000000002', 'International', 'international', ARRAY['CA','GB','EG'], false, true, now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.shipping_rates (id, zone_id, method_id, base_fee, per_kg_fee, free_shipping_threshold, is_active, created_at, updated_at)
VALUES
  ('ad000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 4.99, 1.50, 1500, true, now(), now()),
  ('ad000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', 12.99, 2.00, NULL, true, now(), now()),
  ('ad000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000001', 9.99, 2.50, NULL, true, now(), now()),
  ('ad000000-0000-0000-0000-000000000004', 'ab000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000002', 24.99, 3.00, NULL, true, now(), now())
ON CONFLICT DO NOTHING;
