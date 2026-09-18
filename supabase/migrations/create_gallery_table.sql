-- Galaxy Store: Gallery System
-- Run this SQL in your Supabase SQL Editor

-- 1. Gallery images table
CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  category TEXT DEFAULT 'custom-prints',
  sort_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies - anyone can read, only admin can write
CREATE POLICY "Anyone can view gallery images"
  ON gallery_images FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert gallery images"
  ON gallery_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update gallery images"
  ON gallery_images FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete gallery images"
  ON gallery_images FOR DELETE
  USING (auth.role() = 'authenticated');

-- 4. Storage bucket for gallery images
-- Run this in Supabase Dashboard > Storage > New Bucket
-- Bucket name: gallery
-- Public: true

-- 5. Insert sample gallery images (optional)
INSERT INTO gallery_images (title, image_url, category, sort_order) VALUES
('Galaxy Neon Tee', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab', 'apparel', 1),
('Cosmic Glow Mug', 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d', 'mugs', 2),
('Space Poster', 'https://images.unsplash.com/photo-1550745165-9bc0b252726f', 'posters', 3),
('Gaming Phone Case', 'https://images.unsplash.com/photo-1541560052-5e137f229371', 'phone-cases', 4),
('Custom Galaxy Frame', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f', 'frames', 5),
('Neon Sticker Pack', 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e', 'stickers', 6);
