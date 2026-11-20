# PHASE 1 — Full Project Completion Report

**Date:** 2026-11-21  
**Scope:** Frontend completion against the Phase-0 Local backend (DB `127.0.0.1:54322`, API `127.0.0.1:54121`).  
**Production:** no writes, no reads that mutate, no history changes.

---

## 1. Executive summary

Phase 1 is complete on Local. All four audit streams (auth, products/cart/checkout/payments, gift box/creator studio, admin/vendor) were investigated with read-only subagents, concrete defects were fixed in place, and a **new Local-only E2E suite** was created and passes alongside the full existing test matrix.

Local integrated website is running on ports **3000** (app) and **3100** (E2E), both pointed exclusively at the Local Supabase stack.

---

## 2. What was fixed (grouped by area)

### Cart / Checkout / Payments
| Fix | File | Symptom resolved |
|---|---|---|
| Coupon discount returned as whole `carts` row → `NaN` totals | `app/api/cart/route.js` | Numeric `discount_amount` now returned; cart hardens with `Number(...) || 0`. |
| No way to remove an applied coupon | `app/cart/page.tsx` | Added `handleRemovePromo` + **Remove** button wired to existing `remove_coupon` RPC. |
| Guest view token regenerated per view | `app/product-details/[id]/productDetailsClient.jsx` | Token persisted in `localStorage` (`cart_session_token`). |
| Product view tracked before auth resolved → 500 (`auth.uid()` null + no session token) | `app/product-details/[id]/productDetailsClient.jsx`, `app/api/products/[id]/track/route.js` | Effect waits for `authLoading`; **route now forwards the JWT to the RPC client** so `auth.uid()` is set. |
| Gift-box snapshot prices always shown in USD | `app/components/GiftBoxOrderContents.tsx`, `app/orders/[id]/page.tsx` | `currency` prop added and passed from the order. |

### Gift Box
| Fix | File | Symptom resolved |
|---|---|---|
| Cards/component links used `slug`, product page resolves by `id` → 404 | `app/components/GiftBoxesGrid.tsx`, `app/api/gift-boxes/[id]/route.js` | Links now use `box.id` / `productMeta.id`. Unit tests updated to the corrected contract. |
| Listing vs detail disagreed on inactive-variant price | `app/api/gift-boxes/route.js` | Both use `is_active && !deleted_at`. |

### Creator Studio / Admin
| Fix | File | Symptom resolved |
|---|---|---|
| Archive submission always failed (selected non-existent `title` column → false `MIGRATION_REQUIRED`) | `app/api/admin/creators/route.js`, `lib/creator/api.ts` | Removed `title`; `isMissingRelation` narrowed to real relation codes (42P01/PGRST202/42883). |
| Replace Artwork discarded unsaved edits when save failed | `app/studio/[designId]/page.tsx` | Save result is now checked; abort with `studio_unsaved` before replacing. |
| Theme editor redirected even signed-in admins during render (React warning) | `app/admin/theme-studio/[id]/page.tsx` | Redirect moved to `useEffect` after auth resolves; login-required placeholder rendered meanwhile. |
| Custom Print image upload crashed on invalid JSON | `app/admin/custom-print/page.tsx` | Guarded `JSON.parse` with inline error. |
| Vendor payout form: no balance cap, no success feedback, missing `other` | `app/vendor/earnings/page.tsx` | `max` + available hint, success banner, `Other` option; misleading "Total Earnings" relabeled "Gross Sales (incl. unpaid)". |
| Vendor print queue buttons were completely dead | `app/vendor/printing/page.tsx`, **new** `app/api/vendor/printing/route.js` | New ownership-checked `POST` endpoint (store from `auth.uid()`, transitions `queued→printing→completed`); buttons wired with busy/error states. |
| Vendor dashboard swallowed all errors; no empty states | `app/vendor/page.tsx` | Error state + Retry action. |
| Vendor orders React key warning | `app/vendor/orders/page.tsx` | `Fragment key={order.id}` on the outermost returned element. |

### Auth
| Fix | File | Symptom resolved |
|---|---|---|
| Double URL-decode of OAuth error could throw `URIError` and crash `/login` | `app/login/page.jsx` | Removed second decode. |
| `prevSessionRef` not seeded on initial `getSession()` → possible double cart merge | `app/lib/auth-context.tsx` | Seeded in the `getSession()` callback. |

---

## 3. Test coverage added

**New Local-only config:** `playwright.local.config.ts` — starts the app with Local Supabase env on port 3100. The repository's original `playwright.config.ts` was left untouched (it is intentionally production read-only).

**New E2E specs:** `e2e-local/core.spec.ts` (6 tests), `e2e-local/auth-checkout.spec.ts` (1 test).

| E2E test | What it proves against the real backend |
|---|---|
| Homepage renders real catalog data | Real product query, no console/pageerror/HTTP-5xx. |
| Product detail resolves by id + add to cart | `/product-details/<uuid>` works; cart page shows the item. |
| Gift box catalog links use ids | Every box link matches a UUID (regression guard for GB-1). |
| Login/register render | Forms mount without runtime errors. |
| Core read APIs | `/api/gift-boxes`, `/api/search` return 200; `/api/payment-methods` correctly 401 without auth. |
| Admin route guest gating | No client render-time redirect loop. |
| **Sign up → sign in → cart → checkout** | A throwaway user is created in **Local** Supabase, signs in, adds a real product, reaches checkout — zero unexpected errors. |

`jest.config.ts` updated to exclude `e2e-local/` from the unit run (Playwright specs are not Jest tests). Two untracked gift-box unit tests were updated to assert the new id-based href contract.

---

## 4. Final Local test matrix (all green)

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` | ✅ passed |
| `npm test` | ✅ **97 suites / 1484 tests** |
| `npm run test:integration` | ✅ **7 suites / 126 tests** |
| `npx playwright test --config playwright.local.config.ts` | ✅ **7 tests** |
| Phase-0 `02_POSTCHECK.sql` | ✅ 12 result sets (unchanged, still passing) |

The backend migration from Phase 0 was **not re-run or modified**; no database repair was needed.

---

## 5. Remaining issues / not completed (explicit, not claimed as done)

| # | Issue | Status / why |
|---|---|---|
| 1 | **Google OAuth live sign-in** | `/api/auth/google-status` reports `configured:false` — callback `http://127.0.0.1:54121/auth/v1/callback` must be registered in Google Cloud Console. External credentials required. Probe/callback/redirect logic itself is correct and tested by contract tests. |
| 2 | **Template geometry edits don't affect studio mockups** (`lib/design-studio/templates/index.ts` hardcoded registry vs `creator_product_templates` snake_case JSON) | Known medium issue (CD-3). Needs a normalizer/registration layer or disabling those edit fields. Not changed to avoid a risky half-fix. |
| 3 | **`variant_id` captured at add-to-cart time** | Product cards still store only `product_id/color/size`; server `resolveVariantId` maps via attribute values with default fallback. Correct price/stock is server-authoritative, but an exact-match resolver on the client is still preferable. |
| 4 | **`?next=` propagation** on protected-route redirects | User hitting `/checkout` while logged out lands on `/` after sign-in. No redirect loop; cosmetic UX gap. |
| 5 | **Register `username`/`age` not persisted** to `profiles`; no Navbar sign-out; admin-with-no-store bounced by vendor layout; multi-store `.single()` inconsistency | Lower-priority items from the audit, left untouched as WIP-adjacent. |
| 6 | **UI-driven full Gift Box creation → order and Creator publish cycles** | Backend integration tests cover these flows (`gift-box-checkout`, `creator studio` suites within the 126 passing tests). E2E covers public catalog + link correctness + auth/cart/checkout. A full admin-UI cycle was not automated. |
| 7 | **Staging** | Not configured. No Staging tests were run and none are claimed. |

---

## 6. Manual steps required from you

1. Register the Local callback URL in Google Cloud (or provide test OAuth credentials) to exercise live Google sign-in.
2. Decide whether to implement template-registry normalization (issue 2) before the next phase.
3. Prepare Staging; then run the same E2E suite with the Staging URL (config supports a URL override).
4. Keep `.env.local` pointed at Production for your own workflow — the Local servers are launched with explicit Local env overrides, so no file change was needed.

---

## 7. Readiness

✅ **A fully integrated Local build of the website exists and is running**, backed by the Phase-0 verified database, with **all 1484 unit + 126 integration + 7 E2E tests passing**, no unexpected runtime/console/network errors in the covered flows, and no Production write.

⚠️ It is **not** Production-ready yet: Staging is missing, Google OAuth needs external registration, and the residual frontend items in §5 remain.
