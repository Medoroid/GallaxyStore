# One-Time Production Database Deployment — Manifest

> **PRODUCTION WRITE OPERATIONS REQUIRE EXPLICIT HUMAN APPROVAL.**
> This package was prepared from read-only inspection only. No production DDL/DML was executed.

## Contents

| File | Purpose |
|---|---|
| `01_PRECHECK.sql` | Read-only snapshot before any DDL (identity, history, object presence, ACL baseline) |
| `02_POSTCHECK.sql` | Read-only verification after each group and at the end |
| `03_ROLLBACK.sql` | Commented, human-gated reversal procedures (primary rollback = backup restore) |
| `deploy.ps1` | Optional CLI runner, dry-run by default, requires `-ConfirmProduction` + `SUPABASE_ACCESS_TOKEN` |
| `MANIFEST.md` (this file) | Exact paste order for Supabase SQL Editor and safety rules |

## Safety rules

1. Keep the MCP `read_only=true` setting unchanged. Do not try to make it administrative.
2. Use **Supabase SQL Editor** (`postgres` role) for the initial execution, or a human-authorised CLI connection. Never use `service_role` for DDL.
3. Do not apply `supabase/manual-apply/00_authoritative_baseline.sql` to production — it is local/staging only.
4. Do not delete historical migration files and do not rewrite production history to hide drift.
5. Do not run all SQL files blindly in one script. Apply group by group, run postcheck after each group, stop on first failure.
6. No `DROP`/`TRUNCATE` without explicit approval. The only planned drop-like statements are guarded `DROP POLICY IF EXISTS` / `DROP FUNCTION IF EXISTS` inside the source migrations and the optional duplicate-index file (deferred).
7. Record every verification output in `docs/FINAL-REPORTS/FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md`.

## Execution methods

### Method A — SQL Editor (recommended for this one-time recovery)
For each file in the ordered lists below: open the file, paste its full contents into SQL Editor, run, then run `02_POSTCHECK.sql` (or the group-specific queries) and save the output.

### Method B — CLI (only after human authorisation)
1. Human authenticates CLI (`supabase login`) and provides `SUPABASE_ACCESS_TOKEN` in the CI/secret store.
2. Validate the chain on Staging first.
3. Run `powershell -File supabase/manual-apply/production-deployment/deploy.ps1` for a dry run; only after approval re-run with `-ConfirmProduction`.

## Ordered deployment groups

The authoritative, numbered plan is `docs/FINAL-REPORTS/FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md` §C. The exact 22-file list below is identical to `deploy.ps1` and to the report:

1. `20261028_payment_methods_external_wallet.sql`
2. `20261029_order_payment_completion.sql`
3. `20261030000002_confirm_order_payment_partial_index.sql`
4. `20261030000003_order_status_cod_transitions.sql`
5. `20261030000004_product_images_bucket.sql`
6. `20261101_add_gift_box_product_type.sql`
7. `20261108130000_site_content_banners_sections.sql`
8. `20261110100000_theme_management.sql`
9. `20261110120000_creator_studio_core.sql`
10. `20261110160000_creator_studio_template_seed.sql`
11. `20261110170000_creator_studio_publish_functions.sql`
12. `20261112090000_fix_admin_product_performance.sql`
13. `20261115120000_product_available_sizes_and_color_sync_guard.sql`
14. `20261116130000_custom_print_studio.sql`
15. `20261117130000_revoke_public_security_definer_execute.sql`
16. `20261117140000_gift_box_bundles.sql`
17. `20261117150000_fix_cancel_order_double_restock.sql`
18. `20261117160000_vendor_payout_method.sql`
19. `20261117170000_harden_financial_rls.sql`
20. `20261118120000_fix_vendor_views_security_invoker.sql`
21. `20261118130000_vendor_order_rls.sql` — **production-applicable**: required companion to step 20; after vendor views become `security_invoker`, the two vendor-scoped SELECT policies keep vendor dashboards populated. Not local-only.
22. `20261118140000_unify_checkout_hardening_with_gift_boxes.sql` — the single final `checkout()` definition; the older `20261030000001` is historical and **not deployed**.

Every file above is gated by the same explicit human approval; the "DO NOT APPLY ... without human approval" wording in individual SQL headers is that global gate, not a local-only classification.

---

Prepared: 2026-11-18 · Status: **NOT EXECUTED / BLOCKED BY HUMAN APPROVAL**
