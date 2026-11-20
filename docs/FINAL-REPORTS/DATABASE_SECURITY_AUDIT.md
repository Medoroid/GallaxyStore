# Database Security Audit

## 1. Scope

Final state after applying `20261121090000_production_backend_reconciliation.sql` on a clean Local rebuild. Read-only verification via `02_POSTCHECK.sql` and catalog queries.

## 2. Function ACL (SECURITY DEFINER)

| Function | PUBLIC | anon | authenticated | service_role | Verdict |
|---|:---:|:---:|:---:|:---:|---|
| `confirm_order_payment` (5-arg) | ❌ | ❌ | ❌ | ✅ | fixed |
| `confirm_order_payment` (6-arg) | ❌ | ❌ | ❌ | ✅ | fixed |
| `verify_vodafone_cash_payment` | ❌ | ❌ | ✅ | ✅ | fixed |
| `verify_external_wallet_payment` | ❌ | ❌ | ✅ | ✅ | correct |
| `sync_product_available_colors` | ❌ | ❌ | ❌ | ✅ | fixed |
| `request_vendor_payout` | ❌ | ❌ | ✅ | ✅ | fixed |
| `creator_publish_product` | ❌ | ❌ | ❌ | ✅ | correct |
| `admin_review_creator_submission` | ❌ | ❌ | ❌ | ✅ | correct |
| `gift_box_assert_components_available` | ❌ | ❌ | ✅ | ✅ | correct |
| `enforce_gift_box_item_rules` | ❌ | ❌ | ❌ | ❌ | trigger-only |
| `enforce_gift_box_registration` | ❌ | ❌ | ❌ | ❌ | trigger-only |

Postcheck C: `anon_confirm=false`, `auth_confirm=false`, `anon_colors=false`, `anon_verify=false`.

## 3. Financial RLS

Fixed to `roles = {authenticated}` by migration 19 plus reconciliation additions:

- `vendor_earnings_select_owner_or_admin`
- `vendor_earnings_update_admin`
- `vendor_payout_requests_select_owner_or_admin`
- `vendor_payout_requests_update_admin`
- `payout_transactions_select_owner_or_admin` *(reconciliation addition)*
- `vendor_payouts_select_owner_or_admin` *(reconciliation addition)*

Policies use `USING (owner_id = auth.uid() OR is_admin())` — customers cannot read other users' financial rows and cannot change payment state; verification stays in trusted admin functions.

### Reviewed and intentionally left `TO public`

8 non-financial policies remain:

| Table | Policies | Reason |
|---|---|---|
| `gallery_images` | 2 public SELECT, 4 admin write, 1 admin ALL | Public gallery read is a product requirement; admin policies are guarded by `is_admin()` in `USING`/`WITH CHECK`, so anonymous callers match no rows. |
| `admin_users` | 2 (`Admins can manage…`, `Users can check own admin status`) | `USING` clauses depend on `auth.uid()` / `is_admin()`; anon matches nothing. |

No financial table is public. RLS was **not disabled** anywhere.

## 4. Vendor views

- **19 / 19** `vendor_*` views now have `security_invoker=true` (postcheck G).
- `security_barrier=true` retained where needed.
- Underlying table RLS therefore applies to the caller.
- `vendor_store_orders_select_20261118` and `vendor_store_order_items_select_20261118` exist, isolating stores.
- Grants were preserved; service role still works for background jobs.

## 5. Storage security

- All new buckets use least-privilege policies: admin-only write, public read only where the storefront requires it (`site-banners`, `theme-assets`), owner-only for design uploads, admin-only for `mockup-assets`.
- No bucket was made public merely to simplify upload. See `STORAGE_CONFIGURATION_REPORT.md`.

## 6. Roles tested

Integration tests exercise `anon` and `authenticated` against Local REST; `service_role` used for seeding through the local JWT. Vendor isolation and admin gating are enforced by RLS/ACL and verified in the integration suite (126 tests).

## 7. Residual risks

| Risk | Mitigation |
|---|---|
| 8 `TO public` non-financial policies | Documented; guarded by `is_admin()`/`auth.uid()`. Optional hardening in a future migration. |
| Production ACL may differ from Local snapshot | Run `01_PRECHECK.sql` on Production before deployment and diff. |
| No Staging project | Local validation complete; Staging recommended before Production approval. |
