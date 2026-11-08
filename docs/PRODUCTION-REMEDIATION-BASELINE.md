# Production Remediation Baseline — Galaxy Store

> **Purpose:** Snapshot of project state *before* remediation started (2026-11-01), used for regression comparison at the end of the remediation effort.
>
> **Source issues:** `docs/TESTING-REPORT-AR-2026-10-29.md` (A1–D4).

---

## 1. Project State

| Item | Value |
|---|---|
| Git HEAD | `fc5f544` (text-fil) |
| Working tree | 163 changed/untracked files (pre-existing WIP — **must be preserved**, no reset/force) |
| package name/version | `my-app` / `0.1.0` |
| Next.js | `16.2.9` (installed = declared) |
| React / ReactDOM | `19.2.4` / `19.2.4` |
| Scripts | `dev, build, start, lint, test, test:watch, test:integration` |
| Supabase link | Production project `httywgkwfqvrbuwuzutu` — **read-only during this effort** |
| Local Supabase | Ports remapped to 54120–54129 in `supabase/config.toml`; `supabase start` boots but `db reset` fails at legacy migration `20260907_create_admin_users_secure.sql` (`relation public.profiles does not exist`) → **no reproducible local schema baseline** (7 `create_*.sql` files skipped by CLI naming pattern) |

---

## 2. Baseline Check Results (before any remediation change)

| Check | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS (exit 0) | Initially FAILED with TS1109/TS1128 in `.next/dev/types/routes.d.ts` + `validator.ts` — **corrupted generated files** (line 160 contained stray `sx`, mid-write from killed dev server). Deleting `.next/dev/types/` fixed it; no source errors. |
| `npm run lint` | ✅ PASS (exit 0) | **0 errors, 22 warnings** (mostly `react-hooks/set-state-in-effect`) |
| `npm test` | ✅ PASS (exit 0) | **32 suites / 275 tests — all passing** (27.8 s) |
| `npm run build` | ✅ PASS (exit 0) | All routes built; `ƒ Proxy (Middleware)` active; raw log removed in D3 cleanup |
| `npm audit` | ⚠️ **44 vulnerabilities** | 2 critical, 7 high, 32 moderate, 3 low — see breakdown below |

### 2.1 npm audit breakdown (baseline)

| Severity | Count | Packages (direct=*) | Production path? |
|---|---|---|---|
| critical | 2 | `next*` (16.2.9 → fixed in 16.4.3), `handlebars` (dev chain via jest/istanbul?) | next = **yes**; handlebars = dev |
| high | 7 | `axios*` (**unused in source**), `follow-redirects` (via axios), `postcss` (via next), `sharp` (via next), `brace-expansion`, `source-map-js`, `zod` (**unused in source**) | axios/zod removable; postcss/sharp fixed by next upgrade |
| moderate | 32 | jest / eslint / typescript-eslint chains (dev tooling), `@tanstack/eslint-plugin-query*` (dev) | dev-only |
| low | 3 | dev chains | dev-only |

> `grep` over `*.{ts,tsx,js,jsx,mjs}` found **zero imports of `axios` or `zod`** in project source → removal candidates for D1.

### 2.2 Next.js advisory verification

- `npm view next dist-tags` → `latest: 16.4.3` (16.4.4 does not exist — 404).
- Advisory range (Middleware/Proxy bypass with Turbopack + single locale; Server Actions DoS): `>=9.3.4-canary, <16.4.0`.
- **Fix target: `next@16.4.3`** (React 19.2.4 compatible).

---

## 3. Known Issues Discovered in Phase Zero

1. **Corrupted generated type files** (`.next/dev/types/*`) break `tsc` when a dev server is killed mid-write. Not a source bug; `.next` must be treated as disposable (tsconfig explicitly includes `.next/dev/types/**/*.ts`).
2. **`npm test` prints npm.ps1 NativeCommandError noise** on Windows (stderr passthrough) but exits 0 — cosmetic.
3. **No Playwright/E2E setup in the repo** — browser audit ran from a temp harness (`%TEMP%/opencode/pw-audit`), browsers present in `%LOCALAPPDATA%\ms-playwright`.
4. **Local Supabase schema not reproducible** (see §1) → migrations can be written + reviewed but cannot be applied to a local replica; production application blocked by policy.
5. **`.env`/`.env.local` point the dev server at the live production DB** → all runtime testing must remain read-only against production.

---

## 4. Issues Already Fixed Before This Effort (verified during discovery)

| ID | Issue | Evidence |
|---|---|---|
| (old #2,#3,#9,#11,#12,#13,#15,#28,#30,#32) | Items from `REMAINING-ISSUES.md` | Verified fixed in current code during the 2026-10-29 audit |
| Payment alignment | COD + manual Vodafone Cash only; Stripe/Paymob/checkout return 410 by design | Prior work pass — tests green |
| Custom-print API | Real server submission with storage upload + orphan cleanup | `app/api/custom-print/route.js` |

---

## 5. Production DB Snapshot (read-only, for reference)

- 21 published products + 1 draft; 279 users; 12 orders; 7 payment attempts; 0 reviews; 2 stores.
- Categories: Accessories, Apparel, Home & Living, Hoodies, Mugs, T-Shirts, Tote Bags (**no gift category**).
- `store_settings`: columns `key, value(jsonb), is_public, updated_by, updated_at` — **0 rows** (empty).
- Shipping zones: "Domestic US" + "International" (CA/GB/EG as *international*); rates $4.99/$12.99 US, $9.99/$24.99 intl.
- Currency mix: 18 USD + 3 EGP products.
- Product images: 23/29 `product_images` rows point to missing storage objects; 10 external hotlinks (Unsplash/Pinterest).

---

## 6. Files Expected to Need Modification

| Area | Files |
|---|---|
| A1 security | `package.json`, `package-lock.json`, `proxy.ts` |
| A2 gift boxes | `app/gift-boxes/page.tsx`, new `/api/gift-box` route (or reuse of custom-print), tests |
| A3 images | image-rendering components (`ProductCard`, product-details, gallery), `next.config.ts`, new `public/` placeholder, `docs/PRODUCT-DATA-INTEGRITY-REPORT.md`, `supabase/manual-review/*.sql` |
| A4 logger | `lib/logger.ts` (+ call sites if signature changes) |
| B1 language | `app/cart/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, other public pages |
| B2 shipping UI | `app/cart/page.tsx`, `app/api/shipping/route.js` |
| B3 currency | currency utility + cart/coupon/order math touch points |
| B4 settings | `app/contact/page.tsx`, `app/shipping/page.tsx`, homepage claims, public settings endpoint |
| B5 rate limit | `lib/rate-limit.ts`, sensitive routes |
| B6 weight | `app/api/shipping/route.js` |
| C1–C6 | `app/reset-password/page.tsx`, `app/products/page.tsx`, `app/api/custom-print/route.js`, `app/custom-print/page.tsx`, `app/not-found.tsx`, `app/error.tsx` |
| D1–D4 | `package.json` (audit fixes, version), `.gitignore`, repo temp files |

---

## 7. External Dependencies & Requirements

| Dependency | Status |
|---|---|
| Upstash Redis (distributed rate limiting) | **Not configured** — memory fallback only; production launch gate required |
| Store owner contact data (phone/email/address) | **Missing** — must be entered manually; no fabrication allowed |
| Currency decision (EGP vs USD) + exchange rate | **Manual decision required** for data cleanup |
| Egyptian shipping zone + rates | Migration prepared locally only (needs approval to apply) |
| Test accounts (customer/vendor/admin) for E2E | **Do not exist** — authenticated E2E blocked |
| `supabase db dump --linked` for DR schema snapshot | Requires human approval (read from production) |

---

## 8. Baseline Artifact Index

- Baseline build log (`build-baseline.log`) — full baseline build output; **removed in D3 repo cleanup**, result recorded in the `npm run build` baseline row above.
- `docs/TESTING-REPORT-AR-2026-10-29.md` — source issue list.
- `docs/PRODUCTION-REMEDIATION-TRACKER.md` — per-issue status (A1–D4).
