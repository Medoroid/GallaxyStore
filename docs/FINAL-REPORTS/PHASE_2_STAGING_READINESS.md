# Phase 2 — Staging Readiness

## Determination
**No independent Staging environment exists. Local validation must NOT be presented as Staging validation.**

Evidence:
- `supabase/.temp/linked-project.json`, `project-ref` point at the **production** project; `list_branches = []` (no Supabase branch).
- No `vercel.json`, no staging deploy script, no staging URL in any repo file.
- `supabase/manual-apply/production-deployment/deploy.ps1` is production-only, dry-run by default, requires `-ConfirmProduction` and a verified Staging deployment first (which does not exist).
- No staging env vars in `.env` / `.env.local` / `.env.example`; `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` absent, so `test/integration-env.ts` refuses integration tests outside Local.
- `production-backup/schema.sql` is 0 bytes (no usable schema artifact).
- `supabase/manual-review/07_vendor_isolation_staging.sql` is a verification script, not an environment; its final SELECT previously failed.

## What is Staging-ready (code/artifacts)
- All Local migrations including `20261122100000_creator_template_published_geometry.sql`.
- Phase-0 reconciliation migration unchanged.
- Local E2E config supports pointing at any URL via env override.
- Deployment instructions: `docs/FINAL-REPORTS/PRODUCTION_BACKEND_DEPLOYMENT_RUNBOOK.md`.
- Rollback: `docs/FINAL-REPORTS/PRODUCTION_BACKEND_ROLLBACK_PLAN.md`.

## Required before Phase 2 can be called complete
1. Create an independent Supabase project with a distinct project ref (owner approval); re-link CLI to it.
2. Apply baseline + all migrations in order; run `01_PRECHECK/02_POSTCHECK` and the staging verification SQL.
3. Create a separate app deployment (new URL) and supply its env values (names in `STAGING_EXTERNAL_REQUIREMENTS.md`).
4. Register Staging OAuth callback in Google and redirect URLs in Supabase.
5. Run integration + E2E + security tests against Staging; confirm no data loss.
6. Only then consider Production (with backup + explicit approval).

**Phase 2 is NOT complete.**
