# Phase 1.1 — Remaining Gaps Report

**Date:** 2026-11-21 · **Status:** implemented and verified on Local.

## Implemented
- **CD-3** single source of truth (see `PHASE_1_1_CREATOR_TEMPLATE_ARCHITECTURE.md`).
- **Variant capture**: product reads embed active variants + option labels; `resolveVariantIdForSelection` resolves the selected colour/size client-side; `/api/cart` validates any client `variant_id` against `product_variants` (active, not deleted, same product); client no longer sends price.
- **Auth redirects**: `lib/redirect.ts` (`isSafeNext`, `safeNext`, `loginUrl`, `callbackUrl`); proxy appends `?next=`; login/register/forgot-password/callback propagate it; open-redirect inputs rejected.
- **Authorization**: verified fail-closed `verifyAdmin`; vendor APIs derive store from `auth.uid()`; no vendor API grants admin bypass. Dual-role model documented in security review.
- **Multi-store**: `lib/vendor-store.ts` resolves 0/1/N stores deterministically; `stats` and `payout` GET use it instead of `.single()` and expose `stores`/`multiple_stores`.
- **UX/profile**: Navbar sign-out (desktop + drawer) with session cleanup via `useAuth().signOut()`; search input accessible name; signup username/birth-date persisted in auth metadata and shown read-only in profile (schema has no profile columns — justified, no business-rule change).

## Database change
- New `supabase/migrations/20261122100000_creator_template_published_geometry.sql` (additive; published_* snapshot, is_published, geometry_version, backfill of 8 templates). Phase-0 reconciliation migration untouched.

## Remaining blockers
- Google OAuth live sign-in (external credentials/callback registration).
- Staging environment (none exists).
- Print-job endpoint is ownership-checked but not covered by a role-matrix E2E (unit + contract covered).
- Template registry still supplies SVG `body`/`overlay` code (needed; JSON cannot hold functions) — geometry is DB-authoritative.
