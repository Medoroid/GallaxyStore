# Production Database Backup Report

## 1. Current state

| Artifact | Status |
|---|---|
| `production-backup/schema.sql` | **0 bytes — INVALID** |
| Schema dump | ❌ not present |
| Data dump | ❌ not present |
| Storage objects backup | ❌ not present |
| Auth users backup | ❌ not present |
| Function/policy snapshot | ❌ not present |
| Restore verification | ❌ not performed |

**Conclusion:** there is currently **no usable Production backup**. No Production write may proceed until this is fixed.

## 2. Required backup set

Execute from a trusted environment (read-only source, separate destination):

```bash
# 1. Full schema + data (custom format, compressible, restorable)
pg_dump "$PROD_DB_URL" -Fc -f production-backup/full-$(date +%Y%m%d%H%M%S).dump

# 2. Plain-text schema (for diff/review)
pg_dump "$PROD_DB_URL" --schema-only -f production-backup/schema-$(date +%Y%m%d%H%M%S).sql

# 3. Roles / ACLs snapshot
pg_dumpall --roles-only -f production-backup/roles-$(date +%Y%m%d%H%M%S).sql

# 4. Pre-deploy catalog snapshot (from 01_PRECHECK.sql)
#    - function definitions (pg_get_functiondef)
#    - view definitions (pg_get_viewdef)
#    - policies (pg_policies)
#    - triggers (pg_trigger)
#    - row counts for all business tables

# 5. Storage inventory + files
#    - storage.buckets / storage.objects rows
#    - object files copied via S3/Storage API

# 6. Auth dependency inventory
#    - auth.users ids/emails referenced by profiles/orders/creator_profiles
```

## 3. Restore verification (mandatory)

1. Restore the dump into an **isolated** local/staging database.
2. Run `02_POSTCHECK.sql` — baseline rows must be intact (Production snapshot: **25 products, 15 orders**).
3. Compare row counts with the pre-deploy snapshot.
4. Confirm Storage object checksums/count match.
5. Record the verification result in this report before requesting Production approval.

## 4. Data preservation guarantees of the reconciliation

- No `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or DELETE anywhere in the migration.
- The only data-writing statement is a guarded `UPDATE orders SET payment_method = ...` where the value is null and a settled/unambiguous payment exists.
- Seeds use fixed IDs / `ON CONFLICT` — no duplicates.
- All DDL is additive or `CREATE OR REPLACE`, wrapped in one transaction.

## 5. Production write gate

| Requirement | Status |
|---|---|
| Valid backup | ❌ pending |
| Restore verification | ❌ pending |
| Staging application | ❌ pending (no Staging project) |
| Risk summary presented | ✅ this package |
| Explicit user approval | ❌ pending |

**No Production changes have been applied.**
