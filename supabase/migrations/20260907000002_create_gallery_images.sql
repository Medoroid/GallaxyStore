-- Galaxy Store: Create gallery_images table
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom-prints',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

-- Public can read gallery images
DROP POLICY IF EXISTS "Gallery public read" ON gallery_images;
CREATE POLICY "Gallery public read"
  ON gallery_images FOR SELECT
  USING (true);

-- Only admins can manage gallery images
DROP POLICY IF EXISTS "Gallery admin manage" ON gallery_images;
CREATE POLICY "Gallery admin manage"
  ON gallery_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
