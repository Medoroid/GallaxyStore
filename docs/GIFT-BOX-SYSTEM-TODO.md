# Gift Boxes System — Remaining Work

> Companion to `docs/GIFT-BOX-SYSTEM-REPORT.md`. Updated 2026-11-17.
> Nothing here claims live-database or production verification: the migration is local-only.

## Status legend

- **DONE** — implemented locally and covered by tests/gates.
- **BLOCKED** — requires explicit human approval or an external action.
- **TODO** — optional follow-up, not required for the current scope.
- **NON-GOAL** — intentionally out of scope.

## DONE (local implementation)

- [x] Architecture: box = a real `products` row + 1:1 `gift_boxes` marker; no second catalog.
- [x] Local migration file with 3 tables, expression unique index, checks, triggers, RLS/grants,
      advisory availability RPC, redefined cart/checkout RPCs and cancellation restock.
- [x] Admin composition API (`create_box`, `update_box`, `add_item`, `update_item`, `remove_item`,
      `reorder_items`) with shared validation, rollback and schema-pending handling.
- [x] Method 1 (embed-create product through normal product validation) + images endpoints.
- [x] Method 2 (picker on existing products): additive filters, sanitized search, `variants[]`
      with `sku`, `exclude_boxes`, backward-compatible defaults.
- [x] Inventory: advisory cart check (no locks) + atomic checkout with one ascending lock pass,
      component decrement `component_qty × box_qty`, single restock path on cancellation.
- [x] Frozen order composition snapshot (`order_item_gift_box_contents`, no catalog FK) attached
      to order responses with non-fatal degradation.
- [x] Customer UI: `/gift-boxes` grid, product-page contents block, order-page contents; real
      prices/savings only; hidden components without links; loading/error/retry states.
- [x] Admin UI: list/edit, picker, 3-step new-product modal, images, contents table, live preview.
- [x] EN/AR i18n for admin and storefront (reused pre-existing page-title keys).
- [x] 9 test files; full gates green: `tsc` 0, ESLint 0 errors, Jest 92/1450, `next build` 0.
- [x] No commits, pushes, deploys or production writes; no destructive git commands; all
      pre-existing uncommitted work preserved; Custom Print / theme / payment untouched.

## BLOCKED — waiting on approval (the critical path)

- [ ] **Apply the migration manually** (once, on an approved test/staging project first):
      `supabase/migrations/20261117140000_gift_box_bundles.sql` — paste as one script in the
      Supabase Dashboard SQL Editor. The MCP connection is read-only forever; the agent cannot do
      this. **Never `supabase db push`, no reset/drop/rename.** The connected project currently
      has none of the three tables (verified by read-only query).
- [ ] Pending package approvals from other tracks (theme/content 2-pending migrations) remain
      separate from this feature; keep them out of the gift-box SQL script.

## TODO — verification after the migration is applied

- [ ] Run `npm run test:integration` against a **dedicated test project**; the new
      `__tests__/gift-box-checkout.integration.test.ts` will stop self-skipping and verify:
      1. advisory RPC accepts sufficient stock and rejects `component_qty × box_qty` overflow,
      2. unique index rejects duplicates including NULL variants (`23505`),
      3. nesting triggers in both directions + self-reference (`P0001`),
      4. variant delete → membership survives with `variant_id = null`; product delete →
         relationship cascades away; the box product itself is never deleted,
      5. RLS: anon reads published boxes only and can never write,
      6. relationship-only cleanup leaves catalog rows intact.
- [ ] Live cart → checkout E2E with a real user: confirm component stock decrements exactly once
      per ordered unit and that the snapshot row appears with the right line id.
- [ ] Cancel that order: confirm components are restocked exactly once (and note the pre-existing
      double *line* restock, which this feature deliberately does not change).
- [ ] Run the admin flow against the applied schema: Method 1 + Method 2, image upload, reorder,
      active toggle, removal, and box publish; check `/gift-boxes` and `/orders/[id]` rendering.
- [ ] Re-run all four gates (tsc / ESLint / Jest / build) after the schema exists — the
      schema-pending branches will then be inactive and must not regress.

## TODO — optional enhancements (not required now)

- [ ] Box-level stock policy: current box stock is independent of components; boxes may be
      purchasable only while all components are available (checkout enforces this). If the business
      needs a derived box stock display, add it as a separate, documented rule.
- [ ] Multi-currency boxes: display is intentionally `—` when component currencies differ; full
      FX conversion would need an authoritative rate source.
- [ ] Bulk composition import/export for admins (currently one component at a time).
- [ ] Optional support for nested boxes — explicitly forbidden today by DB triggers in both
      directions; would require a schema and UX redesign.
- [ ] Local Docker Supabase stack was down during this work; bring it up to rehearse the SQL
      before asking for production approval (never apply to production for rehearsal).

## NON-GOALS / guardrails (keep these true)

- No commit, push, deploy, or production write for this feature without a new explicit request.
- No `supabase db push`, reset, drop, rename or truncation of existing tables.
- Do not delete or weaken any test; do not touch unrelated Custom Print, theme or payment code.
- Do not modify the legacy `/api/gift-box` custom-quote flow (`custom_print_requests`).
- Preserve all pre-existing uncommitted changes and other users' untracked files.
- Do not treat the Arabic final report or other pending approvals as part of this deliverable.

## Reversal (only with explicit approval, after applying)

1. Drop `order_item_gift_box_contents`, then `gift_box_items`, then `gift_boxes` (the three new
   tables only). No existing table is dropped.
2. Restore the original definitions of `add_to_cart`, `update_cart_item_quantity`,
   `merge_guest_cart`, `checkout` and `restock_on_order_cancel` from the source migrations
   (`20260910`, `20261023`, `20261030` and the archived `20260913` trigger file), as listed in the
   migration header comment.
3. The application code self-degrades on `42P01` (admin `503 GIFT_BOX_SCHEMA_PENDING`, storefront
   hides the feature), so no emergency code rollback is required.
