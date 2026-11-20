# Phase 2 — Full E2E Results

**Date:** 2026-11-20 · **Staging E2E: NOT EXECUTED** (no Staging environment).

## Executed on LOCAL (clearly not Staging)
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ |
| `npm test` | ✅ 97 suites / 1484 tests |
| `npm run test:integration` | ✅ 7 suites / 126 tests |
| Local Playwright (`playwright.local.config.ts`) | ✅ 11/11 |

Local E2E covered: homepage/products, product detail + add-to-cart, gift-box link IDs, login/register render, read APIs, admin guest gating, real signup→signin→cart→checkout, published template catalog from DB, `?next=` preservation, open-redirect rejection, variant capture with no client price.

## Prepared but NOT EXECUTED (Staging)
`e2e-staging/workflows.spec.ts` with `playwright.staging.config.ts` covers:
- Auth: registration, login, redirect preservation, logout, unauthorized access.
- Products/cart: listing, detail, variant, add, quantity, remove, coupon apply/remove.
- Checkout: server-price integrity, preview API.
- Gift Box: admin create/publish, customer view/checkout, snapshot.
- Creator: published template API, admin review.
- Vendor: dashboard, printing, payout, ownership.
- Authorization matrix: admin-only, vendor-only, dual-role, customer, unauthorized.
- Multi-store scenarios.

Many tests `test.skip()` when staging accounts are absent — they are **not** reported as passed.

## Blocked / external
- Google OAuth live flow (no credentials).
- Payment provider sandbox + webhook tests (no credentials/public staging URL).
- Actual Staging browser execution (no environment).

**Never present the 11 Local results as Staging results.**
