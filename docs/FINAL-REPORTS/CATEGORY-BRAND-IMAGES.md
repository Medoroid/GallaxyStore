# Category / Brand Image Picker — Implementation Notes

**Date:** 2026-11-21 · Deployed to Staging only.

## What changed
- **New upload API** `app/api/admin/catalog/images/route.js`: admin-only multipart upload (`file`/`image`), byte-level type/size validation reused from product images, uploads to the existing public `site-banners` bucket under `catalog/`, returns `{ success, url, path }`. No new bucket or migration.
- **New UI** `app/admin/catalog/CatalogImageField.tsx`: URL text input **plus** device file picker with preview; used in both create and edit forms for categories (`image_url`) and brands (`logo_url`) in `CatalogManager.tsx`.
- **Storefront** `lib/products.ts` now selects `image_url` for categories; `app/page.tsx` renders it in the "Shop by Category" card via `SafeImage`, with the existing Gift icon as fallback.
- `jest.config.ts` ignores `e2e-staging/` (Playwright suite) so `npm test` stays clean.

## Verification actually performed on the deployed URL
- Admin upload endpoint: **201** with a real public URL.
- Uploaded URL saved to a category via the existing catalog PATCH: **200**.
- Homepage "Shop by Category" section: **1 `<img>`** rendered with the optimizer URL of the uploaded image; no page errors.
- `/admin/categories` and `/admin/brands` create forms: upload button + URL input present (browser-checked).
- `tsc` pass · unit **1485/1485** · Staging Playwright **13/13**.

## Notes
- External URLs remain supported (plain text field); unsupported remote hosts still fall back via `SafeImage` unless added to `next.config.ts` remote patterns.
- Several unrelated WIP changes (performance/font/logo work from another session) remain uncommitted in the working tree and were intentionally left untouched.
- No commit/push performed for this change; branch is `staging` and Production was not touched.
