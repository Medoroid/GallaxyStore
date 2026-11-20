# Production Migration Manifest — byte-verified

Generated: 2026-11-18 · Source of order: `supabase/manual-apply/production-deployment/00_MANIFEST.md` · Unified file: `supabase/deployment/PRODUCTION_ALL_MIGRATIONS.sql`

## Verification results

| Check | Result |
|---|---|
| Migration count exactly 22 | **PASS (22)** |
| Numbered markers in unified file | **PASS (22/22)** |
| Order matches approved manifest | **PASS** |
| Each original migration appears exactly once, byte-for-byte | **PASS (true)** |
| Offsets strictly increasing | **PASS (true)** |
| BEGIN/COMMIT/ROLLBACK in any migration | **PASS (0)** |
| CREATE INDEX CONCURRENTLY | **PASS (none)** |
| Excluded historical migration content | **PASS (absent)** |
| Excluded historical migration name | **INFO — appears only in 2 SQL comments inside approved migration 22 (one full filename and one bare timestamp), never as executable SQL. The excluded migration itself is not embedded.** |
| PRECHECK embedded exactly once | **PASS (true)** |
| POSTCHECK embedded exactly once | **PASS (true)** |
| Final file size | 218939 bytes (~213.8 KB) |

## Approved execution order (22)

| # | File | Timestamp | Bytes | Lines | SHA-256 (12) | Content match | Offset in unified file |
|---:|---|---|---:|---:|---|---|---:|
| 1 | `20261028_payment_methods_external_wallet.sql` | 20261028 | 26103 | 784 | `aca981148934` | PASS (1/1) | 6314 |
| 2 | `20261029_order_payment_completion.sql` | 20261029 | 6057 | 177 | `0242bc960e49` | PASS (1/1) | 32663 |
| 3 | `20261030000002_confirm_order_payment_partial_index.sql` | 20261030000002 | 4794 | 122 | `a37e45460add` | PASS (1/1) | 38989 |
| 4 | `20261030000003_order_status_cod_transitions.sql` | 20261030000003 | 3016 | 72 | `06e417a34944` | PASS (1/1) | 44045 |
| 5 | `20261030000004_product_images_bucket.sql` | 20261030000004 | 2024 | 60 | `913a1c750198` | PASS (1/1) | 47316 |
| 6 | `20261101_add_gift_box_product_type.sql` | 20261101 | 2891 | 63 | `f450c5621ab8` | PASS (1/1) | 49587 |
| 7 | `20261108130000_site_content_banners_sections.sql` | 20261108130000 | 7212 | 193 | `ef8f436a0039` | PASS (1/1) | 52741 |
| 8 | `20261110100000_theme_management.sql` | 20261110100000 | 11046 | 268 | `5ee60e783155` | PASS (1/1) | 60203 |
| 9 | `20261110120000_creator_studio_core.sql` | 20261110120000 | 22959 | 479 | `dba3683beb9c` | PASS (1/1) | 71502 |
| 10 | `20261110160000_creator_studio_template_seed.sql` | 20261110160000 | 10312 | 188 | `eebe9f8db2a1` | PASS (1/1) | 94723 |
| 11 | `20261110170000_creator_studio_publish_functions.sql` | 20261110170000 | 18883 | 514 | `313cbc9217f3` | PASS (1/1) | 105301 |
| 12 | `20261112090000_fix_admin_product_performance.sql` | 20261112090000 | 2010 | 49 | `3aa3ac16a3ad` | PASS (1/1) | 124447 |
| 13 | `20261115120000_product_available_sizes_and_color_sync_guard.sql` | 20261115120000 | 3522 | 91 | `28734c3ee3db` | PASS (1/1) | 126735 |
| 14 | `20261116130000_custom_print_studio.sql` | 20261116130000 | 9440 | 200 | `04a13f459ec5` | PASS (1/1) | 130510 |
| 15 | `20261117130000_revoke_public_security_definer_execute.sql` | 20261117130000 | 2562 | 52 | `93da38ce6635` | PASS (1/1) | 140222 |
| 16 | `20261117140000_gift_box_bundles.sql` | 20261117140000 | 37905 | 860 | `254d4203c12b` | PASS (1/1) | 143034 |
| 17 | `20261117150000_fix_cancel_order_double_restock.sql` | 20261117150000 | 3034 | 82 | `1711915c6e2d` | PASS (1/1) | 181204 |
| 18 | `20261117160000_vendor_payout_method.sql` | 20261117160000 | 5397 | 149 | `13eb390017f5` | PASS (1/1) | 184493 |
| 19 | `20261117170000_harden_financial_rls.sql` | 20261117170000 | 3218 | 66 | `56d69f58ff69` | PASS (1/1) | 190145 |
| 20 | `20261118120000_fix_vendor_views_security_invoker.sql` | 20261118120000 | 1538 | 37 | `52c1a5a1cf25` | PASS (1/1) | 193631 |
| 21 | `20261118130000_vendor_order_rls.sql` | 20261118130000 | 2281 | 59 | `8da1dd44dc2c` | PASS (1/1) | 195419 |
| 22 | `20261118140000_unify_checkout_hardening_with_gift_boxes.sql` | 20261118140000 | 15731 | 375 | `165935e36327` | PASS (1/1) | 197974 |

## Historical exception

- `20261030000001_checkout_coupon_shipping_hardening.sql` is excluded. Its coupon/shipping validation is preserved inside migration 22/22 (`20261118140000_unify_checkout_hardening_with_gift_boxes.sql`).

## Transaction / SQL Editor compatibility

- No `BEGIN`, `COMMIT`, `ROLLBACK` or `CREATE INDEX CONCURRENTLY` was found in the 22 migrations, so the unified script has no intrinsic transaction blocker.
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` appears in migrations 01, 09 and 14. PostgreSQL 12+ permits it inside a transaction block; the new enum labels are only used later inside function bodies or text CHECK constraints, not as enum literals in the same top-level transaction. This matches the locally validated chain.
- The file is intentionally large (213.8 KB). Monitor SQL Editor timeout; if a statement errors, stop and use the guide rather than replaying.

Status: **NOT EXECUTED — HUMAN APPROVAL REQUIRED.**
