# Phase 3 — Backup & Restore Plan (Preparation)

**Status:** PLANNED, NOT EXECUTED. No valid backup exists yet (`production-backup/schema.sql` = 0 bytes).

## Critical rule
No Production backup may be taken until explicitly approved. The helper script
`scripts/backup/backup-local-or-staging.ps1` **refuses production** by design.

## Backup set (per environment)
1. **Schema + data:** `supabase db dump --local|--linked -f backup/schema-data-<stamp>.sql` (CLI, never service-role for DDL).
2. **Roles/ACL:** `pg_dumpall --roles-only` on an authorized host (manual; never print values).
3. **Storage inventory:** `select id, public, file_size_limit from storage.buckets; select bucket_id, count(*) from storage.objects group by bucket_id;`
4. **Storage files:** copy via Storage/S3 API to encrypted location.
5. **Auth metadata inventory:** user ids/emails referenced by business tables (no values in reports).
6. **Catalog snapshot:** function/view/policy/trigger definitions + row counts (`01_PRECHECK.sql`).

## Integrity verification (mandatory)
- Dump file must be **non-empty** (script rejects <1 KB).
- Restore into an **isolated** database (never Production/Staging live).
- Run `02_POSTCHECK.sql` on the restored DB; compare row counts and Storage object counts.
- Record checksum (e.g. SHA-256) and retention location.

## Restore procedure (isolated DB)
```bash
psql "<ISOLATED_DB_URL>" -f backup/schema-data-<stamp>.sql
# then run postchecks + diff row counts
```

## Retention & security
- Encrypt at rest; restrict access; keep staging and production backups separate.
- Retention: keep at least the pre-deploy backup + one restore-verified copy until Phase 3 sign-off.
- Never copy production customer data into staging without an approved secure data-handling plan.

## Remaining blockers
- No approved production backup operation.
- No verified non-empty backup exists.
- Restore has not been performed.

**Do not claim a backup exists until one is actually created and verified.**
