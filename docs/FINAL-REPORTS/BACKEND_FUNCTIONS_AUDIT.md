# Backend Functions Audit

## 1. Previously missing functions — now present (Local verified)

| Function | Signature | SECURITY DEFINER | ACL | Purpose |
|---|---|---|---|---|
| `initiate_external_wallet_payment` | `(uuid)` → payments row | yes | postgres, authenticated, service_role | Start external-wallet payment |
| `submit_external_wallet_receipt` | `(uuid,text,text,text)` → receipt | yes | postgres, authenticated, service_role | Upload receipt metadata |
| `verify_external_wallet_payment` | `(uuid,boolean,text)` → receipt | yes | postgres, authenticated, service_role | Admin verification |
| `complete_zero_total_order` | `(uuid)` → orders row | yes | postgres, authenticated, service_role | Complete fully-discounted order |
| `creator_publish_product` | `(uuid,jsonb)` → text | no | postgres, service_role | Publish a creator design product |
| `admin_review_creator_submission` | `(uuid,text,text,text,text,text)` → jsonb | no | postgres, service_role | Approve/reject submission |
| `gift_box_assert_components_available` | `(uuid,numeric)` → void | yes | postgres, authenticated, service_role | Validate box stock |

## 2. Critical function fixes

### Double restock
- **Before:** `cancel_order` incremented `product_variants.stock_quantity` inline, then `trg_restock_on_order_cancel` incremented again → 2× restock.
- **After:** `cancel_order` contains no `stock_quantity = stock_quantity + ...` (postcheck D = `false`). The trigger is the single restock authority, including Gift Box components.

### Checkout
- Final `checkout(uuid,jsonb,jsonb,boolean,text,text,numeric,text)` contains:
  - coupon date/type/usage revalidation (`coupon_hardened = true`)
  - server-side shipping validation via `get_shipping_options` (`shipping_hardened = true`)
  - Gift Box component reads (`giftbox_aware = true`)
  - no stale frontend fee comparison (`no_old_fee_check = true`)

### Vendor payout
- `request_vendor_payout` is now **3-arg** `(uuid, numeric, text)` with per-store advisory lock; the 2-arg version was dropped. The API route has a compatibility fallback.
- `approve_vendor_payout_request` copies `payout_method` into the ledger.

### Payment ACL hardening
| Function overload | Before | After |
|---|---|---|
| `confirm_order_payment(uuid,text,text,numeric,jsonb,text)` | PUBLIC + anon + authenticated | postgres + service_role |
| `confirm_order_payment(uuid,text,text,numeric,jsonb)` | PUBLIC + anon + authenticated | postgres + service_role |
| `verify_vodafone_cash_payment(uuid,boolean,text)` | PUBLIC + authenticated | postgres + authenticated + service_role |
| `sync_product_available_colors(uuid)` | PUBLIC + anon + authenticated | postgres + service_role |
| `request_vendor_payout(uuid,numeric,text)` | anon + authenticated | authenticated + service_role |

## 3. ACL matrix (final, Local)

| Function | PUBLIC | anon | authenticated | service_role |
|---|:---:|:---:|:---:|:---:|
| `confirm_order_payment` (both overloads) | ❌ | ❌ | ❌ | ✅ |
| `verify_vodafone_cash_payment` | ❌ | ❌ | ✅ | ✅ |
| `verify_external_wallet_payment` | ❌ | ❌ | ✅ | ✅ |
| `sync_product_available_colors` | ❌ | ❌ | ❌ | ✅ |
| `request_vendor_payout` | ❌ | ❌ | ✅ | ✅ |
| `creator_publish_product` | ❌ | ❌ | ❌ | ✅ |
| `admin_review_creator_submission` | ❌ | ❌ | ❌ | ✅ |
| `gift_box_assert_components_available` | ❌ | ❌ | ✅ | ✅ |
| `add_to_cart` / `update_cart_item_quantity` | ❌ | ✅ (guest cart, by design) | ✅ | ✅ |
| `enforce_gift_box_item_rules` / `enforce_gift_box_registration` | ❌ | ❌ | ❌ | ❌ |

All SECURITY DEFINER functions use `search_path` as defined in the package sources.

## 4. Contract check

`lib/database.types.ts` regenerated from the live Local schema; `npx tsc --noEmit` passes with zero errors. RPC signatures used by the frontend (including the new functions) now match the database exactly.
