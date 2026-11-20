# Phase 2.1 — Deployment Automation

All scripts live in `scripts/staging/` and dot-source the shared production guard.

| Script | Purpose | Safety behaviour | Executed here? |
|---|---|---|---|
| `lib/assert-safe-environment.ps1` | shared guard | rejects production ref; requires staging ref; hides values | self-tested only |
| `1-validate-env.ps1` | validate env + link | read-only; aborts on missing vars/production | ✅ aborted as designed (no staging env) |
| `2-db-deploy.ps1` | apply migrations | dry-run default; `-Execute` re-verifies ref, inspects remote history, `db push --linked` | ❌ not executed |
| `3-seed.ps1` | staging-only seed | dry-run default; seed file has no customer data | ❌ not executed |
| `4-build.ps1` | build app | refuses production URL; dry-run default | ❌ not executed |
| `5-deploy-app.ps1` | hosting deploy | prints manual steps; never deploys automatically | ❌ not executed |
| `6-smoke.ps1` | HTTP smoke checks | guards URL; reports status codes | ❌ not executed |
| `7-e2e.ps1` | Playwright staging | refuses production URLs; uses `playwright.staging.config.ts` | ❌ not executed |
| `../backup/backup-local-or-staging.ps1` | Phase-3 backup | local/staging only; refuses production; rejects <1KB backups | ❌ not executed |

## Guard self-test results
- Production ref `httywgkwfqvrbuwuzutu` → rejected (PASS).
- Missing `STAGING_PROJECT_REF` → rejected (PASS).
- `1-validate-env.ps1` with no staging env → aborted before any check output (PASS).

## Rollback
- Scripts make no external changes in dry-run mode. For `-Execute` operations, restore by re-linking CLI (read-only) and following `PRODUCTION_BACKEND_ROLLBACK_PLAN.md` patterns adapted to staging; never roll back production.
