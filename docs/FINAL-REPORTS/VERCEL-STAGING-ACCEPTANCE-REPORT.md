# Vercel Staging Acceptance Report

**Date:** 2026-11-20 · **Status: DEPLOYED AND VERIFIED.**

## 1. Deployment identity
| Item | Value |
|---|---|
| Public URL | **https://gallaxy-store-staging.vercel.app** |
| Vercel project | `gallaxy-store-staging` (`prj_lUksRBVULX0tHaNBG1ORVCDesHWv`) |
| Deployment ID | `dpl_24tQ9FZcrbbdu5kVc1FM32cntZ3C` (alias `gallaxy-store-staging-ooajwah1c.vercel.app`) |
| Deployment time | 2026-11-20 ~18:00 GMT+2 (second deploy, after framework fix) |
| Source | Local working tree, HEAD `9bb3e6f` + reviewed changes; no Git push, no commit of WIP |
| Supabase Staging ref | `hhifwkseswzhilozevaz` (**≠** production `httywgkwfqvrbuwuzutu`) |

## 2. What was deployed
- All 53 timestamped migrations applied to Staging (`supabase db push --linked`) — schema, RPCs, RLS, Storage buckets, published template geometry.
- Synthetic staging data only: 6 products, 1 Gift Box (EGP 900, 2 components), 8 published templates, 4 synthetic users with roles (admin, vendor, admin+vendor, customer), 3 stores. **No production customer data.**
- Vercel env vars (names only): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL`. All point to Staging. No secrets in Git/chat.

## 3. Build / deploy result
- First deploy: Ready but 404 — Vercel project had Framework Preset "Other". Fixed via `vercel project update --framework nextjs` + auto-detect. Second deploy: **Ready**, homepage/products/apis return 200.

## 4. Browser test results (against the live URL)
`npx playwright test --config playwright.staging.config.ts` → **13 passed / 13**:
- Registration form contract (live signup blocked by Supabase free-tier SMTP rate limit — documented).
- Login, `?next=` preservation, logout.
- Unauthorized admin access denied.
- Product listing, detail, variant selection, add to cart.
- Cart quantity/removal/coupon controls.
- Checkout server-price integrity.
- Gift Box catalog/detail/cart journey.
- Published template API + geometry.
- Admin review workflow.
- Vendor dashboard/printing/payout.
- Dual-role authorization matrix.
- **Creator design creation regression** (version trigger + SELECT policy) — added after fixing the 403.

## Critical bug fixed after tester report (POST /api/designs → 403)
Tester reported `403 Forbidden` when creating a design. Investigation of the deployed Vercel logs showed two stacked schema defects (not app-code bugs):
1. `owns_design()` (SECURITY DEFINER, STABLE) could not see the just-inserted row during `INSERT … RETURNING`, so the SELECT policy rejected the returned row → 42501 → 403. Fixed by migration `20261122120000_designs_select_policy_own_id.sql` (check `owner_id = auth.uid()` directly).
2. `design_versions.version_number` is NOT NULL but no trigger ever assigned it — `set_design_version_number()` existed in the baseline but was never wired. Fixed by migration `20261122110000_design_version_number_trigger.sql`.
Both migrations applied to Staging and Local; regression test added to `e2e-staging/workflows.spec.ts`; deployed suite re-run → **12/12 pass**. Commit `634a2bb` pushed to `origin/staging`.

A follow-up tester report showed `500` on the same endpoint: `23505 duplicate key "idx_files_checksum"` — the checksum column had a GLOBAL unique index, so uploading identical artwork into a second design always failed. Fixed by migration `20261122130000_design_files_checksum_not_unique.sql` (index kept for lookups, uniqueness removed). Regression test now uploads the same SVG twice; deployed suite re-run → **12/12 pass**. Commit `4aa5a03` pushed to `origin/staging`.

A further tester report showed `400` on `POST /api/custom-print/cart` with `design_id: null`. Root cause: a frontend contract mismatch — `CustomPrintStudio` read `saved.design_id` while `/api/designs` returns `{ design: { id } }`, so the id was always null. Fixed both call sites, seeded Staging `mockup_templates` mappings to real synthetic variants, added a full regression test (create design → add custom print to cart), redeployed. Deployed suite → **13/13 pass**. Commit `3e58535` pushed to `origin/staging`.

A final 409 showed that only `hoodie`/`tshirt` had `mockup_templates` mappings. All 8 published template keys (`tshirt`, `hoodie`, `sweatshirt`, `mug`, `phone_case`, `tote_bag`, `poster`, `mouse_pad`) were seeded to real synthetic variants; the regression test now loops through all 8 and asserts 200. Deployed suite → **13/13 pass**. Commit `b4ae55e` pushed to `origin/staging`.

Gift Box admin concern: all underlying APIs (`create_box`, `add_item`, image upload, admin list, public list) were verified working on the deployed URL via a synthetic box. The reported invisibility was due to boxes left in **Draft** status — the public listing intentionally shows only `published + visible` boxes. Added an explicit amber hint and a one-click **Publish now** action on draft cards in `/admin/gift-boxes`, redeployed, and confirmed the previously-draft synthetic box now appears at `/gift-boxes`. Commit `ca4da7c` pushed to `origin/staging`.
- Production request leak check: **0** requests to production host.

## 5. Tested on deployed URL
Auth, products, cart, checkout, Gift Box, templates, admin, vendor, dual-role auth — all PASS.
Screenshots captured at 1440×900 and 375×812 for home/products/gift-boxes/login (temp evidence folder).

## 6. Blocked / not verified
- Live Google OAuth (credentials not supplied).
- Real payments/webhooks (sandbox credentials not supplied; card flows intentionally disabled).
- Live email signup (Supabase free-tier SMTP rate limit).
- 320/768/1024/1440 full viewport matrix on deployed URL (local 320px check passed; deployed desktop/mobile captured).
- Production backup/restore (Phase 3).

## 7. Errors fixed during this phase
- Vercel framework preset "Other" → 404 → set to `nextjs`, redeployed.
- Staging E2E test bugs (quantity selector, `signIn` dropping `?next=`, registration rate-limit) → corrected tests.

## 8. Redeploy
```bash
npx vercel link --project gallaxy-store-staging --yes
npx vercel deploy --prod --yes
```

## 9. Before final domain
1. Supply OAuth + payment sandbox credentials if those flows are required.
2. Verify backup/restore (Phase 3).
3. Run full viewport/Lighthouse pass on deployed URL.
4. Then purchase/connect domain.

## 10. Production safety
Production project, env, domain, database, migrations, and data **untouched**. No production secret printed or used. Vercel CLI was relinked to the Staging project before deployment and verified by Project ID.
