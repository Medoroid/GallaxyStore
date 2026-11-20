# Phase 1.1 — Creator Template Architecture (CD-3)

## 1. Old data flow (two sources of truth)
- Admin editor `app/admin/creators/TemplateManager.tsx` wrote snake_case JSON (`views`, `colors`, `sizes`, `dimensions_mm`) to `creator_product_templates`.
- `lib/design-studio/templates/index.ts` hardcoded camelCase `TEMPLATES` registry was read by `lib/design-studio/mockup.ts`, `mockups/route.js`, `products/route.js`, `products/[rowId]/route.js` and studio components. Result: edits had no effect on rendering.

## 2. New single source of truth
**The database published snapshot is authoritative for all geometry.**

- New migration adds `published_dimensions_mm`, `published_views`, `published_colors`, `published_sizes`, `is_published`, `published_at`, `geometry_version` to `creator_product_templates`; backfills the 8 seeded templates once (idempotent, draft edits untouched).
- The live `views/colors/sizes/dimensions_mm` columns are now the **admin draft**. Only `POST /api/admin/creator-templates/publish` promotes a validated draft into `published_*` and bumps `geometry_version` (also invalidating cached mockups). Draft fields are immutable from PATCH; published fields are rejected there.
- `lib/design-studio/template-schema.ts`: one shared validator (`validateTemplateGeometry`), normalizer (`publishedGeometryFromRow`, `normalizeDbTemplate`), `hydrateTemplate`, `toGeometry`, `hasUnpublishedChanges`. Includes print-area-within-canvas, unique keys, hex/range caps.
- `lib/design-studio/template-catalog.ts`: server loader reads published rows, skips invalid ones, falls back to the read-only TS registry ONLY when a product references a missing/invalid template (legacy compatibility). Never writes back.
- `GET /api/templates`: public wire endpoint returning published geometry + `geometryVersion`; no functions serialized.
- Client `app/components/studio/useTemplateCatalog.ts` fetches the published catalog and hydrates renderer functions by key. `ProductCatalog`, `ProductConfigCard`, `MockupPreview`, `PublishDialog` now consume this catalog, not the registry.
- Server routes `mockups`, `designs/[id]/products`, `designs/[id]/products/[rowId]` validate against the published template (after authorization checks).
- TemplateManager has an explicit **Publish geometry** action; GET reports `has_unpublished_changes`.

## 3. Safety properties
- Draft edits never affect renderer, storefront or published products until explicit publish.
- Invalid geometry can never be promoted (validator on publish).
- Removing/renaming a template key is still restricted by the existing FK/immutable-key rules; products referencing a missing template use the read-only registry fallback instead of crashing.
- Migration is additive; an un-migrated environment falls back to legacy draft geometry.

## 4. Tests (executed)
- `npx tsc --noEmit`, `npm test` (1484), `npm run test:integration` (126), Local E2E (11) — all pass.
- E2E asserts `/api/templates` returns 8 DB-published templates with geometry + version.

## 5. Files
Added: migration, `template-schema.ts`, `template-catalog.ts`, `app/api/templates/route.js`, `app/api/admin/creator-templates/publish/route.js`, `useTemplateCatalog.ts`.
Changed: registry (`getRenderer`), `product-input.ts`, 3 API routes, 4 studio components, `TemplateManager.tsx`, admin creator-templates route, 2 contract test helpers.
