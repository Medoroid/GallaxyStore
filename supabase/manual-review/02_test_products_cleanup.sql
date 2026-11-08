-- =============================================================================
-- TEST / JUNK PRODUCT CLEANUP — PREPARED, NOT APPLIED
-- Project: Galaxy Store (production: httywgkwfqvrbuwuzutu)
-- Prepared: 2026-11-01 — production remediation A3
--
-- ⚠️  REQUIRES EXPLICIT OWNER APPROVAL. NOTHING IN THIS FILE HAS BEEN RUN.
--
-- Current facts (read-only inspection, 2026-11-01):
--   * 'test product'  (9557f663-5a5c-43db-87e8-5c21bd8cd031) — status: published, 0 images
--   * 'mega'          (777cfbdc-6f1d-4bef-8940-04e54f33ad84) — status: draft, 0 images
--   * 'medoroid'      (0bc39286-eefd-4e47-8c8f-6ffd57c80b29) — status: published,
--                     6 HEALTHY uploaded images — ambiguous: could be a real
--                     product or a dev upload. DECISION REQUIRED BY OWNER.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — PREVIEW every candidate (read-only)
-- -----------------------------------------------------------------------------
SELECT p.id, p.name, p.status,
       (SELECT count(*) FROM public.product_images pi WHERE pi.product_id = p.id) AS image_count,
       p.created_at
FROM public.products p
WHERE p.id IN ('9557f663-5a5c-43db-87e8-5c21bd8cd031',
               '777cfbdc-6f1d-4bef-8940-04e54f33ad84',
               '0bc39286-eefd-4e47-8c8f-6ffd57c80b29')
   OR lower(p.name) ~ '^(test|demo|sample|tmp|asdf)'
ORDER BY p.status, p.name;

-- -----------------------------------------------------------------------------
-- STEP 2 — APPROVED ACTIONS (commented out; uncomment per decision)
-- -----------------------------------------------------------------------------

-- 2a. Unpublish 'test product' (double guard: exact id + exact name + state).
-- BEGIN;
-- UPDATE public.products
-- SET status = 'draft', updated_at = now()
-- WHERE id = '9557f663-5a5c-43db-87e8-5c21bd8cd031'
--   AND lower(trim(name)) = 'test product'
--   AND status = 'published';
-- COMMIT;

-- 2b. Delete 'mega' ONLY if confirmed junk (it is already draft, so no
--     customer impact either way — deletion is optional housekeeping).
--     NOTE: check FK dependents first (variants/order_items reference items,
--     not products — but verify):
--       SELECT * FROM public.product_variants WHERE product_id = '777cfbdc-…';
-- BEGIN;
-- DELETE FROM public.products
-- WHERE id = '777cfbdc-6f1d-4bef-8940-04e54f33ad84'
--   AND lower(trim(name)) = 'mega'
--   AND status = 'draft'
--   AND NOT EXISTS (SELECT 1 FROM public.order_items oi
--                    WHERE oi.product_id = '777cfbdc-6f1d-4bef-8940-04e54f33ad84');
-- COMMIT;

-- 2c. 'medoroid' — leave UNTOUCHED until the owner answers:
--       (a) real product  -> keep as is (images are healthy),
--       (b) dev junk      -> unpublish like 2a (do NOT delete: it may be
--                             referenced by cart/wishlist rows).

-- -----------------------------------------------------------------------------
-- STEP 3 — POST-CHECK (read-only): no test-named product stays published
-- -----------------------------------------------------------------------------
-- SELECT id, name, status FROM public.products
-- WHERE status = 'published'
--   AND lower(name) ~ '^(test|demo|sample|tmp|asdf)';
