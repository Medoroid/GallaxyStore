-- =============================================================================
-- Migration: allow 'gift_box' product type on custom_print_requests
-- Prepared:  2026-11-01 (production remediation — A2 Gift Boxes)
-- STATUS:    LOCAL ONLY — NOT APPLIED TO PRODUCTION. Requires explicit human
--            approval before running against the production project.
--
-- WHY:       /api/gift-box inserts gift-box requests into the existing
--            custom_print_requests queue (single admin view, existing status
--            workflow, existing SELECT own-or-admin RLS policy). Until this
--            migration runs, the API falls back to product_type='other' with a
--            "[GIFT BOX REQUEST]" notes marker — the feature works either way;
--            applying this migration only removes the fallback.
--
-- HOW TO APPLY (when approved):
--   * Prefer running this file MANUALLY in the Supabase SQL editor as a single
--     script. Do NOT use `supabase db push` for this repository until the
--     legacy `create_*.sql` files are reconciled: they are outside the CLI
--     migration history and a push could attempt to re-apply them.
--   * Run the whole file at once (it is idempotent).
--
-- REVERSAL:  re-add the original CHECK without 'gift_box' (existing rows with
--            product_type='gift_box' must first be moved to 'other').
-- =============================================================================

-- 1) Drop the existing CHECK constraint (guarded: only if it exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      DROP CONSTRAINT custom_print_requests_product_type_check;
  END IF;
END $$;

-- 2) Re-create it with 'gift_box' appended. All previous values preserved.
--    (If a constraint with this name still exists with the old definition the
--    statement below would fail loudly — that is intentional, review first.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'custom_print_requests_product_type_check'
      AND conrelid = 'public.custom_print_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_print_requests
      ADD CONSTRAINT custom_print_requests_product_type_check
      CHECK (product_type = ANY (
        ARRAY['tshirt'::text, 'mug'::text, 'phonecase'::text, 'poster'::text,
              'other'::text, 'gift_box'::text]
      ));
  END IF;
END $$;

-- 3) Verification (returns one row when correct).
SELECT pg_get_constraintdef(oid) AS product_type_check_definition
FROM pg_constraint
WHERE conname = 'custom_print_requests_product_type_check'
  AND conrelid = 'public.custom_print_requests'::regclass;
