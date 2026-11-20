# Production Backend Rollback Plan

## 1. Principles

- The reconciliation migration is **additive**: it adds columns, enums, functions, policies, buckets, seeds, and replaces function bodies. It does **not** drop tables, drop columns, truncate, or delete user data.
- Default rollback is **selective object restoration**, NOT a full database restore.
- Always stop on the first failing postcheck; do not continue "to see if it fixes itself".

## 2. Pre-deploy rollback assets (capture in `01_PRECHECK.sql`)

```sql
-- function definitions for every replaced function
select p.oid::regprocedure, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('checkout','add_to_cart','update_cart_item_quantity','merge_guest_cart',
                    'restock_on_order_cancel','cancel_order','request_vendor_payout',
                    'approve_vendor_payout_request','confirm_order_payment',
                    'verify_vodafone_cash_payment','sync_product_available_colors');

-- policy definitions
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public';

-- view options
select c.relname, c.reloptions from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v';
```

Plus the verified full `pg_dump` from `PRODUCTION_DATABASE_BACKUP_REPORT.md`.

## 3. Rollback scenarios

### A. Postcheck fails, but data intact
1. Identify the failing object.
2. Restore its definition from the pre-deploy snapshot (`CREATE OR REPLACE FUNCTION …`).
3. For policy changes, restore the original `roles`/`USING` clause.
4. For view options: `ALTER VIEW … RESET (security_invoker)`.
5. Re-run `02_POSTCHECK.sql`.

### B. New column / enum causes application errors
- Columns are nullable with safe defaults; no immediate rollback needed. Hide at application layer if necessary, then plan a follow-up migration.
- Enum additions are append-only and cannot be removed safely if referenced — do not attempt removal.

### C. Storage bucket/policy problem
- `DELETE FROM storage.policies …` / `UPDATE storage.buckets …` for the 3 new buckets only; never touch existing objects.
- Revert `public` flag if storefront breaks.

### D. Catastrophic failure / data corruption
- **Last resort only**: restore the full verified `pg_dump` into a new database, point the app at it, then investigate. Requires explicit approval and a maintenance window.

## 4. Data preservation

- No rollback step may delete orders, payments, products, users, or receipts.
- If a payment was confirmed during the failed window, reconcile it manually using `payments` / `payment_receipts` before re-attempting deployment.

## 5. Verification after rollback

- `02_POSTCHECK.sql` reflects the pre-deploy state.
- Row counts match the pre-deploy snapshot (25 products, 15 orders baseline).
- Application smoke tests pass.

## 6. History

- Do not delete `schema_migrations` rows to "undo" a deployment. If the reconciliation was registered, leave it and deploy a corrective follow-up migration instead.

## 7. Status

No rollback has been performed; no Production write has occurred.
