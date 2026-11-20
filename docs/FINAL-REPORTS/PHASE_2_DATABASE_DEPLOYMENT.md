# Phase 2 — Database Deployment (Staging)

**Status:** NOT EXECUTED on Staging (no project). Verified on **Local only**.

## Migration integrity (pre-staging verification)
- 60 migration files present; 53 are timestamped and applied on Local in order; 7 legacy `create_*.sql` files are non-conformant names and are skipped by the CLI (WIP — left untouched).
- No duplicate timestamped prefixes.
- `20261122100000_creator_template_published_geometry.sql` is dated **2026-11-22**, while system date is **2026-11-20**. Explanation: the version is a **sort key**, chosen to order after Phase-0's `20261121090000`; it is not a claim of wall-clock execution date. It has been applied on Local via `supabase db reset` (no modification needed). If policy requires versions ≤ today, a documented recovery would be: create a new migration with a current timestamp that re-asserts the same additive columns, keep the future-dated file as historical, and never rewrite applied history. **Not changed.**
- Phase-0 reconciliation (`20261121090000...`) and Phase-1.1 migration preserved unchanged.

## Local evidence (NOT Staging)
- Clean rebuild applied all 53 migrations including both new ones.
- `creator_product_templates`: 8 rows, all `is_published=true`, `geometry_version=1`.
- `/api/templates` returns 8 published templates with geometry (browser E2E verified).
- Phase-0 `02_POSTCHECK.sql`: 12 result sets pass (prior phases).
- RLS/ACL/vendor views unchanged from Phase 0/1.1 verified state.

## Staging deployment plan (manual, not executed)
1. Create distinct Supabase project; verify ref ≠ production.
2. `supabase link --project-ref <STAGING_REF>`.
3. Inspect `schema_migrations` on Staging; apply missing migrations **in version order** only (never blindly replay all against a non-empty DB).
4. Verify RPCs, triggers, indexes, constraints, RLS, buckets/policies.
5. Seed **Staging-only test data** — never copy production customer data.
6. Run Phase-0 postchecks + template geometry checks + Gift Box/Creator workflow checks.
7. Regenerate `lib/database.types.ts` from Staging if schema diverges.

**Blocked:** steps 1–7 require a Staging project and credentials.
