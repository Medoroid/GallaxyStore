-- Fix cart_items_detailed view to include product_image
-- This column is required by the frontend cartStore.ts syncWithServer

CREATE OR REPLACE VIEW cart_items_detailed AS
SELECT
  ci.id,
  ci.cart_id,
  ci.variant_id,
  ci.customization_id,
  ci.quantity,
  ci.unit_price_snapshot,
  (ci.unit_price_snapshot * ci.quantity::numeric) AS line_total,
  ci.is_saved_for_later,
  ci.reserved_until,
  ci.added_at,
  ci.color,
  ci.size,
  pv.sku,
  pv.price AS current_price,
  (ci.unit_price_snapshot <> pv.price) AS price_changed_since_added,
  pv.stock_quantity,
  pv.reserved_quantity,
  (pv.stock_quantity - pv.reserved_quantity) AS available_stock,
  p.id AS product_id,
  p.name AS product_name,
  p.slug AS product_slug,
  COALESCE(
    (SELECT pi.storage_path FROM product_images pi
     WHERE pi.product_id = p.id AND pi.variant_id IS NULL
     ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1),
    p.color
  ) AS product_image,
  pc.name AS customization_name,
  pc.preview_image_url AS customization_preview_url
FROM cart_items ci
  JOIN product_variants pv ON pv.id = ci.variant_id
  JOIN products p ON p.id = pv.product_id
  LEFT JOIN product_customizations pc ON pc.id = ci.customization_id;
