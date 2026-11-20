# External Actions Required (Phase 2.1 → Phase 2)

No values are included. All items are BLOCKED pending owner action.

## 1. Paid / authorization-required
| Item | Where | Why | Est. cost | Verify |
|---|---|---|---|---|
| Supabase Staging project | Supabase dashboard | independent DB/auth/storage | free tier or ~$25/mo | ref ≠ production |
| App hosting deployment | Vercel/Netlify | separate URL + secrets | free or ~$20/mo | unique STAGING_APP_URL |
| Google OAuth test client | Google Cloud Console | live OAuth E2E | free | google-status configured:true |

## 2. Credentials/settings to supply (names only)
- `STAGING_PROJECT_REF`, `STAGING_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `TEST_SITE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (+ Supabase equivalents)
- `ADMIN_EMAILS`, `ADMIN_SETUP_KEY`, `NEXT_PUBLIC_VODAFONE_CASH_NUMBER`
- Payment sandbox keys + webhook secrets (if those flows must be tested)
- `RESEND_API_KEY`, `EMAIL_FROM`, `UPSTASH_REDIS_REST_URL/TOKEN` (optional)
- Staging test account emails/passwords (env only, never committed)

## 3. Manual configuration
- Google redirect URI: `<STAGING_SUPABASE_URL>/auth/v1/callback`
- Supabase redirect URLs: `<STAGING_APP_URL>/auth/callback`
- Register 5 test users with roles described in `PHASE_2_1_TEST_ACCOUNTS.md`
- Add `127.0.0.1:3100/**` to Supabase redirect URLs if Local E2E OAuth is needed

## 4. Commands after resources exist
See `PHASE_2_1_STAGING_PROVISIONING_GUIDE.md` (exact command block). Every script refuses production refs.

## 5. Production status
Production remains untouched: no migration, history change, data access, backup command, or deployment. CLI is still linked to production (read-only link); guards prevent any script from writing to it.
