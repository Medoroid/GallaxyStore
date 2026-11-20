# Backend Test Matrix

## 1. Results summary

| Suite | Command | Result |
|---|---|---|
| Unit tests | `npm test` | ✅ **97 suites / 1484 tests passed** |
| Integration tests | `npm run test:integration` (Local Supabase) | ✅ **7 suites / 126 tests passed** |
| Build | `npm run build` | ✅ passed (Next.js 16.4.6, 122 static pages) |
| Type check | `npx tsc --noEmit` | ✅ passed |
| Clean rebuild | `supabase db reset` | ✅ 52 migrations applied, seeds loaded |
| SQL postcheck | `02_POSTCHECK.sql` | ✅ 12 result sets, all expectations met |

## 2. Integration suites

| File | Coverage |
|---|---|
| `api-routes.integration.test.ts` | Search, gallery, product tracking, recommendations, webhooks, admin/vendor endpoints |
| `gift-box-checkout.integration.test.ts` | Component stock validation, unique pairs, nesting triggers, lifecycle, RLS, cleanup |
| `gate2-rpc-execution.integration.test.ts` | Cart/search RPC execution, input validation, error paths |
| `gate4-cart-e2e.integration.test.ts` | Full cart lifecycle: create → add → update → save → remove → totals |
| `rpc-integration.integration.test.ts` | Views, search infrastructure, anon RLS boundaries |
| `payment-migration-guards.integration.test.ts` | Payment migration guards |
| `vendor-payout-contract.integration.test.ts` | Payout RPC contract (3-arg payload) |

## 3. Postcheck assertions (all passing)

1. 16 required tables exist.
2. 3 required columns exist (`available_sizes`, `editor_state`, `payout_method`).
3. 4 ACL checks false (anon cannot execute sensitive RPCs).
4. `cancel_order` does not increment stock; trigger does.
5. `request_vendor_payout(uuid,numeric,text)` signature + grants.
6. Financial policies use `{authenticated}`.
7. 19 vendor views carry `security_invoker=true`.
8. `creator_publish_product` exists; 8 templates seeded.
9. Checkout: 4 hardening flags all true.
10. Enum values `jpg`, `webp` present.
11. `custom_print_requests_product_type_check` contains `gift_box`.
12. 52 migration versions registered; last `20261121090000`.

## 4. Additional validation performed

- Rebuild was run **twice** (before and after the residual ACL/policy fixes) to confirm idempotency.
- Self-verification `DO` block inside the reconciliation raises on any missing object; it passed.
- Residual gap scan confirmed both `confirm_order_payment` overloads and `request_vendor_payout` are no longer anon-executable; the 2 financial policies were moved to `authenticated`.

## 5. Test environment

- Local Supabase: DB `127.0.0.1:54322`, API `127.0.0.1:54121` (Docker-discovered ports).
- Local Next server built with local Supabase env to avoid any Production traffic.
- Integration tests hard-block the Production URL via `test/integration-env.ts`.
- No Production data was used in tests.

## 6. Not executed (documented limitations)

- Dedicated Staging project tests — no Staging project configured.
- External payment provider (Stripe/Paymob/Google) live webhooks — credentials unavailable; routes tested with integrations disabled.
- Real multi-user vendor isolation with separate vendor/admin JWTs — RLS policies and `security_invoker` verified via catalog + integration tests; recommended as an additional Staging exercise.
