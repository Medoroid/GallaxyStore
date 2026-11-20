# Open Issues

**Date:** 2026-11-20 · Honest status. BLOCKED ≠ COMPLETE. INCOMPLETE ≠ COMPLETE.

## BLOCKED — requires owner action / external resources
| # | Issue | Exact missing input | Impact |
|---|---|---|---|
| B1 | No independent Staging Supabase project | authorize + create project; supply `STAGING_PROJECT_REF` | Staging deployment/testing impossible |
| B2 | No Staging app deployment | hosting project + URL | Staging browser E2E impossible |
| B3 | Staging secrets/env | values for `.env.staging.example` names | cannot configure Staging |
| B4 | Google OAuth live sign-in | OAuth client + callback registration + test users | live OAuth untested |
| B5 | Payment sandbox + webhook secrets | Stripe/Paymob test credentials | real payment/webhook untested (card flows disabled in code) |
| B6 | Production backup | explicit approval for backup operation | `production-backup/schema.sql` still 0 bytes; restore unverified |
| B7 | Production release | explicit authorization | no production deploy performed |

## INCOMPLETE — implementation/verification remains
| # | Issue | Status |
|---|---|---|
| I1 | Admin-UI Gift Box creation E2E | Backend + public journey verified; admin-UI creation not automated in browser |
| I2 | Creator save-draft → publish UI E2E | Published-geometry API verified; full editor UI journey not automated |
| I3 | Vendor printing/payout browser E2E | Endpoints + contracts tested; browser flows not automated |
| I4 | Dual-role / multi-store browser matrix | Prepared in `e2e-staging/workflows.spec.ts`, not executed (no Staging) |
| I5 | Lint warnings | 49 warnings (0 errors), mostly `react-hooks/set-state-in-effect` — non-blocking, left to avoid WIP churn |

## FIXED this session
- Build wrote Production URL into client bundle when built without local env → `scripts/build-local.ps1`.
- Gift Box catalog empty on Local → synthetic real rows created; journey E2E added and passing.

## VERIFIED (not open)
- All routes visually reviewed at desktop/mobile; no 320px overflow on key pages.
- No TODO/FIXME/coming-soon in `app/`.
- 1484 unit + 126 integration + 13 E2E pass; tsc + build pass.
