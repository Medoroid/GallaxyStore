# تقرير الحالة الحالية — Gallaxy Store

> **تاريخ المراجعة:** 22 أكتوبر 2026  
> **المشروع:** Gallaxy Store — Next.js 16.2.9 / React 19 / Supabase / Stripe / Paymob / Resend  
> **نوع المراجعة:** مراجعة قراءة فقط (بدون تعديل كود التطبيق)  
> **الملف:** `CURRENT-STATE-AR.md`

---

## 1) الحكم النهائي

**المشروع يبني وينجح في الاختبارات، لكنه غير جاهز للإنتاج.**

الإجابة المباشرة على سؤال «هل كل ميزات لوحة الأدمن موصولة بـ API صحيح وتعمل بالكامل؟»:

> **لا.** من 9 صفحات أدمن: صفحة واحدة فقط سليمة نسبيًا، 5 صفحات تعمل جزئيًا، و3 صفحات معطلة أو وهمية. بالإضافة إلى أن مسار `/api/admin/setup` نفسه غير قابل للاستخدام.

| المحور | التقييم | ملاحظة مختصرة |
|---|---|---|
| البناء والتشغيل | ✅ | `npm run build` ينجح، و`tsc` بدون أخطاء |
| الاختبارات | ✅ | 197/197 يمر عند تشغيل dev server |
| واجهة المتجر العامة | ⚠️ | الصفحات تفتح، لكن الأسعار والبحث والتتبع بها مشاكل جوهرية |
| لوحة الأدمن | ❌ | أغلب البيانات إما أصفار أو أعمدة غير موجودة |
| الدفع الإلكتروني | ❌ | Stripe وVodafone Cash غير قابلين للاستخدام فعليًا |
| البريد الإلكتروني | ❌ | لا يوجد بريد للعميل أصلًا، والمفتاح غير مضبوط |
| تتبع الطلبات | ❌ | يفشل دائمًا حتى مع البريد الصحيح |
| جاهزية الإنتاج | ❌ | توجد أخطاء P0 تمنع الإطلاق |

---

## 2) المنهجية والقيود

### ما تم فحصه

1. قراءة كود صفحات الأدمن وواجهات API المرتبطة بها.
2. تشغيل `npx tsc --noEmit`.
3. تشغيل `npm run build`.
4. تشغيل `npm run dev` واختبار الصفحات والـ APIs العامة عبر HTTP.
5. تشغيل مجموعة Jest كاملة.
6. استعلامات قراءة فقط على مشروع Supabase الحي للتحقق من:
   - وجود الجداول والـ views والـ RPCs.
   - أسماء الأعمدة الفعلية.
   - أعداد الصفوف.
   - Storage buckets.
   - أخطاء PostgREST الحقيقية.

### القيود

- **لم يتم اختبار مسارات الأدمن المصادقة end-to-end** لعدم توفر بيانات دخول أدمن.
- لذلك تم التحقق من:
  - سلوك المسارات بدون مصادقة (401/307).
  - أسماء الأعمدة والـ RPCs مباشرة من قاعدة البيانات.
  - منطق الكود نفسه.
- ما هو مؤكد بالأدلة هو أن **الاستعلامات نفسها تفشل** أو أن **البيانات المطلوبة غير موجودة**، وليس مجرد افتراض من قراءة الكود.

---

## 3) لقطة الوضع الحالي للبيانات

### أعداد الجداول الأساسية

| الجدول | العدد |
|---|---:|
| `orders` | 12 |
| `products` | 22 (21 منشور + 1 مسودة) |
| `stores` | 2 |
| `gallery_images` | 5 |
| `payments` | 7 |
| `shipments` | 2 |
| `categories` | 7 |
| `product_variants` | 25 |
| `admin_users` | 1 |
| `refunds` | 0 |
| `returns` | 0 |
| `reviews` | 0 |
| `profiles` | ≈279 (منها حسابات اختبار أُنشئت بواسطة Jest) |

### توزيع الأدوار

| الدور | العدد |
|---|---:|
| `admin` | 1 |
| `vendor` | 2 |
| `customer` | 276 |

### توزيع حالات الطلبات

| الحالة | العدد |
|---|---:|
| `pending` | 7 |
| `paid` | 1 |
| `processing` | 1 |
| `shipped` | 1 |
| `delivered` | 1 |
| `cancelled` | 1 |

### الـ views الخاصة بالأدمن

كل الـ views التالية ترجع **0 صفوف** حتى عند القراءة بـ service role، رغم وجود بيانات في الجداول المصدر:

- `admin_orders_overview`
- `admin_customers_overview`
- `admin_product_performance`
- `admin_daily_sales`
- `admin_inventory_status`
- `admin_reviews_moderation_queue`

> توجد دالة `refresh_admin_dashboard_views` في قاعدة البيانات، لكن **لا يوجد أي استدعاء لها في كود التطبيق**. هذا هو السبب الأرجح لبقاء المؤشرات فارغة، ويحتاج تأكيدًا وتشغيلًا دوريًا (cron أو بعد كل عملية كتابة).

### Storage buckets

الموجود:

`avatars`, `product-images`, `design-uploads`, `design-previews`, `fonts`, `customization-previews`, `review-media`

**المفقود:**

`payment-receipts` — وهو مطلوب لرفع إيصالات Vodafone Cash وعرضها للأدمن.

### متغيرات البيئة

`.env.local` يحتوي فقط على:

- `BACKEND_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_EMAILS`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_VODAFONE_CASH_NUMBER`

**المفقود واللازم للتشغيل:**

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `PAYMOB_HMAC_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_SETUP_KEY`

---

## 4) ما تم إنجازه فعليًا

### البنية والتشغيل

- ✅ المشروع يبني بنجاح على Next.js 16.2.9.
- ✅ TypeScript يمر بدون أخطاء.
- ✅ 197 اختبارًا يمرون بالكامل عند تشغيل dev server.
- ✅ الصفحات العامة الرئيسية تفتح بنجاح:
  - `/`
  - `/products`
  - `/product-details/[id]`
  - `/gallery`
  - `/track-order`
  - `/cart`
  - `/custom-print`

### المصادقة والحماية

- ✅ حماية `/admin` تعمل: بدون تسجيل دخول يتم التحويل إلى `/login` (307).
- ✅ حماية `/checkout`, `/orders`, `/wishlist`, `/profile` تعمل.
- ✅ مسارات API المحمية ترجع 401 بدون token.
- ✅ `verifyAdmin` يتحقق من `profiles.role` عبر `is_admin()` ثم `admin_users` ثم `ADMIN_EMAILS`.

### المتجر

- ✅ عرض المنتجات والتصنيفات يعمل عبر Supabase.
- ✅ صفحة تفاصيل المنتج تعمل وتبني JSON-LD.
- ✅ المعرض يعرض 5 صور موجودة.
- ✅ الشحن يرجع خيارين (Standard / Express) بشكل صحيح.
- ✅ السلة والمفضلة والطلبات والإشعارات والمرتجعات لديها APIs محمية.
- ✅ البحث الخلفي موجود: `search_products`, `get_search_suggestions`, `get_search_facets`, `get_popular_searches`.

### الأدمن

- ✅ صفحة الطلبات هي الأفضل توصيلًا:
  - تقرأ من `/api/admin/orders`.
  - تقرأ الطلبات عبر service role.
  - تضيف بيانات الدفع والشحن.
  - تغيير الحالة يستخدم `update_order_status` الموجودة فعلًا.
- ✅ صفحة المرتجعات موصولة بالـ RPCs الصحيحة:
  - `issue_refund`
  - `mark_refund_completed`
  - `mark_refund_failed`
  - `update_return_status`
- ✅ مراجعة التقييمات تستخدم RPC `moderate_review` الموجود.
- ✅ إضافة أدمن تعمل عبر `/api/admin/add` بـ service role.

---

## 5) ما تبقى

### أولويات حرجة (P0)

1. إصلاح لوحة تحكم الأدمن (views فارغة + أعمدة خاطئة).
2. إصلاح قائمة التجار (`profiles.email` غير موجود).
3. إصلاح رفع صور المنتجات.
4. إصلاح أسعار كروت المنتجات والعملة.
5. إصلاح تتبع الطلبات.
6. إصلاح Stripe (المفاتيح + `NEXT_PUBLIC_BASE_URL` + الويب هوك).
7. إصلاح Vodafone Cash (bucket + جدول + RPCs).
8. إصلاح بريد تأكيد الطلب (بريد العميل + العناصر + Resend).

### أولويات عالية (P1)

9. ربط البحث والاقتراحات والفلاتر بشكل صحيح.
10. إصلاح صفحة إعدادات الأدمن أو حذفها.
11. إصلاح أعمدة صفحة مراجعات الأدمن.
12. إضافة إدارة كاملة للمعرض (قائمة + حذف).
13. إضافة إزالة/تعديل صلاحيات الأدمن.
14. التحقق الحقيقي من نجاح الدفع في `checkout/success`.
15. إصلاح `custom-print` (منتجات وهمية + رفع تصميم غير محفوظ).

### أولويات متوسطة (P2)

16. إصلاح `/stores` (المسار 404).
17. تفعيل تتبع مشاهدات المنتجات.
18. إصلاح Paymob أو إزالته من النطاق.
19. إصلاح `/api/admin/setup`.
20. توحيد العملة بين الكروت والتفاصيل.
21. عزل الاختبارات عن قاعدة البيانات الحية وتنظيف حسابات الاختبار.

---

## 6) مصفوفة صفحات الأدمن × APIs

| الصفحة | المصدر الفعلي | الحكم | الملاحظات |
|---|---|---|---|
| `/admin` | `GET /api/admin/stats` | ❌ معطلة | الاستعلامات تستخدم أعمدة غير موجودة، والـ views فارغة، والنتيجة أصفار |
| `/admin/orders` | `GET/PATCH /api/admin/orders` + `GET /api/admin` | ⚠️ جزئية | القراءة وتغيير الحالة يعملان نظريًا؛ التحقق من Vodafone معطل |
| `/admin/products` | Supabase مباشر من المتصفح | ⚠️ جزئية | CRUD أساسي يعمل، لكن رفع الصور ميت تمامًا |
| `/admin/refunds` | `GET/POST /api/admin/refunds` | ✅ موصولة | الـ RPCs موجودة؛ لكن لا توجد بيانات لاختبارها |
| `/admin/reviews` | `GET/POST /api/admin/reviews/moderate` | ⚠️ جزئية | أعمدة الواجهة لا تطابق الـ view، والمحتوى لن يظهر |
| `/admin/vendors` | `GET/POST /api/admin/vendors` | ❌ معطلة | `profiles.email` غير موجود → PostgREST 400 |
| `/admin/users` | Supabase مباشر + `POST /api/admin/add` | ⚠️ جزئية | عرض وإضافة فقط، بدون إزالة أو إدارة صلاحيات |
| `/admin/settings` | لا يوجد API | ❌ وهمية | تقرأ `process.env` على العميل، والحفظ لا يفعل شيئًا |
| `/admin/gallery` | `POST /api/gallery` | ⚠️ جزئية | إضافة فقط، base64، بدون قائمة أو حذف |
| `/api/admin/setup` | `POST /api/admin/setup` | ❌ معطلة | `exec_sql` غير موجود و`ADMIN_SETUP_KEY` غير مضبوط |

**الخلاصة:** 1 ✅ / 5 ⚠️ / 3 ❌ — بالإضافة إلى مسار setup المعطل.

---

## 7) مشاكل الأدمن بالتفصيل

### 7.1 لوحة التحكم: أصفار دائمة وأعمدة غير موجودة

**الملفات:**

- `app/admin/page.tsx`
- `app/api/admin/stats/route.js`

الواجهة تتوقع الحقول التالية، لكن المصدر لا يوفرها:

| ما تتوقعه الواجهة | الواقع |
|---|---|
| `total_orders` | غير موجود في `admin_orders_overview` |
| `total_products` | غير موجود |
| `total_revenue` | غير موجود |
| `pending_orders` | غير موجود |
| `total_users` | يقرأ `admin_customers_overview.total_customers` غير الموجود |
| `total_gallery` | ثابت `0` داخل الراوت |
| `daily_sales[].date / revenue / orders` | الأعمدة الفعلية: `sale_date / gross_revenue / order_count` |
| `top_products[].product_name / total_revenue / total_sold` | الأعمدة الفعلية: `name / revenue / units_sold` |
| `inventory_alerts[].variant_sku` | العمود الفعلي: `sku` |
| `recent_orders[].created_at` | العمود الفعلي: `placed_at` |

**الأعمدة الفعلية للـ views:**

- `admin_orders_overview`: `id, order_number, status, total, currency, placed_at, user_id, customer_name, item_count, amount_paid, amount_refunded`
- `admin_customers_overview`: `id, full_name, role, joined_at, order_count, lifetime_value, last_order_at`
- `admin_product_performance`: `product_id, name, slug, status, avg_rating, rating_count, units_sold, revenue, current_stock`
- `admin_daily_sales`: `sale_date, order_count, gross_revenue, units_sold, refunded_amount, net_revenue`
- `admin_inventory_status`: `variant_id, sku, stock_quantity, reserved_quantity, available_stock, low_stock_threshold, is_low_stock, product_id, product_name, product_status`
- `admin_reviews_moderation_queue`: `id, product_id, product_name, user_id, reviewer_name, rating, title, status, report_count, created_at`

**أخطاء PostgREST المؤكدة:**

```text
column admin_orders_overview.created_at does not exist
column admin_daily_sales.date does not exist
column admin_product_performance.total_revenue does not exist
column admin_customers_overview.total_customers does not exist
```

**السلوك الناتج:**

- الراوت ينفذ `Promise.all` ولا يفحص `error` لكل استعلام.
- لذلك يعيد `200` مع `stats` أصفار بدل إظهار خطأ.
- حتى بعد إصلاح الأعمدة، ستبقى القيم صفرًا لأن الـ views نفسها فارغة.
- `refresh_admin_dashboard_views` موجودة لكنها غير مستدعاة من أي مكان في الكود.

**الإصلاح المقترح:**

1. استبدال الأعمدة الخاطئة بالأسماء الفعلية.
2. إضافة فحص `error` لكل استعلام وإرجاع خطأ واضح.
3. استدعاء `refresh_admin_dashboard_views` بعد العمليات المؤثرة أو عبر cron.
4. أو إعادة كتابة `stats` باستعلامات مباشرة على `orders`, `products`, `profiles`, `gallery_images` بدل الاعتماد على views غير موثوقة.
5. إضافة `total_products` و`total_gallery` من الجداول الفعلية.

---

### 7.2 قائمة التجار: خطأ 400 بسبب عمود غير موجود

**الملفات:**

- `app/api/admin/vendors/route.js`
- `app/admin/vendors/page.tsx`

الكود يطلب:

```js
profiles:owner_id (full_name, email)
```

لكن جدول `profiles` لا يحتوي على عمود `email` إطلاقًا.

**النتيجة المؤكدة:**

```text
column profiles.email does not exist
```

**الإصلاح المقترح:**

- حذف `email` من الاستعلام.
- جلب البريد من `auth.users` عبر service role إذا لزم.
- أو إضافة عمود `email` متزامن مع `auth.users` (غير مفضل لأسباب أمنية).

---

### 7.3 صور المنتجات: الواجهة تستقبل الملفات ثم تتجاهلها

**الملف:** `app/admin/products/page.tsx`

- يوجد `mainImage` و`secondaryImages` وحقول `<input type="file">`.
- `handleSave` يستدعي `createProduct(form)` أو `updateProduct(id, form)` فقط.
- لا يوجد أي استدعاء لـ:
  - `supabase.storage.from("product-images").upload(...)`
  - إدخال في `product_images`
- لذلك أي صورة يختارها الأدمن **لا تُرفع ولا تُحفظ**، وتضيع بعد إغلاق النافذة.

**ملاحظة إيجابية:** bucket `product-images` موجود بالفعل، لكنه غير مستخدم من صفحة الأدمن.

**الإصلاح المقترح:**

1. رفع الصورة إلى `product-images`.
2. حفظ `storage_path` في `product_images`.
3. تعيين `is_primary` للصورة الرئيسية.
4. إضافة حذف/ترتيب للصور.

---

### 7.4 معرض الأدمن: إضافة فقط وbase64

**الملفات:**

- `app/admin/gallery/page.tsx`
- `app/api/gallery/route.js`

- الـ API يدعم `GET` و`POST` و`DELETE`.
- الصفحة تستدعي `POST` فقط.
- لا توجد قائمة صور أو زر حذف في الواجهة.
- رفع الملف يتم عبر `FileReader.readAsDataURL` ويُخزَّن كـ base64 داخل `gallery_images.image_url`.
- التعليق في الكود نفسه يقول: `For demo: convert to base64 data URL`.

**المشاكل:**

- base64 يضخم حجم الصفوف والاستجابة.
- لا يمكن استخدام تحسين الصور في Next/Image بشكل طبيعي.
- لا توجد إدارة فعلية للمعرض رغم وجود API جاهز.

---

### 7.5 إعدادات الأدمن: صفحة وهمية

**الملف:** `app/admin/settings/page.tsx`

- المكوّن `"use client"`.
- يقرأ `process.env.ADMIN_EMAILS` داخل المتصفح.
- Next.js لا يمرر إلا متغيرات `NEXT_PUBLIC_*` إلى العميل، لذلك القيمة دائمًا `undefined` والقائمة فارغة.
- `handleSave` لا يحفظ شيئًا؛ فقط يعرض رسالة نجاح.
- لا يوجد API خلف الصفحة.

**النتيجة:** أي تغيير في الصفحة لا يؤثر على النظام، والصفحة لا تعكس صلاحيات الأدمن الحقيقية الموجودة في `profiles.role` و`admin_users`.

**الإصلاح المقترح:**

- إما حذف الصفحة.
- أو بناء API إداري حقيقي يقرأ/يكتب `admin_users` وصلاحيات `profiles.role`، مع تدقيق أمني.

---

### 7.6 مراجعات الأدمن: أعمدة غير متطابقة

**الملفات:**

- `app/admin/reviews/page.tsx`
- `app/api/admin/reviews/moderate/route.js`

الواجهة تتوقع:

- `author_name`
- `body`

لكن الـ view يوفر:

- `reviewer_name`
- `title`
- ولا يوجد عمود `body` أصلًا.

**النتيجة:**

- اسم المراجع سيظهر فارغًا.
- نص المراجعة سيظهر فارغًا.
- الـ view نفسه فارغ حاليًا (0 صفوف)، وجدول `reviews` أيضًا 0 صفوف.
- RPC `moderate_review` موجود ويقبل `approved` و`rejected`، لكن لا توجد بيانات لاختباره.

---

### 7.7 إدارة المستخدمين: عرض وإضافة فقط

**الملف:** `app/admin/users/page.tsx`

- يقرأ `profiles` و`admin_users` مباشرة من المتصفح.
- لا يعرض البريد الإلكتروني (لأن `profiles.email` غير موجود).
- يضيف أدمن عبر `/api/admin/add`، والراوت يحدّث `profiles.role = 'admin'` فقط.
- لا يوجد:
  - إزالة أدمن.
  - تغيير الدور.
  - تعطيل حساب.
  - بحث من جهة الخادم.

**ملاحظة:** `admin_users` يحتوي على دور `super_admin`، لكن الصفحة لا تعرضه ولا تديره.

---

### 7.8 الطلبات والتحقق من الدفع

**الملفات:**

- `app/api/admin/orders/route.js`
- `app/admin/orders/page.tsx`

**ما يعمل:**

- قراءة الطلبات عبر service role.
- إضافة بيانات الدفع والشحن.
- تغيير الحالة عبر `update_order_status` (موجودة).
- التحقق من `is_admin()` عند استخدام JWT.

**ما لا يعمل:**

- زر التحقق من Vodafone يستدعي:

```js
rpc("verify_vodafone_cash_payment", {
  p_order_id: order_id,
  p_approve: approved,
  p_note: note || null,
})
```

- لكن الدالة **غير موجودة في قاعدة البيانات الحية** بأي من التوقيعين:
  - `p_order_id`
  - `p_receipt_id`
- النتيجة: `PGRST202` — أي أن التحقق من الدفع يفشل دائمًا.
- روابط الإيصالات تُنشأ من bucket `payment-receipts` غير الموجود، فتظهر تحذيرات فقط.

**النتيجة:** صفحة الطلبات هي الأقرب للاكتمال، لكن مسار Vodafone Cash غير مكتمل من الطرفين (العميل والأدمن).

---

### 7.9 `/api/admin/setup` غير قابل للاستخدام

**الملف:** `app/api/admin/setup/route.js`

- يستدعي RPC `exec_sql` غير الموجودة أصلًا.
- `ADMIN_SETUP_KEY` غير مضبوط في `.env.local`.
- الشرط `setupKey !== process.env.ADMIN_SETUP_KEY` يعني أن أي مفتاح سيُرجع 403 (لأن القيمة `undefined`).
- حتى لو تم تمرير المفتاح، فشل `exec_sql` يُسجَّل كتحذير فقط، والراوت يعيد رسالة نجاح مضللة.

---

### 7.10 قاعدة البيانات والـ migrations غير متطابقة

**مشاكل مؤكدة:**

1. ملف `supabase/migrations/20261002_payment_receipts_table.sql` موجود، لكن جدول `payment_receipts` **غير موجود** في قاعدة البيانات الحية (404).
2. الـ views الخاصة بالأدمن والدوال `refresh_admin_dashboard_views` / `refresh_vendor_dashboard_views` **غير موجودة في أي migration** داخل المستودع.
3. الجداول الأساسية مثل `products`, `categories`, `profiles`, `stores`, `payments`, `shipments`, `refunds`, `returns` لا توجد لها migrations تأسيسية في المستودع؛ الموجود مجرد تعديلات لاحقة.
4. النتيجة: **لا يمكن إعادة بناء قاعدة البيانات من المستودع**، وأي بيئة جديدة ستكون ناقصة.

**التوصية:** إنشاء migration تأسيسي كامل (baseline) يطابق الإنتاج، ثم migration تصحيحي لكل ما سبق.

---

## 8) مشاكل صفحات العميل

### 8.1 سعر كارت المنتج خطأ — وأحيانًا صفر (P0)

**الملفات:**

- `app/components/ProductCard.tsx`
- `lib/products.ts`

في `ProductCard`:

```ts
const currentPrice =
  ("discountPercentage" in product
    ? product.discountPercentage ?? product.price
    : product.price) ?? 0;
```

وفي `toProductCardProduct` يتم دائمًا إضافة `discountPercentage`:

```ts
discountPercentage: product.compare_at_price
  ? Math.round(((compare - base) / compare) * 100)
  : 0,
```

**النتيجة:**

- المنتج الذي ليس عليه خصم: يظهر السعر **$0.00**.
- المنتج الذي عليه خصم: يظهر **نسبة الخصم** كسعر (مثل `$20.00` بدل `$19.99`).
- السعر القديم (`comparePrice`) يُعرض كـ `product.price`، أي أنه يظهر السعر الأساسي مشطوبًا.
- `addItem` يستخدم نفس السعر الخاطئ.
- العملة مثبتة كـ `$` داخل الكارت، رغم وجود 4 منتجات بعملة `EGP` و18 بـ `USD`.
- صفحة تفاصيل المنتج تعرض السعر والعملة بشكل صحيح، فيحدث تعارض بين الشبكة والتفاصيل.

**الإصلاح المقترح:**

```ts
const currentPrice = product.price ?? 0;
```

مع إضافة حقل `currency` واستخدام `formatCurrency` بدل `$`.

---

### 8.2 البحث والاقتراحات والفلاتر غير مربوطة

**الملفات:**

- `app/products/page.tsx`
- `app/api/search/route.js`

#### الاقتراحات

الـ API يعيد:

```json
[{ "suggestion": "medoroid", "type": "product", "ref_id": "..." }]
```

لكن الواجهة تتوقع:

```ts
{ id, name, category }
```

**النتيجة:** الاقتراحات تظهر بدون نص، وعند الضغط يبحث عن `undefined`.

#### الفلاتر

الـ API يعيد:

```json
{ "categories": [{ "name": "...", "count": 6, "category_id": "..." }] }
```

لكن الواجهة تقرأ `f.slug`:

```ts
facets.map((f) => ({ slug: f.slug, name: f.name }))
```

**النتيجة:** كل الفلاتر لها `slug = undefined`، والضغط عليها يعطي نتائج فارغة.

#### `?q=` في الرابط

- الصفحة لا تستخدم `useSearchParams`.
- البحث يتم client-side على قائمة المنتجات المحمّلة مسبقًا.
- لذلك `/products?q=...` لا يعمل.

#### البحث بالبادئة

- `search_products` يعتمد على full-text وليس prefix matching.
- `q=med` يعيد `[]`.
- `q=medoroid` يعيد المنتج.
- بينما الاقتراحات تعمل بالبادئة وتعرض `medoroid`.
- النتيجة: المستخدم يرى اقتراحًا ثم لا يجد نتيجة عند الكتابة الجزئية.

#### ملاحظة إضافية

- واجهة المنتجات لا تستخدم `search_products` أصلًا.
- حقل `primary_image` الذي يعيده البحث هو **مسار داخل Storage** وليس URL عامًا؛ لو تم ربطه مباشرة ستحتاج إلى بناء رابط عام.

---

### 8.3 تتبع الطلب يفشل دائمًا

**الملفات:**

- `app/track-order/page.tsx`
- `app/api/orders/track/route.js`

الكود يقرأ:

```js
const orderEmail =
  orderSummary.shipping_address_snapshot?.email ||
  orderSummary.customer_note;
```

لكن `order_summary` يحتوي فقط على:

`id, order_number, user_id, status, total, currency, gift_wrap, placed_at, item_count, total_quantity, first_item_name`

لا يوجد:

- `shipping_address_snapshot`
- `customer_note`
- `email`

**النتيجة:**

- `orderEmail` دائمًا `undefined`.
- أي إدخال بريد سيُرجع `403 Email does not match this order`.
- حتى البريد الصحيح لا يعمل.

**الإصلاح المقترح:**

- جلب الطلب من `orders` مباشرة (الجدول يحتوي على `shipping_address_snapshot` و`customer_note`).
- إضافة حقل `email` إلى نموذج الشحن و`shipping_address_snapshot`.
- أو مقارنة البريد مع `auth.users` بعد مصادقة العميل.

---

### 8.4 Stripe غير قابل للاستخدام

**الملفات:**

- `app/api/checkout/route.js`
- `lib/stripe-server.ts`
- `app/api/stripe/webhook/route.js`
- `app/checkout/page.tsx`

المشاكل:

1. `STRIPE_SECRET_KEY` غير موجود → `new Stripe(undefined)` سيرمي خطأ.
2. `NEXT_PUBLIC_BASE_URL` غير موجود → روابط النجاح والإلغاء تصبح:

```text
undefined/checkout/success
undefined/checkout/cancel
```

3. `STRIPE_WEBHOOK_SECRET` غير موجود → الويب هوك يرجع 500.
4. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` غير موجود.
5. الواجهة تعرض خيار Stripe للمستخدم رغم أن المسار كله غير مهيأ.

---

### 8.5 Vodafone Cash معطل من أول خطوة

**الملفات:**

- `app/components/payment/ReceiptUploader.tsx`
- `app/api/payments/vodafone-cash/route.js`
- `app/admin/orders/page.tsx`

المشاكل المؤكدة:

1. bucket `payment-receipts` غير موجود → رفع الإيصال يفشل.
2. جدول `payment_receipts` غير موجود → أي عملية تعتمد عليه تفشل.
3. RPC `submit_vodafone_cash_receipt` غير موجودة في القاعدة الحية.
4. RPC `verify_vodafone_cash_payment` غير موجودة بأي توقيع.
5. لذلك:
   - العميل لا يستطيع إرسال الإيصال.
   - الأدمن لا يستطيع التحقق منه.

> هذا يعني أن Vodafone Cash **غير مكتمل end-to-end**، وليس مجرد مشكلة إعداد بسيطة.

---

### 8.6 صفحة نجاح الدفع تعلن النجاح بدون تحقق

**الملف:** `app/checkout/success/page.tsx`

- إذا وُجد `session_id`، تنتظر الصفحة 1.5 ثانية فقط.
- ثم تعرض «Payment Successful» بشكل غير مشروط.
- لا يوجد أي استدعاء لـ Stripe للتحقق من حالة الجلسة أو الدفع.
- أي مستخدم يمكنه فتح الرابط ورؤية رسالة النجاح.

**الإصلاح المقترح:**

- استدعاء Stripe server-side للتحقق من `payment_status`.
- أو الاعتماد على الويب هوك وتحديث الطلب، ثم قراءة حالة الطلب من قاعدة البيانات.

---

### 8.7 البريد الإلكتروني لا يُرسل فعليًا

**الملفات:**

- `app/api/orders/route.js`
- `lib/email.ts`
- `app/checkout/page.tsx`

المشاكل:

1. نموذج الشحن لا يحتوي على حقل `email` أصلًا.
2. الكود يرسل:

```js
customerEmail: shipping_address.email || ""
items: []
```

3. `RESEND_API_KEY` و`EMAIL_FROM` غير موجودين، لذلك `sendOrderConfirmation` تتخطى الإرسال بصمت.
4. حتى لو تم ضبط المفتاح:
   - لا يوجد بريد مستلم.
   - قائمة العناصر فارغة.
5. رسالة الواجهة «We'll send you a confirmation email shortly» غير صحيحة.

---

### 8.8 `custom-print` يضيف منتجات غير صالحة للسلة

**الملف:** `app/custom-print/page.tsx`

```ts
addItem({
  product_id: `custom-${product.id}`,
  ...
});
```

- `/api/cart` يتحقق من أن المعرف UUID حقيقي.
- أي معرف يبدأ بـ `custom-` سيُرجع:

```text
"custom-..." is not a real product and cannot be ordered
```

- رفع التصميم يتم كـ base64 في الحالة المحلية فقط، ولا يُرسل أو يُحفظ.
- لذلك تجربة «التصميم المخصص» غير قابلة للشراء فعليًا.

---

### 8.9 معرض الصور

- الصفحة تعرض الصور من `/api/gallery` بشكل صحيح.
- لكن الصور الجديدة المرفوعة من الأدمن تُخزَّن base64، وهو غير مناسب لـ Next/Image ولا لقاعدة البيانات.
- لا توجد إدارة (حذف/ترتيب/تمييز) من واجهة الأدمن رغم دعم الـ API.

---

### 8.10 `/stores` يرجع 404

- المجلد `app/stores` يحتوي فقط على `cartStore.ts` وليس `page.tsx`.
- النتيجة: `GET /stores` → 404.
- لا توجد حاليًا روابط داخلية تشير إليه، لكن المسار موجود في البنية ويوحي بميزة ناقصة.

---

### 8.11 تتبع مشاهدات المنتجات غير موصول

- `POST /api/products/[id]/track` موجود ويولّد `session_token`.
- لكن لا يوجد أي استدعاء من واجهة المنتج إلى هذا المسار.
- النتيجة: `view_count` لا يزيد، و«شوهد مؤخرًا» لا يعمل بشكل حقيقي.

---

### 8.12 صفحات محمية ترجع 401/307 (سلوك متوقع)

- `/wishlist`, `/cart`, `/notifications`, `/returns` ترجع 401 بدون token.
- `/admin`, `/checkout`, `/orders` ترجع 307 إلى `/login`.
- هذا **ليس خطأ**، لكنه مهم لتمييزه عن الأعطال الحقيقية.

---

## 9) أولويات الإصلاح

### P0 — يمنع الإطلاق

| # | المشكلة | التأثير | الملفات الرئيسية |
|---|---|---|---|
| 1 | Stripe غير مهيأ | لا يمكن الدفع بالبطاقة | `app/api/checkout/route.js`, `lib/stripe-server.ts` |
| 2 | Vodafone Cash معطل | لا يمكن الدفع أو التحقق | `ReceiptUploader.tsx`, `vodafone-cash/route.js`, DB |
| 3 | تتبع الطلب يفشل دائمًا | خدمة ما بعد البيع معطلة | `app/api/orders/track/route.js` |
| 4 | أسعار الكروت خاطئة | عرض أسعار مضلل | `ProductCard.tsx`, `lib/products.ts` |
| 5 | لوحة الأدمن أصفار | لا رؤية تشغيلية | `app/api/admin/stats/route.js` |
| 6 | قائمة التجار 400 | لا إدارة للمتاجر | `app/api/admin/vendors/route.js` |
| 7 | رفع صور المنتجات ميت | لا صور جديدة | `app/admin/products/page.tsx` |
| 8 | بريد الطلب لا يُرسل | لا تأكيد للعميل | `app/api/orders/route.js`, `lib/email.ts` |

### P1 — يجب إصلاحه قبل الإطلاق

| # | المشكلة | التأثير |
|---|---|---|
| 9 | البحث والاقتراحات والفلاتر | تجربة بحث غير صالحة |
| 10 | إعدادات الأدمن وهمية | إدارة صلاحيات مضللة |
| 11 | مراجعات الأدمن بأعمدة خاطئة | محتوى فارغ |
| 12 | معرض الأدمن بدون إدارة | لا حذف/ترتيب |
| 13 | إدارة المستخدمين بدون إزالة | صلاحيات غير قابلة للسحب |
| 14 | نجاح الدفع غير محقق | ثقة زائفة |
| 15 | custom-print غير قابل للشراء | ميزة معطلة |

### P2 — تحسينات ومخاطر

| # | المشكلة |
|---|---|
| 16 | `/stores` 404 |
| 17 | تتبع المشاهدات غير موصول |
| 18 | Paymob غير مدمج والتحقق من HMAC لا يطابق مواصفات Paymob |
| 19 | `/api/admin/setup` معطل |
| 20 | عدم توحيد العملة |
| 21 | اختبارات Jest تنشئ مستخدمين في قاعدة البيانات الحية |

---

## 10) خطة إصلاح مقترحة

### المرحلة 0 — تثبيت قاعدة البيانات (نصف يوم)

1. تطبيق migration `payment_receipts`.
2. إنشاء bucket `payment-receipts` وسياساته.
3. إنشاء `submit_vodafone_cash_receipt` و`verify_vodafone_cash_payment`.
4. مزامنة تعريفات `admin_*` views و`refresh_admin_dashboard_views`.
5. تنظيف حسابات الاختبار `*@test.example.com`.

### المرحلة 1 — الإصلاحات الحرجة (1–2 يوم)

1. إصلاح `stats` والأعمدة والـ views.
2. إصلاح استعلام التجار.
3. إصلاح سعر الكارت والعملة.
4. إصلاح تتبع الطلب.
5. ضبط مفاتيح Stripe وResend و`NEXT_PUBLIC_BASE_URL`.
6. إضافة بريد العميل إلى نموذج الشحن.

### المرحلة 2 — استكمال الأدمن (2–3 أيام)

1. رفع صور المنتجات وحفظ `product_images`.
2. إدارة معرض كاملة.
3. إصلاح مراجعات الأدمن.
4. إعادة بناء الإعدادات على API حقيقي أو حذفها.
5. إضافة إزالة/تعديل صلاحيات الأدمن.
6. إكمال التحقق من Vodafone في صفحة الطلبات.

### المرحلة 3 — استكمال المتجر (1–2 يوم)

1. ربط البحث والاقتراحات والفلاتر.
2. إصلاح `checkout/success`.
3. إصلاح `custom-print` أو تعطيله مؤقتًا.
4. إصلاح `/stores` أو حذف المسار.
5. تفعيل تتبع المشاهدات.

### المرحلة 4 — التقوية والاختبارات

1. عزل اختبارات التكامل عن قاعدة البيانات الحية.
2. إضافة اختبارات لعقود الـ APIs (contract tests) تمنع mismatches.
3. إضافة CI يتحقق من `tsc` و`build` و`jest`.
4. مراجعة RLS وسياسات Storage.

---

## 11) أدلة التحقق

### الأوامر

| الأمر | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ بدون أخطاء |
| `npm run build` | ✅ نجح، وتم توليد كل المسارات |
| `npx jest --silent` مع dev server | ✅ 197/197 اختبارًا |

> **ملاحظة مهمة:** نجاح الاختبارات لا يعني سلامة التكامل. الاختبارات لا تغطي أخطاء أسماء الأعمدة في `admin_*`، ولا تعطل Stripe/Vodafone، ولا مشاكل أسعار الكروت.

### فحوصات HTTP

| المسار | الحالة | الملاحظة |
|---|---|---|
| `/` | 200 | يعمل |
| `/products` | 200 | يعمل |
| `/product-details/[id]` | 200 | يعمل |
| `/gallery` | 200 | يعمل |
| `/track-order` | 200 | الصفحة تفتح، لكن الـ API يفشل |
| `/cart` | 200 | يعمل |
| `/custom-print` | 200 | يعمل ظاهريًا |
| `/stores` | 404 | لا توجد صفحة |
| `/admin` بدون دخول | 307 | تحويل إلى `/login` |
| `/api/admin/stats` بدون token | 401 | محمي |
| `/api/admin/orders` بدون token | 401 | محمي |
| `/api/search?q=med` | 200 | `products: []` |
| `/api/search?q=medoroid` | 200 | يرجع المنتج |
| `/api/search?mode=suggestions&q=med` | 200 | شكل الحقول لا يطابق الواجهة |
| `/api/search?mode=facets` | 200 | يعيد `category_id` وليس `slug` |
| `/api/gallery` | 200 | 5 صور |
| `/api/shipping?country=EG&subtotal=500` | 200 | خياران |
| `/api/wishlist` / `cart` / `notifications` / `returns` | 401 | محمية كما هو متوقع |

### فحوصات قاعدة البيانات

| الفحص | النتيجة |
|---|---|
| `admin_orders_overview` | 0 صفوف |
| `admin_customers_overview` | 0 صفوف |
| `admin_product_performance` | 0 صفوف |
| `admin_daily_sales` | 0 صفوف |
| `admin_inventory_status` | 0 صفوف |
| `admin_reviews_moderation_queue` | 0 صفوف |
| `profiles.email` | 400 — العمود غير موجود |
| `admin_daily_sales.date` | 400 — العمود غير موجود |
| `admin_orders_overview.created_at` | 400 — العمود غير موجود |
| `payment_receipts` | 404 — الجدول غير موجود |
| `verify_vodafone_cash_payment` | 404 — الدالة غير موجودة |
| `submit_vodafone_cash_receipt` | غير موجودة |
| `exec_sql` | 404 — الدالة غير موجودة |

### تلوث بيانات الاختبار

- اختبارات `gate2`, `gate4`, `gate5` تستدعي `supabase.auth.signUp`.
- التشغيل الكامل أنشأ حسابات حقيقية في مشروع Supabase:
  - `gate2-test-*@test.example.com`
  - `gate4-e2e-*@test.example.com`
  - `seca-*@test.example.com`
  - `secb-*@test.example.com`
- هذه الحسابات تُنشئ صفوفًا في `profiles` ولا يتم حذفها في `afterAll`.
- **يجب** عزل الاختبارات أو إضافة تنظيف كامل.

---

## 12) خريطة الملفات الحرجة

| الملف | الدور | المشكلة |
|---|---|---|
| `app/api/admin/stats/route.js` | إحصائيات الأدمن | أعمدة خاطئة + تجاهل الأخطاء |
| `app/admin/page.tsx` | لوحة التحكم | تتوقع حقولًا غير موجودة |
| `app/api/admin/vendors/route.js` | قائمة التجار | `profiles.email` غير موجود |
| `app/admin/products/page.tsx` | إدارة المنتجات | الصور لا تُرفع |
| `app/admin/settings/page.tsx` | الإعدادات | وهمية بالكامل |
| `app/admin/reviews/page.tsx` | المراجعات | `author_name` / `body` غير موجودين |
| `app/admin/gallery/page.tsx` | المعرض | base64 + لا إدارة |
| `app/admin/users/page.tsx` | المستخدمون | لا إزالة/تعديل |
| `app/api/admin/orders/route.js` | الطلبات | RPC التحقق مفقودة |
| `app/api/orders/track/route.js` | التتبع | يعتمد على أعمدة غير موجودة |
| `app/components/ProductCard.tsx` | كارت المنتج | السعر = نسبة الخصم |
| `lib/products.ts` | تحويل المنتج | يمرر `discountPercentage` كسعر |
| `app/products/page.tsx` | المنتجات | البحث/الفلاتر غير مربوطة |
| `app/api/search/route.js` | البحث | شكل الاستجابة لا يطابق الواجهة |
| `app/components/payment/ReceiptUploader.tsx` | إيصال Vodafone | bucket مفقود |
| `app/checkout/success/page.tsx` | نجاح الدفع | تحقق وهمي |
| `app/api/orders/route.js` | إنشاء الطلب | بريد فارغ + عناصر فارغة |
| `app/custom-print/page.tsx` | التصميم المخصص | معرفات غير صالحة |
| `supabase/migrations/*` | قاعدة البيانات | غير مكتملة وغير مطبقة بالكامل |

---

## 13) الخلاصة والتوصية

المشروع يمتلك أساسًا جيدًا: بناء ناجح، اختبارات شاملة، واجهات متجر جذابة، وهيكل APIs واسع. لكن **الطبقة الأخيرة من التوصيل — بين الواجهات والـ APIs وقاعدة البيانات — غير مكتملة في نقاط حساسة**.

**التوصية:**

1. **لا تطلق المشروع الآن.**
2. ابدأ بالمرحلة 0 و1 (قاعدة البيانات + الدفع + التتبع + الأسعار + لوحة التحكم).
3. لا تعتبر نجاح `build` أو `jest` دليلًا على الجاهزية؛ أضف اختبارات عقد (contract tests) تقارن أسماء الحقول الفعلية بين الواجهة والـ API.
4. أصلح الـ migrations أولًا حتى تصبح البيئات قابلة لإعادة البناء.
5. بعد إغلاق P0، أعد مراجعة الأدمن بصفحة بصفحة مع حساب أدمن حقيقي.

**باختصار:** المشروع في مرحلة «Demo متقدم / Beta»، وليس في مرحلة «Production Ready».
