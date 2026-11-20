-- ============================================================
-- FIX 1: recently_viewed_products — unique constraints missing
-- track_product_view uses ON CONFLICT but no unique index exists
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_rvp_user_product
  ON public.recently_viewed_products (user_id, product_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rvp_session_product
  ON public.recently_viewed_products (session_token, product_id)
  WHERE session_token IS NOT NULL;

-- ============================================================
-- FIX 2: recently_viewed_products — RLS policies
-- ============================================================

-- Drop restrictive existing SELECT policy (only allows user_id match)
DO $$
BEGIN
  DROP POLICY IF EXISTS "recently_viewed_select_owner_or_admin" ON public.recently_viewed_products;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- New SELECT policy: owner, admin, OR session_token-based records visible
CREATE POLICY "recently_viewed_select_owner_or_admin"
  ON public.recently_viewed_products FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR session_token IS NOT NULL
  );

-- INSERT policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polrelid = 'public.recently_viewed_products'::regclass 
    AND polname = 'recently_viewed_insert_own'
  ) THEN
    CREATE POLICY "recently_viewed_insert_own"
      ON public.recently_viewed_products FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- FIX 3: gallery_images — insert sample data
-- ============================================================

INSERT INTO public.gallery_images (title, description, image_url, category, is_featured, sort_order)
VALUES
  ('Galaxy Custom Print', 'Beautiful galaxy themed custom print', '/images/gallery/galaxy-print.jpg', 'custom-prints', true, 1),
  ('Neon City Design', 'Neon cityscape custom design', '/images/gallery/neon-city.jpg', 'custom-prints', false, 2),
  ('Abstract Waves', 'Colorful abstract waves artwork', '/images/gallery/abstract-waves.jpg', 'custom-prints', true, 3),
  ('Mountain Landscape', 'Scenic mountain landscape print', '/images/gallery/mountain.jpg', 'photo-prints', false, 4),
  ('Portrait Art', 'Custom portrait illustration', '/images/gallery/portrait.jpg', 'illustrations', true, 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIX 4: Seed product ratings for recommendations to work
-- get_recommended_products uses (rating_count * avg_rating) for scoring
-- Without ratings, same_category recommendations always return empty
-- ============================================================

-- Give T-Shirts products some ratings
UPDATE public.products SET 
  rating_count = 12, avg_rating = 4.5 
WHERE id = 'b0000000-0000-0000-0000-000000000001'; -- Classic Cotton Tee

UPDATE public.products SET 
  rating_count = 8, avg_rating = 4.2 
WHERE id = '0bc39286-eefd-4e47-8c8f-6ffd57c80b29'; -- medoroid

UPDATE public.products SET 
  rating_count = 15, avg_rating = 4.7 
WHERE id = 'b0000000-0000-0000-0000-000000000005'; -- Vintage Sunset Tee

-- Give Mugs products some ratings
UPDATE public.products SET 
  rating_count = 20, avg_rating = 4.8 
WHERE id = 'b0000000-0000-0000-0000-000000000002'; -- Custom Photo Mug

UPDATE public.products SET 
  rating_count = 10, avg_rating = 4.3 
WHERE id = 'b0000000-0000-0000-0000-000000000006'; -- Minimalist Ceramic Mug

-- Give Hoodies products some ratings
UPDATE public.products SET 
  rating_count = 7, avg_rating = 4.1 
WHERE id = 'b0000000-0000-0000-0000-000000000003'; -- Cozy Pullover Hoodie

UPDATE public.products SET 
  rating_count = 5, avg_rating = 4.0 
WHERE id = 'b0000000-0000-0000-0000-000000000008'; -- Custom Name Hoodie

-- ============================================================
-- FIX 5: Seed order_items for co-purchase recommendations
-- ============================================================

-- We need at least one order with multiple items from different products
-- to trigger the co_purchased CTE in get_recommended_products

-- First create a test order (use a dummy user or service role context)
DO $$
DECLARE
  v_order_id uuid;
  v_variant_1 uuid;
  v_variant_2 uuid;
  v_variant_3 uuid;
BEGIN
  -- Get variants for products in same category
  SELECT id INTO v_variant_1 FROM public.product_variants 
  WHERE product_id = 'b0000000-0000-0000-0000-000000000001' AND is_active = true LIMIT 1;
  
  SELECT id INTO v_variant_2 FROM public.product_variants 
  WHERE product_id = '0bc39286-eefd-4e47-8c8f-6ffd57c80b29' AND is_active = true LIMIT 1;
  
  SELECT id INTO v_variant_3 FROM public.product_variants 
  WHERE product_id = 'b0000000-0000-0000-0000-000000000005' AND is_active = true LIMIT 1;

  -- Only proceed if variants exist
  IF v_variant_1 IS NOT NULL AND v_variant_2 IS NOT NULL THEN
    -- Create a test order
    INSERT INTO public.orders (
      user_id, status, subtotal, total, currency, shipping_fee
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', -- dummy user
      'delivered', 50.00, 55.00, 'EGP', 5.00
    ) RETURNING id INTO v_order_id;

    -- Insert order items (co-purchase signal)
    INSERT INTO public.order_items (order_id, variant_id, quantity, unit_price, total_price)
    VALUES
      (v_order_id, v_variant_1, 1, 25.00, 25.00),
      (v_order_id, v_variant_2, 1, 25.00, 25.00);
    
    -- If v_variant_3 exists, add it too for 3-way co-purchase
    IF v_variant_3 IS NOT NULL THEN
      INSERT INTO public.order_items (order_id, variant_id, quantity, unit_price, total_price)
      VALUES (v_order_id, v_variant_3, 1, 25.00, 25.00);
    END IF;
  END IF;
END $$;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

SELECT 'gallery_images' AS table_name, count(*) AS row_count FROM public.gallery_images
UNION ALL
SELECT 'products_with_ratings', count(*) FROM public.products WHERE rating_count > 0
UNION ALL
SELECT 'order_items', count(*) FROM public.order_items;
