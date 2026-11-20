# Photorealistic Mockup Replacement — Report

> Date: 2026-11-17 · Scope: replace flat vector mockups in Galaxy Store Custom Print Studio with
> real product photography while preserving full design customisation, cart and order integration.

## 1. Outcome

The studio now renders **real photographs** as the base layer for all ten supported products.
Customer artwork is composited onto the photo inside a measured print area with a blend mode and a
subtle material texture. The vector renderer still exists in code as a data/validation model but is
**never presented to customers as a photorealistic mockup**.

## 2. Products updated (10/10)

| Product | Photo | Colour(s) offered | View(s) offered | Print area source |
|---|---|---|---|---|
| Classic T-Shirt | white flat-lay + black on hanger (2 photos) | white, black | front | measured from each photo |
| Oversized T-Shirt | white flat-lay | white | front | measured |
| Hoodie | white, model-worn | white | front (chest only) | measured, conservative |
| Sweatshirt | white, model-worn | white | front (chest only) | measured, conservative |
| Mug | single white ceramic mug | white | front | measured |
| Phone Case | white case, back view | white | back | measured (camera cut-out excluded) |
| Tote Bag | natural cotton tote | natural | front | measured |
| Poster | white poster on slat wall | white | front | measured |
| Mouse Pad | dark pad on desk | black | top | measured (mouse excluded) |
| Sticker | blank speech-bubble sticker | white | front | measured |

**No colour or view is shown unless a real photograph exists for it.** No CSS filter recolouring is
used — only the actual colours above are selectable. Other colours/views from the legacy vector
catalog are hidden in the studio.

## 3. Sources & licences

All 11 photographs come from **Pexels** under the verified Pexels Licence (free commercial use,
modification allowed, no attribution required). Files are stored locally in `public/mockup-assets/`;
the UI never hotlinks external images. Photographer, photo ID, source page, licence and measured
print area for each file are recorded in `docs/MOCKUP-ASSET-LICENSES.md` and in
`lib/mockup-library/photo-assets.ts`.

No PSD with unverifiable licence and no pirated/copyrighted mockup was used. Where a perfect
product-only photo was unavailable (hoodie, sweatshirt, mouse pad), a real photo with a
deliberately restricted print area is used and the limitation is documented rather than concealed.

## 4. What changed in code

- `lib/mockup-library/photo-assets.ts` — new registry: local path, real dimensions, measured
  printable area, blend mode, opacity, material texture, author/source/licence metadata.
- `lib/mockup-library/compose.ts` — new photo branch: base photograph → artwork clipped to the
  printable-area mask → blend mode (`multiply` on light products, `normal` on dark) → low-opacity
  fabric/paper/ceramic texture overlay. Photo light, shadows, folds and perspective are preserved.
- `lib/mockup-library/types.ts` — `PhotoComposeInput` + admin `photoAssets` schema.
- `lib/mockup-library/sanitize.ts`, `validate.ts` — photo JSON is validated (data URL or local path,
  normalised area bounds, blend allow-list) so admin input cannot inject markup.
- `app/components/custom-print/CustomPrintStudio.tsx` — loads the local photo as a data URL,
  composes it live, offers only colours/views with real photos, shows a "Photorealistic mockup"
  badge and an honest error instead of a vector substitute if a photo fails to load.
- Admin: `app/api/admin/custom-print/assets/route.js` uploads replacement photos into the private
  `mockup-assets` bucket; `/templates` CRUD stores photo layers and sort order; `/templates/preview`
  composes unsaved photo edits before publishing; `/admin/custom-print` inserts uploads as photo
  layers and lets the admin define colour/view, print area/mask, blend, enable/disable and order.
- `lib/design-studio/templates/index.ts` + `20261110160000` seed — added genuine white variants for
  hoodie and sweatshirt (they exist as real photos).
- `supabase/migrations/20261116130000_custom_print_studio.sql` — added `photo_assets` JSONB column.
  **Local and unapplied**, as required.

Existing upload validation, artwork editor controls, print warnings, save flow, `product_customizations`
cart handoff, checkout and orders were **not removed or replaced**.

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors**, 39 warnings (pre-existing legacy + house effect pattern) |
| `npm test` | **83 suites / 1309 tests — all green** (new photo suite: 8 tests; all 11 assets verified on disk) |
| `npm run build` | **BUILD_EXIT=0** |
| Browser render check | nested data-URL photography inside SVG confirmed working in Chromium |
| Live: all 10 products | every product loads a real photo, shows the "Photorealistic mockup" badge, has an active print mask and no load error |
| Live: artwork compositing | uploading artwork produced 2 image layers (photo + artwork), clip path and blend mode; print warnings displayed |
| Mobile viewport (390×844) | preview + Save/Add-to-cart visible, no horizontal overflow |
| E2E | `e2e/custom-print-studio.spec.ts` — **2 passed** (upload/preview + mobile) |
| RTL/LTR | Arabic (`dir=rtl`) and English (`dir=ltr`) verified on desktop + mobile; all studio copy translated, no horizontal overflow |
| Full checkout E2E | still blocked by unapplied migration/fulfilment (see below) |

The full suite includes regression coverage proving checkout/auth/product/admin and the earlier
cart/order fallback are unchanged.

## 6. Known limitations (stated honestly)

- Hoodie, sweatshirt and mouse pad use real but lifestyle/desk photos; print areas are intentionally
  conservative so artwork stays on the product and off hands/mouse/face.
- Only the photographed colours are selectable. Adding a colour requires sourcing another licensed
  photo and a print-area measurement.
- Front/back/side switching is available only where distinct photos exist (currently mainly a single
  view per product).
- Admin photo management relies on the local, unapplied migration; until it is applied on an isolated
  Staging environment the admin API answers `503 MIGRATION_REQUIRED`.
- No fulfilment/production integration exists; ordering still depends on a real, stocked catalog
  product being linked to each template (unchanged business rule).

## 7. Not done
- No production migration, deploy, customer-data change, or hotlinked asset.
- No creator-specific code was added; no second checkout was introduced.
