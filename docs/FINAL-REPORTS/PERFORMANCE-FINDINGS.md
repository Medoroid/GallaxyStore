# Performance Findings (Phase: Lighthouse report review)

**Date:** 2026-11-21 · **Source report:** Lighthouse run against `http://localhost:3000` (unscored categories).

## Applied fixes (deployed to Staging)
| Finding | Change | File |
|---|---|---|
| Render-blocking font chain (Tajawal 700 Arabic 3,007 ms on critical path; Poppins 500/600/700 also requested) | Added preloads for the four fonts that cover LCP text: Poppins 400 + 600, Tajawal 400 + 700 Arabic. Other weights still load on demand via `fonts.css`. | `app/layout.tsx` |
| Image delivery ~179 KiB oversized | `images.formats = ['image/avif','image/webp']`, `qualities = [50,65,75]`, and intermediate `deviceSizes` (160/192/224/320/512) so cards/logos no longer jump 128→256→384. | `next.config.ts` |
| Product images 640px for 339px display | Tighter `sizes` at large breakpoints (25vw→20vw above 1440px). | `app/components/ProductCard.tsx` |
| Navbar logo marked low priority while being LCP-visible | `fetchPriority="high"`. | `app/components/Navbar.tsx` |

## Verification actually executed
- `npx tsc --noEmit` — pass.
- `npm test` — **1485 / 1485** pass.
- `npm run build` with Staging env — pass.
- `vercel deploy --prod` to `gallaxy-store-staging` — Ready; homepage 200.
- Deployed HTML contains the four new font preloads (verified by HTTP fetch).
- Staging Playwright suite — **13 / 13** pass.

## Not changed — honest reasoning
- **Forced reflow:** the report attributes ~102 ms to a minified chunk and ~96 ms to `installHook.js` plus ~24 ms to `content.bundle.js` — these are Lighthouse's own injected instrumentation. Our application chunks register ~1 ms each. The only geometry reads in our code are in `ArtworkCanvas` (ResizeObserver measurement in a layout effect and `getBoundingClientRect` inside pointer-event handlers), which are legitimate and not render-loop reads. No change made; no fabricated improvement claimed.
- **Legacy JavaScript (~13 KiB):** emitted by framework/tooling chunks; not something to "fix" by weakening the modern build. Not changed.
- **Preconnect:** no third-party origin is on the critical path; Lighthouse itself reported no good candidates. Not changed.
- **No before/after Lighthouse scores:** the supplied report was unscored and ran on localhost with production-hosted image URLs. A fresh Lighthouse run against the deployed Staging URL is required for measured numbers.

## Git / safety note
The working tree is currently on branch **`main`**, which is connected to the Production Vercel project. Per the non-negotiable rules, these performance edits were **not committed or pushed**. They are deployed to Staging via the Vercel CLI from the local working tree, which is linked to `gallaxy-store-staging` (project ID verified before deploy). Production was not touched.
