-- =============================================================================
-- CURRENCY DATA REVIEW & CLEANUP — PREPARED, NOT APPLIED
-- Project: Galaxy Store (production: httywgkwfqvrbuwuzutu)
-- Prepared: 2026-11-01 — production remediation B3
--
-- ⚠️  REQUIRES EXPLICIT OWNER APPROVAL + A DECISION ON THE STORE CURRENCY AND
--     THE EGP/USD EXCHANGE RATE. NOTHING IN THIS FILE HAS BEEN RUN.
--
-- Facts (read-only inspection, 2026-11-01):
--   * 18 products priced in USD, 3 products in EGP.
--   * store_settings is EMPTY (0 rows) — no store currency is configured.
--   * Shipping rates are US-domestic + international (CA/GB/EG).
--   * The storefront and formatCurrency default to USD.
--
-- DECISION REQUIRED (do not guess):
--   1) Store currency: USD or EGP?
--   2) If converting the3 EGP rows to USD: what EGP/USD rate applies on the
--      conversion date? (Enter it below as :rate_usd_per_egp — e.g.1 EGP =
--      0.020 USD means rate =0.020.)
--   3) Alternative: keep mixed currencies — the cart now shows per-currency
--      subtotals honestly, but a single-currency catalog is strongly
--      recommended before enabling payments.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP1 — REVIEW (read-only)
-- -----------------------------------------------------------------------------

--1a. Full currency distribution of products:
SELECT p.currency, count(*) AS products,
       min(p.base_price) AS min_price, max(p.base_price) AS max_price
FROM public.products p
GROUP BY p.currency
ORDER BY products DESC;

--1b. The exact EGP products (conversion candidates — review each):
SELECT p.id, p.name, p.slug, p.base_price, p.compare_at_price, p.currency,
       p.status, p.created_at
FROM public.products p
WHERE upper(p.currency) = 'EGP'
ORDER BY p.created_at;

--1c. NOTE: product_variants has NO currency column — variant prices follow the
--    parent product's currency. Nothing to convert there.
SELECT v.id, v.product_id, p.name, v.price, v.sku, p.currency AS product_currency
FROM public.product_variants v
JOIN public.products p ON p.id = v.product_id
ORDER BY p.name
LIMIT 50;

--1d. Currencies present in carts / orders (historical impact):
SELECT currency, count(*) FROM public.carts GROUP BY currency;
SELECT currency, count(*) FROM public.orders GROUP BY currency;

--1e. Any existing store_settings rows about currency (currently none):
SELECT key, value, is_public
FROM public.store_settings
WHERE key ILIKE '%currency%';

-- -----------------------------------------------------------------------------
-- STEP2 — MUTATIONS (commented out; require approval + decided rate)
-- -----------------------------------------------------------------------------

--2a. OPTIONAL — record the store currency decision as a public setting so the
--    UI can read it (once the settings page supports currency, or via SQL):
-- BEGIN;
-- INSERT INTO public.store_settings (key, value, is_public)
-- VALUES ('store_currency', '"USD"'::jsonb, true)
-- ON CONFLICT (key) DO UPDATE
--   SET value = EXCLUDED.value, updated_at = now();
-- COMMIT;

--2b. Convert the3 EGP products to USD using the APPROVED rate.
--     Example: rate_usd_per_egp =0.020 →799 EGP ≈15.98 USD.
--     The UPDATE keeps compare_at_price proportional and rewrites currency.
-- BEGIN;
-- UPDATE public.products
-- SET base_price      = round((base_price * :rate_usd_per_egp)::numeric,2),
--     compare_at_price = CASE
--                          WHEN compare_at_price IS NOT NULL
--                            THEN round((compare_at_price * :rate_usd_per_egp)::numeric,2)
--                          ELSE NULL
--                        END,
--     currency        = 'USD',
--     updated_at      = now()
-- WHERE upper(currency) = 'EGP'
--   AND id IN ('e5ef97ea-07d4-47cd-bce1-6ac4fba706f3',  -- زجاجة مياه ستانلس
--              '80d1be9b-add3-4f68-8b5c-ec96307a9bd3',  -- وسادة ديكور
--              'ef14bbd9-1bef-452b-b6ae-c50e264e379a'); -- مج حراري أبيض
-- COMMIT;

--2c. Variants need NO conversion — they have no currency column; their prices
--    follow the parent product's currency (see preview1c).

-- -----------------------------------------------------------------------------
-- STEP3 — POST-CHECK (read-only): one currency across the catalog
-- -----------------------------------------------------------------------------
-- SELECT currency, count(*) FROM public.products GROUP BY currency;
