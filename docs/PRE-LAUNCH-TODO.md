# Galaxy Store — Pre-Launch TODO

Generated 2026-11-17 from the comprehensive audit. Nothing below was applied to production. Items marked **BLOCKS LAUNCH: YES** must be closed before public deployment.

---

## P0 — Release blockers

| # | Exact file / route / object | Root cause | Impact | Required action | Blocks launch |
|---|---|---|---|---|---|
| 1 | `supabase/manual-apply/20261112_pending_bundle.sql` (sections 1–8) + `supabase/migrations/20261116130000_custom_print_studio.sql` + `supabase/migrations/20261117140000_gift_box_bundles.sql` | Local migrations never applied to `httywgkwfqvrbuwuzutu` (verified by catalog queries) | `products.available_sizes` missing → every first products SELECT returns 400 (fallback slows pages); `/api/admin/products` GET fails; theme/site-content/creator/custom-print/gift-box features dead; admin performance view has phantom rows | Authorized operator pastes the bundle into Supabase SQL Editor, then applies the two later migrations; run the bundle's 4 verification queries (all must be `true`/named, 4 revokes `locked_down=true`) | **YES** |
| 2 | DB function `public.confirm_order_payment(uuid,text,text,numeric,jsonb,text)` | `SECURITY DEFINER` with no caller check and ACL `=X/postgres` (anon EXECUTE) | Any anonymous caller knowing an order UUID can insert a `succeeded` payment and flip `pending → paid` without paying | Apply section 8 of the bundle (`REVOKE ... FROM public, anon, authenticated`, keep `service_role`), then confirm `proacl` via the verification query | **YES** |
| 3 | DB functions `public.sync_product_available_colors(uuid)`, `public.trg_sync_colors_from_variant()`, `public.trg_sync_colors_from_variant_options()` | Same public EXECUTE grant; direct call rewrites arbitrary products' colours | Data integrity: colours can be overwritten by unauthenticated callers | Apply bundle section 8; verify all 4 functions show `locked_down=true` | **YES** |
| 4 | 19 `public.vendor_*` views (e.g. `vendor_pending_designs`, `vendor_order_items`, `vendor_dashboard_overview`, `vendor_mv_*`) | Views are `security_definer` — evaluated with creator privileges, not caller's RLS (advisor ERROR `security_definer_view`) | Potential cross-vendor data exposure if grants are broad | Set `security_invoker = true` via a new local migration (or restrict GRANTs), then re-run Supabase advisors | **YES** |

---

## P1 — Critical before public launch

| # | Exact file / route | Root cause | Impact | Required action | Blocks launch |
|---|---|---|---|---|---|
| 5 | `e2e/homepage.spec.ts`, `e2e/products.spec.ts`, `e2e/content-pages.spec.ts`, `e2e/reset-password.spec.ts` | 7/13 read-only E2E tests fail: first products query 400 (pending `available_sizes`) + slow fallback within a 20 s expect timeout; several expectations also mismatch current WIP UI copy | Storefront not verified end-to-end; regressions could ship unnoticed | Apply P0 #1, then re-run against a clean pre-production build; update stale copy assertions only if the new text is intentional | **YES** |
| 6 | `app/api/vendor/payout/route.js:73-76` + `app/vendor/earnings/page.tsx:98` + `vendor_payout_requests` | UI collects `method` (`bank_transfer`/`paypal`) but the route never reads it and the table has no `method` column; `request_vendor_payout(p_store_id,p_amount)` has no method parameter | Vendor's payout instruction is silently discarded; 0 requests exist today, so no data lost yet | Local migration: add `method text`, drop/recreate RPC with `p_method text default null`, re-grant `authenticated`; pass `p_method` from the route; add an admin payout request list with approve/reject | **YES** (before vendors are enabled) |
| 7 | `test/integration-env.ts` / `npm run test:integration` | Requires `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY`; none available | 6 integration suites cannot run; no authenticated/admin workflow verification | Provide an isolated staging Supabase project or local `supabase start`; never point at production | No (verification gap) |
| 8 | `app/api/admin/products/images/route.js:90-103`, `app/api/gallery/route.js:91-104`, `app/api/custom-print/route.js:121-134` | MIME type taken from client-supplied `file.type` with no magic-byte sniff (unlike vendor images, designs, receipts) | Mislabelled files can enter public buckets; XSS risk if HTML/SVG served as image | Reuse the project's existing `prepareArtwork` / byte-sniffing helper (or extend `validateProductImageFile` with magic bytes) and update contract tests with real file bytes | No (admin-authenticated only) |
| 9 | RLS policies on `vendor_earnings`, `vendor_payout_requests`, `vendor_commissions`, `recently_viewed_products` | Named `*_owner_or_admin` but SELECT checks only `owns_store(...)`; `roles={public}` | Admin may not see vendor earnings/payouts through the user client; broader role scope than intended | Local migration adding explicit admin branch (`is_admin()`/service role already used in APIs) and narrowing roles to `authenticated` | No (APIs use service role) |
| 10 | `app/api/admin/_lib/verifyAdmin.ts:50-79` | RPC/table errors swallowed; falls back to `ADMIN_EMAILS` env allow-list even when `profiles.role` is not admin | A DB outage silently weakens admin authorization; env list is a bypass | Fail closed on errors, require `profiles.role='admin'` or `admin_users` row; keep `ADMIN_EMAILS` only as documented bootstrap with audit | No (admin-only) |
| 11 | `app/api/products/[id]/track/route.js:26-34` | No rate limit, arbitrary client `session_token` | Trivial view-count pollution | Add the shared IP rate limiter (fail_closed) and validate token format | No |
| 12 | `app/components/payment/ReceiptUploader.tsx:158-182` | Uploads to `<uid>/<orderId>/…` before server validates order ownership | Orphaned/overwritten files if Storage RLS path constraint regresses | Validate order ownership in the client flow or move upload server-side after `auth.getUser()` + order check | No |
| 13 | `app/profile/page.tsx:135-148` | Direct browser writes to `profiles`/auth metadata, no length/format validation, errors swallowed | Inconsistent profiles, silent failure | Route through a validated API handler or add explicit validation + visible error state | No |

---

## P2 — Important, schedule after launch stabilizes

| # | Exact file / route / object | Root cause | Impact | Required action | Blocks launch |
|---|---|---|---|---|---|
| 14 | `public.mv_trending_products` | Materialized view selectable by `anon`/`authenticated` (advisor WARN) | Unnecessary data exposure | `REVOKE SELECT ... FROM anon, authenticated` if the UI reads it via service role | No |
| 15 | 38 anon-executable / 85 authenticated-executable `SECURITY DEFINER` functions | Broad default grants; most have token/owner guards but not audited individually | Latent privilege-escalation surface | Enumerate and revoke where unused; prefer service-role-only for admin helpers | No |
| 16 | Duplicate indexes: `order_items(order_id)` ×2, `recently_viewed_products` session/user pairs, `reviews(product_id)` ×2, `payments(provider_payment_id)` ×2 | Redundant definitions | Extra write overhead | Drop the older duplicates in a local migration after confirming query plans | No |
| 17 | Supabase Auth config | Leaked Password Protection disabled | Weak credential policy | Enable in Supabase Auth settings (operational, not code) | No |
| 18 | `app/api/reviews/route.js:69-72`, `app/api/search/route.js` | Write rate limits use `fail_open`; reviews allowed without purchase verification | Spam/abuse under Redis outage | Use `fail_closed` for mutating endpoints; consider purchase check for reviews | No |
| 19 | `app/api/cart/route.js:284-318,360` | `cart_id` trusted for coupon actions (RPC re-checks owner); no upper bound on `quantity` | Larger carts than intended if RPC cap is absent | Add explicit ownership load + quantity cap (e.g. ≤99) | No |
| 20 | `lib/products.ts:464-517`, `lib/cartService.ts:126-258` | Dead/latent browser-client write helpers duplicating audited API routes | Future developer could bypass auth/validation by importing them | Delete or convert to server-only, with tests | No |
| 21 | `app/api/admin/setup/route.js:16-31` | Static secret in URL query string | Secret leaks via access logs/referrers | Move to header/POST body; 410 when disabled already helps | No |
| 22 | `app/admin/gift-boxes/page.tsx:442` (untracked WIP) | React Compiler: "Existing memoization could not be preserved"; also unused `addItemToBox` | `npm run lint` exits 1 (only error); file is not in HEAD | Owner of WIP to remove/replace the manual `useMemo` and unused variable | No (not shipped in HEAD) |

---

## P3 — Improvements / documentation

| # | Item | Action | Blocks launch |
|---|---|---|---|
| 23 | WIP Theme Studio / Creator Studio (~105 untracked files) | Finish, test and commit separately; typography ranges were aligned with the validator but remain in WIP | No |
| 24 | 47 ESLint warnings (`react-hooks/set-state-in-effect`, unused `_error`) | Batch cleanup; none are errors in HEAD | No |
| 25 | `docs/FINAL-PRODUCTION-READINESS-REPORT.md` and other older reports | Reconcile with this audit; keep one source of truth | No |
| 26 | `custom-print-designs` private bucket has 0 storage policies | Document service-role-only access or add scoped policies | No |

---

## Already fixed in this audit (for reference)

- `lib/gift-box.ts` syntax error; `/api/admin/custom-print` GET auth forwarding; `/api/notifications` double body read; `/api/email` ownership check; `/api/gift-boxes` + `[id]` `PGRST205` fallback; `Object.hasOwn` action dispatch; shipping subtotal validation; limit clamps; review-reply UUID validation; prepared P0/P1 SQL revokes.
- Earlier in this release chain (commits `5e6cbad`, `e40e963`, `7a06e7d`, `9bb3e6f`): colour/size persistence, compare-at validation, shipped-note preservation, `published_at` preservation, archived-product restore, moderation/prompt fields, gallery description, print currency, Next.js 16.4.6.
