# Phase 2 — Staging Infrastructure

**Date:** 2026-11-20 · **Status:** BLOCKED — no independent Staging environment exists.

## Discovered facts
| Item | Finding |
|---|---|
| Supabase Staging project | ❌ none. CLI linked to production ref `httywgkwfqvrbuwuzutu` (`supabase/.temp/linked-project.json`). `list_branches = []`. |
| App Staging deployment | ❌ none. No `vercel.json`, no staging deploy script, no staging URL in repo. |
| Staging env/secrets | ❌ none. `.env.local` contains production-target values; `.env.example` has placeholders only. |
| Payment test credentials | ❌ none. Card providers intentionally disabled in code. |
| OAuth callback config | ⚠️ config.toml allows localhost:3000, 127.0.0.1:3000, Vercel prod; no Staging origin. Google callback not registered. |
| Production backup | ❌ `production-backup/schema.sql` = 0 bytes. |
| Webhook endpoints | ⚠️ routes exist; no public Staging URL or provider test secrets. |

## Prepared artifacts (no external changes made)
- `.env.staging.example` — complete variable list, no real values.
- `playwright.staging.config.ts` — refuses production URL; requires `STAGING_APP_URL`/`SUPABASE_TEST_URL`.
- `e2e-staging/workflows.spec.ts` — browser coverage for Auth, Products/Cart/Checkout, Gift Box, Creator, Vendor, Authorization matrix, Multi-store. **Prepared, NOT executed.**
- `docs/FINAL-REPORTS/STAGING_EXTERNAL_REQUIREMENTS.md` — exact external actions.

## Required manual actions
1. Authorize creation of a distinct Supabase Staging project (paid resource).
2. Create a separate app deployment and provide its URL.
3. Supply staging secrets via environment (names in `.env.staging.example`).
4. Register OAuth callback + redirect URLs; supply Google test client.
5. Provide payment sandbox credentials if card flows must be tested.

**No paid resource was created. No Production change was made.**
