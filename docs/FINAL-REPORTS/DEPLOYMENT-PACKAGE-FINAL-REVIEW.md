# Deployment Package — Final Review (R1 closed)

Date: 2026-11-18 · Package: `supabase/manual-apply/production-deployment/` · Target: `httywgkwfqvrbuwuzutu`

**No production DDL/DML, no permission change, no migration was executed by the agent.** All work was local file editing, local Supabase testing, and read-only inspection.

## 1. Answers

| Question | Answer |
|---|---|
| **هل الحزمة جاهزة للتنفيذ؟** | **نعم، تقنياً** بعد إغلاق R1 وإصلاح R2–R5. ما زالت **غير مُنفَّذة** وتنتظر موافقة بشرية ونسخة احتياطية. لا أُعلن نجاحاً قبل التنفيذ والتحقق. |
| **هل يمكن تنفيذ المجموعات الثلاث بالترتيب؟** | نعم، وفق الترتيب المحدّث في `FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md` القسم C — 22 ملفاً، آخرها `20261118140000_unify_checkout_hardening_with_gift_boxes.sql`. |
| **الخطوات البشرية المطلوبة** | نسخة احتياطية كاملة (schema + data + storage) ← تشغيل `01_PRECHECK.sql` وحفظ مخرجاته ← لصق كل ملف على حدة في SQL Editor ← `02_POSTCHECK.sql` بعد كل مجموعة ← توثيق النتائج ← قرار CLI اختيارياً. |
| **المخاطر المانعة للتنفيذ** | لم يبق مانع تقني معروف. تبقى عمليات بيانات محدودة (`UPDATE orders.payment_method`, `UPDATE products.available_sizes`) وتغييرات ACL/Bucket/Views قابلة للعكس بالنسخة الاحتياطية، وتتطلب قراراً بشرياً. |
| **الملفات المطلوب نسخها إلى SQL Editor** | `01_PRECHECK.sql` + 22 ملف migration بالترتيب + `02_POSTCHECK.sql` (بعد كل مجموعة) + `03_ROLLBACK.sql` للقراءة فقط. |

## 2. Package integrity (verified)

| File | Status |
|---|---|
| `00_MANIFEST.md` | Present — safety rules, paste order, execution methods |
| `01_PRECHECK.sql` | Present — read-only snapshot; improved with function-definition + row-count captures |
| `02_POSTCHECK.sql` | Present — read-only verification; now also asserts final `checkout()` markers |
| `03_ROLLBACK.sql` | Present — human-gated, all statements commented |
| `deploy.ps1` | Present — dry-run by default; parse bug fixed |

**22 referenced migration files exist and are non-empty.** The ordered list in `FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md` and `deploy.ps1` contain the same 22 filenames in the same order (Compare-Object mismatch = 0). The package does not store duplicate copies of SQL; `deploy.ps1` references `supabase/migrations/` directly. Excluded files (`20260000000000`, `20260000000002`, `20261118100000`, `20261118110000`, `20261118115000`, baseline/bundle/archived files) are absent from `deploy.ps1`.

Dry run was executed locally: exit **0**, output lists 22 files and ends with `No production operation performed (missing -ConfirmProduction).` The only `npx supabase db query` call is after the confirmation guard.

PRECHECK / POSTCHECK / ROLLBACK were executed against the **local** Supabase stack with `ON_ERROR_STOP=1`: all exit 0 (ROLLBACK is fully commented).

## 3. R1 — root cause and fix

### Cause
- `20261030000001_checkout_coupon_shipping_hardening.sql` defines a hardened `checkout()`: validates `coupon.starts_at/expires_at/type/value/max_uses/max_uses_per_user`, recomputes `v_discount`, and verifies `p_shipping_fee` against `get_shipping_options()`.
- `20261117140000_gift_box_bundles.sql` later redefines `checkout()` with gift-box locking/stock/snapshot logic, but trusts `cart.discount_amount` and only checks `shipping_rates.base_fee` — silently dropping the hardening.
- The hardened version has zero gift-box logic, so simply swapping the order would break Gift Boxes.

### Fix applied
New file **`supabase/migrations/20261118140000_unify_checkout_hardening_with_gift_boxes.sql`** (375 lines) is the single final `checkout()` definition in the deploy list:
- Keeps all gift-box logic: `v_lock_ids`, ascending lock pass, component stock validation, `gift_box_items` / `order_item_gift_box_contents` snapshots.
- Keeps all hardening: `starts_at`, `expires_at`, `max_uses`, `min_order_amount`, `type`, `value`, `max_uses_per_user`, recomputed `v_discount`, and `get_shipping_options()` fee check.
- Order insert uses `v_discount`, `v_coupon_id`, `v_coupon_code` instead of trusting the cart.
- Repeats the hardened ACL: `REVOKE ... FROM public, anon; GRANT ... TO authenticated, service_role`.
- `20261030000001` remains in the repository as history but is **not deployed**, so only one checkout version is applied.

### Evidence (local checks)
- `gift_box_items` occurrences in final function: 5; `get_shipping_options`: 4; `v_coupon.starts_at > now()`: 2.
- Old weak patterns: `round(base_fee, 2) = round(p_shipping_fee, 2)` → **0**; `coalesce(v_cart.discount_amount` → **0**.
- POSTCHECK now asserts all four properties (`coupon_hardened`, `shipping_hardened`, `giftbox_aware`, `no_old_fee_check`).

## 4. Other fixes closed during the earlier review (R2–R5)

| ID | Status |
|---|---|
| R2 | `20261117170000` no longer revokes `authenticated` from `verify_vodafone_cash_payment`; it re-grants `authenticated, service_role`. |
| R3 | Explicit `begin/commit` removed from `20261117150000`, `20261117160000`, `20261117170000` (SQL Editor safety). |
| R4 | POSTCHECK uses correct `creator_publish_product(uuid, jsonb)` and verifies `gift_box` through the CHECK constraint, not a non-existent enum. |
| R5 | `deploy.ps1` parse error fixed; dry run verified. |

## 5. Final execution order (22 files)

Groups and full order are maintained in `docs/FINAL-REPORTS/FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md` §C. Last entries:

```
15. 20261117130000_revoke_public_security_definer_execute.sql
16. 20261117140000_gift_box_bundles.sql
17. 20261117150000_fix_cancel_order_double_restock.sql
18. 20261117160000_vendor_payout_method.sql
19. 20261117170000_harden_financial_rls.sql
20. 20261118120000_fix_vendor_views_security_invoker.sql
21. 20261118130000_vendor_order_rls.sql
22. 20261118140000_unify_checkout_hardening_with_gift_boxes.sql   <-- final checkout
```

## 6. Human command for SQL Editor

Open Supabase SQL Editor for `httywgkwfqvrbuwuzutu` (runs as `postgres`) and paste, one at a time:

1. `supabase/manual-apply/production-deployment/01_PRECHECK.sql` — save output.
2. Each of the 22 files listed in §C of `FINAL-PRODUCTION-DATABASE-DEPLOYMENT.md`, in order.
3. `supabase/manual-apply/production-deployment/02_POSTCHECK.sql` after each group and at the end.
4. `03_ROLLBACK.sql` — read only, do not execute.

Optional CLI (only with human-approved credentials): dry run with
`powershell -File supabase/manual-apply/production-deployment/deploy.ps1`; real run adds `-ConfirmProduction` with `SUPABASE_ACCESS_TOKEN` set from an approved secret store.

## 7. Status

**R1 CLOSED locally. Package technically ready. Production deployment NOT executed and NOT verified.**
