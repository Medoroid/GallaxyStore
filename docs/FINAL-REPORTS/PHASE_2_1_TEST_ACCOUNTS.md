# Phase 2.1 — Staging Test Accounts

Do NOT invent passwords. Supply values through environment variables on the staging host; never commit them.

## Required accounts (synthetic staging emails only)
| # | Account | Required role setup | E2E scenarios |
|---|---|---|---|
| 1 | Admin only | `profiles.role='admin'` (or `admin_users` grant) | /admin access; admin APIs; creator review; gift box admin; deny other vendors' data |
| 2 | Vendor only | `profiles.role='vendor'` + owns ≥1 staging store | /vendor access; dashboard; printing; payout; deny /admin; deny other store |
| 3 | Admin + Vendor | admin grant + owns a staging store | both panels; own-store-only data; dual-role does NOT bypass ownership |
| 4 | Customer | `profiles.role='customer'` | registration/login; products/cart/checkout; gift box purchase; deny admin/vendor |
| 5 | Unauthorized | no profile/role | redirect to /login; all protected APIs rejected |

## Env variable names (values supplied by owner)
`STAGING_ADMIN_EMAIL` / `STAGING_ADMIN_PASSWORD`, `STAGING_VENDOR_EMAIL` / `STAGING_VENDOR_PASSWORD`, `STAGING_DUAL_EMAIL` / `STAGING_DUAL_PASSWORD`, `STAGING_CUSTOMER_EMAIL` / `STAGING_CUSTOMER_PASSWORD`.

## Multi-store fixtures
- One vendor account should own **zero** stores at first (verify graceful empty state).
- Then **one** store (verify dashboard/payout).
- Then **two** stores (verify `multiple_stores` flag, deterministic selection, no arbitrary switching).

## Security notes
- Never reuse production user emails or data.
- Role elevation must be done in the staging Supabase dashboard or via authorized service-role SQL on staging only.
- These accounts are NOT created here; blocked on staging provisioning.
