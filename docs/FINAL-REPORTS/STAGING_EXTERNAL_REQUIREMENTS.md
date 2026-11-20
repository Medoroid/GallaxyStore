# Staging — External Requirements

No values are included here — only variable names and actions.

## 1. Supabase (Staging project)
- New project ref distinct from production; Supabase CLI re-linked to it.
- `SUPABASE_ACCESS_TOKEN` (CLI auth) — required by deploy scripts; not present locally.
- Apply migrations in repo order (baseline → package → Phase-0 reconciliation → `20261122100000`).
- Create/storage-configure buckets: `product-images`, `design-uploads`, `design-previews`, `site-banners`, `theme-assets`, `mockup-assets`, `payment-receipts`, etc., with the policies defined in migrations.
- Run `01_PRECHECK.sql`, `02_POSTCHECK.sql`, `06_local_staging_p0_verification.sql`, `07_vendor_isolation_staging.sql` (fix its final SELECT first).

## 2. Application env (names only)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS`, `BACKEND_URL`, `NEXT_PUBLIC_VODAFONE_CASH_NUMBER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `TEST_SITE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional; rate limiter falls back to per-instance).

## 3. Google OAuth (external actions)
Google Cloud Console → OAuth client → **Authorized redirect URIs**:
- Local: `http://127.0.0.1:54121/auth/v1/callback`
- Hosted (current .env.local): `https://httywgkwfqvrbuwuzutu.supabase.co/auth/v1/callback`
- Staging: `<STAGING_SUPABASE_URL>/auth/v1/callback` (cannot be stated until provisioned)

Supabase Auth → URL Configuration → Redirect URLs must include the app callback origins, e.g. `http://localhost:3000/**`, `http://127.0.0.1:3000/**`, `http://127.0.0.1:3100/**`, `https://gallaxy-store.vercel.app/**`, plus the Staging app origin once known. Also add test users / publish the OAuth consent screen. Code-side contract tests (12) pass; live OAuth is blocked.

## 4. Payments / webhooks
- Card payments (Stripe/Paymob) are intentionally disabled in code; no live credentials needed for Staging unless that feature is enabled.
- Vodafone cash / external wallet are admin-configured settings; no external credentials required to run tests.
- Webhook endpoints are exercised with integrations disabled; real webhook testing requires provider test credentials + a public Staging URL.

## 5. Blockers
- No Staging project/deployment/secrets → cannot create or validate Staging.
- No paid external resource may be created without explicit authorization.
- Google credentials/callback registration must be supplied by the owner.
