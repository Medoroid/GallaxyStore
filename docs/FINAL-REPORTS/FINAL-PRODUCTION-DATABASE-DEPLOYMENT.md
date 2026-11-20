# Final Production Database Deployment — Galaxy Store

Prepared 2026-11-18 from read-only inspection of `httywgkwfqvrbuwuzutu` and the local Supabase stack. **No production DDL/DML, no permission change, no migration application, no commit/push/deploy was performed.**

> **PRODUCTION WRITE OPERATIONS REQUIRE EXPLICIT HUMAN APPROVAL.**
> The MCP connection remains `read_only=true` (`supabase_read_only_user`). Do not attempt to make it administrative. Use SQL Editor (`postgres`) for the initial execution, or an authorised CLI connection after human approval.

---

## A. SQL Inventory (70 files)

### A.1 Counts by category

| Category | Files |
|---|---:|
| Catalog & Products | 12 |
| Orders | 10 |
| Admin & Dashboard | 7 |
| Payments | 7 |
| Schema | 5 |
| Security | 5 |
| RLS | 5 |
| Integration/verification | 4 |
| Creator Studio | 3 |
| Functions | 3 |
| Vendor & Payouts | 3 |
| Storage | 2 |
| Triggers | 2 |
| Documentation-other | 1 |
| Seeds | 1 |

### A.2 Grouping by directory

| Directory | Count | Notes |
|---|---:|---|
| `supabase/migrations` | 56 | 49 timestamped (`2026…`) + 7 legacy non-timestamped base files (`create_*_tables.sql`). Two synthetic-zero files (`20260000000000`, `20260000000002`) sort first and are **local/staging only**. |
| `supabase/manual-apply` | 4 | `00_authoritative_baseline.sql`, `20261112_pending_bundle.sql`, plus `production-deployment/{01_PRECHECK,02_POSTCHECK}.sql`. |
| `supabase/manual-review` | 8 | Approval-gated review/cleanup/verification scripts; never auto-run. |
| `supabase/migrations-archived` | 1 | `…_ARCHIVED_DANGEROUS.sql` — historical, do not re-apply. |
| `supabase/snippets` | 0 | Empty. |
| Elsewhere | 1 | `supabase/seed.sql` — local/E2E only. |

### A.3 Classification

**Historical / archived — do not re-apply**
- `supabase/migrations-archived/20260913_comprehensive_audit_fixes_ARCHIVED_DANGEROUS.sql`.
- `supabase/migrations/20260910000001_fix_cart_stock_search_reviews.sql` (header: already correct in production).
- `supabase/migrations/20261030000001_checkout_coupon_shipping_hardening.sql` — **superseded, historical, NOT in the deploy list**. Its coupon/shipping validation lives on inside `20261118140000_unify_checkout_hardening_with_gift_boxes.sql` (see R1 closure in §C).
- Legacy base variants superseded by timestamped versions: `create_admin_table.sql`, `create_admin_table_fixed.sql`, `create_gallery_table.sql`.

**Local/staging only — never apply to production**
- `00_authoritative_baseline.sql` (and its copy `_20260000000000_authoritative_baseline.sql`).
- `20260000000002_authoritative_rls_and_grants.sql`, `20261118115000_authoritative_vendor_views.sql`.
- `20261118100000_drop_duplicate_indexes.sql`, `20261118110000_enable_rls_and_final_view_grants.sql` (local parity helpers).
- `supabase/seed.sql`, all `manual-review/*` verification scripts.
- `supabase/manual-apply/20261112_pending_bundle.sql` — reference bundle for the older subset; **not executed** in the final 22-file plan (cross-check §C).

**Pending production candidates (require human approval, ordered in §C)**
- Payments/orders: `20261028…`, `20261029…`, `20261030000002…00000004…` (**not** `20261030000001`; see historical above).
- Catalog/features: `20261101…`, `20261108130000…`, `20261110100000…`, `2026111012/16/17…`, `20261112090000…`, `20261115120000…`, `20261116130000…`.
- Security/finance corrections: `20261117130000…`, `20261117140000…`, `20261117150000…`, `20261117160000…`, `20261117170000…`, `20261118120000…`.
- **Production-applicable companion:** `20261118130000_vendor_order_rls.sql` — adds two vendor-scoped SELECT policies on `orders`/`order_items`. It is **not local-only**: it must follow `20261118120000_fix_vendor_views_security_invoker.sql` (step 20) so vendors still see their own store's orders after the views switch to invoker mode. Its header's "DO NOT APPLY ... without human approval" is the same global human gate as every other file in this package, not a local-only marker.

**Duplicates / conflicts to document, not delete**
- `00_authoritative_baseline.sql` and `migrations/20260000000000_authoritative_baseline.sql` are byte-identical (both 2,877 lines).
- `20260909000001` and `20260909000002` both add cart color/size and rebuild the unique constraint.
- `create_admin_table.sql` / `create_admin_table_fixed.sql` / `20260907000001_create_admin_users_secure.sql` — three `admin_users` variants.
- `manual-review/` has two files prefixed `06_`.
- Mixed version formats (8-digit, 14-digit, synthetic-zero, non-prefixed); keep all historical files, do not rewrite history.

---

## B. Production ↔ Local Reconciliation (read-only evidence)

### B.1 Migration history

| Metric | Production | Local |
|---|---:|---:|
| Applied versions / numbered files | **190** | **49** numbered + 7 unnumbered |
| First version | `20260706081845` | `20260000000000` (sentinel) |
| Last version | `20261026` | `20261118130000` |
| Local versions exactly present in production | **4** (`20261023`–`20261026`) | — |
| Local versions absent | **52 total**: 34 with no same-day version + 11 renumbered same-day + 2 sentinel + 5 others | — |

Renumbered equivalents (11) exist with different production versions on the same date (e.g. local `20260909000001` ↔ prod `20260909091603`). **Do not rewrite history**; confirm object-level presence instead.

### B.2 Object-level comparison (counts)

| Object | Production | Local | Common | Missing in production |
|---|---:|---:|---:|---:|
| Tables | 76 | 91 | 75 | **16** |
| Columns | 1,245 | 1,396 | 1,191 | **205** (201 on new tables + 4 key columns) |
| Functions | 180 | 88 | 76 | **12** |
| Views / matviews | 41 / 10 | 36 / 5 | 36 / 5 | **0** (all local views exist in production) |
| Triggers | 123 | 44 | 29 | **15** |
| RLS policies | 206 | 229 | 206 | **23** |
| Storage buckets | 10 | 13 | 10 | **3** |
| Enum labels | 67 | 70 | 67 | **3** |

**Production-only drift (do not delete):** 104 extra functions, 94 extra triggers, 5 extra views (`admin_coupon_performance`, `admin_customer_ltv`, `admin_design_moderation_queue`, `admin_mv_coupon_performance`, `admin_printing_queue`), 5 extra matviews, and `_seed_report`.

### B.3 Missing in production — exact lists

**16 tables:** `creator_profiles`, `creator_product_templates`, `creator_design_products`, `creator_gallery_items`, `gift_boxes`, `gift_box_items`, `order_item_gift_box_contents`, `mockup_templates`, `shared_designs`, `site_banners`, `site_sections`, `store_themes`, `theme_assets`, `theme_schedule_history`, `theme_settings`, `theme_versions`.

**4 key columns on existing tables:** `products.available_sizes`, `design_versions.editor_state`, `orders.payment_method`, `vendor_payout_requests.payout_method`.

**12 functions:** `admin_review_creator_submission`, `complete_zero_total_order`, 5-arg `confirm_order_payment`, `creator_publish_product`, `enforce_gift_box_item_rules`, `enforce_gift_box_registration`, `gift_box_assert_components_available`, `guard_vodafone_receipt_method`, `initiate_external_wallet_payment`, 3-arg `request_vendor_payout`, `submit_external_wallet_receipt`, `verify_external_wallet_payment`.

**15 triggers:** 4 creator `*_updated_at`, 3 gift-box, 4 custom-print/mockup, 2 gallery/site-content, 2 theme, plus `payment_receipts.guard_vodafone_receipt_method`.

**23 policies:** creator (5), gift-box (3), custom-print (3), site-content/theme (5), gallery (2), vendor order RLS (2), etc.

**3 buckets:** `mockup-assets`, `site-banners`, `theme-assets`.

**3 enum labels:** `design_file_format.jpg`, `design_file_format.webp`, `payment_provider.external_wallet`; plus the `gift_box` **CHECK value** on `custom_print_requests.product_type` (not an enum).

### B.4 Partially applied / divergent

- `custom_print_requests` exists (`20261024`) but its `gift_box` CHECK does not (`20261101`).
- `vendor_payouts.payout_method` exists; `vendor_payout_requests.payout_method` does not.
- `confirm_order_payment` exists only as 6-arg in production; local has an extra 5-arg overload.
- `request_vendor_payout` is 2-arg in production; local has the 3-arg `p_method` version.
- `gallery_images` has 4 policies in production, 6 locally (2 local-only).
- Vodafone Cash is applied; external-wallet enum/functions/receipt guard are not.

### B.5 Classification

- **Already applied / in sync:** 75 tables, 1,191 columns, 76 functions, 36 views, 5 matviews, 29 triggers, 206 policies, 10 buckets, 67 enum labels, 4 migration versions.
- **Missing:** all objects in B.3; 34 migrations with no same-day production version.
- **Partially applied:** B.4.
- **Duplicate/local-only helpers:** sentinel baselines, 7 unnumbered legacy base files, duplicate cart color/size migrations, 2 identical baseline files in different folders.
- **Baseline needed:** the authoritative baseline is required only for fresh Local/Staging rebuilds — **not for production**.

---

## C. Unified Deployment Plan (ordered, dependency-safe)

Apply **group by group** in SQL Editor; run postchecks after each group. Never paste all files into one script.

### Group 0 — verify only (already in production baseline)
Foundational files through `20261026_admin_audit_log.sql` and the 11 **renumbered same-day equivalents**: confirm object-level presence; do not re-run or rewrite history. Only 4 versions match exactly (`20261023`–`20261026`).

### Group 1 — payments / checkout / catalog
1. `20261028_payment_methods_external_wallet.sql`
2. `20261029_order_payment_completion.sql`
3. `20261030000002_confirm_order_payment_partial_index.sql`
4. `20261030000003_order_status_cod_transitions.sql`
5. `20261030000004_product_images_bucket.sql`
6. `20261101_add_gift_box_product_type.sql`

### Group 2 — content / theme / creator / catalog
7. `20261108130000_site_content_banners_sections.sql`
8. `20261110100000_theme_management.sql`
9. `20261110120000_creator_studio_core.sql`
10. `20261110160000_creator_studio_template_seed.sql`
11. `20261110170000_creator_studio_publish_functions.sql`
12. `20261112090000_fix_admin_product_performance.sql`
13. `20261115120000_product_available_sizes_and_color_sync_guard.sql`
14. `20261116130000_custom_print_studio.sql`

### Group 3 — P0/P1 corrections + final checkout (must be last)
15. `20261117130000_revoke_public_security_definer_execute.sql`
16. `20261117140000_gift_box_bundles.sql`
17. `20261117150000_fix_cancel_order_double_restock.sql`
18. `20261117160000_vendor_payout_method.sql`
19. `20261117170000_harden_financial_rls.sql`
20. `20261118120000_fix_vendor_views_security_invoker.sql`
21. `20261118130000_vendor_order_rls.sql`
22. `20261118140000_unify_checkout_hardening_with_gift_boxes.sql`

**R1 closure:** step 22 is the only `checkout()` definition applied. It merges the gift-box logic from step 16 with the coupon/shipping hardening from `20261030000001` (kept in the repo as history, **not deployed**). The old weak `checkout` logic is not part of the execution list.

**Deploy coupling:** the payout API has a 2-arg fallback; method persistence requires step 19. Vendor views invoker (step 20) must be followed by vendor order RLS (step 21).

---

## D. One-Time Execution Package

Location: `supabase/manual-apply/production-deployment/`

| File | Purpose |
|---|---|
| `00_MANIFEST.md` | Safety rules, execution methods, pasting order |
| `01_PRECHECK.sql` | Read-only snapshot before DDL (identity, history, object presence, ACL baseline) |
| `02_POSTCHECK.sql` | Read-only verification after each group and at the end |
| `03_ROLLBACK.sql` | Commented, human-gated reversal procedures; primary rollback = backup restore |
| `deploy.ps1` | Optional CLI runner, dry-run by default; requires `-ConfirmProduction` and `SUPABASE_ACCESS_TOKEN` |

### Backup instructions (human)
1. Supabase Dashboard → Project Settings → Database → create a manual backup (or `pg_dump` via an authorised connection string stored only in the operator's environment).
2. Back up Storage objects (at least `product-images`, `design-uploads`, `design-previews`, `site-banners`, `theme-assets`).
3. Save the precheck output and the backup ID/timestamp in the deployment record.

### CLI commands (only after human authorisation)
```powershell
# Dry run (lists ordered files, performs nothing)
powershell -File supabase/manual-apply/production-deployment/deploy.ps1

# Real run requires an authenticated CLI and explicit approval flag:
# $env:SUPABASE_ACCESS_TOKEN = '<from approved secret store>'
# powershell -File supabase/manual-apply/production-deployment/deploy.ps1 -ConfirmProduction
```
Do not run `supabase db push` blindly; the migration history is renamed/incomplete (§B).

### Pre-deployment checks
- Confirm connected project is `httywgkwfqvrbuwuzutu`.
- Run `01_PRECHECK.sql`, save output.
- Verify backup exists and restore was tested on Staging.
- Confirm `read_only=true` remains in `opencode.json`.

### Post-deployment verification
Run `02_POSTCHECK.sql` after each group and at the end. All object lookups must be non-null; all P0 ACL checks must be `false`; `cancel_order` must not increment stock while the trigger does; vendor views must contain `security_invoker=true`; enum values and `available_sizes`/`payout_method` columns must exist.

### Rollback
See `03_ROLLBACK.sql`. Primary rollback is a full backup restore. Individual reversals are commented and must be uncommented only by a human for the exact object involved. Never re-grant anon EXECUTE on payment functions as a workaround.

---

## E. Authorization & Tooling Constraints

- MCP stays `supabase_read_only_user` with `read_only=true`; it is for inspection only.
- No `service_role` for DDL (it lacks CREATE on `public` and is runtime-only).
- SQL Editor (`postgres`) is the approved initial execution path; CLI only after a human provides management credentials.
- No data deletion, no `DROP`/`TRUNCATE` without explicit approval, no history rewriting to hide drift.

---

## F. Final Verification Plan (after human execution)

1. **Tables**: every table listed in `02_POSTCHECK.sql` exists.
2. **Functions/RPC**: publish flow, payout RPC arity, payment helpers; compare `pg_proc` counts with precheck.
3. **Triggers**: restock trigger present, guard triggers enabled.
4. **RLS**: policy counts/roles match `02_POSTCHECK.sql`; anon denied on cart views.
5. **Storage**: buckets `site-banners`, `theme-assets`, `mockup-assets`, `design-*` present with correct public/private flags.
6. **Migration history**: record final `schema_migrations` count/version; do not fabricate entries.
7. **Creator Studio**: all four tables + template seed + publish RPC; `503 MIGRATION_REQUIRED` gone.
8. **Application smoke tests**: admin product create with colours/sizes; gift-box list; vendor payout with `method`; admin approve; creator upload/publish; cart→checkout→cancel stock check.

---

## G. Deliverables

- This report: `docs/FINAL-REPORTS/FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md`.
- Deployment package: `supabase/manual-apply/production-deployment/` (manifest, precheck, postcheck, rollback, CLI runner).
- Local verification evidence: integration 126/126 (×3 + final), full E2E 15/15, unit 1476, TypeScript/ESLint/build green.

**Status: NOT EXECUTED — BLOCKED BY HUMAN APPROVAL.**
