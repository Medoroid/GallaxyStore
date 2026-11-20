# Customer Custom Print Studio — Build Report

> Date: 2026-11-16 · Status: **PARTIAL IMPLEMENTATION — see §5 for exact status categories.**
> Scope: customer-focused custom printing inside Galaxy Store. No creator accounts, roles,
> dashboards, profiles, marketplace, monetization, or second checkout.

## 1. Architecture decisions

- Single store owner; customers are ordinary authenticated buyers.
- Reused: `user_designs` / `design_versions` / `design_files` (artwork + editor snapshot), existing
  `products` / `product_variants`, `product_customizations`, `add_to_cart`, `checkout` RPC, cart,
  orders, payments, admin auth (`verifyAdmin`) and i18n.
- New local migration: `supabase/migrations/20261116130000_custom_print_studio.sql`
  (`mockup_templates`, `shared_designs`, `design_versions.editor_state`, enum values). **Not applied.**
- No new cart/order columns: the existing `product_customizations.customization_id` bridge carries
  the full print configuration into `order_items` via the existing `checkout` RPC.
- The three old untracked Creator Studio migrations were left in place (no deletion without approval)
  and are **superseded** by the new customer-only migration — they must NOT be applied.

## 2. Implemented and tested

| Deliverable | Evidence |
|---|---|
| Layered mockup library: 10 product templates (incl. oversized tee + sticker), print masks, fabric/ceramic/paper textures, shadows, highlights, per-view perspective, tokenised colours, strict input validation | `lib/mockup-library/{types,templates,compose}.ts`; `__tests__/mockup-library.test.ts` — **13 tests green** |
| Original assets + licensing inventory | `docs/MOCKUP-ASSET-LICENSES.md` — no third-party files; external research blocked (401/cancelled), original CC0 vectors used per the stated fallback rule |
| Customer studio UI: product/colour/size/view selection, drag-drop upload with magic-byte validation, placement editor (move/resize/rotate/align/undo/redo), live layered mockup preview, print-quality warnings, private save, add-to-cart, opt-in sharing checkbox | `app/custom-print/page.tsx`, `app/components/custom-print/CustomPrintStudio.tsx` |
| Server route: ownership-checked design → `product_customizations` (full config snapshot) → existing `add_to_cart` RPC; optional `shared_designs` row only when opted in | `app/api/custom-print/cart/route.js` |
| Admin review + template activation/store-product linking inside existing admin shell | `app/api/admin/custom-print/route.js`, `app/admin/custom-print/page.tsx`, `app/admin/layout.tsx` |
| Public gallery of approved shared designs only (RLS-gated) | `app/designs/page.tsx`, Navbar link, i18n EN/AR |
| TypeScript | `npx tsc --noEmit` = **0 errors** |

## 3. Implemented but awaiting database migration

- Saving a design (`/api/designs`) requires `design_versions.editor_state` — added in the local
  migration, not applied.
- The cart route requires `mockup_templates` (with `store_product_id` / `store_variant_id` mapping to
  a real catalog product) and `shared_designs` — local migration, not applied.
- Admin queue and public gallery require `shared_designs` — local migration, not applied.
- Until applied, those routes answer honestly (`503 MIGRATION_REQUIRED` naming the SQL file, or a
  clear "product not configured" 409); **no simulated success**.

## 4. Blocked by missing credentials / external configuration

- **Fulfilment/production:** no real print-provider integration or stock configuration exists. Per the
  business rule, `checkout` re-prices from variants and decrements stock; a template must be linked to
  a real, in-stock product before an order can be placed. The pre-existing quote workflow remains for
  unsupported items.
- **External mockup assets:** web search cancelled and direct licence page returned 401 — no external
  PSD/PNG could be licence-verified, so original vectors were used. Documented in the licence inventory.
- **Staging:** no isolated Supabase branch exists; migrations cannot be applied or live-tested.

## 5. Not implemented

- Automated e2e of the full **checkout** journey (blocked by §4: migration + product mapping);
  preview-only e2e specs are written.
- Deletion/cleanup of the old creator-specific code (requires explicit approval per the safety rules).
- Visual drag-to-draw mask editor (the current editor uses validated JSON/numeric fields).

## 6. Verification commands

```
npx tsc --noEmit        # 0
npm run lint            # 0 errors, 38 warnings (legacy + house effect pattern)
npm test                # 82 suites / 1301 tests — all green
npm run build           # BUILD=0 (after the Next.js security-advisory retry gate)
```

## 7. Phase status

| Phase | Status |
|---|---|
| 1 Architecture audit | Done — `docs/CUSTOM-PRINTING-SCOPE-ASSESSMENT.md` |
| 2 Asset acquisition/licensing | Done (original vectors + inventory; external research blocked) |
| 3 Mockup engine | Done and tested |
| 4 Customer editor | Implemented; live DB path awaits migration |
| 5 Cart/order integration | Implemented against existing RPCs; awaits migration + product mapping |
| 6 Optional sharing | Implemented; awaits migration |
| 7 Admin management | Implemented — full template CRUD, JSON geometry editor, preview-before-publish, asset upload, moderation (§5 for remaining visual mask editor) |
| 8 Tests/docs | Implemented — contract/e2e suites + three required docs; full checkout e2e blocked by §4 |
