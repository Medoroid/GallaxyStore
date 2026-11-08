-- =============================================================================
-- SHIPPING ZONES — EGYPT LOCAL + CORRECT GLOBAL FALLBACK
-- Project: Galaxy Store (production: httywgkwfqvrbuwuzutu)
-- Prepared: 2026-11-01 — production remediation B4 (Phase Two)
--
-- ⚠️  THIS FILE MUST NEVER BE RUN AGAINST PRODUCTION WITHOUT EXPLICIT OWNER
--     APPROVAL AFTER REVIEWING THE PREVIEW SELECTs AND EDITING THE FEES.
--
-- Current live state (read-only inspection 2026-11-01):
--   Zone "Domestic US"   countries=['US']   is_default=TRUE   base 4.99/12.99
--   Zone "International" countries=['CA','GB','EG']           base 9.99/24.99
--
-- Problems this migration fixes:
--   1. Egypt (the target market) is priced as "International" instead of a
--      local zone with its own rates and delivery windows.
--   2. "Domestic US" is the DEFAULT zone, so any country not explicitly listed
--      silently receives US-domestic pricing. The default must be the
--      rest-of-world (International) zone.
--   3. If EG stays in more than one zone, get_shipping_options() matches
--      `p_country = any(countries) limit 1` with no ORDER BY — the zone a
--      customer gets becomes arbitrary. EG must exist in exactly ONE zone.
--
-- Guard rails:
--   * Idempotent: safe to re-run (checks to_regclass / existing rows first).
--   * REFUSES TO RUN while any fee below is still NULL — the migration will
--     never create an Egypt zone with no rates, because an empty zone makes
--     get_shipping_options() return nothing and checkout() then accepts a
--     zero shipping fee (free shipping by accident).
--   * No rows are deleted. The International zone keeps its other countries.
--
-- ⚠️  CURRENCY: fees below must be entered in the SAME currency the store
--     bills in (store_settings.currency). The checkout validates the fee
--     against these numbers but does not convert currencies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only, safe to run any time — run this FIRST)
-- -----------------------------------------------------------------------------
SELECT z.name               AS zone,
       z.countries,
       z.is_default,
       m.name               AS method,
       r.base_fee,
       r.per_kg_fee,
       r.free_shipping_threshold,
       r.is_active
FROM public.shipping_zones z
LEFT JOIN public.shipping_rates r ON r.zone_id = z.id
LEFT JOIN public.shipping_methods m ON m.id = r.method_id
WHERE z.deleted_at IS NULL
ORDER BY z.is_default DESC, z.name, m.sort_order;

-- Where Egypt is priced today (must be a single zone after applying):
SELECT z.name, z.countries
FROM public.shipping_zones z
WHERE z.deleted_at IS NULL
  AND z.countries @> array['EG'];

-- -----------------------------------------------------------------------------
-- STEP 2 — APPLY (set the four ★ fee values inside the DECLARE block below
--          first; the block REFUSES to run while any required fee is NULL)
-- -----------------------------------------------------------------------------
DO $$
declare
  v_standard_fee     numeric := NULL;  -- ★ Egypt standard base fee
  v_express_fee      numeric := NULL;  -- ★ Egypt express base fee
  v_per_kg_fee       numeric := NULL;  -- ★ Egypt per-kg surcharge
  v_free_threshold   numeric := NULL;  -- ★ free shipping threshold (NULL = never free)

  v_eg_zone_id       uuid;
  v_intl_zone_id     uuid;
  v_standard_method  uuid;
  v_express_method   uuid;
  v_existing         int;
begin
  if v_standard_fee is null or v_express_fee is null or v_per_kg_fee is null then
    raise exception
      'FEES NOT SET: edit v_standard_fee / v_express_fee / v_per_kg_fee in the DECLARE block of STEP 2 before applying.';
  end if;

  if to_regclass('public.shipping_zones') is null
     or to_regclass('public.shipping_rates') is null
     or to_regclass('public.shipping_methods') is null then
    raise exception 'Dependency missing: shipping_zones / shipping_rates / shipping_methods';
  end if;

  -- The exact methods the live checkout uses (type = standard / express).
  select id into v_standard_method from public.shipping_methods
   where type = 'standard' and is_active and deleted_at is null limit 1;
  select id into v_express_method from public.shipping_methods
   where type = 'express' and is_active and deleted_at is null limit 1;
  if v_standard_method is null or v_express_method is null then
    raise exception 'Dependency missing: an active standard AND express shipping method';
  end if;

  -- 1) Ensure the International (rest-of-world) zone exists and is the default.
  select id into v_intl_zone_id from public.shipping_zones
   where name = 'International' and deleted_at is null limit 1;
  if v_intl_zone_id is null then
    insert into public.shipping_zones (name, countries, is_default, is_active)
    values ('International', '{}', true, true)
    returning id into v_intl_zone_id;
  end if;

  -- 2) Create the Egypt Local zone if missing (EG lives ONLY here).
  select id into v_eg_zone_id from public.shipping_zones
   where name = 'Egypt Local' and deleted_at is null limit 1;
  if v_eg_zone_id is null then
    insert into public.shipping_zones (name, countries, is_default, is_active)
    values ('Egypt Local', array['EG'], false, true)
    returning id into v_eg_zone_id;
  end if;

  -- 3) Move EG out of every other zone so the zone match is unambiguous.
  update public.shipping_zones
     set countries = array_remove(countries, 'EG'),
         updated_at = now()
   where id <> v_eg_zone_id
     and countries @> array['EG'];

  -- 4) Unlisted destinations must fall to International, not US-domestic.
  update public.shipping_zones
     set is_default = (id = v_intl_zone_id),
         updated_at = now()
   where deleted_at is null
     and is_default <> (id = v_intl_zone_id);

  -- 5) Rates for the Egypt zone (insert only when missing — never overwrite
  --    an existing configured rate).
  select count(*) into v_existing from public.shipping_rates
   where zone_id = v_eg_zone_id and method_id = v_standard_method;
  if v_existing = 0 then
    insert into public.shipping_rates
      (zone_id, method_id, base_fee, per_kg_fee, free_shipping_threshold, is_active)
    values (v_eg_zone_id, v_standard_method, v_standard_fee, v_per_kg_fee, v_free_threshold, true);
  end if;

  select count(*) into v_existing from public.shipping_rates
   where zone_id = v_eg_zone_id and method_id = v_express_method;
  if v_existing = 0 then
    insert into public.shipping_rates
      (zone_id, method_id, base_fee, per_kg_fee, free_shipping_threshold, is_active)
    values (v_eg_zone_id, v_express_method, v_express_fee, 0, null, true);
  end if;

  raise notice 'Egypt Local zone ready (id=%). EG removed from other zones. Default zone = International.', v_eg_zone_id;
end $$;

-- -----------------------------------------------------------------------------
-- STEP 3 — VERIFY (run after applying)
-- -----------------------------------------------------------------------------
SELECT z.name               AS zone,
       z.countries,
       z.is_default,
       m.name               AS method,
       r.base_fee,
       r.per_kg_fee,
       r.free_shipping_threshold,
       r.is_active
FROM public.shipping_zones z
LEFT JOIN public.shipping_rates r ON r.zone_id = z.id
LEFT JOIN public.shipping_methods m ON m.id = r.method_id
WHERE z.deleted_at IS NULL
ORDER BY z.is_default DESC, z.name, m.sort_order;

-- Sanity: EG must appear in exactly ONE zone after applying.
SELECT z.name, z.countries
FROM public.shipping_zones z
WHERE z.deleted_at IS NULL
  AND z.countries @> array['EG'];

-- Functional check (anon can execute this RPC): Egypt must return methods.
SELECT * FROM public.get_shipping_options('EG', 1000, 500);
SELECT * FROM public.get_shipping_options('DE', 1000, 500);  -- unlisted country -> International rates
