# Phase 2 — External Integrations

**Status:** BLOCKED — no external credentials or Staging environment supplied.

| Integration | State | Evidence / blocker |
|---|---|---|
| Google OAuth live sign-in | BLOCKED | `/api/auth/google-status` on Local returns `configured:false` with callback `http://127.0.0.1:54121/auth/v1/callback`. Callback must be registered in Google Cloud Console; test users/consent app required. 12 contract tests pass locally; no live call made. |
| Google redirect URLs | PARTIAL | config.toml allows localhost:3000, 127.0.0.1:3000, Vercel prod. Missing 127.0.0.1:3100 and any Staging origin. |
| Stripe sandbox | NOT EXECUTED | Card payments intentionally disabled in code; no test keys. |
| Paymob sandbox | NOT EXECUTED | Disabled; no test keys. |
| Webhook signature/retry/duplicate | NOT EXECUTED | Routes exist and respond with "ignored while disabled" in Local tests; real signatures need provider secrets + public Staging URL. |
| Vodafone / external wallet | PARTIAL | Admin-configurable; flows covered by integration tests with in-app settings. No external provider. |
| Email (Resend) | NOT EXECUTED | No Staging API key; contact form writes guarded in read-only E2E. |
| Upstash Redis | BLOCKED | Not configured; rate limiter uses per-instance fallback (warning only). |

## Required external actions
1. Supply Google OAuth client + register callbacks (Local: `http://127.0.0.1:54121/auth/v1/callback`; Hosted: `https://httywgkwfqvrbuwuzutu.supabase.co/auth/v1/callback`; Staging: `<STAGING_SUPABASE_URL>/auth/v1/callback`).
2. Supply payment sandbox credentials + webhook secrets if those flows must be validated.
3. Supply Resend/Upstash Staging keys if needed.

**No provider response was simulated and labelled as a real integration test.**
