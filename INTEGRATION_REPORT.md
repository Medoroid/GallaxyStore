# Galaxy Store - Full Integration Report

## Status: All API routes and pages aligned with DB schema

---

## Summary of All Fixes Applied

### Field Name Mismatches Fixed (DB column → old code → new code)

| File | Old Field | New Field | Status |
|------|-----------|-----------|--------|
| `app/api/orders/route.js` | RPC `create_order` | Direct `orders` + `order_items` insert | FIXED |
| `app/api/orders/route.js` | `shipping`, `discount`, `promo_code` | `shipping_fee`, `discount_amount`, `coupon_code` | FIXED |
| `app/api/orders/route.js` | `shipping_address`, `payment_method`, `notes` | `shipping_address_snapshot`, (removed), `customer_note` | FIXED |
| `app/api/orders/track/route.js` | `shipping_address` | `shipping_address_snapshot` | FIXED |
| `app/api/email/route.js` | `shipping_address` | `shipping_address_snapshot` | FIXED |
| `app/api/admin/stats/route.js` | `admin_users`, `gallery_images` | `profiles`, graceful fallback | FIXED |
| `app/api/admin/orders/route.js` | `confirmed` status | `paid`, `printing` added | FIXED |
| `app/admin/page.tsx` | `shipping_address`, `confirmed` | `shipping_address_snapshot`, `paid` | FIXED |
| `app/admin/orders/page.tsx` | `shipping`, `discount`, `payment_method`, `confirmed` | `shipping_fee`, `discount_amount`, (removed), `paid` | FIXED |
| `app/orders/page.tsx` | `shipping_address`, `confirmed` | `shipping_address_snapshot`, `paid` | FIXED |
| `app/track-order/page.tsx` | `product_name`, `price`, `shipping_address` | `product_name_snapshot`, `unit_price_snapshot`, `shipping_address_snapshot` | FIXED |
| `app/wishlist/page.tsx` | Single-table model | Two-table model (`wishlists` + `wishlist_items`) | FIXED |
| `app/admin/users/page.tsx` | `email` column (doesn't exist) | `full_name` column | FIXED |
| `lib/email.ts` | `address` only | `address?` + `line1?` (both supported) | FIXED |
| `app/admin/add/route.js` | Only `email` param | `email` OR `user_id` accepted | FIXED |
| `middleware.ts` | `admin_users` only | + `profiles.role` fallback | FIXED |
| `app/admin/users/page.tsx` | `admin_users` only | + `profiles.role` fallback | FIXED |

### Code Quality Fixes

| File | Issue | Fix |
|------|-------|-----|
| 7 page files | Duplicate `formatCurrency` functions | Consolidated to `lib/formatCurrency.ts` |
| `app/components/Navbar.tsx` | `getCount()` called as selector | Inline reducer for stable reference |
| `app/admin/orders/page.tsx` | Address `line1` field name | Changed to `address` (matches checkout form) |
| `lib/email.ts` | Only `address` field | Added `address?` + `line1?` support |

### Admin System Unified

| Component | Before | After |
|-----------|--------|-------|
| `middleware.ts` | `admin_users` table only | + `profiles.role` (admin/superadmin) |
| `app/api/admin/route.js` | `admin_users` table only | + `profiles.role` fallback |
| `app/api/admin/add/route.js` | `admin_users` table only | + `profiles.role` fallback |
| `app/api/admin/stats/route.js` | `admin_users` + `gallery_images` | `profiles` + graceful `gallery_images: 0` |
| `app/api/gallery/route.js` | `admin_users` only | + `profiles.role` via `verifyAdmin()` |
| `app/admin/users/page.tsx` | `admin_users` only | + `profiles.role` fallback |

---

## Data Flow Map (UI → Supabase → UI)

### 1. Homepage (`/`)
- **Data Source**: Supabase `products` table (via `lib/products.ts:fetchFeaturedProducts()`)
- **React Query**: `["homeProducts"]`
- **Fallback**: Hardcoded `data/products.ts` for hero images/categories
- **Columns Used**: `id, name, slug, base_price, is_featured, status, visibility, deleted_at, categories, brands, product_images`

### 2. Products (`/products`)
- **Data Source**: Supabase `products` table (via `lib/products.ts:fetchProducts()`)
- **React Query**: `["products"]`
- **Columns Used**: Same as homepage + filtering by `categories.slug`

### 3. Product Details (`/product-details/[id]`)
- **Data Source**: Supabase `products` table (via `lib/products.ts:fetchProductById()`)
- **Columns Used**: `id, name, slug, base_price, compare_at_price, description, categories, brands, stores, product_images`
- **Also fetches**: `reviews` table (via `/api/reviews?product_id=`)

### 4. Cart (`/cart`)
- **Data Source**: Zustand store + Supabase `cart_items` (via `/api/cart`)
- **DB Table**: `cart_items` (columns: `id, user_id, variant_id, quantity, unit_price_snapshot, added_at`)
- **Resolves**: `variant_id` → `product_variants` → `products` (for name, image)

### 5. Checkout (`/checkout`)
- **Data Source**: Zustand cart store → Creates order
- **API**: POST `/api/orders` → inserts `orders` + `order_items`
- **API**: POST `/api/checkout` → Stripe session (card only)
- **DB Tables**: `orders`, `order_items`

### 6. Orders (`/orders`)
- **Data Source**: GET `/api/orders` → Supabase `orders` table
- **DB Columns**: `id, status, subtotal, shipping_fee, discount_amount, total, currency, coupon_code, shipping_address_snapshot, customer_note, created_at`

### 7. Order Items
- **DB Table**: `order_items`
- **Columns**: `order_id, product_id, variant_id, product_name_snapshot, image_snapshot, unit_price_snapshot, line_total, quantity, options`

### 8. Track Order (`/track-order`)
- **Data Source**: GET `/api/orders/track` → `orders` + `order_items`
- **Email verification**: `shipping_address_snapshot.email`

### 9. Wishlist (`/wishlist`)
- **Data Source**: GET/POST/DELETE `/api/wishlist`
- **DB Tables**: `wishlists` (one per user) + `wishlist_items` (with `variant_id`)
- **Resolves**: `variant_id` → `product_variants` → `products`

### 10. Reviews (`/product-details/[id]`)
- **Data Source**: GET/POST/DELETE `/api/reviews`
- **DB Table**: `reviews` (columns: `product_id, user_id, rating, body`)
- **Conflict**: `product_id,user_id`

### 11. Profile (`/profile`)
- **Data Source**: `auth.updateUser()` + Supabase `profiles` table
- **DB Columns**: `id, full_name, avatar_url, phone, role`

### 12. Gallery (`/gallery`)
- **Data Source**: GET `/api/gallery` → Supabase `gallery_images` (table doesn't exist yet)
- **Migration**: `supabase/migrations/20260907_create_gallery_images.sql` (needs manual execution)

### 13. Email (`/api/email`)
- **Data Source**: Fetches `orders` + `order_items` by `order_id`
- **Service**: Resend API (requires `RESEND_API_KEY`)

---

## Admin Dashboard

### 14. Admin Dashboard (`/admin`)
- **Data Source**: GET `/api/admin/stats`
- **DB Tables**: `orders`, `products`, `profiles`
- **Status Map**: `pending`, `paid`, `processing`, `printing`, `shipped`, `delivered`, `cancelled`

### 15. Admin Orders (`/admin/orders`)
- **Data Source**: GET `/api/admin/orders` → `orders` table
- **PATCH**: Updates `orders.status`

### 16. Admin Products (`/admin/products`)
- **Data Source**: Supabase `products` table (via `lib/products.ts`)
- **Lookups**: `categories`, `brands`, `stores`
- **CRUD**: create, update, archive products

### 17. Admin Users (`/admin/users`)
- **Data Source**: Supabase `profiles` table
- **Admin Check**: `admin_users` → `profiles.role` fallback

### 18. Admin Gallery (`/admin/gallery`)
- **Data Source**: CRUD `/api/gallery` → `gallery_images` (requires table creation)

### 19. Admin Settings (`/admin/settings`)
- **Data Source**: Client-side `process.env.ADMIN_EMAILS` (read-only)

---

## Required Manual Actions

### 1. Run Migrations in Supabase SQL Editor
```sql
-- Migration 1: admin_users table
-- File: supabase/migrations/20260907_create_admin_users_secure.sql

-- Migration 2: gallery_images table
-- File: supabase/migrations/20260907_create_gallery_images.sql
```

### 2. Add Service Role Key to `.env`
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```
Required for: `/api/admin/add` route

### 3. Add Resend API Key to `.env` (optional)
```
RESEND_API_KEY=your_resend_key_here
EMAIL_FROM=Galaxy Store <your@domain.com>
```
Required for: order confirmation emails

---

## File Change Log

| File | Action | Description |
|------|--------|-------------|
| `lib/formatCurrency.ts` | CREATED | Shared currency utility |
| `lib/supabaseServer.ts` | CREATED | Server-side Supabase client |
| `lib/email.ts` | EDITED | Added `line1` support for shipping address |
| `lib/products.ts` | VERIFIED | All column names match DB |
| `app/api/orders/route.js` | REWRITTEN | Removed `create_order` RPC, direct inserts |
| `app/api/orders/[id]/route.js` | VERIFIED | No changes needed |
| `app/api/orders/track/route.js` | EDITED | `shipping_address_snapshot` |
| `app/api/wishlist/route.js` | REWRITTEN | Two-table model |
| `app/api/reviews/route.js` | EDITED | `body` column, `onConflict` order |
| `app/api/cart/route.js` | REWRITTEN | No RPC, variant resolution |
| `app/api/email/route.js` | EDITED | `shipping_address_snapshot` |
| `app/api/admin/route.js` | VERIFIED | Graceful `admin_users` handling |
| `app/api/admin/add/route.js` | REWRITTEN | Accepts `email` or `user_id`, `profiles.role` fallback |
| `app/api/admin/orders/route.js` | EDITED | Updated status values |
| `app/api/admin/stats/route.js` | REWRITTEN | Uses `profiles`, graceful `gallery_images` |
| `app/api/gallery/route.js` | EDITED | Admin check added |
| `app/admin/page.tsx` | EDITED | `shipping_address_snapshot`, `paid` status |
| `app/admin/orders/page.tsx` | EDITED | Field names, status values, `formatCurrency` consolidated |
| `app/admin/products/page.tsx` | REWRITTEN | Full product form with all fields |
| `app/admin/users/page.tsx` | EDITED | `full_name`, `profiles.role` fallback |
| `app/orders/page.tsx` | EDITED | `shipping_address_snapshot`, status values, `formatCurrency` consolidated |
| `app/track-order/page.tsx` | EDITED | `product_name_snapshot`, `unit_price_snapshot` |
| `app/wishlist/page.tsx` | REWRITTEN | Two-table API format |
| `app/checkout/page.tsx` | EDITED | Alert removed, `formatCurrency` consolidated |
| `app/cart/page.tsx` | EDITED | `formatCurrency` consolidated |
| `app/custom-print/page.tsx` | EDITED | `formatCurrency` consolidated |
| `app/profile/page.tsx` | EDITED | Saves to auth + profiles |
| `app/components/Reviews.tsx` | EDITED | `body` column |
| `app/product-details/[id]/productDetailsClient.jsx` | EDITED | `useState` → `useEffect`, `formatCurrency` consolidated |
| `app/stores/cartStore.ts` | EDITED | Response parsing for `variant_id` |
| `middleware.ts` | EDITED | `profiles.role` admin fallback |
| `app/admin/settings/page.tsx` | VERIFIED | Environment variable display |
| `app/admin/users/page.tsx` | EDITED | `full_name`, `profiles.role` fallback |
| `app/admin/layout.tsx` | VERIFIED | Auth check |
| `app/components/Navbar.tsx` | EDITED | Cart count selector optimization |
| `app/admin/page.tsx` | EDITED | `formatCurrency` consolidated |
| `app/api/admin/setup/route.js` | VERIFIED | Schema creation helper |
| `supabase/migrations/20260907_create_admin_users_secure.sql` | CREATED | Secure admin_users table |
| `supabase/migrations/20260907_create_gallery_images.sql` | CREATED | Gallery images table |
| `.env.example` | EDITED | Added `SUPABASE_SERVICE_ROLE_KEY` |

---

## TypeScript Status
- **0 errors** in `app/` and `lib/` directories
- Pre-existing test errors in `__tests__/i18n.test.ts` (unrelated)
