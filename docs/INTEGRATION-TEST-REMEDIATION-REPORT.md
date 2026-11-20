# Integration Test Remediation Report — 2026-11-18

## Baseline → current
- Before schema recovery: **42 passed / 84 failed** (7 suites, 126 tests).
- After authoritative baseline + full local bootstrap: **83 passed / 43 failed** (same 126 tests).
- Root cause of the improvement: the previous local DB lacked foundational tables/views; `npx supabase db reset` now applies 44 migrations + seed successfully.

## Root-cause analysis of the remaining 43 failures

| Category | Count | Evidence | Fix |
|---|---|---|---|
| Missing RPCs (schema parity) | 13 | `PGRST202 Could not find the function public.get_or_create_cart(p_session_token)`; 13 functions exist in production but were excluded from the original baseline: `get_or_create_cart`, `remove_cart_item`, `save_for_later`, `remove_coupon`, `apply_coupon`, `track_product_view`, `get_recently_viewed`, `create_return_request`, `reject_vendor_payout_request`, `vote_review`, `report_review`, `reply_to_review`, `moderate_review` | Restoring verbatim `pg_get_functiondef` from the live catalog into the baseline (in progress) |
| API-route tests hitting the wrong backend | ~14 | `GET /api/search` returned `undefined`; 401 assertions received wrong status. `test/integration-env.ts` points the test process at local Supabase but the Next server on :3000 still uses `.env.local` (production) | `scripts/run-integration-local.ps1` now starts a dedicated Next server on :3102 with `NEXT_PUBLIC_*` and `SUPABASE_SERVICE_ROLE_KEY` from the local stack |
| Cascading fixture corruption | ~8 | `invalid input syntax for type uuid: "null"` in cross-user test because `cartAId` was never created (get_or_create_cart missing) | resolves with RPC restoration; no assertion weakening |
| Gift-box seed defect | 6 | `seed component product failed: No suitable key or wrong key type`. Reproduced with the CORRECT local service key → insert returns 201. The earlier failure used the production service-role key from `.env.local` against the local database (JWT secret mismatch). | `scripts/run-integration-local.ps1` now exports the local `SUPABASE_SERVICE_ROLE_KEY` from `supabase status` to the test process. |
| Webhook/status assertions | ~2 | disabled stubs return 410/200-ignored while tests expected 400/500 | verify actual response contract; update test only if the stub behaviour is intentional |

## Environment repair already applied
- `scripts/run-integration-local.ps1` reads keys from `supabase status -o json` at runtime (nothing stored in source), hard-blocks the production URL via the existing guard in `test/integration-env.ts`, starts a temporary Next server with local env, runs the suite, and stops the server.
- No `skip`, `only`, deleted tests, weakened assertions, or mocks were used.

## Final result

After restoring all 13 missing RPCs from the production catalog, 206 RLS policies + production view ACLs, enabling RLS on all 91 local tables, setting `security_invoker` on the cart views, adding deterministic seed data, and fixing the two auth-order routes and stale API assertions:

| Run | Command | Result |
|---|---|---|
| 1 | `powershell -File scripts/run-integration-local.ps1` | **126 passed / 126 total** (7 suites) |
| 2 | same | **126 passed / 126 total** |
| 3 | same | **126 passed / 126 total** |

No tests deleted, skipped, or weakened; no mocks replaced real Supabase integration. The only assertion changes were to match the documented API contract (`id` vs `product_id`, disabled-webhook responses) and to use deterministic seeded Arabic data instead of a corrupted fixture pattern.
