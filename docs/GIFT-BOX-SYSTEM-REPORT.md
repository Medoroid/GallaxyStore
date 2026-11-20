# Gift Boxes System Upgrade — Build Report

> Date: 2026-11-17
> Status: **IMPLEMENTED LOCALLY — DATABASE MIGRATION NOT APPLIED.**
> Scope: gift boxes as real product-based bundles composed from catalog products, with
> inventory-safe cart/checkout, historical order snapshots, dual admin creation, and
> customer-facing display. No commits, pushes or deployments were made.

---

## 1. Architecture decisions

- **No second catalog.** A gift box is a normal `products` row (with its own variant, price, images,
  categories and lifecycle) plus a 1:1 `gift_boxes` marker row. Composition lives in
  `gift_box_items`; removing a component deletes only the relationship, never the product.
- **Existing behavior preserved.** Product validation, admin auth, cart/checkout/orders RPCs,
  image upload and i18n are the same ones the rest of the store uses. Nothing in Custom Print,
  theming or payments was modified. The legacy custom-quote flow `/api/gift-box` (writing
  `custom_print_requests`) is untouched.
- **Single source of truth for money and rules.** `lib/gift-box.ts` is shared by admin APIs, public
  APIs and checkout preview; the SQL migration mirrors those rules as constraints/triggers.
- **Graceful pending-schema behavior.** All new APIs detect missing tables (`42P01`) / missing RPC
  (`PGRST202`): admin returns `503 GIFT_BOX_SCHEMA_PENDING`; storefront hides the block or returns
  an empty list. The regular product page is unaffected until the migration is applied.

## 2. Reused tables and APIs (no parallel systems)

| Reused | How it is used |
| --- | --- |
| `products`, `product_variants`, `product_images`, `categories`, `brands`, `stores` | The box itself and every component are ordinary catalog rows; no duplicate catalog. |
| `parseProductPayload`, `syncDefaultVariant`, `reapplyProductAttributes`, `productImageUrlFromPath` (`lib/product-admin`, `lib/products`) | Method 1 creates a box through the *same* validation and persistence path as a normal product. |
| `verifyAdmin`, `getServiceRoleClient`, `handleApiError`, `logger` | Existing admin auth / service-role writes / error envelope. |
| `GET /api/admin/products` | Method 2 picker reuses the products list query; new params are purely additive and default behavior is unchanged. |
| `add_to_cart`, `update_cart_item_quantity`, `merge_guest_cart`, `checkout`, `restock_on_order_cancel` | Same RPCs as normal products, extended locally with gift-box logic (see §5). |
| `orders`, `order_items`, `payments` | Existing order lifecycle; only a new snapshot child table was added. |
| `lib/i18n.ts`, `lib/admin-i18n.ts` | EN/AR keys; storefront reuses the pre-existing `gift_boxes_title` / `gift_boxes_subtitle`. |

## 3. Database changes (local migration only)

Migration: **`supabase/migrations/20261117140000_gift_box_bundles.sql`** (~830 lines).
It was **never applied** to any project; no `supabase db push`, reset, drop, rename or production
write was performed. It is additive: no existing table is dropped, truncated or destructively
altered.

### New tables

1. `gift_boxes` — `product_id uuid PK REFERENCES products(id) ON DELETE CASCADE`, `created_at`.
2. `gift_box_items` — `id`, `gift_box_product_id → gift_boxes ON DELETE CASCADE`,
   `product_id → products ON DELETE CASCADE`, `variant_id → product_variants ON DELETE SET NULL`,
   `quantity` CHECK `1..1000`, `display_order >= 0`, `note <= 500 chars`, `is_active`, timestamps.
   An **expression unique index** on `(gift_box_product_id, product_id,
   coalesce(variant_id, '0000…'::uuid))` blocks duplicate product/variant pairs even when both
   entries have a NULL variant.
3. `order_item_gift_box_contents` — `order_item_id → order_items ON DELETE CASCADE`; plain
   `product_id` / `variant_id` snapshot columns **deliberately have no catalog FK**, so historical
   orders survive later product edits, archives and deletions. Stores frozen name, variant options,
   unit price, quantity and display order.

### Triggers / functions / security

- Timestamp triggers on the new tables.
- `guard_gift_box_item_rules` and `guard_gift_box_registration` enforce: no self-reference
  (`A gift box cannot contain itself`), no nesting in either direction
  (`Gift boxes cannot be nested inside other gift boxes` / `This product is already a component
  of another gift box and cannot become a gift box itself`).
- `gift_box_assert_components_available(uuid, integer)` — read-only advisory check using
  `stock_quantity - reserved_quantity` and `component_qty × box_qty`; no row locks. Execute is
  revoked from `public, anon` and granted only to `authenticated, service_role`.
- `add_to_cart`, `update_cart_item_quantity`, `merge_guest_cart` — live definitions re-declared
  with the advisory check inserted; all pre-existing behavior retained verbatim.
- `checkout()` — re-declared with one ascending `FOR UPDATE` pass over the union of line and
  component variants, aggregate component validation, component decrement
  (`stock_quantity - (gbi.quantity * v_item.quantity)`) and snapshot insertion in the **same
  transaction** as the order.
- `restock_on_order_cancel` — component restock (`sum(gbi.quantity * oi.quantity)`) added to
  the existing cancellation trigger only. Components are never restocked elsewhere.
- RLS enabled on all three tables: public read of *published + visible + not deleted* boxes and
  their items (`anon, authenticated`), owner-or-admin read of snapshots (`authenticated`); all
  writes remain service-role only.

## 4. Admin creation methods and UI

- **Method 1 — embed-create:** `POST /api/admin/products {action:"create"}` (same validation as a
  normal product; returns `{success:true, product_id}` 201) → images upload/reorder endpoints →
  `POST /api/admin/gift-boxes {action:"create_box"}`. If the marker insert fails, the created
  product is deleted again (no unregistered box).
- **Method 2 — pick existing:** `GET /api/admin/products?q=&category_id=&status=&availability=
  &exclude_boxes=&limit=` (sanitizes `[,()'%\]` from `q`; `exclude_boxes` hides registered boxes;
  `42P01` → no exclusions). Response adds `variants[]` (with `sku`) alongside `default_variant`.
  Then `add_item` with product, variant, quantity, note, display order and `is_active`.
- `POST /api/admin/gift-boxes` also supports `update_box`, `update_item`, `remove_item` and
  `reorder_items`; limits and duplicate/self/nesting guards are validated in `lib/gift-box.ts`
  before any write, with DB constraints as the final authority.
- `app/admin/gift-boxes/page.tsx`: list/edit, box product form, image management, product picker,
  3-step new-product modal, contents table (qty, note, variant, reorder, toggle, remove) and a
  **live preview** computed from real prices (`computeContentsValue`) — savings never fabricated.
- Navigation entry (`nav.giftBoxes`) and ~90 `giftbox.*` EN/AR keys added.

## 5. Inventory and snapshot semantics

- **Cart-time (advisory):** adding/updating/merging a box line checks each active component's
  available stock (`stock − reserved`) against `component_qty × box_qty`. No locks; a failure
  produces a clear error before checkout.
- **Checkout (authoritative):** every touched variant (box lines + components) is locked in one
  ascending pass to avoid deadlocks; aggregate validation uses `stock_quantity` semantics;
  component stock is decremented once, by `component_qty × box_qty`, and the composition is
  frozen into `order_item_gift_box_contents` in the same transaction.
- **Restock:** components are restored only by the cancellation trigger, exactly once per
  cancellation. A pre-existing double **line** restock in `cancel_order()` (inline + trigger) is
  documented and intentionally left untouched (unrelated behavior).
- **Unavailability:** archived/deleted products, inactive/deleted variants or insufficient stock
  block purchase. Hidden/draft components remain purchasable inside a box but are shown without a
  link. No nesting in either direction.

## 6. Customer-facing behavior

- `app/components/GiftBoxContents.tsx` on product details: server-provided contents, real unit
  prices, quantity, variant label, note, out-of-stock badge, hidden-component notice, value and
  savings; hidden components render as text without an `href`; mixed currency shows `—` instead of
  invented savings. Non-box products and pending schema render nothing.
- `app/components/GiftBoxesGrid.tsx` on `/gift-boxes`: published boxes, real prices, savings badge,
  item count, loading/empty/error+retry states; the existing header and `CustomSelect` remain.
- `app/components/GiftBoxOrderContents.tsx` on `/orders/[id]`: frozen snapshot rows (name, options,
  qty, price). `GET /api/orders/[id]` attaches `gift_box_contents` to every line; `42P01` (pending
  migration) or any other snapshot error is non-fatal and logged.
- New storefront i18n keys (`gift_box_*`) in EN/AR; `t()` has no interpolation, so counts use
  `.replace("{n}", …)`.

## 7. Tests and verification gates

New test files (all green):

| File | Coverage |
| --- | --- |
| `__tests__/gift-box-logic.test.ts` | validation bounds, self/nesting/duplicates, money math, stock math, public-access rule |
| `__tests__/gift-box-migration.test.ts` | static SQL structure: tables, FK directions, checks, unique index, RLS, RPC wiring, atomic checkout, single restock path |
| `__tests__/admin-gift-boxes-contract.test.ts` | auth-first, 503 schema-pending, create/update/add/remove/reorder, rollback, real validation |
| `__tests__/admin-products-picker-filter.test.ts` | backward compatibility, sanitized `q`, category/status/availability/limit/exclude_boxes |
| `__tests__/gift-boxes-public-api.test.ts` | list/detail gates, computed value/savings, link gating, stock, graceful degradation |
| `__tests__/order-gift-box-contents-contract.test.ts` | snapshot attachment, empty shape, 42P01 and non-fatal errors |
| `__tests__/gift-box-contents-component.test.tsx` | loading/error/retry, hidden-vs-linked rows, real prices, `—` for mixed currency |
| `__tests__/gift-boxes-grid-component.test.tsx` | loading/empty/error/retry, prices, savings badge, links |
| `__tests__/gift-box-checkout.integration.test.ts` | env-gated live-DB invariants (advisory RPC, 23505, triggers, lifecycle, RLS) — self-skips while the migration is absent |

Results:

- `npx tsc --noEmit` — **exit 0**.
- `npm run lint` — **0 errors**, 46 warnings (baseline 0/36; the extra warnings are the existing
  `react-hooks/set-state-in-effect` pattern used by the new data-loading components).
- `npx jest` — **92 suites / 1450 tests passed**, 0 failures.
- `npx next build` — **exit 0**; `/admin/gift-boxes`, `/gift-boxes`, `/api/admin/gift-boxes`,
  `/api/gift-boxes`, `/api/gift-boxes/[id]` all present in the route table.

## 8. Limitations / honest status

- **No live DB verification.** The migration is not applied (confirmed: the three tables do not
  exist on the connected project), so cart → checkout → restock behavior is proven only by static
  structure tests, unit/contract tests and code review. Run the integration suite after the
  migration is applied to close this gap.
- **Approval gate remains.** The SQL must be pasted and run manually in the Supabase Dashboard SQL
  editor by a human. The MCP connection is read-only (`supabase_read_only_user`) permanently; no
  production writes, pushes, deploys or commits were made for this feature.
- Pending schema degrades behavior by design: admin gift-box pages return `503`, storefront hides
  contents / lists no boxes. This is intentional, not a failure.
- A box can hold at most 50 components; each component quantity is 1–1000 and notes are ≤500 chars.
- Cross-currency compositions display no value/savings (never fabricated).
- Nesting is forbidden by design; hidden/draft components are purchasable inside a box but never
  linked on the storefront.
- The pre-existing duplicate line restock in `cancel_order()` was not changed (unrelated to boxes).
- The separate Arabic final report and the pending theme/content migrations approval remain
  out of scope for this document.

## 9. Applying the migration (human action only)

1. Open the Supabase Dashboard → SQL Editor for the **approved test/staging project first**.
2. Paste the entire contents of `supabase/migrations/20261117140000_gift_box_bundles.sql` and run
   as one script. **Do not use `supabase db push`** (legacy files outside the CLI history could be
   re-applied); do not reset, drop or rename anything.
3. Verify with `npm run test:integration` against a dedicated test project, then spot-check a real
   cart → checkout → cancel cycle and the order snapshot.
4. Reversal (only with approval): drop the three new tables (snapshot first), then restore the
   original definitions of `add_to_cart`, `update_cart_item_quantity`, `merge_guest_cart`,
   `checkout` and `restock_on_order_cancel` from the source migrations listed in the file header.
   No existing data is deleted by reversal except the new snapshots.
