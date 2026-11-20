# Phase 2 — Application Deployment (Staging)

**Status:** NOT EXECUTED on Staging. Build verified locally with Local env.

## Verified locally (NOT Staging)
- `npm run build` ✅ (Next.js 16.4.6, Turbopack, 122 static pages).
- `npx tsc --noEmit` ✅.
- Local servers on 3000/3100 using Local Supabase only.
- No production credentials in the running Local servers (verified via `/api/auth/google-status` returning Local callback `http://127.0.0.1:54121/auth/v1/callback`).

## Staging deployment procedure (manual, not executed)
1. Create separate hosting deployment; obtain its URL.
2. Configure env from `.env.staging.example` using **staging-only** values (service-role key server-side only).
3. Confirm `NEXT_PUBLIC_SUPABASE_URL` ≠ production URL before build.
4. Build + deploy; run smoke checks: homepage loads, login/register render, protected routes redirect, `/api/templates` returns published geometry, API routes hit Staging DB.
5. Verify Storage uploads and signed URLs use the Staging project.
6. Verify no `httywgkwfqvrbuwuzutu` string appears in deployed runtime config/logs.

## Blocked
- No Staging app deployment or URL.
- No staging secrets/credentials supplied.
- OAuth + payment credentials unavailable (see `PHASE_2_EXTERNAL_INTEGRATIONS.md`).

**No Production deployment or configuration change was performed.**
