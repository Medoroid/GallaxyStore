# Production Backend Deployment Runbook

> ⚠️ **Do not execute until all prerequisites are met and explicit written approval is given.**

## 0. Prerequisites (gate)

- [ ] Valid Production backup created **and restore verified** (`PRODUCTION_DATABASE_BACKUP_REPORT.md`).
- [ ] `01_PRECHECK.sql` executed on Production; outputs saved.
- [ ] Staging application + postchecks completed (or explicit acceptance of Local-only validation).
- [ ] Migration history strategy selected (`PRODUCTION_MIGRATION_MATRIX.md` §4).
- [ ] Maintenance window agreed; user approval recorded.
- [ ] No WIP/unrelated working-tree changes staged or committed.

## 1. Pre-deploy snapshot (Production, read-only)

Run `supabase/manual-apply/production-deployment/01_PRECHECK.sql`. Save all result sets, especially:
- function definitions (`pg_get_functiondef`)
- view definitions
- policies and triggers
- row counts (expect ~25 products, ~15 orders)

## 2. Apply the reconciliation

```bash
# Preferred for reviewability: SQL Editor / psql with the exact file
supabase/migrations/20261121090000_production_backend_reconciliation.sql
```

- The file is wrapped in `begin; … commit;` — any failure rolls back the entire change.
- It contains **no** table recreation, no drops, no deletes.
- It is idempotent for all objects (`CREATE OR REPLACE`, guarded `ALTER`, `ON CONFLICT`, `IF NOT EXISTS` only for genuinely new objects).
- The self-verification `DO` block raises if any required object is missing.

**Do not re-run `20261120000340`.** Do not register the 22 old versions before verifying their effects.

## 3. Immediate post-deploy verification

Run `supabase/manual-apply/production-deployment/02_POSTCHECK.sql`. All 12 result sets must match expectations (see `BACKEND_TEST_MATRIX.md` §3).

Additional spot checks:

```sql
-- both payment RPC overloads must be closed to anon
select oid::regprocedure, proacl from pg_proc
where proname='confirm_order_payment';

-- payout RPC must not be anon-executable
select has_function_privilege('anon','public.request_vendor_payout(uuid,numeric,text)','EXECUTE');

-- buckets
select id, public from storage.buckets
where id in ('site-banners','theme-assets','mockup-assets');
```

## 4. Application smoke tests (Production, read-only + normal user flows)

- Storefront loads; products and Gift Box catalog render.
- Guest cart → add item → checkout preview works.
- Zero-total order flow (if applicable).
- Vendor dashboard views return data without cross-store leakage.
- Admin theme/gallery/gift-box pages load.
- Watch logs for `permission denied` or missing-function errors.

## 5. Migration history reconciliation

Choose and execute one documented option from `PRODUCTION_MIGRATION_MATRIX.md` §4. Verify `schema_migrations` afterwards. Never mark a version applied if its effects are absent.

## 6. Post-deploy artifacts

- Save postcheck output.
- Save `schema_migrations` snapshot.
- Update `lib/database.types.ts` (already regenerated from Local; re-run against Staging/Production if schema differs).
- Record deployment in change log.

## 7. Rollback

Follow `PRODUCTION_BACKEND_ROLLBACK_PLAN.md`. Stop and assess on any postcheck failure.

## 8. No changes applied so far

This runbook was prepared without executing any Production write.
