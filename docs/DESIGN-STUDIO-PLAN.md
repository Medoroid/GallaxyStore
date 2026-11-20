# Creator Design Studio — Implementation Plan (Phase 1)

> Redbubble-style design-to-product workflow inside Galaxy Store.
> This document is the Phase 1 deliverable: existing-system analysis + technical design.
> Status: **approved for implementation** — phases 2-10 follow it.

---

## 1. What already exists and is reused (never rebuilt)

### 1.1 Live design/POD subsystem (verified live 2026-11-10, read-only)

The database already contains a complete design subsystem with RLS enabled and real rows.
No repo DDL and no app code references it today, so we **extend it instead of inventing `creator_designs`**.

| Table | Live rows | RLS | Why it fits |
|---|---|---|---|
| `user_designs` | 2 | insert self / update owner / **delete admin-only** / public read of approved+public | The design record: title, slug, category, `is_public`, `status design_status`, review fields (`rejection_reason`, `reviewed_by/at`), `deleted_at` soft delete |
| `design_versions` | 2 | 4 policies (owner/admin) | Version history: `version_number`, `status`, `is_current`, own review fields, `submitted_at` |
| `design_files` | 2 | owner write; anon read only `scan_status='clean'` + approved + public primary | The original artwork file: `mime_type`, `file_size_bytes`, `width_px/height_px`, `dpi`, `has_transparent_background`, `checksum_sha256`, `scan_status`, `is_primary` |
| `design_categories` | 2 | public read active | Categories for designs |
| `design_status_history` | — | owner select | History trail |
| `product_customization_areas` | 13 | 4 policies | Per-product printable areas (existing store products) — reused for the editor when the artwork is applied to a real store product later |
| `print_jobs` / `printers` | 3 | — | **Future fulfillment integration boundary** (documented, not wired) |

- `design_status` enum already equals the required workflow: `draft, pending_review, approved, rejected, archived`.
- `user_designs.owner_id → profiles(id) ON DELETE CASCADE`.
- **Delete = soft delete** (`UPDATE … SET deleted_at`): the `designs_delete_admin_only` policy means creators must never issue a hard `DELETE` (task requirement "delete designs" is satisfied by soft delete, which also satisfies "soft deletion where appropriate").

### 1.2 Commerce (all reused as-is)

- `products` (public read = `status='published' AND visibility='visible' AND deleted_at IS NULL`, insert requires `owns_store`/`is_admin`), `product_variants` (single **default variant** per product — `syncDefaultVariant`), `product_images`, `categories` (public read active), `brands`, `stores`.
- Cart / checkout / payments / orders / reviews / search / facets: untouched. Creator products are ordinary `products` rows, so they enter the existing funnel with zero new checkout code.
- `lib/product-admin.ts`: `parseProductPayload`, `syncDefaultVariant`, `replaceProductImages` — reused server-side for creator product creation.
- Stock gate: `available_stock = stock_quantity − reserved_quantity` (views) enforced in `app/api/orders/route.js` → checkout fails honestly with 409 when stock is 0.

### 1.3 Identity, admin, audit, i18n, UX

- `profiles` (id = `auth.users.id`, `full_name`, `avatar_url`, `role`) — **no public SELECT policy**, so private account data is already unreachable by the public; creators get a separate public persona table.
- `is_admin()` helper + `app/admin` shell (nav items array in `app/admin/layout.tsx`), `admin_audit_log` (+ `20261026_admin_audit_log.sql`) for recording admin actions.
- `lib/i18n.ts` typed keys (`en` + `ar`), `useLanguage()`, RTL.
- Tailwind v4 tokens (`@theme inline`: neon `#FF4FD8`, purple `#A855F7`, gold `#FFD166`, always-dark, `--radius: 1rem`), sonner Toaster, `SafeImage`, `SectionHeading`.
- Storage buckets (live): **`design-uploads` (private, 200 MB, owner-folder policies → direct browser upload)** and **`design-previews` (public, 5 MB, admin-write)** already exist for exactly our two payload types.
- API house patterns: `verifyAdmin`/`getUser` + `handleApiError` + `checkRateLimitAsync` + magic-byte validation (`lib/receipt-file.ts`) + `{success, message, data}` responses (`app/api/custom-print/route.js`, `app/api/vendor/products/images/route.js`).
- Public RSC pattern for slug pages: `app/stores/[slug]/page.tsx` (server fetch + `generateMetadata`).
- Test harness: flat `__tests__/`, per-file `jest.mock`, chainable query builders, `*-contract.test.ts` for API contracts (32 suites / 275 tests baseline).

### 1.4 Next.js 16 (read from `node_modules/next/dist/docs`)

- `proxy.ts` (root) replaces deprecated `middleware.ts`; matcher is a `config.matcher` array.
- `params` is a **Promise** in pages and route handlers → `const { id } = await params`.
- `export const runtime = "nodejs"` for routes needing Node APIs.

---

## 2. Key decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Reuse `user_designs` + `design_versions` + `design_files`**; no `creator_designs` | RLS, moderation fields, file metadata and the exact status enum already exist live. Creating parallel tables would duplicate them (explicitly forbidden). |
| D2 | **4 new tables only**: `creator_profiles`, `creator_product_templates`, `creator_design_products`, `creator_gallery_items` | Everything they hold is genuinely missing (public persona, product-type catalog, design×product configuration, gallery publication). |
| D3 | **No `creator_submissions` table** | Status + review feedback live on each entity (same pattern as `user_designs`). Admin queue = UNION query over the three entity types. Avoids dual-source-of-truth drift; decisions are recorded in `admin_audit_log`. |
| D4 | **No schema change to `products`** | Attribution flows through `creator_design_products.creator_profile_id → creator_profiles`. `products` stays untouched (highest-risk table, complex RLS). |
| D5 | **All writes to the 4 new tables go through service-role API routes; RLS is SELECT-only** | The only reliable way to block self-approval and enforce state machines client-side-proof. Mirrors `payment_receipts` (no write policies). |
| D6 | **Mockups rendered client-side** by a pure placement engine + Canvas renderer over **vector SVG templates** (transparent print-area layers), uploaded through the API | No server-side image lib in the repo; jsdom has no canvas → tests target pure math/registry/contracts. Purpose-built templates (not naive photo overlay), and photographic templates can be dropped into the same registry later. |
| D7 | **Generated mockups → `design-previews` (public), originals → `design-uploads` (private)** | Reuses existing live buckets; originals never become public (anon `design_files` read already requires approved+clean). |
| D8 | **POD fulfillment boundary**: `fulfillment_mode ∈ unconfigured\|configured` + `stock_buffer` | Unconfigured → default variant `stock_quantity = 0` → existing checkout gate fails honestly (409). Configured → stock = buffer. Product page shows an explicit "fulfillment not configured — not yet available for shipping" state. Never claims manufacturability. |
| D9 | **Creator product = service-role insert with `status='draft', visibility='hidden', store_id=null`** | RLS blocks creator inserts (no store). Draft/hidden rows are invisible to the public read policy → **not purchasable before approval**. Approval flips `status='published'`, `visibility='visible'`, `published_at=now()`. |
| D10 | Editor state persists as **`design_versions.editor_state jsonb`** (one additive column) | A version *is* an editor snapshot → design history = version history, and "resume editing later" reads `is_current` version. |
| D11 | Two RPCs (service-role-only) for multi-statement operations | `creator_publish_product()` (product + default variant + images + link, one transaction) and `admin_review_creator_submission()` (decision + product flip + stock + `admin_audit_log`, one transaction). supabase-js cannot span a transaction across calls. |

---

## 3. New database structures (migration `20261110120000_creator_studio_core.sql`)

Additive only, with `to_regclass`/`to_regprocedure` preflight for the baseline tables/functions
(`user_designs`, `design_versions`, `design_files`, `design_categories`, `profiles`, `is_admin()`),
matching the house preflight style.

```sql
-- 1) extend enums (additive; no rows using new values inside this transaction)
ALTER TYPE public.design_file_format ADD VALUE IF NOT EXISTS 'jpg';
ALTER TYPE public.design_file_format ADD VALUE IF NOT EXISTS 'webp';

-- 2) editor persistence (one column)
ALTER TABLE public.design_versions
  ADD COLUMN IF NOT EXISTS editor_state jsonb NOT NULL DEFAULT '{}';

-- 3) public persona (profiles has no public read policy)
CREATE TABLE public.creator_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username      text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  avatar_url    text,
  bio           text CHECK (bio IS NULL OR char_length(bio) <= 500),
  social_links  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- allow-listed keys only (validated server-side)
  is_featured   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  can_publish   boolean NOT NULL DEFAULT true,         -- admin-managed publishing permission
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 4) product-type catalog (seeded with the 8 required types)
CREATE TABLE public.creator_product_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    text NOT NULL UNIQUE,               -- tshirt | hoodie | sweatshirt | mug | phone_case | tote_bag | poster | mouse_pad
  name            text NOT NULL,
  name_ar         text,
  category        text NOT NULL,                      -- maps to categories for publishing
  dimensions_mm   jsonb NOT NULL,                     -- {w,h,depth?}
  views           jsonb NOT NULL,                     -- [{key,label,canvas:{w,h},print_area:{x,y,w,h},layers:[...]}]
  colors          jsonb NOT NULL,                     -- [{key,name,name_ar,hex,shade_hex}]
  sizes           jsonb NOT NULL,                     -- [{key,name,label}]
  mockup_format   text NOT NULL DEFAULT 'png' CHECK (mockup_format IN ('png','jpg','webp')),
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 5) design × product configuration (the heart of multi-product customization)
CREATE TABLE public.creator_design_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id           uuid NOT NULL REFERENCES public.user_designs(id) ON DELETE CASCADE,
  template_id         uuid NOT NULL REFERENCES public.creator_product_templates(id) ON DELETE RESTRICT,
  creator_profile_id  uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  view_states         jsonb NOT NULL DEFAULT '{}',    -- {front:{x,y,scale,rotation,lockAspect},back:{...}}
  selected_colors     text[] NOT NULL DEFAULT '{}',
  selected_sizes      text[] NOT NULL DEFAULT '{}',
  mockups             jsonb NOT NULL DEFAULT '[]',    -- [{view,color,path,width,height,config_hash,generated_at}]
  status              public.design_status NOT NULL DEFAULT 'draft',
  rejection_reason    text,
  reviewed_by         uuid REFERENCES public.profiles(id),
  reviewed_at         timestamptz,
  submitted_at        timestamptz,
  product_id          uuid REFERENCES public.products(id) ON DELETE SET NULL,  -- set at publish
  fulfillment_mode    text NOT NULL DEFAULT 'unconfigured'
                        CHECK (fulfillment_mode IN ('unconfigured','configured')),
  stock_buffer        integer NOT NULL DEFAULT 0 CHECK (stock_buffer BETWEEN 0 AND 100000),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE UNIQUE INDEX creator_design_products_design_template
  ON public.creator_design_products (design_id, template_id) WHERE deleted_at IS NULL;
CREATE INDEX creator_design_products_profile_idx ON public.creator_design_products (creator_profile_id) WHERE deleted_at IS NULL;
CREATE INDEX creator_design_products_product_idx ON public.creator_design_products (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX creator_design_products_status_idx ON public.creator_design_products (status) WHERE deleted_at IS NULL;

-- 6) gallery publication
CREATE TABLE public.creator_gallery_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id       uuid NOT NULL REFERENCES public.user_designs(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_profile_id uuid REFERENCES public.creator_profiles(id) ON DELETE SET NULL,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description     text CHECK (description IS NULL OR char_length(description) <= 2000),
  preview_path    text,                                -- public URL path in design-previews
  tags            text[] NOT NULL DEFAULT '{}',
  visibility      text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted')),
  status          public.design_status NOT NULL DEFAULT 'draft',
  rejection_reason text,
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,
  submitted_at    timestamptz,
  published_at    timestamptz,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,  -- later "publish as product"
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**RLS (SELECT-only, `DROP POLICY IF EXISTS` + `CREATE`, `(select auth.uid())`, `is_admin()`):**

| Table | Public (anon) | Owner | Admin |
|---|---|---|---|
| `creator_profiles` | `SELECT` all rows (public persona only — **no email/phone ever stored here**, API rejects unknown fields) | same | full |
| `creator_product_templates` | `SELECT` where `is_active` | — | full (via API/service role) |
| `creator_design_products` | `SELECT` only when linked product is `published + visible + not deleted` (enables the attribution embed) | `SELECT` own rows | `SELECT` all |
| `creator_gallery_items` | `SELECT` where `status='approved' AND visibility='public' AND deleted_at IS NULL` | `SELECT` own rows | `SELECT` all |

No INSERT/UPDATE/DELETE policies anywhere on these four tables — mutations only via service-role routes (D5).

**Storage (idempotent):**

- `INSERT INTO storage.buckets … ON CONFLICT (id) DO NOTHING` for `design-uploads` (private) and `design-previews` (public) so fresh databases match live.
- `UPDATE storage.buckets SET allowed_mime_types = … WHERE id='design-uploads'` → widen to include `image/jpeg` and `image/webp` (currently missing; the task requires them). Size limit left as-is (200 MB live); the app enforces 10 MB.
- Recreate the 4 `design-uploads` owner-folder policies (`drop policy if exists` + `create`) so fresh DBs can do direct browser uploads exactly like live, plus the 3 `design-previews` admin-write policies, so a fresh environment matches live byte-for-byte. Mockup writes still go through the API (service role) only.

**RPCs** (service-role-only, `REVOKE EXECUTE FROM public, anon, authenticated`):
- `creator_publish_product(p_design_product_id uuid, p_payload jsonb) RETURNS uuid`
- `admin_review_creator_submission(p_target text, p_id uuid, p_decision text, p_reason text) RETURNS jsonb`

These two ship with the **phase 7** migration (`20261110170000_creator_studio_publish_functions.sql`)
so the multi-statement publish/review transactions land together with the APIs that call them.
The phase 2 file above contains schema, RLS, grants and storage only.

---

## 4. New UI, routes and components

### Pages

| Route | Purpose | Notes |
|---|---|---|
| `/studio` | Design Studio home: my designs grid, upload (drag-drop + picker), empty/loading/error states | Client page, React Query |
| `/studio/[designId]` | **Editor**: desktop 3-pane (left = artwork + product catalog, center = preview, right = controls); mobile = full-width preview + collapsible panels + bottom action bar | `await params` |
| `/creator` | Creator Dashboard: Overview, My Designs, My Products, My Gallery, Drafts, Pending, Rejected, Settings via `?tab=` | Mirrors `app/vendor/layout.tsx` shell pattern |
| `/creators/[username]` | Public creator profile (RSC + `generateMetadata`, tabs for products/gallery, pagination) | Pattern: `app/stores/[slug]/page.tsx` |
| `/admin/creators` | Creator management: creators, submission queue (UNION), review artwork + mockups, approve/reject/archive, feature, permissions, template/area management | Added to `app/admin/layout.tsx` nav |

### API routes (13)

```
app/api/designs/route.js                          GET list own · POST create (multipart upload)
app/api/designs/[id]/route.js                     GET · PATCH (rename, editor_state, submit) · DELETE (soft)
app/api/designs/[id]/artwork/route.js             POST replace artwork → new design_versions row
app/api/designs/[id]/products/route.js            GET · POST (add product config)
app/api/designs/[id]/products/[rowId]/route.js    PATCH (view_states/colors/sizes/mockups) · DELETE (soft)
app/api/designs/[id]/mockups/route.js             POST multipart (generated PNG) → design-previews, idempotent by config_hash
app/api/designs/[id]/publish/route.js             POST {target:'product'|'gallery', …} → pending_review
app/api/creator/dashboard/route.js                GET stats + section lists
app/api/creator/profile/route.js                  GET · PATCH (username/slug validation)
app/api/creators/[username]/route.js              GET public profile + counts
app/api/creators/[username]/content/route.js      GET products|gallery, paginated (public RSC page fallback)
app/api/admin/creators/route.js                   GET queue · PATCH decisions/feature/permissions
app/api/admin/creator-templates/route.js          GET · POST · PATCH · DELETE (templates, views, print areas, colors, sizes)
```

`proxy.ts` matcher gains `/studio/:path*` and `/creator/:path*` only — **`/creators` stays public**.

### Reused / new lib modules

```
lib/design-studio/types.ts            Transform, ViewState, ProductTemplate, MockupRecord, warnings
lib/design-studio/placement.ts        PURE math: fit, align, rotate, bounds, overflow + DPI warnings, clamp, reset
lib/design-studio/history.ts          PURE bounded undo/redo stack
lib/design-studio/templates/index.ts  8 vector product templates (viewBox, layers, print area, colors, sizes)
lib/design-studio/render.ts           Canvas renderer: color layer → clipped artwork → shading overlay → PNG blob
lib/design-studio/svg-sanitize.ts     Allow-list SVG sanitizer (server-side; rejects script/foreignObject/on*/external refs/ENTITY)
lib/design-studio/validate.ts         MIME + magic bytes, size, dimension, transparency detection, DPI math
lib/design-studio/mockup-hash.ts      Deterministic config_hash → skip regeneration
```

Components: `app/components/studio/{Dropzone,ArtworkCanvas,TransformControls,ProductCatalog,ProductConfigCard,MockupPreview,PublishDialog,DesignCard,StatusBadge,ConfirmDialog,UnsavedChangesGuard}.tsx`.

### Design-system compliance

- Only existing tokens (`bg-card`, `border-border`, `text-neon`, `rounded-2xl`, glass surfaces), `lucide-react` icons, sonner toasts, existing modal/table/badge conventions inlined per page (the repo has no shared primitives).
- Every string via `useLanguage().t` with new `studio_*` / `creator_*` keys added to **both** `en` and `ar`; layout verified with `dir="rtl"` behavior.
- Warnings: boundary overflow, insufficient resolution (DPI < 150 effective), aspect-ratio unlock confirmation.

---

## 5. Security model

1. **Never trust the client**: user id, creator id, ownership, prices, approval state and category are derived from the session server-side; `parseProductPayload`-style validation on every payload.
2. **Self-approval impossible**: the four new tables have no write policies at all; only service-role routes mutate, and `admin_review_creator_submission()` is service-role-only and writes `admin_audit_log`.
3. **Private artwork**: originals live in private `design-uploads`; the browser reads only its own folder (existing owner policies); public surfaces expose only generated previews/product images.
4. **SVG**: sanitised server-side with an allow-list before storage; never rendered inline without sanitisation.
5. **Draft products** are excluded by the existing public `products` policy → no pre-approval purchases; variants/images of drafts are unreachable without the product id.
6. **Rate limiting** (`checkRateLimitAsync`) + magic-byte checks + size/dimension caps on every upload; multipart size capped; duplicate-submission guard (idempotent `config_hash`, unique partial index, publish refuses if `product_id` already set).
7. No service-role key ever reaches the client (server routes only); no new env vars required beyond the existing `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Performance plan

- Mockups cached by `config_hash` (skip re-render + re-upload when unchanged); thumbnails via width/height metadata + `loading="lazy"` (existing `SafeImage`).
- Pagination (12/page) for designs, creator products and gallery.
- `revalidate = 300` on the public creator profile RSC page; JSON/React Query caching for dashboard lists.
- Editor: pure-function transforms (no network per keystroke), debounced persistence, bounded undo stack.
- Indexes on every FK used by list queries (§3); attribution embed is a single indexed join.

## 7. Conflicts / risks and mitigations

| Risk | Mitigation |
|---|---|
| 13 legacy + 7 `create_*.sql` migrations still pending on live; CLI linked to production | Migration is written + statically tested locally, **never pushed** without an isolated staging branch (`list_branches` = `[]` today) and explicit approval |
| `design_file_format` enum lacks `jpg`/`webp` | `ADD VALUE IF NOT EXISTS` (PG12+, additive); no rows using the new values in the same transaction |
| `design-uploads` MIME list lacks jpeg/webp | Idempotent `UPDATE storage.buckets` inside the migration |
| `products` RLS blocks creator inserts | All product creation through service role (D9) |
| Checkout could claim stock that does not exist | `fulfillment_mode` + `stock_buffer`; unconfigured ⇒ stock 0 ⇒ existing 409 gate (D8) |
| Canvas unavailable in jsdom | Tests target pure modules + API contracts; renderer feature-detects and degrades |
| `productSelect` embed increases query cost | One indexed LEFT JOIN; only4 call sites |
| Admin template edits could corrupt print areas | Server-side geometry validation (print area ⊂ canvas, positive sizes) + tests |

## 8. Phase mapping (each phase = working code + tests)

| Phase | Deliverable | Acceptance |
|---|---|---|
| 1 | This document | ✅ |
| 2 | `20261110120000_creator_studio_core.sql` + static guard tests | tsc/lint/jest/build green; migration is additive, preflight-guarded, no live writes |
| 3 | `creator_profiles`, `/creator` dashboard, `/creators/[username]`, i18n keys, proxy matcher | Profile CRUD + public page render; tests for slug validation + public/private exposure |
| 4 | `/studio` + `/studio/[designId]` editor, upload pipeline, placement/history/sanitize modules | Editor tests: upload, position, scale, rotate, boundaries, persistence, undo/redo |
| 5 | Template registry (8 types) + mockup renderer + `POST …/mockups` caching | Mockup tests: templates, transparency, colors, placement, persistence/idempotency |
| 6 | Multi-product catalog UI + per-product config + error states | Config tests: independent state, color/size multi-select, validation |
| 7 | Publish (product + gallery), approval RPC, attribution embed | Publishing tests: draft/gallery/product/approval/rejection/attribution + self-approval blocked |
| 8 | Marketplace integration: attribution on detail + discovery sections + creator profile content | Commerce tests: detail/cart/checkout/order ownership unchanged |
| 9 | `/admin/creators` + template/area management + audit | Admin tests: decisions, feature, permissions, protected fields |
| 10 | Full test pass, perf sweep, `docs/FINAL-REPORT.md` §M + `docs/TODO.md` update | 100% existing suites pass; new suites documented |

## 9. Explicit non-goals / integration boundaries (documented in the final report)

- No malware scanner: `design_files.scan_status` stays `'pending'` (honest); a scanner can be wired later without schema change.
- No POD provider: `print_jobs`/`printers` and `fulfillment_mode='configured'` are the integration points; until then the UI states plainly that the product is not yet available for shipping.
- No photographic mockup assets: the shipped templates are purpose-built vector mockups with transparent print areas; the registry accepts raster templates later.
- No changes to checkout, payments, orders, auth, vendor or existing admin flows.
