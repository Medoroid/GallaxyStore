# Product Data Integrity Report — Galaxy Store

> **Date:** 2026-11-01 · **Method:** read-only SQL against production + HTTP `HEAD` checks against the public Storage endpoint and external image hosts.
> **Policy:** nothing was deleted or modified in production. All cleanup statements are prepared under `supabase/manual-review/` and require explicit owner approval.
>
> Companion: `docs/TESTING-REPORT-AR-2026-10-29.md` (issue A3), `docs/PRODUCTION-REMEDIATION-TRACKER.md`.

## 1. Inventory

| Source | Count |
|---|---|
| Products | 21 published + 1 draft (`mega`) |
| `product_images` rows | 29 |
| — rows pointing at bucket objects that **exist** (HTTP 200) | 6 |
| — rows pointing at bucket objects that are **missing** (HTTP 400) | 8 |
| — rows whose `storage_path` is an **external hotlink** (Unsplash/Pinterest) | 15 (14× HTTP 200, 1× HTTP 404) |
| Published products with **no image row at all** | 2 (`test product`, and draft `mega`) |
| `gallery_images` rows pointing at **missing local files** | 5 of 5 |

Bucket: `product-images` is **public**; `custom-print-designs` is private (design uploads — not part of this review).

## 2. Per-product image status

### 2.1 Broken Storage paths (HTTP 400 — object does not exist)

| Product ID | Product | Image ID | Storage path | Status | HTTP | Recommended action |
|---|---|---|---|---|---|---|
| `b0000000-0000-0000-0000-000000000001` | Classic Cotton Tee | `b2000000-0000-0000-0000-000000000001` | `products/classic-tee/main.jpg` | MISSING | 400 | Re-upload a real photo **or** delete the row (product then shows the local category placeholder) |
| `b0000000-0000-0000-0000-000000000002` | Custom Photo Mug | `b2000000-0000-0000-0000-000000000002` | `products/photo-mug/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000003` | Cozy Pullover Hoodie | `b2000000-0000-0000-0000-000000000003` | `products/cozy-hoodie/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000004` | Custom Text Tote Bag | `b2000000-0000-0000-0000-000000000004` | `products/text-tote/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000005` | Vintage Sunset Tee | `b2000000-0000-0000-0000-000000000005` | `products/vintage-tee/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000006` | Minimalist Ceramic Mug | `b2000000-0000-0000-0000-000000000006` | `products/mini-mug/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000007` | Eco Canvas Tote | `b2000000-0000-0000-0000-000000000007` | `products/eco-tote/main.jpg` | MISSING | 400 | same |
| `b0000000-0000-0000-0000-000000000008` | Custom Name Hoodie | `b2000000-0000-0000-0000-000000000008` | `products/name-hoodie/main.jpg` | MISSING | 400 | same |

> These8 are seed-era rows: the paths never existed in the bucket (or were removed). Until the owner acts, the storefront shows the **local placeholder** (no broken image) thanks to the `SafeImage`/`onError` fallbacks added in this remediation.

### 2.2 Healthy uploaded images (HTTP 200)

| Product ID | Product | Image rows | Storage paths | Status |
|---|---|---|---|---|
| `0bc39286-eefd-4e47-8c8f-6ffd57c80b29` | **medoroid** | 6 (1 primary + 5) | `0bc39286-…/<uuid>.jpeg|.jpg` (6/6) | ✅ all exist |

> `medoroid` looks like an owner/dev test upload (name + recent UUID paths). **Manual decision required:** keep as a real product or unpublish. The images themselves are healthy.

### 2.3 External hotlinks stored in `storage_path` (policy + reliability risk)

| Product ID | Product | Image ID | URL | HTTP | Recommended action |
|---|---|---|---|---|---|
| `f9a11e67-af79-449a-9b63-43bdb6ff177e` | Vintage Thick Silver Ring | `a961313d-…` | `https://i.pinimg.com/736x/10/13/87/101387561948be573f1d248693b6d81a.jpg` | 200 | Replace with owner-owned photo; Pinterest hotlinking violates their ToS and can be rate-limited/blocked at any time |
| ″ | ″ | `7069461f-…` | `https://i.pinimg.com/736x/28/2d/ad/282dadc81a82accb5ef10bc82e631be1.jpg` | 200 | ″ |
| ″ | ″ | `385b3cb1-…` | `https://i.pinimg.com/736x/cd/a8/6a/cda86a227f6ab31f5672da674927d28f.jpg` | 200 | ″ |
| ″ | ″ | `81394ce9-…` | `https://i.pinimg.com/736x/10/95/d2/1095d2590dc332cc6a170f1ffcd82e3b.jpg` | 200 | ″ |
| ″ | ″ | `aaaced6d-…` | `https://i.pinimg.com/1200x/90/3e/3e/903e3e4d192c701f8fd44d94b7849b2f.jpg` | 200 | ″ |
| `a4505fc5-9195-4831-9e95-1adfa345a7c8` | بوستر فني | `793a2aca-…` | `https://images.unsplash.com/photo-1513519245088-0e12902e5a38` | 200 | Unsplash hotlink works but is fragile + no size params; prefer local copies |
| `71fbca7b-7345-4dab-9c98-13694a35ba4a` | تيشيرت قطني أسود كلاسيك | `7f3ddd16-…` | `https://images.unsplash.com/photo-1521572163474-6864f9cf17ab` | 200 | ″ |
| `1dc69109-e405-4569-8e55-f63469f131ac` | جراب هاتف شفاف | `e822bfe5-…` | `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9` | 200 | ″ |
| `d4634666-5be0-4cd9-931c-2d45c937a3fb` | حقيبة Tote قماش | `fe0db87b-…` | `https://images.unsplash.com/photo-1542291026-7eec264c27ff` | 200 | ″ |
| `cc51fc19-e4c7-4fd1-9432-e2bc1726f426` | دفتر ملاحظات فاخر | `eebc808d-…` | `https://images.unsplash.com/photo-1517842645767-c639042777db` | 200 | ″ |
| `e5ef97ea-07d4-47cd-bce1-6ac4fba706f3` | زجاجة مياه ستانلس | `7329a019-…` | `https://images.unsplash.com/photo-1602143407151-7111542de6e8` | 200 | ″ |
| `10b18b36-3da4-4fb3-8136-dd810417357f` | كاب رياضي أسود | `7d57b792-…` | `https://images.unsplash.com/photo-1521369909029-2afed882baee` | 200 | ″ |
| `ef14bbd9-1bef-452b-b6ae-c50e264e379a` | مج حراري أبيض | `44afe232-…` | `https://images.unsplash.com/photo-1514228742587-6b1558fcf93a` | **404** | **Broken today** → replace/attach real image; placeholder shown meanwhile |
| `a8786b2a-b1af-4294-82d3-b38280e7f3aa` | هودي رمادي شتوي | `47a91235-…` | `https://images.unsplash.com/photo-1556906781-9a412961c28c` | 200 | ″ |
| `80d1be9b-add3-4f68-8b5c-ec96307a9bd3` | وسادة ديكور | `39f0f15b-…` | `https://images.unsplash.com/photo-1505693416388-ac5ce068fe85` | 200 | ″ |

### 2.4 Published/draft products with NO images

| Product ID | Name | Status | Image rows | Recommended action |
|---|---|---|---|---|
| `9557f663-5a5c-43db-87e8-5c21bd8cd031` | **test product** | **published** | 0 | **Unpublish (draft) immediately** — test data visible to customers. Prepared in `supabase/manual-review/02_test_products_cleanup.sql` |
| `777cfbdc-6f1d-4bef-8940-04e54f33ad84` | **mega** | draft | 0 | Already unpublished ✅ — delete only if it is confirmed junk |

### 2.5 Gallery images (all5 point at missing local files)

| Row ID | Title | `image_url` | File exists? | Status after code fix | Recommended action |
|---|---|---|---|---|---|
| `942501b1-…` | Galaxy Custom Print | `/images/gallery/galaxy-print.jpg` | ❌ | local placeholder | Upload the real file or update the row |
| `223f3897-…` | Neon City Design | `/images/gallery/neon-city.jpg` | ❌ | local placeholder | ″ |
| `fe8034d3-…` | Abstract Waves | `/images/gallery/abstract-waves.jpg` | ❌ | local placeholder | ″ |
| `2340f0f0-…` | Mountain Landscape | `/images/gallery/mountain.jpg` | ❌ | local placeholder | ″ |
| `a6a609b2-…` | Portrait Art | `/images/gallery/portrait.jpg` | ❌ | local placeholder | ″ |

## 3. Code fixes shipped with this remediation (no broken image can reach the customer)

| Surface | Before | After |
|---|---|---|
| Product grids (home/products/search/gift-boxes) | ProductCard had fallback ✅ | unchanged |
| Cart line items | had `onError` fallback ✅ | unchanged |
| **Product details (main image + thumbnails)** | no error handling → broken | `SafeImage` → local placeholder |
| **Homepage (hero cards, category tiles, gift-box tiles)** | no handling | `SafeImage` → local placeholder |
| **Wishlist** | raw `<img>` no handling | guarded `onError` → placeholder (loop-safe) |
| **Checkout summary** | no handling | `SafeImage` |
| **Gallery page (grid + lightbox)** | no handling (5/5 files missing!) | `SafeImage` |
| Admin product/gallery views | left as-is **intentionally** — admins must SEE the real broken state while cleaning up | documented |

- New shared component: `app/components/SafeImage.tsx` (stateful `next/image` with local `/public/product-tshirt.jpg` fallback, resets when `src` changes).
- Newly uploaded images verified working: all6 `medoroid` paths return HTTP200 (upload pipeline OK).

## 4. Cleanup plan (REQUIRES OWNER APPROVAL — nothing applied)

Prepared in `supabase/manual-review/`:

1. `01_product_images_cleanup.sql`
   - Preview `SELECT`s listing every row that would change.
   - Guarded `DELETE` of the8 broken seed image rows — matches on **exact `image_id` + exact `storage_path` + expected product id** (triple match, so a reused path can never delete an unrelated row).
   - Guarded `UPDATE` statements to set `test product` to `draft` (exact id + name check).
   - Optional (commented out): remove Pinterest/Unsplash hotlink rows after real photos are uploaded.
2. `02_test_products_cleanup.sql` — unpublish/delete candidates (`test product`, `mega`, optionally `medoroid`) with per-row confirmation `SELECT`s first.

**How to apply (only after explicit approval):** run the preview `SELECT`s in the Supabase SQL editor, review every row, then uncomment and run the guarded statements — one product at a time. Never run `supabase db push` for these (see `docs/DATABASE-INTEGRITY-REPORT.md` § migration history warning).

## 5. Decisions recorded

- No production rows were modified during this review (read-only constraint honored).
- Placeholder policy: single local fallback `/product-tshirt.jpg` (existing convention from `ProductCard`), category-aware local art (`productCardImage`) continues to be used where the product object is available.
- External hotlinks that still resolve (HTTP200) are **left in place** — they render; replacing them requires owner-supplied photography (cannot be invented).
