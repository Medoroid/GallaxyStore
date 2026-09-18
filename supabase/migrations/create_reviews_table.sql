-- Galaxy Store: Reviews System
-- Run this SQL in your Supabase SQL Editor

-- 1. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 2. Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Index for faster lookups
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user_product ON reviews(user_id, product_id);

-- 5. View for product stats
CREATE OR REPLACE VIEW product_review_stats AS
SELECT
  product_id,
  COUNT(*) as review_count,
  ROUND(AVG(rating), 1) as avg_rating
FROM reviews
GROUP BY product_id;
