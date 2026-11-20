# Production Deployment Guide — single-file SQL Editor run

Target project: `httywgkwfqvrbuwuzutu` · Unified file: `supabase/deployment/PRODUCTION_ALL_MIGRATIONS.sql`

> **PRODUCTION WRITE OPERATIONS REQUIRE EXPLICIT HUMAN APPROVAL.**
> This package was prepared locally. No production SQL was executed while building it. **No automatic rollback is included.**

## 1. Before opening SQL Editor

1. Take a full backup: database schema + data + Storage objects. Verify the restore point on Staging.
2. Run `supabase/manual-apply/production-deployment/01_PRECHECK.sql` **separately** in SQL Editor and read the result. The unified file contains a copy of that section, but a single execution cannot stop for human review — do not treat the embedded copy as a gate.
3. Confirm the connected project is `httywgkwfqvrbuwuzutu` (PRECHECK prints `current_database()` and identity).

## 2. Open and run the unified file

1. Supabase Dashboard → select project `httywgkwfqvrbuwuzutu` → **SQL Editor**.
2. New query → paste the entire contents of `supabase/deployment/PRODUCTION_ALL_MIGRATIONS.sql`.
3. Run **once**. The file contains 22 clearly marked migration sections in the approved order, followed by the POSTCHECK queries.
4. Keep the SQL Editor output open until you have read every result set.

## 3. When to stop immediately

Stop the run and investigate if you see any of the following:

- Any `ERROR:` line — note the marker `MIGRATION NN/22` immediately above it.
- A lock timeout or statement timeout.
- A `permission denied` on a `CREATE POLICY`, `CREATE FUNCTION`, `ALTER TABLE`, or `GRANT`.
- Any failure involving `confirm_order_payment`, `cancel_order`, `restock_on_order_cancel`, `vendor_*` views, or `checkout` — these are the integrity/security-critical paths.

## 4. How to review errors

1. Identify the last successful `MIGRATION NN/22` marker in the output.
2. Re-read `01_PRECHECK.sql` queries against the live DB to see which objects already exist.
3. Compare with the table in `PRODUCTION_MIGRATION_MANIFEST.md` (22 filenames, SHA-256 prefixes, expected offsets).
4. Consult `supabase/manual-apply/production-deployment/03_ROLLBACK.sql` — all reversal statements are commented and human-gated.
5. Fix forward with a **new** corrective migration; do not edit historical migrations.

## 5. What NOT to do after a mid-file failure

- **Do not re-run the whole unified file blindly.** Some migrations call `DROP FUNCTION IF EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING` or `CREATE OR REPLACE`; replaying can change state in ways you did not review.
- Do not mark a migration as applied in `schema_migrations` by hand. The SQL Editor does not record versions for these files; object-level verification is authoritative.
- Do not grant `anon`/`public` EXECUTE on payment functions as a workaround.
- Do not delete production data or Storage objects to "make it clean".

## 6. Post-deployment verification

The unified file ends with the approved `02_POSTCHECK.sql` content. You can also run it separately:

`supabase/manual-apply/production-deployment/02_POSTCHECK.sql`

Check that:
- All required tables/columns are non-null (Creator Studio, Theme, Site Content, Gift Boxes, Mockups, `available_sizes`, `payout_method`, `editor_state`).
- All P0 ACL checks return `false` for `anon`/`authenticated` on `confirm_order_payment`, `sync_product_available_colors`, `verify_vodafone_cash_payment`.
- `cancel_order` does not increment stock inline; `restock_on_order_cancel` does.
- `request_vendor_payout` is 3-arg.
- All 19 `vendor_*` views show `security_invoker=true`.
- The final `checkout()` reports `coupon_hardened=t`, `shipping_hardened=t`, `giftbox_aware=t`, `no_old_fee_check=t`.
- The `gift_box` CHECK constraint exists on `custom_print_requests`.

## 7. Transaction and timeout safety

- No migration in the 22-file list contains `BEGIN`, `COMMIT`, `ROLLBACK`, or `CREATE INDEX CONCURRENTLY`, so a single script has no intrinsic transaction blocker.
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` appears in migrations 01, 09 and 14. PostgreSQL 12+ allows it inside a transaction; the new labels are only consumed later in function bodies or text CHECK constraints, matching the locally validated chain.
- The file is about **214 KB**. SQL Editor may impose a statement timeout; if the run times out, stop and treat it as a partial failure (see §4–§5).
- Mixed CRLF/LF line endings inside the file are preserved from the original migrations; PostgreSQL accepts both.

## 8. Final status

**NOT EXECUTED — HUMAN APPROVAL REQUIRED.** Do not claim success until POSTCHECK output is saved and reviewed.
