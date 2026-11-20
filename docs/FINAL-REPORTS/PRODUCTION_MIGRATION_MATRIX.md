# Production Migration Matrix

## 1. Reconciliation strategy

- The 22-migration package (`supabase/deployment/PRODUCTION_ALL_MIGRATIONS.sql`) was **0/22 registered** on Production.
- `20261120000340_create_missing_production_tables` created the 16 feature tables and **is registered**; it must not be re-run.
- A single follow-up migration, **`20261121090000_production_backend_reconciliation.sql`**, re-applies every missing non-table object from the package, in dependency order.
- Migrations **3, 4, 5, 12 are already satisfied** on Production and are intentionally omitted:
  - 3: unique index present
  - 4: `validate_order_status_transition()` present with all COD transitions; equivalent trigger `guard_order_status_transition` exists (migration's own guard detects it)
  - 5: `product-images` bucket exists
  - 12: view exists
- All `CREATE TABLE` statements for the 16 existing tables were **programmatically removed** from the reconciliation (16 statements filtered; hard guard asserts none remain).

## 2. Final matrix

| # | Version | File | Local status | Reconciliation content |
|---:|---|---|---|---|
| 1 | `20261028` | payment_methods_external_wallet | ✅ applied | full (columns, enum, backfill, 3 payment RPCs, trigger) |
| 2 | `20261029` | order_payment_completion | ✅ applied | full (`complete_zero_total_order`, shipping method) |
| 3 | `20261030000002` | confirm_order_payment_partial_index | ✅ already satisfied | omitted |
| 4 | `20261030000003` | order_status_cod_transitions | ✅ already satisfied | omitted (equivalent trigger present) |
| 5 | `20261030000004` | product_images_bucket | ✅ already satisfied | omitted |
| 6 | `20261101` | add_gift_box_product_type | ✅ applied | full (CHECK rebuilt with `gift_box`) |
| 7 | `20261108130000` | site_content_banners_sections | ✅ applied | bucket + storage policies (table DDL filtered) |
| 8 | `20261110100000` | theme_management | ✅ applied | bucket + storage policies + `theme_settings` seed |
| 9 | `20261110120000` | creator_studio_core | ✅ applied | buckets/policies, editor state, formats (table DDL filtered) |
| 10 | `20261110160000` | creator_studio_template_seed | ✅ applied | 8 template seed rows |
| 11 | `20261110170000` | creator_studio_publish_functions | ✅ applied | `creator_publish_product`, `admin_review_creator_submission` |
| 12 | `20261112090000` | fix_admin_product_performance | ✅ already satisfied | omitted |
| 13 | `20261115120000` | product_available_sizes_and_color_sync_guard | ✅ applied | `products.available_sizes` + function |
| 14 | `20261116130000` | custom_print_studio | ✅ applied | `mockup-assets` bucket/policies, `editor_state`, jpg/webp |
| 15 | `20261117130000` | revoke_public_security_definer_execute | ✅ applied | ACL revokes + **additional 5-arg overload fix** |
| 16 | `20261117140000` | gift_box_bundles | ✅ applied | 8 functions (tables/triggers filtered) + 3 adopted policies |
| 17 | `20261117150000` | fix_cancel_order_double_restock | ✅ applied | `cancel_order` without inline restock |
| 18 | `20261117160000` | vendor_payout_method | ✅ applied | column, constraint, 3-arg payout RPC + **anon revoke** |
| 19 | `20261117170000` | harden_financial_rls | ✅ applied | 4 financial policies → `authenticated` + 2 more fixed |
| 20 | `20261118120000` | fix_vendor_views_security_invoker | ✅ applied | 19/19 views `security_invoker=true` |
| 21 | `20261118130000` | vendor_order_rls | ✅ applied | 2 vendor order policies |
| 22 | `20261118140000` | unify_checkout_hardening_with_gift_boxes | ✅ applied | final `checkout()` |

## 3. Drift note (302 bytes)

Applied `20261120000340` = repository file + 4 lines:

```sql
REVOKE ALL ON FUNCTION public.enforce_gift_box_item_rules() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_gift_box_registration() FROM PUBLIC, anon, authenticated, service_role;
```

Live ACL confirms both are restricted. The drift is **documented and re-asserted** in the reconciliation footer. The old migration file was not rewritten and no history row was altered.

## 4. History reconciliation options (decision required)

| Option | Description | Risk |
|---|---|---|
| A (recommended) | After full verification on Staging, register the 22 versions with `supabase migration repair --status applied` (or documented SQL) — all their effects are now present via the reconciliation. | Low, if verified |
| B | Keep history as-is; document that the package was applied through the reconciliation migration. | Low, but tooling drift remains |
| C | Rebuild a fresh Staging project from all migrations, verify, then adopt its history. | Medium; highest confidence |

**Never** register a version whose effects are not fully present.

## 5. Local evidence

- `supabase db reset` applied **52** migration versions.
- Last version: `20261121090000`.
- Reconciliation includes a self-verification `DO` block that raises on any missing required object.
