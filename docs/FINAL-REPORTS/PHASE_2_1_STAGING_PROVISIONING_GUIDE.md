# Phase 2.1 — Staging Provisioning Guide

Preparation only. No external resource created. Cost figures are estimates — confirm with provider.

## A. Supabase Staging project
- **Where:** Supabase dashboard → New project (choose region near app).
- **Why:** independent database/auth/storage; prevents production writes.
- **Paid:** free tier may suffice for short-lived staging; otherwise ~$25/mo. **Manual authorization required.**
- **Verify:** project ref ≠ `httywgkwfqvrbuwuzutu`; `supabase link --project-ref <STAGING_REF>`; `scripts/staging/1-validate-env.ps1`.

## B. App deployment
- **Where:** separate Vercel/Netlify project (not production).
- **Why:** isolates env/secrets and URLs.
- **Paid:** Vercel Hobby free for non-commercial; Pro ~$20/mo. **Manual authorization required.**
- **Verify:** unique `STAGING_APP_URL`; no production ref in env.

## C. Env variables
- **Where:** hosting env UI; names in `.env.staging.example`.
- **Paid:** no. **Manual action:** supply values.
- **Verify:** `1-validate-env.ps1`.

## D. Auth config
- **Where:** Supabase Auth → Providers/URL Configuration.
- **Why:** email/OAuth redirects must point at staging.
- **Paid:** no. **Verify:** login/register E2E.

## E. Storage buckets/policies
- **Where:** migrations create them; run `2-db-deploy.ps1`.
- **Why:** product images/designs/mockups need buckets.
- **Paid:** storage usage. **Verify:** `select id, public from storage.buckets;`

## F. Staging test users
- **Where:** Supabase Auth dashboard / signup flow with synthetic emails.
- **Why:** authorization matrix needs role variants.
- **Paid:** no. **Verify:** `PHASE_2_1_TEST_ACCOUNTS.md`.

## G. Google OAuth
- **Where:** Google Cloud Console → Credentials → Authorized redirect URIs: `<STAGING_SUPABASE_URL>/auth/v1/callback`; Supabase redirect URLs: `<STAGING_APP_URL>/auth/callback`.
- **Paid:** no. **Manual authorization + credentials required.**
- **Verify:** `/api/auth/google-status` returns `configured:true`.

## H. Payment sandbox
- **Where:** Stripe/Paymob test mode (card flows currently disabled in code).
- **Paid:** test mode free. **Manual credentials if enabling.**
- **Verify:** webhook signature tests with test secrets.

## I. Webhooks
- **Where:** provider dashboard → staging endpoint URLs.
- **Paid:** no. **Requires public staging URL + secrets.**
- **Verify:** signed request accepted; duplicate ignored.

## Exact commands (once resources exist)
```powershell
$env:STAGING_PROJECT_REF='<STAGING_REF>'
$env:STAGING_APP_URL='https://<staging-host>'
$env:NEXT_PUBLIC_SUPABASE_URL='https://<STAGING_REF>.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='<STAGING_ANON_KEY>'
$env:SUPABASE_SERVICE_ROLE_KEY='<STAGING_SERVICE_ROLE_KEY>'
$env:SUPABASE_TEST_URL=$env:NEXT_PUBLIC_SUPABASE_URL
$env:SUPABASE_TEST_ANON_KEY=$env:NEXT_PUBLIC_SUPABASE_ANON_KEY
$env:TEST_SITE_URL=$env:STAGING_APP_URL

supabase link --project-ref $env:STAGING_PROJECT_REF
powershell -File scripts/staging/1-validate-env.ps1
powershell -File scripts/staging/2-db-deploy.ps1 -Execute
powershell -File scripts/staging/3-seed.ps1 -Execute
powershell -File scripts/staging/4-build.ps1 -Execute
# 5-deploy-app.ps1 prints manual hosting steps
powershell -File scripts/staging/6-smoke.ps1
powershell -File scripts/staging/7-e2e.ps1
```
**Stop before any step if a guard aborts.**
