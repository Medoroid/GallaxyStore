-- Add color and size columns to cart_items for variant option tracking
-- These are user-selected options, not database variant attributes

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT;

-- Update the unique constraint to include color and size
-- First drop the old constraint if it exists, then add new one
DO $$
BEGIN
  -- Drop existing unique constraints on cart_items that involve cart_id
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_cart_id_variant_id_key'
    AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE cart_items DROP CONSTRAINT cart_items_cart_id_variant_id_key;
  END IF;

  -- Add new unique constraint including color and size
  ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_cart_variant_color_size_unique
    UNIQUE (cart_id, variant_id, color, size);
END $$;

-- Update cart_items_detailed view to include color and size
CREATE OR REPLACE VIEW cart_items_detailed AS
SELECT
  ci.id,
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
  pc.preview_image_url AS customization_preview_url
FROM cart_items ci
  JOIN product_variants pv ON pv.id = ci.variant_id
  JOIN products p ON p.id = pv.product_id
  LEFT JOIN product_customizations pc ON pc.id = ci.customization_id;
