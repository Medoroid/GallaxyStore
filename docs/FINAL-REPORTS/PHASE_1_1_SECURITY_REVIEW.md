# Phase 1.1 — Security Review

## Permission model (from evidence)
- `app_role` enum is `customer | vendor | admin` — one profile role per user. `admin_users` is an independent explicit admin grant; `ADMIN_EMAILS` is only a bootstrap fallback in `verifyAdmin` (fail-closed). `owns_store()` grants DB-level admin bypass for store RLS.
- Dual-role in practice: possible via `profiles.role='vendor' + admin_users row`. `verifyAdmin` grants admin; `is_admin()` does NOT (so no DB bypass). Vendor APIs still scope by `owner_id`. No privilege escalation path found in API code.
- Every `/api/admin/**` route calls `verifyAdmin`; no `/api/vendor/**` route calls it — separation intact.
- Frontend visibility (`proxy.ts`, layouts) is defense-in-depth only; API + RLS remain authoritative.

## Changes
- `proxy.ts` now propagates `?next=` safely; store shell-gate unchanged (`.single()`) but API routes use the multi-store-safe resolver.
- `lib/vendor-store.ts` eliminates `.single()`/`.maybeSingle()` misuse on non-unique `stores.owner_id`; zero/one/many handled explicitly and deterministically; explicit `store_id` re-checked against owner.
- `stats` and `payout` GET no longer silently return zero financial data for multi-store vendors; expose `stores` and `multiple_stores`.
- `/api/cart` validates client variant ids against DB (ownership, active, not deleted) — prevents cross-product variant injection; client price removed from payload.
- Auth redirect helper rejects `//`, `://`, `\` and non-`/` targets (open-redirect safe).
- Logout calls `signOut()` then local state/cart cleanup via auth context; Navbar exposes it.

## Verified
- Unit: proxy authorization, admin contracts, payout contracts, cart contracts — 1484 pass.
- Integration: 126 pass (includes security-negative suite).
- E2E: open-redirect `next` rejected; protected-route `next` preserved; guest admin gating has no render loop.

## Residual / recommendation
- `proxy.ts` still consults `ADMIN_EMAILS` for page-shell access; API calls remain 403 for non-admins. Aligning the middleware fully with `verifyAdmin` is a future hardening task (would change existing tested behaviour).
- Admin role downgrade only best-effort deletes `admin_users` rows — recommend hard-fail in a follow-up.
