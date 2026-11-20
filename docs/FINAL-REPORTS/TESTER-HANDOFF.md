# Tester Handoff — GALAXY STORE (STAGING)

## Store URL
**https://gallaxy-store-staging.vercel.app**

Open from any device. No Vercel login required. Synthetic test data only.

## Test accounts (synthetic, staging only)
| Role | Email | Password |
|---|---|---|
| Admin | admin@staging.test | StagingTest123! |
| Vendor | vendor@staging.test | StagingTest123! |
| Admin + Vendor | dual@staging.test | StagingTest123! |
| Customer | customer@staging.test | StagingTest123! |

Do **not** use real customer data, real cards, or production credentials.

## What to test
1. **Home** → hero, featured products, navigation (desktop + mobile).
2. **Products** → filters, search, product details, variant selection.
3. **Cart** → add/remove items, quantity, coupon field.
4. **Checkout** → address/shipping form, order preview up to the safe payment stage. Do not submit real payments.
5. **Gift Boxes** → open "Staging Gift Box" (EGP 900, 2 components), verify details, add to cart.
6. **Creator Studio / Templates** → `/api/templates` catalog, template geometry.
7. **Admin** (`/admin`) with admin account — products, orders, gift boxes, creator review.
8. **Vendor** (`/vendor`) with vendor/dual accounts — dashboard, printing, payout, store scoping.
9. **Auth** → register/login/logout, protected routes, `?next=` redirect.

## Known limitations
- Google sign-in: temporarily unavailable — a separate Staging OAuth client must be configured (see `GOOGLE-OAUTH-ENABLEMENT.md`). Use email/password meanwhile.
- Payments/webhooks: sandbox not configured; card payments intentionally disabled. Do not expect real payment completion.
- New signups: Supabase free-tier SMTP rate limit may show "email rate limit exceeded". Use the accounts above or ask the owner to create users via Admin API.
- Domain: not yet connected; use the .vercel.app URL.

## Report an issue
Include: page URL, device/browser, steps to reproduce, expected vs actual, screenshot. Send to the owner. Never include real personal or payment data.

## Reset synthetic data
Contact the owner — never reset against Production. Staging seed files: `supabase/seed.staging.sql`, `supabase/seed.staging-users.sql`.
