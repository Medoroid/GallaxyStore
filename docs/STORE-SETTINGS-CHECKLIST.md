# Store Settings Checklist — Manual Owner Actions

> Prepared: 2026-11-01 (B4 — Store Settings & Egyptian Market Configuration)
> Every item below is data or configuration **only the store owner can provide**.
> Nothing here has been invented or auto-filled. The storefront **hides** any
> element whose setting is missing — completing these items turns the features on.

---

## 1. Store profile (Admin → Settings)

Open **Admin → Settings** (`/admin/settings`) and fill in:

| Setting | Current live value | Where it appears | Priority |
| --- | --- | --- | --- |
| `store_name` | *(empty — UI shows "Galaxy Store" as fallback)* | Site title, metadata, JSON-LD, footer brand & copyright | High |
| `support_email` | *(empty)* | Contact page channel **and** contact-form delivery target. **The contact form is hidden until this is set.** | High |
| `support_phone` | *(empty)* | Contact page — hidden until set. Do NOT invent a number. | Medium |
| `address` | *(empty)* | Contact page — hidden until set | Medium |
| `announcement` | *(empty)* | Top announcement bar on every page — hidden until set | Low |
| `currency` | *(empty — shipping page currently labels fees as USD)* | Shipping policy page fee formatting | **High** (see §3) |
| `free_shipping_threshold` | *(0)* | Display/fallback only — checkout always recalculates from `shipping_rates` | Low |
| `default_shipping_fee` | *(0)* | Display/fallback only — checkout always recalculates from `shipping_rates` | Low |
| `instagram_url` / `facebook_url` / `twitter_url` | *(all empty)* | Footer social icons — **hidden until set** (no dead `#` links anymore) | Low |
| Wallet transfer account (Vodafone Cash…) | *(empty)* | Checkout (authenticated customers only) | Medium |

## 2. Shipping zones — Egypt (requires approval + editing)

Live state today: **Egypt is priced as "International"**, and **"Domestic US" is
the default zone** (so any unlisted country silently gets US pricing).

Prepared script: `supabase/manual-review/04_shipping_zones_egypt.sql`

1. Decide the Egypt fees (standard / express / per-kg / free-shipping
   threshold) **in the store's billing currency** (see §3).
2. Edit the four `★` values in the script's DECLARE block.
3. Run STEP 1 (preview) and read the current rows.
4. Apply STEP 2 **only with explicit approval** — the script refuses to run
   while fees are NULL, so it can never create a zone with free-by-accident
   shipping.
5. Run STEP 3 (verify): `get_shipping_options('EG', …)` must return methods.

After applying: the shipping policy page (`/shipping`) automatically renders
the new Egypt zone, fees and delivery windows — no code change needed.

## 3. Currency decision (blocks correct shipping display)

Live products: **18 × USD and 3 × EGP** (see `docs/PRODUCT-DATA-INTEGRITY-REPORT.md`
and `supabase/manual-review/03_currency_cleanup.sql`). The store targets Egypt.

- [ ] Pick ONE billing currency (EGP recommended for the Egyptian market).
- [ ] Set it in Admin → Settings → Store currency.
- [ ] Review `supabase/manual-review/03_currency_cleanup.sql` (prepared, not applied)
      — it converts product prices **only** with an explicit conversion rate you provide.
- [ ] Enter the Egypt zone fees (§2) **in the same currency**.

> The checkout validates the shipping fee against `shipping_rates` but never
> converts currencies. Mixed-currency carts are blocked at checkout already.

## 4. Email delivery (contact form + transactional emails)

| Env var | Needed for | Status |
| --- | --- | --- |
| `RESEND_API_KEY` | Contact form delivery, order/status/custom-print emails | **Required for the contact form** — without it `/api/contact` returns an honest 503 |
| `EMAIL_FROM` | Sender identity (default `Galaxy Store <onboarding@resend.dev>`) | Verify a real domain in Resend before launch |
| `RESEND_TO` / admin inbox | — | The contact form sends **to `support_email`** from §1, not an env var |

## 5. Rate limiting gate (B5 — launch prerequisite)

| Env var | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Distributed rate limiting (Upstash free tier is fine) |
| `REQUIRE_DISTRIBUTED_RATE_LIMIT` | When `true` (production launch), sensitive routes **fail closed** if Redis is missing — see §9 remaining risks |

## 6. Weight-based shipping fees (B6 — apply BEFORE enabling the flag)

Shipping quotes currently charge the zone **base fee only** (`weight = 0`),
because the live `checkout()` RPC rejects any fee that is not exactly a
`shipping_rates.base_fee`. The per-kg component exists in every rate row but
cannot be charged until the RPC validation is migrated.

- [ ] **Step 1 — apply** `supabase/manual-review/05_checkout_weight_shipping_fee.sql`
      (replaces `checkout()` so it validates the fee against
      `get_shipping_options(country, subtotal, weight)` — the same rule the
      API routes quote with). Back up the current function first (STEP 0 in
      the file) and follow STEP 1–3 in the file.
- [ ] **Step 2 — verify with the flag OFF** (STEP 3 a–b): place a test order
      and confirm `orders.shipping_fee` equals the quoted option fee.
- [ ] **Step 3 — enable** `SHIPPING_CALCULATE_WEIGHT=true` in the deployment
      env (`.env.example` has the full warning), then place a test order
      containing a product with `weight_grams` set and confirm the per-kg
      component is charged and checkout succeeds.
- [ ] **Step 4 — fill weights** (Admin → products/variants, `weight_grams`,
      integer grams). Nearly all weights are NULL today, so the per-kg
      component stays 0 until they are filled. The one existing value
      (product "medoroid" = 12 grams) looks like a data-entry mistake —
      review it (12 g for a physical product is implausible; 1200 was
      probably intended).
- ⚠️ **Do NOT enable the flag before Step 1** — carts with a known weight
  would fail checkout with `Invalid shipping fee`.

## 7. Product & gallery data (requires approval)

All scripts are in `supabase/manual-review/` — **none applied to production**:

- [ ] `01_product_images_cleanup.sql` — 8 rows pointing at missing storage objects; `test product` (published, 0 images) and `mega` (draft).
- [ ] `02_test_products_cleanup.sql` — guarded removal of test products after review.
- [ ] `03_currency_cleanup.sql` — currency unification (see §3).
- [ ] Gallery: all **5 rows in `gallery_images` point to `/images/gallery/*.jpg`
      files that do not exist** → re-upload real print photos to Storage and
      update `image_url`, or delete the rows. Until then the gallery shows the
      standard placeholder (and no fake stock photos are mixed in anymore).

## 8. Reviews

- The `reviews` table is **empty (0 rows)**. The homepage "Customer Reviews"
  section renders only when approved reviews exist (RLS `status = 'approved'`).
- To turn it on: customers leave reviews on product pages; approve them in
  Admin. No fabricated ratings are used anywhere.

## 9. Environment variables — full launch list

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Already configured |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Canonical URL / OG / sitemap (fallback `https://galaxystore.com` — set the real domain) |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✅ | §4 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ✅ | §5 |
| `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` | ✅ at launch | Fail-closed gate for sensitive routes |
| `TRUST_PROXY` | ⚠️ | Set `true` only behind Vercel/Cloudflare; affects rate-limit IPs |
| `SHIPPING_CALCULATE_WEIGHT` | ⚠️ | B6 rollout — only AFTER migration `05` (see §6) |
| `LOG_LEVEL` | optional | Logger defaults to `warn` in production |
| `ADMIN_EMAILS` / bootstrap admin | ✅ | First admin login (see `.env.example`) |

## 10. What is intentionally NOT filled in

- No phone number, address, review count, rating average, customer count,
  product count or social URL has been invented anywhere in the UI.
- Numbers shown on `/about` are counted live from the catalog and shipping zones.
- Shipping fees shown on `/shipping` come from `shipping_zones`/`shipping_rates`/`shipping_methods` directly.
