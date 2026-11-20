# Phase 2.1 — Environment Isolation

**Date:** 2026-11-20 · **Status:** PREPARATION COMPLETE. Production untouched.

## Current linking (read-only inspection)
- `supabase/.temp/project-ref` = `httywgkwfqvrbuwuzutu`
- `supabase/.temp/linked-project.json` = production (`galaxy-store`, org `nufiqypilaairmozaxty`)
- CLI v2.117.0 → local stack on 54322/54121.

## Remote-write commands identified (must never target production)
`supabase db push`, `supabase db reset --linked`, `supabase db query --project-ref <ref>`, `supabase migration repair`, `supabase db dump --linked`, `supabase link --project-ref <ref>`, `supabase functions deploy`, `supabase secrets set`, `pg_dump`/`psql` against remote DB URLs, `vercel --prod`.

## Implemented protection
`scripts/staging/lib/assert-safe-environment.ps1` provides:
- `Assert-NotProductionRef` — rejects `httywgkwfqvrbuwuzutu` (self-test: PASS).
- `Assert-ExpectedStagingRef` — requires `STAGING_PROJECT_REF`, rejects production, verifies CLI link matches (self-test: PASS).
- `Assert-RequiredEnv` — checks names only, never prints values.
- `Assert-LocalMode` — rejects production URLs.

Every staging/backup script dot-sources this guard and aborts before any operation. `1-validate-env.ps1` aborts with no secrets set (verified).

## Safe switching procedure (manual, when Staging exists)
1. Record current production link (above) for restoration.
2. Set `STAGING_PROJECT_REF` in environment (value supplied by owner).
3. `supabase link --project-ref $env:STAGING_PROJECT_REF`
4. Run `scripts/staging/1-validate-env.ps1` — must print `VALIDATION OK`.
5. Run staging scripts **only after** step 4 passes.
6. To restore production link later: `supabase link --project-ref httywgkwfqvrbuwuzutu` (read-only link change, no DB write).

## Secret inheritance
- `.env.staging.example` contains placeholders only; secret scan for production ref / JWT prefixes returned nothing.
- Scripts never echo env values. Service-role key is documented server-only.
- Staging must use a distinct Supabase project — credentials cannot be shared with production.

**No Production write, history change, or data access occurred.**
