-- Galaxy Store: Wishlist System
-- Run this SQL in your Supabase SQL Editor

-- 1. Wishlists table
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 2. Enable RLS
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Users can view own wishlist"
  ON wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist"
  ON wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist"
  ON wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Index for faster lookups
CREATE INDEX idx_wishlists_user_product ON wishlists(user_id, product_id);
