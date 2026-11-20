-- ===========================================================================
-- Phase 5 — seed the product-type catalog with the 8 required types.
--
-- The TypeScript registry (lib/design-studio/templates/index.ts) is the
-- RENDERING authority (it also carries the SVG body/overlay code); this seed
-- mirrors its geometry into creator_product_templates so commerce, publishing
-- and admin tooling can read the catalog from the database. Keep the two in
-- sync — a color/view that exists only here cannot be rendered, and one that
-- exists only in the registry cannot be sold.
--
-- JSON casing: SQL jsonb uses snake_case (print_area, name_ar, shade_hex) as
-- documented in the plan; the TS registry uses camelCase (printArea, nameAr,
-- shadeHex). Categories/keys satisfy the table CHECK constraints
-- (^[a-z0-9_-]{1,40}$ / ^[a-z0-9_]{2,40}$).
--
-- Idempotent: re-running never duplicates or reverts admin edits.
-- ===========================================================================

insert into public.creator_product_templates
  (template_key, name, name_ar, category, dimensions_mm, views, colors, sizes,
   mockup_format, is_active, sort_order)
values
  (
    'tshirt', 'T-Shirt', 'تيشيرت', 'apparel',
    '{"w": 560, "h": 700}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 290, "w": 300, "h": 400}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 270, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "black",   "name": "Black",        "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white",   "name": "White",        "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "heather", "name": "Heather Gray", "name_ar": "رمادي",  "hex": "#a7adb8", "shade_hex": "#828996"},
      {"key": "navy",    "name": "Navy",         "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",     "name": "Red",          "name_ar": "أحمر",   "hex": "#c62f38", "shade_hex": "#8f1f26"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 1
  ),
  (
    'hoodie', 'Hoodie', 'هودي', 'apparel',
    '{"w": 600, "h": 760}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 400, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1100}, "print_area": {"x": 350, "y": 340, "w": 300, "h": 420}}
    ]'::jsonb,
    '[
      {"key": "white",    "name": "White",    "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "charcoal", "name": "Charcoal", "name_ar": "فحمي",   "hex": "#33343d", "shade_hex": "#1a1b22"},
      {"key": "black",    "name": "Black",    "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "gray",     "name": "Gray",     "name_ar": "رمادي",  "hex": "#8f95a3", "shade_hex": "#6a7080"},
      {"key": "navy",     "name": "Navy",     "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "maroon",   "name": "Maroon",   "name_ar": "عنابي",  "hex": "#7a2e39", "shade_hex": "#541d25"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 2
  ),
  (
    'sweatshirt', 'Sweatshirt', 'سويت شيرت', 'apparel',
    '{"w": 580, "h": 720}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 330, "w": 300, "h": 360}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 1000, "h": 1000}, "print_area": {"x": 350, "y": 300, "w": 300, "h": 380}}
    ]'::jsonb,
    '[
      {"key": "white",    "name": "White",         "name_ar": "أبيض",       "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "ash",      "name": "Ash",           "name_ar": "رمادي فاتح", "hex": "#c9ccd3", "shade_hex": "#a4a8b2"},
      {"key": "navy",     "name": "Navy",          "name_ar": "كحلي",       "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "forest",   "name": "Forest Green",  "name_ar": "أخضر",       "hex": "#2f5541", "shade_hex": "#1d382a"},
      {"key": "black",    "name": "Black",         "name_ar": "أسود",       "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "burgundy", "name": "Burgundy",      "name_ar": "خمري",       "hex": "#6d2b36", "shade_hex": "#4a1c24"}
    ]'::jsonb,
    '[
      {"key": "s",   "name": "Small",       "label": "S"},
      {"key": "m",   "name": "Medium",      "label": "M"},
      {"key": "l",   "name": "Large",       "label": "L"},
      {"key": "xl",  "name": "Extra Large", "label": "XL"},
      {"key": "xxl", "name": "Double XL",   "label": "XXL"}
    ]'::jsonb,
    'png', true, 3
  ),
  (
    'mug', 'Coffee Mug', 'كوب قهوة', 'drinkware',
    '{"w": 120, "h": 95, "depth": 80}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 700}, "print_area": {"x": 215, "y": 200, "w": 430, "h": 300}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White", "name_ar": "أبيض",    "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "black", "name": "Black", "name_ar": "أسود",    "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",    "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر",    "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "mint",  "name": "Mint",  "name_ar": "نعناعي",  "hex": "#7fd1b9", "shade_hex": "#5aa992"}
    ]'::jsonb,
    '[
      {"key": "11oz", "name": "11 oz", "label": "11 oz"},
      {"key": "15oz", "name": "15 oz", "label": "15 oz"}
    ]'::jsonb,
    'png', true, 4
  ),
  (
    'phone_case', 'Phone Case', 'غطاء هاتف', 'tech',
    '{"w": 75, "h": 152}'::jsonb,
    '[
      {"key": "back", "label": "Back", "canvas": {"w": 600, "h": 1200}, "print_area": {"x": 64, "y": 130, "w": 472, "h": 970}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود",   "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض",   "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "navy",  "name": "Navy",  "name_ar": "كحلي",   "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "pink",  "name": "Pink",  "name_ar": "وردي",   "hex": "#f2a8c4", "shade_hex": "#d17fa3"},
      {"key": "clear", "name": "Clear", "name_ar": "شفاف",   "hex": "#e9f3f7", "shade_hex": "#c3d8e0"}
    ]'::jsonb,
    '[
      {"key": "iphone-15",     "name": "iPhone 15",    "label": "iPhone 15"},
      {"key": "iphone-15-pro", "name": "iPhone 15 Pro", "label": "15 Pro"},
      {"key": "galaxy-s24",    "name": "Galaxy S24",   "label": "S24"}
    ]'::jsonb,
    'png', true, 5
  ),
  (
    'tote_bag', 'Tote Bag', 'حقيبة قماش', 'accessories',
    '{"w": 380, "h": 420}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}},
      {"key": "back",  "label": "Back",  "canvas": {"w": 900, "h": 1000}, "print_area": {"x": 250, "y": 390, "w": 400, "h": 440}}
    ]'::jsonb,
    '[
      {"key": "natural", "name": "Natural", "name_ar": "طبيعي", "hex": "#e8dcc6", "shade_hex": "#cbb998"},
      {"key": "black",   "name": "Black",   "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "navy",    "name": "Navy",    "name_ar": "كحلي", "hex": "#26324f", "shade_hex": "#141c31"},
      {"key": "olive",   "name": "Olive",   "name_ar": "زيتي", "hex": "#5d6b3f", "shade_hex": "#414c2a"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "15×16 in"},
      {"key": "large",    "name": "Large",    "label": "18×20 in"}
    ]'::jsonb,
    'png', true, 6
  ),
  (
    'poster', 'Art Poster', 'ملصق فني', 'wall_art',
    '{"w": 305, "h": 381}'::jsonb,
    '[
      {"key": "front", "label": "Front", "canvas": {"w": 800, "h": 1000}, "print_area": {"x": 45, "y": 45, "w": 710, "h": 910}}
    ]'::jsonb,
    '[
      {"key": "white", "name": "White Paper",  "name_ar": "ورق أبيض",  "hex": "#ffffff", "shade_hex": "#dcdce4"},
      {"key": "ivory", "name": "Ivory Paper",  "name_ar": "ورق عاجي",  "hex": "#f6f1e7", "shade_hex": "#ddd5c4"},
      {"key": "black", "name": "Black Paper",  "name_ar": "ورق أسود", "hex": "#16161c", "shade_hex": "#000000"}
    ]'::jsonb,
    '[
      {"key": "12x16", "name": "12 × 16 in", "label": "12×16"},
      {"key": "18x24", "name": "18 × 24 in", "label": "18×24"},
      {"key": "24x36", "name": "24 × 36 in", "label": "24×36"}
    ]'::jsonb,
    'png', true, 7
  ),
  (
    'mouse_pad', 'Mouse Pad', 'ماوس باد', 'accessories',
    '{"w": 220, "h": 220}'::jsonb,
    '[
      {"key": "front", "label": "Top", "canvas": {"w": 900, "h": 900}, "print_area": {"x": 72, "y": 72, "w": 756, "h": 756}}
    ]'::jsonb,
    '[
      {"key": "black", "name": "Black", "name_ar": "أسود", "hex": "#1f1f26", "shade_hex": "#000000"},
      {"key": "white", "name": "White", "name_ar": "أبيض", "hex": "#f6f6f8", "shade_hex": "#d7d7de"},
      {"key": "red",   "name": "Red",   "name_ar": "أحمر", "hex": "#c62f38", "shade_hex": "#8f1f26"},
      {"key": "blue",  "name": "Blue",  "name_ar": "أزرق", "hex": "#2f5f9e", "shade_hex": "#1f4272"}
    ]'::jsonb,
    '[
      {"key": "standard", "name": "Standard", "label": "9×9 in"},
      {"key": "xl",       "name": "Extended", "label": "12×10 in"}
    ]'::jsonb,
    'png', true, 8
  )
on conflict (template_key) do nothing;
