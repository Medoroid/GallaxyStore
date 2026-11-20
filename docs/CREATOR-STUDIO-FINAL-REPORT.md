# Creator Design Studio — Final Report (Phases 1–10)

> Date: 2026-11-13 · Project: `galaxy-store` · Spec: `docs/DESIGN-STUDIO-PLAN.md` (D1–D11)
> Scope: Redbubble-style Creator Design Studio + Print-on-Demand + Creator Marketplace,
> built **on top of** the existing Galaxy Store architecture (never a rewrite).
> All work is local and uncommitted; no production write, migration push or deploy was performed.

## A. Status summary

All 10 phases are complete in application code and verified locally:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors** / 36 warnings (0 from Studio files) |
| `npm test` | **76 suites / 1223 tests — all pass** (Studio subset: 23 suites / 516 tests) |
| `npm run build` | **BUILD=0** — `/admin/creators` (○), `/creators` (○), `/studio` (○), `/creator` (○) |

**Deployment gate:** the three Studio migrations are **not applied** to any live database
(no isolated Staging project exists; see `docs/FINAL-REPORT.md` §K for why pushes are blocked).
Every Studio surface fails honestly (`503 MIGRATION_REQUIRED` naming the exact SQL file, or a
pending-migration notice) instead of pretending success. The feature is not usable until the
migrations below are reviewed, approved and applied to an isolated Staging project first.

## B. Feature list (by phase)

1. **Analysis & tech design** — `docs/DESIGN-STUDIO-PLAN.md`: D1–D11 decisions, DDL, routes/pages/libs,
   security model, phase mapping (§8), API contracts (§4).
2. **Migrations, storage, security** — 4 new tables (UUID PKs, timestamps, ownership FKs, soft delete,
   CHECK constraints), `design_versions.editor_state` column, strict RLS (client SELECT-only;
   all mutations server-side via service role), two storage buckets with policies, migration guard tests.
3. **Creator profiles & dashboard** — public persona fields only (never email/phone/addresses),
   `username ^[a-z0-9_]{3,30}$` + display-name/bio validation, `/creator` dashboard
   (Overview · My Designs · My Products · My Gallery · Drafts · Pending · Rejected · Settings),
   public profile page `/creators/[username]` (RSC + `generateMetadata`), dashboard data API.
4. **Design Studio & artwork editor** — `/studio` grid + upload (drag-drop & picker, PNG/JPG/WebP/SVG,
   magic-byte checks, 50 MB / SVG 2 MB, min 200 px / max 10000 px, resolution & transparency warnings,
   SVG sanitized server-side, originals kept in private `design-uploads`); `/studio/[designId]` editor:
   desktop 3-pane / mobile full-width + collapsible panels + bottom action bar, move/resize/rotate/scale/
   align, printable-area preview, aspect lock, overflow & DPI warnings, undo/redo history, zoom,
   multi-view, reset, unsaved/confirm states, 93 `studio_*` i18n keys (EN/AR, RTL-correct).
5. **Templates & mockup engine** — registry of **8 product types** (`tshirt`, `hoodie`, `sweatshirt`,
   `mug`, `phone_case`, `tote_bag`, `poster`, `mouse_pad`) with purpose-built transparent print layers
   (no naive photo overlay), color variants, front/back (+top) views, persisted mockup images under
   `mockups/<designId>/<templateKey>/…` with config-hash caching (no needless regeneration),
   extensible registry + seed migration.
6. **Multi-product customization** — one artwork → many product rows; independent per-product config
   (view state per view: `{x,y,scale,rotation,lockAspect}`), multi color + size selection,
   `fulfillment_mode unconfigured|configured` + `stock_buffer 0..100000`; **unconfigured rows keep
   stock at 0 and are never presented as shippable** (POD business rule), idempotent create,
   soft-delete withdraw (409 `product_linked` when a store product exists).
7. **Publishing & approval** — two publish targets: **(A)** real store product (status `draft` +
   `visibility hidden` until approval, single default variant, images from generated mockups,
   automatic **“Designed by [Creator Name]”** attribution embedded in the listing) and
   **(B)** Creator Gallery item (later publishable without re-upload).
   Statuses `draft → pending_review → approved/published/rejected/archived`; nothing publicly
   purchasable before admin approval; transactional `creator_publish_product` RPC; re-submission
   after rejection updates the same product (no duplicates).
8. **Gallery & marketplace** — `/creators` public directory (server component, 5-min revalidate,
   honest `CreatorsUnavailable` notice while migrations are pending), `GalleryCover`/`GalleryItemCard`
   (deterministic title-card fallback, never a broken image), `/creators/[username]` profile,
   Navbar link, content API with category filter, +13 i18n keys. Creator products behave as
   **normal products** — existing commerce (cart/checkout/orders) reused, no separate checkout.
9. **Admin** — `/admin/creators` (nav entry `nav.creators`):
   * **Submission Queue** — UNION of product + gallery submissions merged by `submitted_at`,
     status filters, mockup/preview thumbnails, fulfillment badge (amber until configured),
     Approve / Reject (reason required) / Archive with confirmations, duplicate-action lock.
   * **Creators** — stats per creator, Feature / Can-publish / Active-Archived toggles (confirm on archive).
   * **Templates** — catalog with view/color/size counts, activate/deactivate, JSON geometry editor
     (views/colors/sizes/dimensions), delete with in-use guidance.
   * API: `GET/PATCH /api/admin/creators` (review goes through `admin_review_creator_submission`
     **with actor parameters** — creators can never self-approve; approval columns are never writable
     from a body field) and `GET/POST/PATCH/DELETE /api/admin/creator-templates`
     (`template_key` frozen — it namespaces mockup folders; FK-in-use → 409 “deactivate instead”).
   * Admin audit written for every toggle/archive/template change; review decisions audited inside the RPC.
   * 87 new EN/AR keys in `lib/admin-i18n.ts` (EN source of truth, type-enforced parity).
10. **Testing & documentation** — 23 Studio test suites (516 tests) covering editor math & history,
    SVG sanitization, validation, mockup generation & hashing, migration content/guards, publishing
    contract, security (auth-first, RLS-facing shapes, protected fields), commerce regression
    (checkout/auth/product/admin untouched), directory page rendering — plus this report.

## C. New and modified files

### Migrations (new, uncommitted)

| File | Contents |
|---|---|
| `supabase/migrations/20261110120000_creator_studio_core.sql` | `creator_profiles`, `creator_product_templates`, `creator_design_products`, `creator_gallery_items` (+ checks/FKs/soft delete), `design_versions.editor_state`, 2 enum values, RLS policies, grants, both storage buckets + policies |
| `supabase/migrations/20261110160000_creator_studio_template_seed.sql` | 8 product templates (views, print areas, colors, sizes), idempotent `on conflict (template_key) do nothing` |
| `supabase/migrations/20261110170000_creator_studio_publish_functions.sql` | `creator_publish_product(uuid, jsonb)` and `admin_review_creator_submission(text, uuid, text, text, uuid, text)` — service-role only, `search_path` pinned, REVOKE/GRANT, review RPC writes `admin_audit_log` itself, namespaced `review:*` errors |

### API routes (13, all new)

- Phase 3: `app/api/creator/profile/route.js`, `app/api/creator/dashboard/route.js`,
  `app/api/creators/[username]/route.js`, `app/api/creators/[username]/content/route.js`
- Phase 4: `app/api/designs/route.js`, `app/api/designs/[id]/route.js`, `app/api/designs/[id]/artwork/route.js`
- Phase 5: `app/api/designs/[id]/mockups/route.js`
- Phase 6: `app/api/designs/[id]/products/route.js`, `app/api/designs/[id]/products/[rowId]/route.js`
- Phase 7: `app/api/designs/[id]/publish/route.js`
- Phase 9: `app/api/admin/creators/route.js`, `app/api/admin/creator-templates/route.js`

### Pages (6, all new)

`app/studio/page.tsx` · `app/studio/[designId]/page.tsx` · `app/creator/page.tsx` ·
`app/creators/page.tsx` · `app/creators/[username]/page.tsx` · `app/admin/creators/page.tsx`
(+ `app/admin/creators/TemplateManager.tsx`)

### Components (15, all new)

- Studio: `app/components/studio/{ArtworkCanvas, ConfirmDialog, DesignCard, Dropzone, MockupPreview,
  ProductCatalog, ProductConfigCard, PublishDialog, StatusBadge, TransformControls}.tsx`
- Shared: `app/components/{GalleryCover, GalleryItemCard, CreatorsDirectoryView, CreatorsUnavailable,
  CreatorProfileView}.tsx`

### Libraries (20, all new)

- `lib/creator/`: `api.ts` (requireUser / isMissingRelation / migrationRequiredResponse),
  `directory.ts`, `gallery-cover.ts`, `media.ts` (`designPreviewUrl`), `profile-validation.ts`
- `lib/design-studio/`: `types.ts`, `validate.ts`, `svg-sanitize.ts`, `placement.ts`, `history.ts`,
  `editor-state.ts`, `design-input.ts`, `server.ts` (migration guard, storage paths), `error-codes.ts`,
  `mockup.ts`, `mockup-hash.ts`, `render.ts`, `product-input.ts`, `publish-input.ts`,
  `templates/index.ts` (8-type registry)

### Modified existing files (additive only)

- `app/admin/layout.tsx` — nav entry `{ href: "/admin/creators", labelKey: "nav.creators", icon: User }`
  (matches the in-flight `labelKey` refactor)
- `lib/admin-i18n.ts` — `nav.creators` + 86 `creators.*` keys, EN + AR (type-enforced parity)
- `app/components/Navbar.tsx` — public `/creators` link
- `lib/i18n.ts` — Studio/storefront keys across phases (93 `studio_*` + 52 product keys + 13 directory keys)
- `app/admin/content/page.tsx` — restored `PLACEMENT_LABELS` / `SECTION_TYPE_LABELS` from HEAD (user-approved fix)

### Tests (23 new suites, 516 tests)

`admin-creators-contract` (27) · `admin-creator-templates-contract` (26) · `creator-api-contract` ·
`creator-directory-contract` · `creator-profile-validation` · `creators-directory-page` ·
`creator-studio-migration-guards` · `creator-studio-publish-migration` · `creator-studio-template-seed` ·
`designs-api-contract` · `design-studio-{editor-state,history,mockup,placement,product-input,
publish-input,svg-sanitize,validate}` · `gallery-cover` · `marketplace-commerce-regression` ·
`mockups-api-contract` · `products-api-contract` · `publish-api-contract`

## D. Storage buckets (created by the core migration)

| Bucket | Public | Size limit | MIME allow-list | Policies |
|---|---|---|---|---|
| `design-uploads` | **no** (originals stay private) | 200 MB | png, jpeg, webp, svg, pdf, postscript, psd, octet-stream | owner insert / owner-or-admin select·update·delete (folder = `<owner>/<design>/…`) |
| `design-previews` | **yes** (generated mockups + previews) | 5 MB | png, jpeg, webp | admin write·update·delete, public read |

Mockup objects are namespaced `mockups/<designId>/<templateKey>/<view>-<color>-<hash>.png`;
public URLs are built with `designPreviewUrl()` (bucket-relative paths are never assumed absolute).

## E. RLS & security model

- **The 4 new tables are SELECT-only for clients**: `revoke all` from `public/anon/authenticated`,
  then `grant select`; `grant all` to `service_role`. Every mutation goes through a server route
  that (a) authenticates the caller, (b) verifies ownership with the caller-scoped client, then
  (c) writes with the service role. Client-supplied user/creator IDs, prices, approval states and
  ownership are never trusted.
- Public read policies: `creator_profiles_public_select` (`using true` — the app filters `is_active`),
  `creator_product_templates_public_select` (`using true`),
  `creator_design_products_public_select` (linked product is published/visible/not deleted),
  `creator_gallery_items_public_select` (`status='approved' and visibility='public' and deleted_at is null`).
- Owner policies exist for the creator’s own rows (`*_owner_select`), and the legacy design-subsystem
  tables (`user_designs`, `design_versions`, `design_files`) keep their full owner-write RLS;
  deletion is soft (`deleted_at`) because `designs_delete_admin_only` blocks creator hard deletes.
- **Approval columns are never client-writable**: review decisions only via the
  `admin_review_creator_submission` RPC (service-role grant, REVOKE from public/anon/authenticated),
  which requires admin actor parameters and writes `admin_audit_log` itself. The route maps
  `review:*` errors to house codes and a missing function to `503 MIGRATION_REQUIRED`.
- SVG uploads are sanitized server-side; artwork validation is magic-byte based (never trust headers).
- Rate limits (existing helper): artwork upload 10/min **fail-closed**, PATCH 60, DELETE 30,
  mockups 10 **fail-closed**, product config 30 fail-open, publish 30 fail-open;
  admin routes rely on `verifyAdmin` only (house admin pattern).

## F. Environment variables

**No new variables.** The Studio reuses the existing ones:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public client + auth)
- service-role key via the existing `lib/supabase/service-role` (server routes only — never exposed to the browser)
- `ADMIN_EMAILS` (existing `verifyAdmin` fallback when the `is_admin()` DB role is absent)
- Optional rate-limit backend: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  (without them the limiter falls back to the per-instance counter; setting
  `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` makes missing Upstash reject rate-limited requests —
  note that the fail-closed Studio upload/mockup routes then reject too, by design)

## G. Admin setup

1. Give the reviewing admin either the `is_admin()` database role (primary) or list their email
   in `ADMIN_EMAILS` (comma-separated) — this is the existing `verifyAdmin` contract.
2. After migrations are applied, open **Admin sidebar → Creators** (`/admin/creators`).
3. Audit trail: `admin_audit_log` receives `creator.featured_toggled`,
   `creator.publish_permission_toggled`, `creator.active_toggled`, `creator_submission_archived`,
   `creator_template.create/update/delete` from the routes, plus the approve/reject decision rows
   written inside `admin_review_creator_submission`.
4. Template creation: `POST /api/admin/creator-templates` (validated, audited) — the UI edits,
   activates and deletes existing templates (see limitation L7).

## H. Test & verification results

```
npm test          →  76 suites passed / 1223 tests passed   (full repository)
Studio subset     →  23 suites passed /  516 tests passed
npx tsc --noEmit  →  0 errors
npm run lint      →  0 errors, 36 warnings  (0 warnings from Studio files)
npm run build     →  BUILD=0  (/admin/creators ○, /creators ○, /studio ○, /creator ○)
```

Coverage highlights: editor transforms & undo/redo, printable-area/DPI math, SVG sanitizer,
upload/format validation, mockup rendering inputs & cache hashes, all three migration files
(schema/RLS/grants/RPC content + placement), publish contract (33 tests), admin queue contract
(27) and template contract (26), auth-first ordering on every Studio/admin verb, protected-field
immutability, `product_linked` withdrawal edge, and a commerce regression suite proving
checkout/auth/product/admin behaviour is unchanged.

## I. Known limitations

1. **Migrations not applied** — the feature is code-complete but inert until
   `20261110120000` → `20261110160000` → `20261110170000` are applied to an isolated Staging
   project (no isolated environment exists today; production pushes are blocked by standing rules).
   Until then surfaces show honest `503 MIGRATION_REQUIRED` / pending notices.
2. **No independent design-submit path** — artwork/designs themselves are never sent to review;
   only their derived **products** and **gallery items** enter the approval queue. The design file
   stays private to its creator.
3. **Creator-side withdrawal of a linked submission** — `DELETE` on a product-linked row answers
   `409 product_linked` by design; withdrawal is an admin action (`archive_submission`, Phase 9),
   which hides the store product first and then archives the row. Creators can delete only
   product-less rows themselves.
4. **Fulfillment is intentionally inert** — every creator product starts
   `fulfillment_mode='unconfigured'`, `stock_buffer=0` → variant stock 0, badge “not shippable”.
   No fulfillment provider is integrated; the boundary is integration-ready but nothing may be
   claimed as manufacturable/shippable until configured (business rule).
5. **Admin review shows generated mockups, not the raw original** — the private `design-uploads`
   original would need signed URLs; mockups (rendered from the artwork) are what buyers see and
   drive the review. A signed-URL original viewer is future work.
6. **Template geometry editing is JSON-based** — the admin edits views/colors/sizes/dimensions as
   validated JSON (server re-validates geometry); a visual print-area editor is future work.
   `template_key` is immutable after creation (it namespaces stored mockup paths).
7. **No template-create button in the UI** — `POST /api/admin/creator-templates` exists and is
   tested, but the UI only edits/activates/deletes the 8 seeded templates.
8. **Lint warnings** — 36 repository-wide warnings remain (0 from Studio files); they are the
   accepted house `react-hooks/set-state-in-effect` pattern in legacy admin/vendor pages plus
   in-flight work. Errors are 0.
9. **Server messages stay English** — per the admin-i18n contract only interface copy is
   translated (EN/AR); API error strings shown verbatim are English by design.
10. **Static SQL verification only** — Docker is unavailable, so migrations were verified by
    guard tests (content/placement/grants) rather than executed against a real database.

## J. Remaining manual configuration (deployment gate)

1. **Create an isolated Staging Supabase project** (none exists; `list_branches` = [] and the CLI
   is linked to production `httywgkwfqvrbuwuzutu`). Do **not** push migrations to production.
2. Apply in order on Staging: `20261110120000_creator_studio_core.sql` →
   `20261110160000_creator_studio_template_seed.sql` →
   `20261110170000_creator_studio_publish_functions.sql`
   (plus the unrelated theme/payment migrations per their own gates).
3. Verify on Staging: 4 tables + RLS policies present, both buckets exist,
   8 template rows, both RPCs callable **by service role only**, and
   `admin_review_creator_submission` rejects non-admin paths.
4. Configure `ADMIN_EMAILS` (or the `is_admin()` role) for the reviewing admin.
5. Optional but recommended for production: `UPSTASH_REDIS_REST_URL/TOKEN` for distributed rate limits.
6. Run the full gate again after applying: `npx tsc --noEmit`, `npm run lint`, `npm test`,
   `npm run build`, then a manual walkthrough (upload → edit → mockups → configure → publish →
   admin review → public listing with “Designed by …”).
7. Fulfillment provider integration remains open (limitation L4) before any creator product can
   be sold as shippable.
