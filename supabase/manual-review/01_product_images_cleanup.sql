-- =============================================================================
-- PRODUCT IMAGE DATA CLEANUP — PREPARED, NOT APPLIED
-- Project: Galaxy Store (production: httywgkwfqvrbuwuzutu)
-- Prepared: 2026-11-01 — production remediation A3
--
-- ⚠️  THIS FILE MUST NEVER BE RUN AGAINST PRODUCTION WITHOUT EXPLICIT OWNER
--     APPROVAL AFTER REVIEWING THE PREVIEW SELECTs.
--
-- Safety design:
--   * Every mutating statement matches on the EXACT image_id AND the EXACT
--     storage_path AND the expected product_id (triple match) — a row that was
--     later re-used for a healthy image cannot be deleted by accident.
--   * All statements are COMMENTED OUT by default. Uncomment per approved item.
--   * Run step 1 (preview) first and read every returned row.
--
-- Context: see docs/PRODUCT-DATA-INTEGRITY-REPORT.md §2.1 and §2.4.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only, safe to run any time)
-- -----------------------------------------------------------------------------

-- 1a. The8 rows that point at storage objects that do not exist (HTTP 400):
SELECT p.id          AS product_id,
       p.name        AS product_name,
       p.status      AS product_status,
       pi.id         AS image_id,
       pi.storage_path,
       pi.is_primary
FROM public.product_images pi
JOIN public.products p ON p.id = pi.product_id
WHERE pi.storage_path IN (
        'products/classic-tee/main.jpg',
        'products/photo-mug/main.jpg',
        'products/cozy-hoodie/main.jpg',
        'products/text-tote/main.jpg',
        'products/vintage-tee/main.jpg',
        'products/mini-mug/main.jpg',
        'products/eco-tote/main.jpg',
        'products/name-hoodie/main.jpg'
      )
ORDER BY p.name;

-- 1b. Test/ junk products currently visible (published):
SELECT id, name, status, created_at
FROM public.products
WHERE id IN ('9557f663-5a5c-43db-87e8-5c21bd8cd031',   -- test product (published)
             '777cfbdc-6f1d-4bef-8940-04e54f33ad84')   -- mega (draft)
   OR lower(name) IN ('test product', 'mega', 'test', 'demo')
ORDER BY status, name;

-- 1c. External hotlink rows (optional cleanup AFTER real photos exist):
SELECT p.id AS product_id, p.name, pi.id AS image_id, pi.storage_path
FROM public.product_images pi
JOIN public.products p ON p.id = pi.product_id
WHERE pi.storage_path LIKE 'http%'
ORDER BY p.name;

-- -----------------------------------------------------------------------------
-- STEP 2 — MUTATIONS (commented out; uncomment ONLY after approval)
-- -----------------------------------------------------------------------------

-- 2a. Delete the8 dead seed image rows (triple-match guard).
--     After deletion the storefront shows the local category placeholder
--     (productCardImage) instead of a broken URL — visually identical to the
--     current SafeImage fallback, but without dead references.
--
-- BEGIN;
-- DELETE FROM public.product_images pi
-- USING public.products p
-- WHERE p.id = pi.product_id
--   AND pi.id = 'b2000000-0000-0000-0000-000000000001'
--   AND pi.storage_path = 'products/classic-tee/main.jpg'
--   AND p.id = 'b0000000-0000-0000-0000-000000000001';
-- -- repeat for each pair (image_id / storage_path / product_id) from preview 1a:
-- --   b2000000-…-000000000002 / products/photo-mug/main.jpg      / b0000000-…-000000000002
-- --   b2000000-…-000000000003 / products/cozy-hoodie/main.jpg    / b0000000-…-000000000003
-- --   b2000000-…-000000000004 / products/text-tote/main.jpg      / b0000000-…-000000000004
-- --   b2000000-…-000000000005 / products/vintage-tee/main.jpg    / b0000000-…-000000000005
-- --   b2000000-…-000000000006 / products/mini-mug/main.jpg       / b0000000-…-000000000006
-- --   b2000000-…-000000000007 / products/eco-tote/main.jpg       / b0000000-…-000000000007
-- --   b2000000-…-000000000008 / products/name-hoodie/main.jpg    / b0000000-…-000000000008
-- COMMIT;

-- 2b. Unpublish the published test product (id + exact name double guard).
-- BEGIN;
-- UPDATE public.products
-- SET status = 'draft', updated_at = now()
-- WHERE id = '9557f663-5a5c-43db-87e8-5c21bd8cd031'
--   AND lower(name) = 'test product'
--   AND status = 'published';
-- COMMIT;

-- 2c. OPTIONAL — remove external hotlink rows (only after uploading real
--     photos; otherwise the products lose their images entirely and show the
--     generic placeholder):
-- BEGIN;
-- DELETE FROM public.product_images pi
-- USING public.products p
-- WHERE p.id = pi.product_id
--   AND pi.id = 'a961313d-083a-4eed-8960-938e0f3ce23a'                 -- pinimg
--   AND pi.storage_path LIKE 'https://i.pinimg.com/%'
--   AND p.id = 'f9a11e67-af79-449a-9b63-43bdb6ff177e';
-- -- …repeat per row from preview 1c, keeping the LIKE-host guard.
-- COMMIT;

-- -----------------------------------------------------------------------------
-- STEP 3 — POST-CHECK (read-only): confirm nothing broken remains
-- -----------------------------------------------------------------------------
-- SELECT count(*) AS remaining_dead_rows
-- FROM public.product_images
-- WHERE storage_path LIKE 'products/%'            -- seed-era paths
--   AND storage_path NOT LIKE 'http%';
