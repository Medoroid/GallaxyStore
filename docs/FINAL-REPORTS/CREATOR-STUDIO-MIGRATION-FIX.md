# Creator Studio — missing tables fix (human-executed)

## 1. Confirmed root cause

The message comes from `lib/creator/api.ts:66-76` (`migrationRequiredResponse`): an API route queried a Creator table, PostgREST returned `42P01`/`PGRST202`, and the app correctly returned `503 MIGRATION_REQUIRED`.

Read-only catalog check against the connected project (`httywgkwfqvrbuwuzutu`) returned `[]` for:

```
creator_profiles, creator_product_templates, creator_design_products, creator_gallery_items
```

So the tables really are missing in the environment where the error appears. The local Supabase stack has all four (and 48 migrations), which is why the error does not reproduce locally.

## 2. Prerequisites verified present in that environment

`20261110120000_creator_studio_core.sql` has a preflight block; every required object exists:

`public.user_designs`, `design_versions`, `design_files`, `design_categories`, `profiles`, `products`, `public.is_admin()`, `public.set_updated_at()`, `public.owns_design(uuid)`, types `design_status`, `design_file_format`.

Storage buckets `design-uploads` (private) and `design-previews` (public) also exist, so the migration's `INSERT ... ON CONFLICT` / `UPDATE` bucket statements are safe.

**The migration can be applied as-is; no prerequisite migration is missing.**

## 3. Why the agent did not apply it

The Supabase MCP connection is authenticated as `supabase_read_only_user` (`select current_user` → `supabase_read_only_user`). It cannot execute DDL. Per the safety rules, production DDL must be executed by a human in Supabase SQL Editor (which uses the owner/postgres role).

## 4. Human action — SQL Editor

1. Open Supabase → SQL Editor for project `httywgkwfqvrbuwuzutu`.
2. Take a schema/backup snapshot first (the migration adds tables, one column, two enum values, RLS policies, storage policies and trigger functions — it is additive but touches storage policies by name).
3. Paste the entire contents of:
   ```
   supabase/migrations/20261110120000_creator_studio_core.sql
   ```
   and run it once. The file is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT`).
4. Run the verification queries below. All must be `true`/non-null.

```sql
select to_regclass('public.creator_profiles')            as creator_profiles,
       to_regclass('public.creator_product_templates')   as templates,
       to_regclass('public.creator_design_products')     as design_products,
       to_regclass('public.creator_gallery_items')       as gallery_items;

select exists (select 1 from information_schema.columns
 where table_schema='public' and table_name='design_versions'
   and column_name='editor_state') as editor_state_column;

select enumlabel from pg_enum e
 join pg_type t on t.oid=e.enumtypid
 where t.typname='design_file_format' and enumlabel in ('jpg','webp');

select relname, relrowsecurity from pg_class
 where relname like 'creator_%' and relkind='r';
```

## 5. Follow-up migrations for the full Creator Studio

Applying the core file clears this specific error, but the following objects are also still absent in that environment and are needed by other routes:

| Migration | Adds | Current state |
|---|---|---|
| `20261110160000_creator_studio_template_seed.sql` | seeded product-type templates | `creator_product_templates` empty/absent |
| `20261110170000_creator_studio_publish_functions.sql` | `creator_publish_product(uuid)` and publish flow | `to_regprocedure(...)` = null |
| `20261116130000_custom_print_studio.sql` | `mockup_templates`, `shared_designs`, studio buckets | both tables = null |

Verify with:

```sql
select to_regprocedure('public.creator_publish_product(uuid)') as publish_fn,
       to_regclass('public.mockup_templates') as mockups,
       to_regclass('public.shared_designs') as shared_designs,
       (select count(*) from public.creator_product_templates) as template_count;
```

Apply them in the order above after the core migration, following `docs/PRODUCTION-DATABASE-MIGRATION-RUNBOOK.md`.

## 6. Verification after the human applies the migration

Re-run the affected Creator endpoint. The `503 MIGRATION_REQUIRED` response must disappear. The local equivalent is already proven: `scripts/run-integration-local.ps1` → 126/126 and `scripts/run-e2e-local.ps1` → 15/15 on the local stack where these migrations are applied.

No production DDL/DML was executed by the agent while producing this guide.
