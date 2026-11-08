# Vercel Deployment Guide — Galaxy Store

> Prepared: 2026-11-05 · **No deployment was executed by the assistant** — this document is the runbook for the owner.
> Companion: `docs/FINAL-PRODUCTION-READINESS-REPORT.md` (remediation status), `docs/STORE-SETTINGS-CHECKLIST.md` (data rollout).

---

## 1. Pre-flight status (verified 2026-11-05)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ 0 errors / 24 warnings (22 baseline + 2 from new `admin/audit` + `admin/custom-prints` pages — `react-hooks/set-state-in-effect` style warnings only) |
| `npm test` | ✅ 456/456, 44 suites |
| `npm run build` | ✅ exit 0 |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities (35 dev-only remain) |
| Full-site runtime scan (`scripts/site-scan.mjs`) | ✅ 37 routes — no 5xx, no uncaught JS errors, admin/vendor guests redirect to `/login`, all 9 admin APIs answer clean `401`, **0 blocked write attempts** (read-only verified) |
| `.env*` in git | ✅ not tracked, ignored via `.gitignore` (`.env*`) — safe for Git-based deploys |
| Local filesystem writes in app code | ✅ none (uploads go to Supabase Storage) — compatible with Vercel's read-only FS |
| Framework compatibility | ✅ Next.js 16.4.3 · Vercel is a **verified adapter** (full support incl. `proxy.ts`) · `sharp` is provided by Vercel's runtime (no local install needed) |

**Remaining before any deploy:** the working tree (211+ entries, including all remediation changes and the new `admin/audit`, `admin/custom-prints` pages) is **uncommitted**. Vercel's Git integration deploys committed code only — the owner must review, commit and push first (or use the Vercel CLI, which uploads the working directory).

---

## 2. Import the project

**Option A — Git integration (recommended):** vercel.com → *Add New → Project* → import the repository. Vercel auto-detects Next.js; no `vercel.json` is required.

**Option B — CLI:** `npm i -g vercel` → `vercel` (first run links the project) → `vercel --prod`.

Build settings (defaults are correct):

| Setting | Value |
|---|---|
| Framework Preset | Next.js (auto-detected) |
| Build Command | `next build` |
| Output | default (no `output` mode configured — correct) |
| Install Command | `npm install` |
| Node.js version | `>=20` via `engines` in `package.json` (local reference: Node 22) |

---

## 3. Environment variables — set BEFORE the first build

Vercel → Project → **Settings → Environment Variables**. `.env.local` is gitignored and is **not** uploaded — every value below must be entered in the dashboard (Production + Preview + Development as needed). `NEXT_PUBLIC_*` values are inlined at **build** time, so a deploy started before they exist produces a broken bundle.

### Required

| Variable | Where to get the value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role key (**server-only**; admin stats/users/settings/custom-prints APIs fail without it) |
| `NEXT_PUBLIC_BASE_URL` | `https://<your-domain>` (no trailing slash) — feeds `sitemap.ts` / `robots.ts` / metadata. Update after attaching a custom domain |

### Strongly recommended at launch

| Variable | Why |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Vercel runs multiple serverless instances — the in-memory rate limiter is per-instance and therefore weak. Create a free DB at upstash.com |
| `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` | With Upstash set, make sensitive routes **fail closed** instead of silently falling back (fix B5) |
| `TRUST_PROXY=true` | Vercel sits behind a proxy; required for correct client IPs in rate limiting (only enable behind Vercel/Cloudflare) |
| `ADMIN_EMAILS` | Fallback admin allow-list (comma-separated). Primary checks are `profiles.role = 'admin'` and the `admin_users` table — the env list is a safety net |

### Feature-dependent

| Variable | Effect when unset |
|---|---|
| `RESEND_API_KEY` + `EMAIL_FROM` | Contact form answers honest `503`; order/custom-print emails are skipped and logged |
| `ADMIN_SETUP_KEY` | Optional guard for the read-only `/api/admin/setup` probe |
| `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` | Legacy display only |
| `SHIPPING_CALCULATE_WEIGHT` | **Leave unset** until `supabase/manual-review/05_…sql` is applied (enabling early breaks checkout — see checklist §6) |
| `NEXT_PUBLIC_STRIPE_*` / `STRIPE_*` | Payments are intentionally disabled (410) — leave empty |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` | Not needed — production OAuth providers are configured in the Supabase dashboard |

---

## 4. Post-deploy verification

1. **Automated read-only scan against the live URL:**
   ```bash
   node scripts/site-scan.mjs https://<your-deployment-url>
   ```
   Expect: all pages `200` (guest-protected ones redirect to `/login`), all `/api/admin/*` → `401`, **0 blocked write attempts**, no 5xx. (The script aborts every non-GET request, so it can never write.)
2. Manual smoke: homepage → products → product details → cart render; `/admin` as guest must land on `/login`.
3. Logged-in admin check (owner): Dashboard stats, Orders, Products, **Audit Log**, **Custom Prints**, Settings — these are the pages that depend on `SUPABASE_SERVICE_ROLE_KEY`.
4. Attach the custom domain, then update `NEXT_PUBLIC_BASE_URL` and redeploy so sitemap/robots point at the canonical origin.

---

## 5. Operational notes

- **Rate limiting:** until Upstash + `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` are configured, expect the startup warning `[RateLimit] UPSTASH_… using the per-instance limiter` — known, documented behavior (B5), not an error.
- **Admin access on the new deployment:** a user is an admin iff `profiles.role` is `admin`/`superadmin`, or a row exists in `admin_users`, or (fallback) their email is in `ADMIN_EMAILS`. The `proxy.ts` middleware re-verifies this server-side for every `/admin/*` and `/vendor/*` request.
- **Image optimization:** product images from `*.supabase.co` are allowed by `next.config.ts` `remotePatterns`; ~23 known-missing storage objects return 400 and render the `SafeImage` placeholder (A3, cleanup SQL pending approval in `manual-review/01`).
- **Payments stay disabled** (410 responses) — out of scope; do not add Stripe/Paymob credentials expecting them to work.
- **Pending approval-gated work is independent of Vercel:** `manual-review/01`–`06`, the gift-box migration, `SHIPPING_CALCULATE_WEIGHT`, and the DR `supabase db dump --linked` still require the owner (see final report §6).

---

## 6. Checklist

- [ ] Review + commit + push the working tree (owner)
- [ ] Create Vercel project (Git or CLI)
- [ ] Enter env vars (§3) **before** first deploy
- [ ] Deploy → confirm build green
- [ ] Run `node scripts/site-scan.mjs https://<url>` → all green, 0 writes
- [ ] Logged-in admin smoke test (Dashboard/Orders/Audit/Custom Prints/Settings)
- [ ] Attach custom domain → update `NEXT_PUBLIC_BASE_URL` → redeploy
- [ ] Enable Upstash + `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` + `TRUST_PROXY=true`
