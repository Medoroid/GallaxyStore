# Google OAuth — Staging Enablement (Remaining External Step)

## Current state
- Deployed status endpoint `GET /api/auth/google-status` returns `{"enabled":false}`.
- Cause: Google provider is **disabled on the Staging Supabase project** `hhifwkseswzhilozevaz`. This is an external configuration item — not an application bug.
- Safe local work done: staging app redirect URL added to `supabase/config.toml`; `scripts/staging/enable-google-oauth.ps1` prepared; it refuses to run if CLI is linked to Production, and never prints values.

## Owner action (3 steps)
1. In Google Cloud Console → Credentials → OAuth client (create a new one for staging), add Authorized redirect URI:
   ```
   https://hhifwkseswzhilozevaz.supabase.co/auth/v1/callback
   ```
2. In Supabase Dashboard → Authentication → Providers → Google: enable it and paste that client's ID + secret (or let the script push them).
3. Set the credentials in your shell (not in chat, not in Git) and run:
   ```powershell
   $env:GOOGLE_CLIENT_ID='<staging-client-id>'
   $env:GOOGLE_CLIENT_SECRET='<staging-client-secret>'
   powershell -File scripts/staging/enable-google-oauth.ps1
   ```

⚠️ Do **not** reuse the production OAuth client. Its registered callback points at the production Supabase project and would break live sign-in there.

## Verification after enablement
```bash
curl -s https://gallaxy-store-staging.vercel.app/api/auth/google-status
# expect: {"enabled":true,...} (configured:false until the Google callback is registered)
```
Then browser-test "Sign in with Google" on https://gallaxy-store-staging.vercel.app/login with the synthetic staging account allowed by that OAuth client.

## Until then
Email/password login works. Google sign-in is **BLOCKED BY EXTERNAL CREDENTIALS**, not failed.
