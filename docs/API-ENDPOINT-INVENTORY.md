# Galaxy Store — API Endpoint & Data-Operation Inventory

Audit date: 2026-11-17 · Baseline: `main` @ `9bb3e6f` (Next.js 16.4.6) · Supabase ref `httywgkwfqvrbuwuzutu`

Discovery was performed from source, not from `fetch()` alone: route handlers, `"use server"`, `action=`, Supabase `.from/.rpc/.storage/.auth`, webhook receivers, third-party SDKs, form handlers, proxy/middleware and cron configuration.

## Counts

| Item | Count |
|---|---|
| Route handler files | **86** (85 under `app/api/**`, 1 at `app/auth/callback`) |
| Exported HTTP operations | **143** |
| GET operations | **59** |
| Mutation operations | **84** (POST 52, PATCH 19, DELETE 13; no PUT/OPTIONS/HEAD) |
| Route files with ≥1 unauthenticated operation | 22 (public by design + 4 disabled stubs) |
| Server Actions | **0** |
| Route handlers outside `app/api/**` | 1 (`/auth/callback`) |
| Client `fetch()` call sites | ~167 (59 files) |
| Direct Supabase `.from()` outside `app/api/**` | 60 (37 files) |
| Direct Supabase `.rpc()` outside `app/api/**` | 3 (`lib/cartService.ts`) |
| Direct Supabase `.storage` usages outside `app/api/**` | 5 |
| Active browser-side table/storage writes outside API | 2 (`profiles`, `payment-receipts`) |
| Latent/dead browser-side write helpers | 2 modules (`lib/products.ts`, `lib/cartService.ts`) |
| Webhook receivers | 2 (both deliberately disabled) |
| Cron / scheduled jobs | 0 |

Auth legend: **verifyAdmin** = `app/api/admin/_lib/verifyAdmin.ts`; **bearer** = `Authorization: Bearer` + `auth.getUser()`; **requireUser** = `lib/creator/api.ts`; **public** = no caller check (RLS / rate limit only); **key** = static setup key; **stub** = intentionally disabled (410/ignored).

Status: **✓** tested by a named contract/integration test, **~** partially covered, **—** no dedicated test. "Test" means automated mock-based contract coverage; it does not imply a live production write test.

---

## A. Admin routes (30 files, 70 operations)

| Route | Methods | Purpose | Auth / authorization | Input | DB / storage effects | External | Validation | Tests |
|---|---|---|---|---|---|---|---|---|
| `/api/admin` | GET | Admin status check | verifyAdmin | — | — | — | — | ~ |
| `/api/admin/add` | POST | Promote user to admin | verifyAdmin; target resolved server-side | `email` / `user_id` | `profiles` update, `admin_users` insert, audit | — | presence + existence | ✓ |
| `/api/admin/audit` | GET | Audit trail | verifyAdmin | `?limit`, `?entity_type`, `?action` | SELECT `admin_audit_log` | — | limit 1–200 | ~ |
| `/api/admin/content` | GET/POST/PATCH/DELETE | Banners & sections CMS | verifyAdmin on all 4 | `type`, fields, `order[]`, `?type&id` | `site_banners`, `site_sections` CRUD; storage remove; audit | — | UUID + field validators | ✓ |
| `/api/admin/content/images` | POST | Banner image upload | verifyAdmin | multipart file | `site-banners` upload | — | `validateProductImageFile`, rate limit | ✓ |
| `/api/admin/creators` | GET/PATCH | Creator review queue | verifyAdmin | `?status`; actions review/feature/permissions/archive | `creator_design_products`, `creator_gallery_items`, `creator_profiles`, `products`; RPC `admin_review_creator_submission`; audit | — | allow-list, UUID, reason ≤1000 | ✓ |
| `/api/admin/creator-templates` | GET/POST/PATCH/DELETE | Product-type template catalog | verifyAdmin all 4 | `template_key`, views/colors/sizes | `creator_product_templates` CRUD; audit | — | `validateTemplateInput`, immutable key | ✓ |
| `/api/admin/custom-print` | GET | Submission queue + mockup catalog | verifyAdmin (fixed 2026-11-17: now forwards caller request) | — | `mockup_templates`, `shared_designs` | — | migration guard | ✓ |
| `/api/admin/custom-print` | POST/PATCH | Moderate design / toggle mockup | verifyAdmin | `id`, `action`, `reason`, `is_active`, store links | `shared_designs`, `mockup_templates`, audit | — | UUID + allow-list | ✓ |
| `/api/admin/custom-print/assets` | POST | Mockup layer asset upload | verifyAdmin + IP rate limit fail-closed | multipart file | `mockup-assets` upload | — | magic bytes + SVG sanitize, 2 MB | ✓ |
| `/api/admin/custom-print/templates` | GET/POST/PATCH/DELETE | Mockup template editor | verifyAdmin via guardAuth | template payload, `?id` | `mockup_templates` CRUD (soft delete); audit | — | `validateTemplatePayload` | ✓ |
| `/api/admin/custom-print/templates/preview` | POST | Compose unsaved preview | verifyAdmin | template, view/color/artwork | none (no persistence) | — | validator + safe href | ✓ |
| `/api/admin/custom-prints` | GET/PATCH | Print request queue & statuses | verifyAdmin | `id`, `status`, `quoted_amount`, `currency`, `admin_notes` | `custom_print_requests`, signed URLs | **Email** | allow-lists | ~ |
| `/api/admin/gift-boxes` | GET/POST | Gift-box bundles admin | verifyAdmin | `action`, box + item payloads | `products`, `gift_boxes`, `gift_box_items`, `product_variants` | — | `parseProductPayload`, composition validator | ✓ |
| `/api/admin/orders` | GET/PATCH | Order list, status/payment actions | verifyAdmin + admin JWT RPCs | `order_id`, `status`, `action`, `payment_id`, `approve` | RPCs `update_order_status`, `mark_cod_collected`, `verify_*_payment`; `payments`, `shipments`; audit | **Email** | status allow-list, server-chosen provider | ✓ |
| `/api/admin/products` | GET/POST | Product CRUD incl. archive/restore | verifyAdmin | `action`, `product_id`, product payload | `products` insert/update, variant/attribute sync | — | `parseProductPayload`, UUID | ✓ |
| `/api/admin/products/images` | POST/PATCH/DELETE | Product image management | verifyAdmin all 3 | multipart, `image_id`, `sort_order` | `product-images` bucket + `product_images` | — | MIME from `file.type` + size (see TODO P2) | ✓ |
| `/api/admin/refunds` | GET/POST | Refund & return workflow | verifyAdmin; RPCs re-check `is_admin()` | `action`, `order_id`, `amount`, `reason` | RPC `issue_refund`, `mark_refund_completed/failed`, `update_return_status`; audit | — | UUID, amount>0, reason, allow-list | ✓ |
| `/api/admin/reviews/moderate` | GET/POST | Review queue + moderate | verifyAdmin + admin JWT RPC | `review_id`, `new_status`, `note` | `admin_reviews_moderation_queue`; RPC `moderate_review` | — | status allow-list | ✓ |
| `/api/admin/settings` | GET/PATCH | Store settings | verifyAdmin | `settings{}` | `store_settings` upsert | — | per-key allow-list validators | ✓ |
| `/api/admin/setup` | POST | Bootstrap readiness probe | **key** (`?key=` vs `ADMIN_SETUP_KEY`), no identity | query key | SELECT count `admin_users` | — | key equality; 410 when unset | ✓ |
| `/api/admin/stats` | GET | Dashboard statistics | verifyAdmin | — | 8 service-role reads | — | — | ~ |
| `/api/admin/theme-settings` | GET/PATCH | Default/override theme pin | verifyAdmin | theme ids | `theme_settings`, `theme_schedule_history`, `store_themes`; audit; cache purge | — | UUID/null; archived rejected | ✓ |
| `/api/admin/themes` | GET/POST | Theme inventory/create | verifyAdmin | theme fields | `store_themes`, history, audit | — | validator, slug 409 | ✓ |
| `/api/admin/themes/[id]` | GET/PATCH/DELETE | Theme detail/edit/delete | verifyAdmin all 3 | `id`, theme fields | `store_themes`, versions/history, 3 delete guards, audit | — | UUID, guard windows | ✓ |
| `/api/admin/themes/[id]/duplicate` | POST | Clone theme | verifyAdmin | `id` | `store_themes` ×2, history, audit | — | UUID, slug retry | ✓ |
| `/api/admin/themes/[id]/publish` | POST | Snapshot + publish | verifyAdmin | `id`, `note` | `theme_versions`, `store_themes`, history, audit | — | UUID, note ≤300 | ✓ |
| `/api/admin/themes/[id]/versions` | GET/POST | History / snapshot / restore | verifyAdmin | `id`, `note`, `restore` | `theme_versions`, `store_themes`, history, audit | — | int version ≥1, allow-list | ✓ |
| `/api/admin/themes/assets` | GET/POST/DELETE | Theme asset bucket | verifyAdmin all 3 | `?theme_id`, `?id`, multipart | `theme-assets` + `theme_assets`; audit; cache purge | — | image validator, asset type, UUID | ✓ |
| `/api/admin/users` | GET/PATCH | User list & role changes | verifyAdmin | `user_id`, `role` | `profiles`, `admin_users`, `auth.admin.listUsers`; audit | — | allow-list, self/last-admin guards | ✓ |
| `/api/admin/vendors` | GET/POST | Store approval + payout decisions | verifyAdmin | `action`, `store_id`, `payout_request_id`, `reason`, `notes` | `stores` status; RPC `approve_/reject_vendor_payout_request`; audit | — | `Object.hasOwn(STORE_ACTIONS)` (fixed 2026-11-17) | ✓ |

## B. Vendor routes (6 files, 13 operations)

| Route | Methods | Purpose | Auth / authorization | Input | DB effects | Validation | Tests |
|---|---|---|---|---|---|---|---|
| `/api/vendor/stats` | GET | Dashboard | bearer + store by `owner_id` | — | 11 `vendor_*` views, products | ownership | ~ |
| `/api/vendor/orders` | GET | Vendor order items | bearer + IP limit + store check | — | `vendor_order_items`, `profiles`, `products` | RLS view | ✓ |
| `/api/vendor/products` | GET/POST | Own-store products | bearer + session-derived store | `action`, product payload | `products`, variants, attributes | `parseProductPayload` | ✓ |
| `/api/vendor/products/images` | POST/PATCH/DELETE | Own-store images | bearer + `authenticateVendor`, fail-closed limit | multipart, `image_id` | `product-images` + `product_images`, rollback | magic bytes, 5 MB, image cap | ✓ |
| `/api/vendor/shipments` | GET/POST | Shipment create + status machine | bearer + store; per-item `vendor_order_items` checks | order/item ids, status, tracking | `shipments`, `shipment_items`, `order_items`, `orders` | transition allow-list, payment gate | ✓ |
| `/api/vendor/payout` | GET/POST | Request/list payouts | bearer + store derived from user | `amount` | RPC `request_vendor_payout`, `vendor_earnings` | amount>0, rate limit | ✓ |

## C. Creator / Design Studio (11 files, 22 operations)

| Route | Methods | Purpose | Auth | Input | DB effects | Validation | Tests |
|---|---|---|---|---|---|---|---|
| `/api/creator/profile` | GET/PATCH | Own persona | requireUser; id from JWT | persona fields | `creator_profiles` upsert | allow-list rejects flags/identity | ✓ |
| `/api/creator/dashboard` | GET | Own dashboard | requireUser, owner-scoped | — | `user_designs`, `creator_design_products`, `creator_gallery_items` | RLS | ✓ |
| `/api/creators/[username]` | GET | Public profile | public | `username` | `creator_profiles` + counts | regex | ✓ |
| `/api/creators/[username]/content` | GET | Public content | public | `type`, `page`, `per_page` | gallery / design products | regex, clamp 1–24 | ✓ |
| `/api/designs` | GET/POST | List / upload design | requireUser; fail-closed POST limit | multipart, `title` | `design-uploads`, `user_designs`, `design_versions`, `design_files` | `prepareArtwork`, SVG sanitize | ✓ |
| `/api/designs/[id]` | GET/PATCH/DELETE | Editor | requireUser + `loadOwnedDesign` | id, fields, editor_state | `user_designs`, `design_versions` | `validateDesignPatch` allow-list | ✓ |
| `/api/designs/[id]/artwork` | POST | Replace artwork | requireUser + owner proof | multipart | storage + version/file insert | `prepareArtwork` | ✓ |
| `/api/designs/[id]/mockups` | POST | Save mockup | requireUser + owner proof (service role after) | multipart, `config` | `design-previews`, `creator_design_products.mockups` | registry config, stale check | ✓ |
| `/api/designs/[id]/products` | GET/POST | Product configs | requireUser + owned design | template, colors, sizes | `creator_design_products` | validator, idempotent 23505 | ✓ |
| `/api/designs/[id]/products/[rowId]` | PATCH/DELETE | Config edits / soft delete | requireUser + owner binding | view states, colors, sizes | `creator_design_products` | validator, 409 `product_linked` | ✓ |
| `/api/designs/[id]/publish` | POST | Publish to product/gallery | requireUser + owned design + `can_publish` | target, product fields | RPC `creator_publish_product`, `creator_gallery_items` | `validatePublishInput` | ✓ |

## D. Checkout / Orders / Payments (16 files, 25 operations)

| Route | Methods | Purpose | Auth | Input | DB / external effects | Tests |
|---|---|---|---|---|---|---|
| `/api/checkout` | GET/POST | Disabled card checkout | none | — | none (stub) | ✓ |
| `/api/checkout/preview` | POST | Price/shipping preview | bearer + cart owner | `cart_id`, country, address, method | RPCs `calculate_tax`, `gift_wrap_fee`, `get_shipping_options` | ✓ |
| `/api/checkout/verify` | GET | Disabled Stripe success lookup | none | — | none (stub) | ✓ |
| `/api/orders` | GET | Own order list | bearer + `.eq(user_id)` | — | `orders`, `payments` | ✓ |
| `/api/orders` | POST | Place order | bearer + fail-closed limit + cart owner | cart/shipping/payment ids | RPCs `checkout`, `set_order_shipping_method`, `complete_zero_total_order`, `pay_with_cod`, `initiate_external_wallet_payment`; **email** | ✓ |
| `/api/orders/[id]` | GET | Own order detail | bearer + owner filter | `id` | `orders`, `order_items`, `payments`, `shipments` | ✓ |
| `/api/orders/[id]/payment` | POST | Resume payment / free order | bearer + owner filter + limit | `id`, `payment_method` | RPCs above | ✓ |
| `/api/orders/[id]/receipt` | GET | Receipt signed URL | bearer + RLS | `id`, `?payment` | `payment-receipts` signed URL (1 h) | ✓ |
| `/api/orders/cancel` | POST | Cancel own order | bearer + RPC ownership | `order_id`, `reason` | RPC `cancel_order` | ✓ |
| `/api/orders/track` | GET | Public tracking | public + order ref & email match + fail-closed limit | ref, email | service-role reads | ✓ |
| `/api/returns` | GET/POST | Return requests | bearer + RPC/owner filter | `order_id`, `items`, `reason` | RPC `create_return_request`, `returns` | ✓ |
| `/api/payments/external-wallet` | POST | Transfer receipt | bearer + path prefix `<uid>/<order>` + magic bytes | receipt fields, path | `payment-receipts`, RPC `submit_external_wallet_receipt` | ✓ |
| `/api/payments/vodafone-cash` | POST | Legacy receipt | same via `submitReceipt` | same | RPC `submit_vodafone_cash_receipt` | ✓ |
| `/api/paymob/webhook` | GET/POST | Disabled webhook (410) | none, no signature check | ignored | none | ✓ |
| `/api/stripe/webhook` | GET/POST | Disabled webhook (200 ignored) | none, no signature check | ignored | none | ✓ |
| `/api/wallet` | GET/POST | Balance / disabled payment | bearer (POST only checks header, returns 410) | — | `wallets` SELECT | ~ |

## E. Catalog / Public / Misc (23 files, 28 operations)

| Route | Methods | Purpose | Auth | Input | DB effects | Tests |
|---|---|---|---|---|---|---|
| `/api/cart` | GET/POST/DELETE | Cart sync via RPCs | bearer + `auth.getUser` | `items[]`, `action`, `cart_id`, `code` | RPCs `get_or_create_cart`, `add_to_cart`, `remove_cart_item`, `apply_coupon`, `remove_coupon` | ~ |
| `/api/wishlist` | GET/POST/DELETE | Wishlist toggle | bearer | `product_id`, `variant_id`, `?item_id` | `wishlists`, `wishlist_items` | ✓ |
| `/api/gallery` | GET | Public gallery | public | — | `gallery_images` | ✓ |
| `/api/gallery` | POST/PATCH/DELETE | Gallery CMS | verifyAdmin | multipart, fields, `order[]` | `gallery-images` + `gallery_images` | ~ |
| `/api/search` | GET | Search / facets / suggestions | public + IP limit (fail_open) | `mode`, `q`, filters, page, session | RPCs `search_products`, facets, suggestions, `log_search` | ✓ |
| `/api/shipping` | GET | Shipping quotes | public | `country`, `subtotal`, `items` | RPC `get_shipping_options`; server-side weight lookup | ✓ |
| `/api/products/[id]/track` | POST | Track view | public, optional session token | `id`, `session_token` | RPC `track_product_view` | ✓ |
| `/api/products/[id]/recommendations` | GET | Recommendations | public | `id`, `?limit` (now clamped 1–24) | RPC `get_recommended_products` | ~ |
| `/api/products/recently-viewed` | GET | Recently viewed | optional bearer/session | `?session_token`, `?limit` (clamped) | RPC `get_recently_viewed` | ~ |
| `/api/reviews` | GET/POST/DELETE | Reviews | public GET; bearer mutations | `product_id`, rating, comment | `reviews` | ✓ |
| `/api/reviews/[id]/vote` | POST | Helpful vote | bearer, self-vote blocked | `vote_type` | RPC `vote_review` | ✓ |
| `/api/reviews/[id]/report` | POST | Report review | bearer, self-report blocked | reason, details | RPC `report_review` | ✓ |
| `/api/reviews/[id]/reply` | POST | Reply | bearer + UUID validation (fixed) | `body`, `parent_reply_id` | RPC `reply_to_review` | ✓ |
| `/api/notifications` | GET/POST | Notifications & preferences | bearer | `action`, ids, preferences, push token | RPCs `mark_*`, `update_*`, `register_*` | new (2026-11-17) |
| `/api/email` | POST | Order emails | bearer + **owner or admin check (fixed)** | `type`, `order_id` | reads `orders`, `order_items`; **sends email** | new (2026-11-17) |
| `/api/contact` | POST | Contact form | public + fail-closed limit | name, email, subject, message | **email via Resend** | ✓ |
| `/api/custom-print` | POST | Custom-print request | bearer | multipart fields + design | private bucket + `custom_print_requests` | ✓ |
| `/api/custom-print/cart` | POST | Add customized product | requireUser + design owner | design/template/quantity/transform | `product_customizations`, `shared_designs`, RPC `add_to_cart` | ✓ |
| `/api/gift-box` | POST | Gift-box request | bearer | name, email, occasion, message, budget | `custom_print_requests` (fallback) | ✓ |
| `/api/gift-boxes` | GET | Public list | public | — | `gift_boxes`, `products`, items; PGRST205 fallback (fixed) | ✓ |
| `/api/gift-boxes/[id]` | GET | Public detail | public | `id` | same; PGRST205 fallback (fixed) | ✓ |
| `/api/theme` | GET | Resolved theme | public | — | `getResolvedTheme()` cached | ✓ |
| `/api/auth/google-status` | GET | OAuth provider probe | public + IP limit | — | outbound HTTP probe | ~ |
| `/auth/callback` | GET | OAuth code exchange | flow endpoint | `code`, `next`, `error` | Supabase session cookies; `safeRedirect` open-redirect guard | ~ |

---

## F. Data operations outside API routes

| Location | Operation | Auth / ownership | Notes |
|---|---|---|---|
| `proxy.ts:34-119` | `auth.getUser`, reads `admin_users`, `profiles`, `stores` | session `user.id` | Page-shell gate only, matcher `/admin`, `/vendor`, `/checkout`, …; APIs re-verify |
| `app/auth/callback/route.ts:54` | `exchangeCodeForSession` | OAuth code | Open redirect blocked by `safeRedirect()` |
| `app/page.tsx:50`, `app/components/SiteContent.tsx:39` | Direct public reads | public RLS | Featured products use a select-with-fallback |
| `app/profile/page.tsx:135-148` | **WRITE** `auth.updateUser` + `profiles.update` | `.eq("id", user.id)` + RLS | No server-side validation; error swallowed |
| `app/components/payment/ReceiptUploader.tsx:158-182` | **WRITE** private bucket `payment-receipts` | path `<uid>/<order>/…` + Storage RLS | Upload happens **before** server ownership validation |
| `lib/cartService.ts:126-201` | RPC cart writes (`add_to_cart`, `update_*`, `merge_guest_cart`) | session/guest token | Active: only `merge_guest_cart`; rest duplicate `/api/cart` |
| `lib/products.ts:470-517` | Browser-client writes to `products`, `product_variants` | none in module | Dead code; would bypass audited admin/vendor APIs if wired up |
| `lib/email.ts`, `lib/stripe-server.ts` | Resend / Stripe SDK | server-only | Consumed exclusively from API routes |
| `lib/rate-limit.ts:121` | Upstash Redis `/pipeline` | server-side | Only external HTTP from application code |
| Form submissions (~24) | All `POST` via `fetch` to API routes | Bearer where needed | No native form actions |

## G. Inventory-level findings

1. Every `/api/admin/**` mutation calls `verifyAdmin` first. No admin mutation depends solely on a hidden button.
2. `verifyAdmin` has two fallback paths (`admin_users`, then `ADMIN_EMAILS`); RPC/table errors are swallowed and downgrade to the weaker check.
3. Disabled-but-live stubs (`/api/checkout`, `/api/checkout/verify`, `/api/paymob/webhook`, `/api/stripe/webhook`, `/api/wallet` POST) intentionally return 410/ignored and perform no writes. They do not verify signatures, which is safe only because they have no effect.
4. Routes with real public side effects: `contact` (email, fail-closed limit), `orders/track` (read, fail-closed limit), `products/[id]/track` (view write, **no rate limit**).
5. Before the 2026-11-17 fixes: `/api/admin/custom-print` GET always 401, `/api/notifications` push actions always failed, `/api/email` had no explicit owner/admin check, `gift-boxes` returned 500 on missing tables.
6. Missing dedicated tests: `/api/notifications`, `/api/email`, `/api/wishlist`, `/api/cart` (store unit + E2E only), `/api/admin/setup`, `/api/admin/route`, `/api/gallery` (component only). Regression tests for the four fixed routes were added in `__tests__/prelaunch-api-fixes.test.ts` and `__tests__/admin-products-contract.test.ts`.
