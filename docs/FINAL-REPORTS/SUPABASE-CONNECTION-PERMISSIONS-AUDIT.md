# Supabase Database Connection & Privilege Audit

Date: 2026-11-18 · Project: `httywgkwfqvrbuwuzutu` · **Read-only diagnosis. No DDL/DML, no permission changes, no migrations applied, no secrets printed.**

## 1. All database connections used by the project and tooling

| # | Connection | Identity / role | Where configured | Purpose | DDL capability |
|---|---|---|---|---|---|
| 1 | Browser Supabase client | `anon` (or `authenticated` with a user JWT) | `lib/supabaseClient.js` via `NEXT_PUBLIC_SUPABASE_*` | Public reads, user auth, client-side RPC calls | None |
| 2 | Server user-scoped client | `authenticated` (Bearer token from request) | API routes, e.g. `getSupabaseForUser(token)` | Owner-scoped reads/writes through RLS | None |
| 3 | Server service-role client | `service_role` (bypasses RLS) | `lib/supabase/service-role.ts` via `SUPABASE_SERVICE_ROLE_KEY` | Admin API routes, trusted server-side writes | **No** (`has_schema_privilege('service_role','public','CREATE') = false`) |
| 4 | Public server client | `anon` | `lib/supabase/public-server.ts` | Server Components public reads with RLS | None |
| 5 | Local Supabase stack | `postgres` (local) | `supabase/config.toml`, Docker `supabase_db_Gallaxy_Store` | `supabase db reset`, local migrations, integration/E2E tests | Full (local only) |
| 6 | **Supabase MCP (this dev tool)** | **`supabase_read_only_user`** | `opencode.json` → `mcp.servers.supabase.url` | Read-only catalog/schema inspection of production | **None** |
| 7 | Supabase SQL Editor (human) | `postgres` (project owner role) | Supabase Dashboard, human login | Authoritative place to run production migrations | Full |
| 8 | Supabase CLI → production | not usable currently | `supabase/config.toml` linked to the project, but **no** `SUPABASE_ACCESS_TOKEN` env var and no `~/.supabase/auth.json` | Would be `db push`/Management API | Blocked (unauthenticated) |

Notes:
- No `supabase/functions` directory exists.
- No direct PostgreSQL connection string (e.g. `DATABASE_URL`) is present in `.env.local`; the app uses REST/PostgREST only.
- `SUPABASE_SERVICE_ROLE_KEY` exists only in server-side env and is imported only by API routes / server modules. A scan of every `"use client"` file found **0** imports of `supabase/service-role` or the service-role env key — safe.

## 2. Identity of the MCP connection (evidence)

`select current_user, session_user, current_role, current_database(), current_setting('transaction_read_only'), version()` returned:

| current_user | session_user | current_role | database | transaction_read_only | PostgreSQL |
|---|---|---|---|---|---|
| `supabase_read_only_user` | `supabase_read_only_user` | `supabase_read_only_user` | `postgres` | **on** | 17.6 |

Role memberships of that user: `pg_monitor`, `pg_read_all_data`. It is `LOGIN`, not superuser, no `CREATEDB`, no `CREATEROLE`.

## 3. Privileges of the current connection (evidence)

| Check | Result |
|---|---|
| `has_database_privilege(current_user, current_database(), 'CREATE')` | **false** |
| `has_schema_privilege(current_user, 'public', 'CREATE')` | **false** |
| `has_schema_privilege(current_user, 'public', 'USAGE')` | true |
| `SELECT` on `public.products` | true (via `pg_read_all_data`) |
| `INSERT` / `UPDATE` / `DELETE` on `public.products` | **false / false / false** |
| `EXECUTE` on `public.is_admin()` | **false** |
| `SELECT` on `supabase_migrations.schema_migrations` | true |
| `INSERT` on `supabase_migrations.schema_migrations` | **false** |
| `transaction_read_only` | **on** |

Therefore this connection can **inspect** schema/catalog but cannot execute `CREATE TABLE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE POLICY`, or record a migration.

## 4. Why `supabase_read_only_user` is used — intentional or misconfiguration?

**It is intentional tool configuration, not a Supabase project misconfiguration.**

- The project file `opencode.json` configures `mcp.servers.supabase` with a URL on host `mcp.supabase.com`, path `/mcp`, containing the production project ref and an explicit **`read_only=true`** query parameter (only the parameter name is reported here, not the URL or any token).
- Supabase's hosted MCP maps that flag to the built-in `supabase_read_only_user` role and sets the transaction read-only.
- No repository code or Supabase setting switches the project itself to read-only; the app's anon/service-role connections are unaffected.
- The local Supabase CLI connection is a different identity (`postgres`, full privileges) used only for local/staging.

Conclusion: the read-only connection is a deliberate safety boundary of the development tool. It is the correct default for schema inspection; it is simply the wrong tool for applying migrations.

## 5. Can we configure a safe administrative connection?

Yes — three options, in increasing order of operational complexity:

### Option A — Human SQL Editor (recommended for the immediate fix)
- Runs as the `postgres` role in the Supabase control plane, with full DDL rights.
- No new database role, no new secret, no credential rotation; the human session is audited by the dashboard.
- Use for the one-off Creator Studio fix (`docs/CREATOR-STUDIO-MIGRATION-FIX.md`) and for the P0 security migration bundle.
- Risk: manual step; mitigate with the verification queries in the runbook.

### Option B — Authenticated Supabase CLI with a dedicated CI secret
- Requires: `SUPABASE_ACCESS_TOKEN` (Management API) and a direct/session-pooler database connection string with the `postgres` password, stored in CI secrets (never in the repo).
- Then `supabase db push --project-ref httywgkwfqvrbuwuzutu` is technically possible, **but must not be used blindly**: this repository's migration history is incomplete/renamed, so the runbook (`docs/PRODUCTION-DATABASE-MIGRATION-RUNBOOK.md`) must be executed first, on Staging.
- Advantage: repeatable, auditable; disadvantage: long-lived DB credentials must be rotated and tightly scoped.

### Option C — Dedicated migration role (least-privilege CI)
- A human creates a login role (e.g. `migration_runner`) in SQL Editor with only the privileges listed in §6, and uses it solely for migrations.
- Never use `anon`, `authenticated`, or the runtime `service_role` for DDL.
- Store that role's credential only in CI secrets; rotate periodically.

## 6. Minimum privilege set for migrations

To apply this repository's migration chain safely, a migration principal needs:

1. `LOGIN`.
2. `CREATE` on the target database (to create schemas/extensions if any migration needs them) — optional if all objects stay in existing schemas.
3. `USAGE` **and** `CREATE` on schema `public` (create tables, functions, policies).
4. Ownership of, or membership in the owner role of, existing objects being altered. In this project most `public` tables (e.g. `products`, `vendor_payout_requests`, `supabase_migrations.schema_migrations`) are owned by `postgres`; `storage.objects` is owned by `supabase_storage_admin`. Since several migrations touch storage buckets/policies, the migration principal must either be `postgres` or be granted the equivalent ownership/membership.
5. `SELECT, INSERT, UPDATE, DELETE` on `supabase_migrations.schema_migrations` so applied versions are recorded truthfully.
6. `EXECUTE` on helper functions used by policies/triggers (e.g. `is_admin`, `owns_store`) — normally inherited from public execution grants.
7. No `SUPERUSER`, no `CREATEROLE`/`CREATEDB` unless a specific migration requires them (none in this chain).
8. No `anon`/`authenticated` membership, and no runtime use of this role.

**Gap:** the current MCP role satisfies none of 2–6 (it only has USAGE and read access), and the CLI has no management credentials. Hence migrations are currently BLOCKED BY HUMAN APPROVAL / correct tooling.

## 7. Difference between current and required

| Capability | Current MCP role | Required for migrations | Runtime service_role |
|---|---|---|---|
| `transaction_read_only` | on | off | n/a (REST) |
| CREATE on public schema | no | **yes** | no |
| ALTER existing public tables | no | **yes** (ownership/membership) | no |
| CREATE FUNCTION / POLICY | no | **yes** | no |
| Write migration history | no | **yes** | no |
| Bypass RLS | yes (via role attribute) but read-only tx | not required for DDL; avoid for app data | yes (runtime only) |
| Suitable for migrations | **No** | Yes (human SQL Editor or dedicated role) | **No** |

## 8. Recommended steps (no changes made yet)

1. For the current Creator Studio error: human runs `supabase/migrations/20261110120000_creator_studio_core.sql` in SQL Editor (Option A), then the verification queries in `docs/CREATOR-STUDIO-MIGRATION-FIX.md`.
2. For the P0 security/schema bundle: human follows `docs/PRODUCTION-DATABASE-MIGRATION-RUNBOOK.md` in SQL Editor, with a backup and post-checks.
3. For repeatability: decide between Option B and C; if C, have a human create the dedicated role with §6 privileges and store its credential only in CI secrets.
4. Keep the MCP `read_only=true` setting unchanged — it is the correct safe default for inspection.
5. Re-run this privilege audit after any role change; never grant DDL to `anon`, `authenticated`, or the runtime service role.

## 9. Safety statement

All statements executed for this audit were `SELECT`/catalog reads (`current_user`, `pg_roles`, `pg_auth_members`, `has_*_privilege`, `to_regclass`, `information_schema`). No DDL/DML was run, no grants were changed, no migration was applied, and no keys, URLs with credentials, or secrets were printed.
