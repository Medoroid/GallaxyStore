-- Galaxy Store: Orders System
-- Run this SQL in your Supabase SQL Editor

-- 1. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal NUMERIC(10,2) NOT NULL,
  shipping NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  promo_code TEXT,
  shipping_address JSONB,
  payment_method TEXT DEFAULT 'cod',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  size TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON orders FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. RLS Policies for order_items
CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own order items"
  ON order_items FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

-- 6. Function to create order with items
CREATE OR REPLACE FUNCTION create_order(
  p_user_id UUID,
  p_subtotal NUMERIC,
  p_shipping NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_currency TEXT,
  p_promo_code TEXT,
  p_shipping_address JSONB,
  p_payment_method TEXT,
  p_notes TEXT,
  p_items JSONB
)
RETURNS UUID AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Create order
  INSERT INTO orders (user_id, subtotal, shipping, discount, total, currency, promo_code, shipping_address, payment_method, notes)
  VALUES (p_user_id, p_subtotal, p_shipping, p_discount, p_total, p_currency, p_promo_code, p_shipping_address, p_payment_method, p_notes)
  RETURNING id INTO v_order_id;

  -- Insert order items
  INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, color, size)
  SELECT
    v_order_id,
    (item->>'product_id')::TEXT,
    (item->>'product_name')::TEXT,
    (item->>'product_image')::TEXT,
    (item->>'price')::NUMERIC,
    (item->>'quantity')::INTEGER,
    (item->>'color')::TEXT,
    (item->>'size')::TEXT
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
