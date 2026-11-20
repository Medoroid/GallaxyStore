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
`npx playwright test --config playwright.staging.config.ts` → **11 passed / 11**:
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
