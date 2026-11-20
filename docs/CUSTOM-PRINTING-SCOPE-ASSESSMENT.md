# Customer Custom Printing — Scope Correction Assessment

> Date: 2026-11-16 · Status: **ASSESSMENT ONLY — NO CODE, SCHEMA OR DATA CHANGES MADE**
> Supersedes the Creator Marketplace interpretation in `docs/CREATOR-STUDIO-FINAL-REPORT.md`.
> Target: a customer-focused Custom Printing flow inside Galaxy Store with **optional** public
> design sharing. No creator accounts, dashboards, profiles, marketplace, or second checkout.

---

## 1. Current architecture assessment

Three independent subsystems exist today. Two are live; one is code-complete but inert.

| Subsystem | Live? | What it does | Key assets |
|---|---|---|---|
| **A. Custom-print quote flow** | **Live** | `/custom-print` form → uploads one file → creates a quote request. Explicitly *not* an order; admin replies by email. | `app/custom-print/page.tsx`, `app/api/custom-print/route.js`, `app/api/admin/custom-prints/route.js`, `app/api/gift-box/route.js`, `supabase/migrations/20261024_custom_print_requests.sql` (`custom_print_requests` table), private `custom-print-designs` bucket (10 MB) |
| **B. Creator Design Studio (Phases 1–10)** | **No** — 3 migrations untracked and never applied anywhere | Upload + full artwork editor + 8-template mockup engine + multi-product config + publish/approval + creator marketplace UI. | 4 new tables, 2 RPCs, 2 buckets/policies, 13 API routes, 6 pages, 15 components, 20 libs, 23 test suites (516 tests) |
| **C. Galaxy Store commerce** | **Live** | Products/variants → cart → `checkout` RPC → orders/payments/admin/vendor. | `product_customizations` + `cart_items.customization_id` + `order_items.customization_id` bridge (see §4.2) |

### 1.1 State of the Creator Studio database work

`git ls-files supabase/migrations/` contains **no** creator-studio file; `git status` shows all three as untracked:

```
?? supabase/migrations/20261110120000_creator_studio_core.sql
?? supabase/migrations/20261110160000_creator_studio_template_seed.sql
?? supabase/migrations/20261110170000_creator_studio_publish_functions.sql
```

No Staging project exists (`list_branches = []`), CLI is linked to production, and the standing rules forbid
pushing. **Consequence: zero live rows exist in `creator_profiles`, `creator_product_templates`,
`creator_design_products` or `creator_gallery_items`.** There is no production data to migrate or delete
for these four tables. They can be rewritten locally before they ever land.

Live objects that DO exist and must be preserved untouched: `design-uploads` bucket (original artwork files),
`design_files` / `design_versions` / `user_designs` rows, and `custom_print_requests` rows.

### 1.2 Where the old studio became creator-specific

- `creator_profiles` exists **only** to back `/creators/[username]` and the "Designed by" attribution.
  It is referenced by:
  - `creator_design_products.creator_profile_id` — **NOT NULL**, `ON DELETE CASCADE`
  - `creator_gallery_items.creator_profile_id` — nullable, `ON DELETE SET NULL`
  - `creator_publish_product()` — reads `v_profile.can_publish` and rejects if false/absent
  - `fetchProductAttribution()` in `lib/products.ts` — selects `creator_profiles(username, display_name, avatar_url)`
- Routes `mockups`, `products`, `products/[rowId]`, `publish` each resolve `creator_profiles` with the
  caller's user id before writing `creator_profile_id`.
- Product-detail UI links attribution to `/creators/[username]` and renders "More by this creator" /
  "View creator profile" (`app/product-details/[id]/productDetailsClient.jsx:455-463,732-747`).
- Navbar has `/creators` (`app/components/Navbar.tsx:132`); admin has `/admin/creators` with a
  **Creators** tab and 86 `creators.*` i18n keys.
- `app/studio/page.tsx:275` links to the `/creator` dashboard.
- `lib/creator/api.ts` is **generic** despite its folder name (`requireUser`, `isMissingRelation`,
  `migrationRequiredResponse`) — only its error message names Creator Studio.

### 1.3 Verified baseline

Immediately before this assessment: `npx tsc --noEmit` = 0, `npm run lint` = 0 errors / 36 legacy warnings,
`npm test` = **78 suites / 1257 tests green**, `npm run build` = 0. No files were changed by this audit.

---

## 2. Reusable components (keep; rename concepts only)

Everything below is customer-agnostic machinery — it has no creator-account dependency beyond comments,
type names, or a `creator_profile_id` field.

### 2.1 Upload, validation, storage — reusable as-is
| Asset | Note |
|---|---|
| `lib/design-studio/validate.ts`, `svg-sanitize.ts` | magic-byte checks, 50 MB / SVG 2 MB, 200–10000 px, transparency/DPI warnings, server-side SVG sanitization |
| `lib/design-studio/server.ts` | migration guard, SHA-256, private storage paths |
| `app/api/designs/route.js`, `app/api/designs/[id]/route.js`, `app/api/designs/[id]/artwork/route.js` | only import generic `requireUser`; no creator-profile lookup |
| `app/components/studio/Dropzone.tsx`, `DesignCard.tsx`, `ConfirmDialog.tsx`, `StatusBadge.tsx` | generic UI |
| `design-uploads` (private, originals) + `design-previews` (public mockups) buckets and their RLS policies | keep; do **not** delete existing objects |

### 2.2 Editor — reusable as-is
| Asset | Note |
|---|---|
| `lib/design-studio/{types,placement,history,editor-state}.ts` | move/resize/rotate/align, printable-area math, aspect lock, undo/redo, zoom, multi-view state |
| `app/components/studio/{ArtworkCanvas,TransformControls}.tsx`, `app/studio/[designId]/page.tsx` | desktop/mobile editor incl. bottom action bar |
| `design_versions.editor_state jsonb` column (in core SQL) | history/resume — keep exactly as written |
| `design_file_format` + `jpg`/`webp` enum values | keep |

### 2.3 Mockup engine — reusable as-is (rename table reference)
| Asset | Note |
|---|---|
| `lib/design-studio/templates/index.ts` + `20261110160000` seed | 8 product types with purpose-built transparent print layers, views, colors, sizes (no naive photo overlay) |
| `lib/design-studio/{mockup,mockup-hash,render}.ts`, `app/components/studio/MockupPreview.tsx`, `app/api/designs/[id]/mockups/route.js` | cached persisted mockups, config hashing, lazy generation |
| `mockups/<designId>/<templateKey>/<view>-<color>-<hash>.png` | keep path convention |

### 2.4 Product configuration + approval — reusable after small edits
| Asset | Edit needed |
|---|---|
| `lib/design-studio/product-input.ts`, `app/components/studio/{ProductCatalog,ProductConfigCard}.tsx`, `app/api/designs/[id]/products/route.js`, `[rowId]/route.js` | replace `creator_profile_id` with design-owner id; keep fulfillment/stock boundary |
| `lib/design-studio/publish-input.ts`, `PublishDialog.tsx`, `app/api/designs/[id]/publish/route.js` | add **opt-in share checkbox (default OFF)**; drop creator-profile gate |
| `admin_review_creator_submission()` RPC | rename; drop creator references; keep hidden-draft → approved/rejected transaction + audit |
| RLS pattern (SELECT-only + service-role mutations) and `admin_audit_log` writes | unchanged |
| `lib/creator/api.ts` | move/rename to a neutral `lib/custom-print/api.ts`; update 503 message with new SQL filename |
| `lib/design-studio/{design-input,error-codes}.ts` | comments/error name only (`creator_profile_required`) |
| Tests: `design-studio-{editor-state,history,mockup,placement,svg-sanitize,validate}`, `marketplace-commerce-regression`, `designs-api-contract`, `mockups-api-contract`, `products-api-contract`, `publish-api-contract` (latter four after contract edits) | keep/update |

### 2.5 Existing custom-print quote flow — keep as fallback
`custom_print_requests` + `/api/custom-print` + admin queue already serve unsupported item types
(e.g. `gift_box`) and customers who want a quote rather than immediate checkout. Recommend keeping it
and routing only supported print products through the new cart path (open decision, §6).

---

## 3. Unnecessary components (removal CANDIDATES — nothing deleted in this phase)

| Area | Candidates | Reason |
|---|---|---|
| Table | `creator_profiles` (core SQL §3, its trigger, RLS policy, grants, preflight) | exists solely for creator accounts/profiles/marketplace attribution |
| Columns | `creator_design_products.creator_profile_id` (NOT NULL), `creator_gallery_items.creator_profile_id` | replace with owner linkage already present (`user_designs.owner_id`, `profiles.id`) |
| RPC logic | `creator_publish_product()` preflight + `v_profile.can_publish` read | no creator roles/permissions in target scope |
| API routes | `/api/creator/profile`, `/api/creator/dashboard`, `/api/creators/[username]`, `/api/creators/[username]/content` | creator account + public profile APIs |
| Pages | `/creator` (dashboard), `/creators` (directory), `/creators/[username]` (profile) | explicitly out of scope |
| Components | `CreatorProfileView`, `CreatorsDirectoryView`, `CreatorsUnavailable` (rewrite as generic "sharing unavailable"), `GalleryCover`/`GalleryItemCard` (keep, strip creator links) | marketplace UI |
| Admin UI | **Creators** tab of `/admin/creators`, per-creator stats/feature/can-publish toggles | creator management; keep the **submission queue** and **print templates** tabs, renamed |
| Nav/i18n | Navbar `/creators` link, `nav_creators`, `attribution_more_by`, `attribution_visit_profile`, ~86 `creators.*` admin keys | creator vocabulary |
| Product detail | "More by this creator" and "View creator profile" blocks/links | marketplace cross-links |
| Tests | `creator-api-contract`, `creator-directory-contract`, `creator-profile-validation`, `creators-directory-page`, `admin-creators-contract` (creator-management portion), migration-guard filename assertions | test creator-only behaviour |
| Studio home | `/creator` dashboard link in `app/studio/page.tsx:275` | creator dashboard entry |

**Data-impact analysis:** no live rows in the four creator tables (§1.1); no data loss from dropping them.
The `design-uploads` bucket and `custom_print_requests` are live with real data and are **not** in this list.

---

## 4. Database and order integration plan

### 4.1 Rework the three untracked SQL files locally (after approval)

Because they are untracked and unapplied, **edit them in place** — no `DROP TABLE` / repair migration needed.

| Current | Proposed | Change |
|---|---|---|
| `creator_profiles` | — | remove table, trigger, RLS, grants, preflight |
| `creator_product_templates` | `custom_print_templates` | pure rename; seed SQL updated |
| `creator_design_products` | `custom_print_products` | rename; `creator_profile_id` → `owner_id uuid not null references profiles(id)`; keep `design_id`, `template_id`, `view_states`, `mockups`, `status`, `product_id`, `fulfillment_mode`, `stock_buffer`, soft delete, unique `(design_id, template_id)`, RLS |
| `creator_gallery_items` | `shared_design_items` | rename; drop `creator_profile_id`; keep `owner_id`, `design_id`, `title`, `preview_path`, `visibility`, `status`, `product_id`; add `author_display_name text` so public attribution needs **no public profile table** |
| `creator_publish_product()` | `publish_custom_print_product()` | remove profile lookup/`can_publish`; keep draft-hidden product + variant + mockup images + idempotent resubmit |
| `admin_review_creator_submission()` | `admin_review_custom_print_submission()` | keep product/gallery targets, actor params and audit; rename actions/entity types |
| `20261110120000_…core.sql` | rename file to match new date/name | update every migration-guard test and 503 message |

Keep: `design_versions.editor_state`, the two enum values, both storage buckets + policies, 8 seeded templates,
SELECT-only RLS + service-role grants, unique gallery index `(design_id, owner_id)`.

### 4.2 Link artwork to the EXISTING order — no new cart/order columns

The live schema (from `lib/database.types.ts`, generated from production) already provides the bridge:

```
product_customizations:
  id, owner_id, product_id, variant_id, name,
  preview_image_url, preview_settings jsonb, status,
  cart_item_id, order_item_id, deleted_at, created_at, updated_at

cart_items.customization_id          -> product_customizations.id
order_items.customization_id         -> product_customizations.id
order_items.printing_instructions    -> free text for print notes
```

Verified live code path:
1. `add_to_cart(p_variant_id, p_quantity, p_customization_id, p_session_token)` —
   `app/api/cart/route.js:358-363` already forwards `customization_id`; the RPC enforces
   `owns_customization()` (`20260910_fix_cart_stock_search_reviews.sql:46-54`).
2. `checkout` RPC — `20261030_checkout_coupon_shipping_hardening.sql:279-295` copies
   `cart_items.customization_id` → `order_items.customization_id` **and** sets
   `product_customizations.order_item_id`, `status = 'ordered'`.
3. `app/api/orders/route.js:404` calls that same `checkout` RPC (card checkout at `/api/checkout` is
   disabled by design — COD/wallet flows are used).

**Integration:** a new server route creates/updates a `product_customizations` row owned by `auth.uid()`:

```jsonc
// preview_settings (jsonb) — proposed contract
{
  "source": "custom_print",
  "design_id": "uuid",
  "template_key": "tshirt",
  "artwork": { "bucket": "design-uploads", "path": "…", "sha256": "…" },
  "editor_state": { /* placement/zoom/history checkpoint */ },
  "view_states": { /* per-print-area transforms */ },
  "selected_colors": [], "selected_sizes": [], "mockups": [],
  "share_opt_in": false,
  "shared_item_id": null
}
```

`preview_image_url` = primary mockup URL; `name` = e.g. "Custom T-Shirt — <design title>";
`product_id` / `variant_id` = the **real** store product chosen for that print type.
Artwork originals stay in the private `design-uploads` bucket; the order keeps an immutable reference
plus the rendered preview. No duplicate product, order, or checkout system is introduced.

**Constraint (do not bypass):** the `checkout` RPC re-prices from variants and decrements stock. A print
product must therefore be a real, published, in-stock product; keep the existing rule that
`fulfillment_mode='unconfigured'` → stock 0 → not orderable. Do not claim print items are
manufacturable/shippable until fulfillment is configured (open decision §6).

### 4.3 Optional sharing (default OFF)

- Publish dialog gains a single opt-in: **"Share my design on Galaxy Store"** (unchecked = private).
- **OFF:** no public row, no product listing; customer still adds the customized item to cart and pays
  through the existing flow. Artwork remains in `product_customizations` for the order.
- **ON:** submit the (still hidden-draft) product + a `shared_design_items` row to admin review using the
  same state machine and audit; on approval show the attributed listing in the existing store/gallery.
  Attribution text comes from `shared_design_items.author_display_name` — **no creator profile, username
  route, or public account data**. Remove "More by this creator"/"View profile" links.
- Admin approval remains mandatory; a customer can never self-approve (service-role-only RPC unchanged).

---

## 5. Required changes & migration plan (gated — awaiting approval)

| # | Step | Gate |
|---|---|---|
| 1 | Approve the classification in §2/§3 and the naming in §4.1. | **this document** |
| 2 | Rewrite the 3 untracked SQL files locally; rename guard tests, migration-guard 503 text, seed table refs. No live SQL. | after #1 |
| 3 | Replace `creator_profile_id` lookups in the 4 API routes with design-owner checks; add share opt-in to publish flow. | after #2 |
| 4 | Add the `product_customizations` handoff route; wire "Add customized item to cart" from the editor. No cart/order schema change. | after #3 |
| 5 | Rework `/custom-print` into the integrated hub (product select → editor → mockup → cart); keep quote flow for unsupported types. | after #4 |
| 6 | Rescope admin `/admin/creators` → design-review queue + print templates; strip creator-management tab/keys. | after #5 |
| 7 | Remove creator-only routes/pages/components/tests/links listed in §3 (destructive code step — explicit approval required). | after #6 |
| 8 | Verify locally: `npx tsc --noEmit`, `npm run lint`, `npm test` (baseline 78 suites / 1257 tests), `npm run build`; add contract tests proving artwork config survives cart → `checkout` → `order_items` and that private designs create no public rows. | before any deploy |
| 9 | Create an isolated Staging project; apply the renamed migrations there and walk through upload → edit → mockup → cart → order, plus opt-in share → admin review → public listing. | Staging only |
| 10 | Production migration/application strictly manual and approval-gated. **No deploy in this phase.** | separate approval |

**No destructive database action is needed**: the four creator tables never existed outside the untracked
SQL files, and the order link uses existing live structures.

---

## 6. Open decisions for the approver

1. **Names** — `custom_print_templates` / `custom_print_products` / `shared_design_items`, or keep existing
   table names and only drop `creator_profiles`? (Cosmetic, but affects many files/tests.)
2. **Fulfillment** — do we already have a print provider with stock configured? If not, the new cart path
   cannot legally place an order under the existing stock rule; the quote flow should remain primary.
3. **Existing quote flow** — keep it alongside the cart path (recommended for gift boxes / unsupported
   types) or retire it?
4. **Public gallery** — reuse the existing `gallery_images` / `/gallery` (admin-curated photos) for approved
   designs, or keep the new `shared_design_items` gallery components?
5. **Attribution source** — customer-entered `author_display_name` stored on the shared item (proposed),
   or `profiles` display name via a new safe public view? The former adds no account surface.
6. **`/studio` entry** — keep the standalone editor URL as the entry point from `/custom-print`, or merge
   the editor into the custom-print page itself?

---

## 7. Safety statement

This audit changed **no** application code, SQL, migrations, configuration or live data. All uncommitted
user work was preserved. No migration was applied; nothing was deployed. Tests had already been verified
green before this assessment (§1.3) and remain untouched.
