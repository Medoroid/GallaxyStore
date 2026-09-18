-- Galaxy Store: Cart System
-- Run this SQL in your Supabase SQL Editor to create the cart tables

-- 1. Cart table (one per user)
CREATE TABLE IF NOT EXISTS carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Cart items table
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  size TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cart_id, product_id, color, size)
);

-- 3. Enable RLS
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view own cart"
  ON carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cart"
  ON carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cart"
  ON carts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cart"
  ON carts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own cart items"
  ON cart_items FOR SELECT
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own cart items"
  ON cart_items FOR INSERT
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own cart items"
  ON cart_items FOR UPDATE
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own cart items"
  ON cart_items FOR DELETE
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

-- 5. Function to get or create cart
CREATE OR REPLACE FUNCTION get_or_create_cart(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
  END IF;
  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to sync entire cart (replace all items)
CREATE OR REPLACE FUNCTION sync_cart(
  p_user_id UUID,
  p_items JSONB
)
RETURNS VOID AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Get or create cart
  SELECT get_or_create_cart(p_user_id) INTO v_cart_id;

  -- Delete existing items
  DELETE FROM cart_items WHERE cart_id = v_cart_id;

  -- Insert new items
  INSERT INTO cart_items (cart_id, product_id, product_name, product_image, price, quantity, color, size)
  SELECT
    v_cart_id,
    (item->>'product_id')::TEXT,
    (item->>'product_name')::TEXT,
    (item->>'product_image')::TEXT,
    (item->>'price')::NUMERIC,
    (item->>'quantity')::INTEGER,
    (item->>'color')::TEXT,
    (item->>'size')::TEXT
  FROM jsonb_array_elements(p_items) AS item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
