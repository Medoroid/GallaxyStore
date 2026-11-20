# Theme Management System — Implementation Plan (Phase 1)

> Prepared: 2026-11-10 · Task: dynamic, admin-controlled seasonal theme system for Galaxy Store.
> Constraints honored: extend, don't rebuild · no production DB writes (migration is prepared, **not applied**) · no commits · preserve every existing feature.

---

## 1. Architecture findings (what exists today)

| Area | Finding | Consequence for the design |
|---|---|---|
| Styling | Tailwind **v4 CSS-first**, no `tailwind.config.*`. `@theme inline` (globals.css:18-63) maps `--color-*` → utilities; **`--radius: 1rem` (line 66) derives the entire radius scale** (lines 19-25) | One `--radius` token = global radius control. Bridging `--color-x: var(--x)` lets themes re-skin every named utility (`bg-primary`, `pink-500`, …) with zero per-component edits |
| Tokens | `:root` (65-113) already holds semantic vars: `--background/foreground/card/primary/secondary/accent/muted/border/ring/neon/pink-glow/gold`, `--gradient-galaxy/neon/gold/hero`, `--shadow-*`. Body background = `body::before` using `--gradient-hero` (127-133) | The theme engine **overrides these vars** — no page edits needed for background/brand/gradient/glow |
| Fonts | Google Fonts `@import` (Poppins + Tajawal) at globals.css:1; `body { font-family }` (122) and `h1-h4 { font-weight:800; letter-spacing }` (135-138) hardcoded in `@layer base` | Convert to `var(--font-body)/var(--font-heading)/var(--font-weight-*)` with identical defaults |
| Hex literals | 225 hex across 29 files — **concentrated in admin/vendor/auth pages**; public storefront (Navbar/Footer/ProductCard/home) is already semantic (`.glass`, `bg-gradient-neon`, `text-gradient-gold`, `pink-glow`) | Codemod the repeated brand literals (`#FF4FD8` ×113, `#A855F7` ×31, `#FFD166` ×13, dark surfaces) into `var(--…)`/new utilities; skip product swatches + Google logo fills |
| Hardcoded classes | `.glass-nav`, `.glass-strong`, `pulse-glow` keyframes, `select option` (globals 140-144, 155-160, 242-248) | Rewrite to vars (defaults byte-identical → zero visual change) |
| Admin | Flat `navItems` array in `app/admin/layout.tsx:27-40`; pages are `"use client"` + `useAuth().getToken()` + inline `message` banner + native `confirm()`; APIs are **`.js`** with `verifyAdmin` → `getServiceRoleClient()` → `handleApiError`; audit via `recordAdminAudit` | Theme Studio follows these exactly: one nav entry, `route.js` files, same response shapes, audit entries per mutation |
| Data | No theme tables exist. Migration style = idempotent (`if not exists`, `drop policy if exists`), least-privilege grants, `set_updated_at()` trigger, public bucket + `storage.objects` policies (copy `site-banners` pattern from `20261108130000…sql`) | New file `20261110100000_theme_management.sql`, paste-safe, approval-gated |
| Public reads | `lib/storeSettings.ts` pattern: `getPublicServerClient()` + try/catch → defaults. `getServiceRoleClient()` exists for server-only reads. Root layout has `export const revalidate = 300` | `getResolvedTheme()` = service-role read (server-only) + try/catch → built-in default + 30 s in-memory TTL; layout piggybacks on its 300 s revalidate |
| Auth/preview | Admin APIs are Bearer-only (no cookies). `proxy.ts` guards `/admin/*` server-side. RTL owned by `LanguageProvider`; admin UI is English-only | Preview cannot rely on cookies inside iframes → draft config passed via `localStorage` (same-origin) + `postMessage`; bridge only activates with `?preview=1` |
| i18n | Public `t()` + runtime `dir` mutation; admin English-only | Theme Studio copy in English; decorations/RTL-safe (no directional assumptions) |

## 2. Architecture decisions

1. **Token strategy — layered, zero-regression:**
   - Layer 1 (no edits): theme overrides existing `:root` vars (`--background`, `--gradient-*`, `--shadow-*`, `--radius`, …).
   - Layer 2 (`globals.css` only): add new vars (`--brand`, `--brand-2`, `--brand-glow`, `--bg-deep`, `--bg-panel`, `--bg-elevated`, `--font-heading`, `--font-body`, `--comp-*`) + register `--color-brand: var(--brand)` etc. in `@theme inline` + rewrite the 4 hardcoded classes to vars. **Defaults = current values → pixel-identical when no theme is active.**
   - Layer 3 (codemod): replace repeated literal patterns (`from-[#FF4FD8]`→`from-brand`, `text-[#FF4FD8]`→`text-brand`, `focus:border-[#FF4FD8]`→`focus:border-brand`, `bg-[#0a0018]`→`bg-bg-deep`, CTA glow shadows → `shadow-cta`) across app/**. Denied files: product swatch sources (`productDetailsClient.jsx`, color pickers) and Google-logo fills.
2. **Resolution order (explicit):** `manual override` (theme_settings.manual_override_theme_id) → **highest-priority eligible scheduled/active theme** (window contains now; tie → newest updated_at) → `default_theme_id` → built-in default config. The spec lists override second, but §8 requires it to beat the active theme — **override wins**, documented here as the single source of truth.
3. **Server-side scheduling:** eligibility is computed in `resolveTheme()` from `now` + `starts_at/ends_at` + IANA `timezone` (recurring themes = annual window rebuilt from month/day, spanning year boundaries for Dec→Jan). No browser timers; every visitor gets the same answer (30 s server cache + 300 s layout revalidate; activation drift ≤ 5 min, documented).
4. **Config = validated JSONB, no free-form CSS/JS:** colors must be hex/rgb/hsl; fonts from a whitelist; strings stripped of `<`, `}`, `;`, `url(`, `expression`, `javascript:`; numbers clamped. CSS emitted only by `themeCss()` from structured values. Preview applies values through `CSSStyleDeclaration.setProperty` (CSSOM rejects invalid input) — injection-safe on both paths.
5. **Preview isolation:** Theme Studio renders an iframe (`?preview=1`) at desktop/tablet/mobile widths over 5 representative routes. Draft (unsaved) config lives in `localStorage["galaxy-theme-preview"]` + `postMessage` on every edit; `ThemePreviewBridge` (mounted in root layout, **inert unless `?preview=1`**) applies vars. Public visitors never receive the param → zero impact.
6. **Versioning:** append-only `theme_versions` (JSONB snapshot on every publish/activate/restore). Compare = client-side token diff. **Restore Default** clears the override and falls back to the built-in default instantly.
7. **Brand preservation:** core logo/navigation/checkout are untouched by themes; only tokens, banners, decorations, badges and typography presets change.
8. **Graceful degradation:** migration not applied (current production state) → every read falls back to the built-in default; Theme Studio shows an honest "database upgrade required" state instead of fake controls.

## 3. Data model (prepared migration — NOT applied)

`20261110100000_theme_management.sql` (idempotent, paste-safe):
- **store_themes**: id, name, slug (unique), description, category, preview_image, theme_config JSONB (validated server-side), status (`draft|scheduled|active|archived`), priority int, activation_mode (`manual|scheduled`), starts_at, ends_at, timezone, is_recurring, created_by → auth.users, created_at/updated_at. Indexes on (status), (starts_at, ends_at), priority.
- **theme_assets**: id, theme_id FK cascade, asset_type, asset_url, mobile_asset_url, metadata JSONB, created_at.
- **theme_settings**: single row — default_theme_id, manual_override_theme_id, updated_at.
- **theme_schedule_history**: id, theme_id FK, action, previous_theme_id, performed_by, performed_at.
- **theme_versions**: id, theme_id FK, version int (per-theme sequence), snapshot JSONB, note, created_by, created_at.
- **Bucket `theme-assets`** (public read, 5 MB, image mime allowlist) + `storage.objects` policies: public select / `is_admin()` insert-update-delete (site-banners pattern with `to_regprocedure` pre-flight).
- RLS: `store_themes` public select limited to `status in ('active','scheduled')` + `is_admin()` all; `theme_settings`/`theme_versions`/`theme_schedule_history`/`theme_assets` service-role only (no anon policies); least-privilege grants; `set_updated_at()` triggers.

## 4. File plan by phase

| Phase | Files |
|---|---|
| 2 Tokens/engine scaffolding | **edit** `app/globals.css` (new vars, `@theme` bridge, var-driven `.glass-nav/.glass-strong/pulse-glow/select/body/h1-h4`), codemod across `app/**` (script run once, output committed) |
| 3 DB + engine | **new** `supabase/migrations/20261110100000_theme_management.sql`, `lib/themes/{types,defaults,presets,validate,css,resolve,server}.ts`, `app/api/theme/route.js` |
| 4 Admin dashboard | **edit** `app/admin/layout.tsx` (+1 nav item); **new** `app/api/admin/themes/route.js`, `app/api/admin/themes/[id]/route.js`, `app/api/admin/theme-settings/route.js`, `app/admin/theme-studio/page.tsx` + `components/{ThemeCard,StatCard}.tsx` |
| 5 Theme builder | **new** `app/admin/theme-studio/components/{ThemeEditor,ColorsTab,TypographyTab,ComponentsTab}.tsx` |
| 6 Presets + decorations | presets in `lib/themes/presets.ts` (Ramadan, Eid al-Fitr, Eid al-Adha, Christmas, Valentine, Halloween, Black Friday, New Year + editable); **new** `app/components/ThemeDecorations.tsx`, `app/components/ThemeBanner.tsx` |
| 7 Scheduling + priority | resolve logic (phase 3) + `app/api/admin/themes/[id]/schedule` folded into PATCH + `ScheduleTab.tsx` + conflict computation in list API |
| 8 Preview + versioning | **new** `app/components/ThemePreviewBridge.tsx`, `app/api/admin/themes/[id]/versions/route.js`, `app/api/admin/themes/[id]/publish/route.js`, `app/api/admin/themes/assets/route.js`, `PreviewTab.tsx`, `VersionsTab.tsx`, `AssetsTab.tsx`, `DecorationsTab.tsx` |
| 9 Public integration | **edit** `app/layout.tsx` (server token `<style>` + `<ThemeDecorations>` + `<ThemePreviewBridge>`), `app/lib/theme-context.tsx`, `app/components/AnnouncementBar.tsx` (theme announcement/banner precedence), `app/components/providers.tsx` (mount provider) |
| 10 Tests + docs | **new** `__tests__/theme-{engine,validation,css,presets}.test.ts`, optional `theme-api-contract.test.ts`; `docs/THEME-STUDIO-GUIDE.md`; gates (tsc/lint/test/build) + read-only E2E additions |

## 5. Verification strategy (production stays read-only)

- Pure logic (resolution, validation, CSS emission, presets) → Jest unit tests (no DB).
- Admin APIs → code follows the house contract; write paths are exercised only via unit/contract tests, **never against production**.
- Public `/api/theme` + layout resolution → SELECT-only, graceful fallback while tables are missing (this is the live behavior until the owner applies the migration).
- Full regression: `npx tsc --noEmit`, `npm run lint`, `npm test` (must stay 456+ new), `npm run build`; Playwright read-only specs for `/api/theme` + homepage token rendering.
