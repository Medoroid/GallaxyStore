# خطة إكمال مشروع Galaxy Store للإنتاج

## حالة المشروع الحالية: ~60% مكتمل

### ما يعمل حالياً
- التصميم البصري (Galaxy theme + Glassmorphism)
- عرض المنتجات من Supabase
- تفاصيل المنتج مع صور وألوان ومقاسات
- نظام سلة مشتريات محلي (Zustand) مع مزامنة Supabase
- تسجيل الدخول والتسجيل عبر Supabase Auth
- صفحة Custom Print بواجهة تفاعلية
- صفحة Gift Boxes
- تصميم متجاوب (Responsive)

---

## المرحلة 0: إصلاحات حرجة (يجب تنفيذها أولاً)

### 0.1 إصلاح نظام المصادقة
**المشكلة:** تسجيل الدخول يتم عبر API route (server-side) لكن AuthContext يستخدم Supabase client-side. الجلسة لا تتم المزامنة بشكل صحيح.

**الحل:**
- تعديل `app/login/page.jsx` لاستخدام Supabase client مباشرة بدلاً من API route
- تعديل `app/register/page.tsx` نفس الشيء
- حذف `app/api/auth/login/route.js` و `app/api/auth/register/route.js` (لن نحتاجهما)
- التأكد من أن `AuthProvider` يستمع لتغييرات الجلسة بشكل صحيح

### 0.2 إصلاح مشكلة العملة
**المشكلة:** المنتجات بالدولار (USD) لكن السلة تعرض بالجنيه المصري (EGP)

**الحل:**
- توحيد العملة في جميع أنحاء المشروع (USD أو EGP)
- تعديل `cart/page.tsx` لعرض العملة الصحيحة
- تعديل `productDetailsClient.jsx` لعرض العملة الصحيحة

### 0.3 إصلاح quantity في السلة
**المشكلة:** صفحة التفاصيل تتبع الكمية لكنها ترسل دائماً 1 للسلة

**الحل:**
- تعديل `handleAddToCart` في `productDetailsClient.jsx` لإرسال الكمية المحددة

### 0.4 إصلاح RTL
**المشكلة:** `dir="rtl"` م固定 على صفحة التفاصيل مما يتعارض مع النص الإنجليزي

**الحل:**
- إزالة `dir="rtl"` من الصفحة الرئيسية
- استخدام flex direction و text alignment بدلاً من RTL fixed

### 0.5 إصلاح mutationKey في Hooks
**المشكلة:** كلا الـ hooks يستخدم `mutationKey: ['signup']`

**الحل:**
- تغيير mutationKey في `useLogin.jsx` إلى `['login']`

---

## المرحلة 1: إصلاح بيانات Gallery

### 1.1 ربط Gallery مع Supabase Storage
- إنشاء جدول `gallery_images` في Supabase
- إنشاء API route لجلب صور Gallery من Supabase
- تعديل `useGetGallary.jsx` لجلب البيانات الحقيقية
- حذف الاعتماد على `jsonplaceholder.typicode.com`

### 1.2 إنشاء نظام رفع الصور للGallery
- إنشاء صفحة admin بسيطة لرفع الصور
- استخدام Supabase Storage لتخزين الصور
- إضافة metadata للصور (title, category)

---

## المرحلة 2: نظام الطلبات (Orders)

### 2.1 جدول الطلبات
```sql
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped, delivered
  total NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  shipping_address JSONB,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  product_image TEXT,
  price NUMERIC(10,2),
  quantity INTEGER,
  color TEXT,
  size TEXT
);
```

### 2.2 API Routes
- `POST /api/orders` - إنشاء طلب جديد
- `GET /api/orders` - جلب طلبات المستخدم
- `GET /api/orders/[id]` - تفاصيل طلب محدد

### 2.3 صفحة تأكيد الطلب
- عرض ملخص الطلب قبل الدفع
- إدخال عنوان الشحن
- اختيار طريقة الدفع
- زر تأكيد الطلب

### 2.4 صفحة طلباتي
- عرض جميع طلبات المستخدم
- حالة كل طلب (قيد المعالجة، تم الشحن، تم التوصيل)
- تفاصيل كل طلب

---

## المرحلة 3: نظام الدفع (Payment)

### 3.1 تكامل بوابة دفع
**الخيارات:**
- **Stripe** - الأشهر عالمياً (يحتاج حساب Stripe)
- **PayPal** - بديل شائع
- **Fawry** - للدفع داخل مصر (EGP)

**التنفيذ:**
- تثبيت `@stripe/stripe-js` و `@stripe/react-stripe-js`
- إنشاء Stripe Checkout Session عبر API route
- التعامل مع webhooks لتأكيد الدفع
- تحديث حالة الطلب بعد الدفع بنجاح

### 3.2 صفحة نجاح/فشل الدفع
- `/checkout/success` - صفحة تأكيد نجاح الدفع
- `/checkout/cancel` - صفحة إلغاء الدفع

---

## المرحلة 4: Wishlist (قائمة الأمنيات)

### 4.1 جدول Wishlist
```sql
CREATE TABLE wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  product_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);
```

### 4.2 API Routes
- `POST /api/wishlist` - إضافة/حذف من Wishlist
- `GET /api/wishlist` - جلب Wishlist

### 4.3 تحديث الواجهة
- تعديل `ProductCard.tsx` لزر Wishlist الحقيقي
- تعديل `productDetailsClient.jsx` لزر Wishlist الحقيقي
- إنشاء صفحة `/wishlist` لعرض المنتجات المفضلة
- تحديث الـ Navbar لعرض رابط Wishlist

---

## المرحلة 5: نظام التقييمات والمراجعات

### 5.1 جدول التقييمات
```sql
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  product_id TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);
```

### 5.2 API Routes
- `POST /api/reviews` - إضافة تقييم
- `GET /api/reviews?product_id=xxx` - جلب تقييمات منتج

### 5.3 تحديث الواجهة
- تعديل `productDetailsClient.jsx` لعرض التقييمات الحقيقية
- إضافة نموذج إضافة تقييم (rating stars + comment)
- تحديث `avg_rating` و `rating_count` في جدول المنتجات

---

## المرحلة 6: صفحة Admin (لوحة التحكم)

### 6.1 حماية الصفحة
- middleware للتحقق من صلاحيات admin
- جدول `admin_users` أو حقل `role` في جدول المستخدمين

### 6.2 إدارة المنتجات
- `/admin/products` - عرض جميع المنتجات
- `/admin/products/new` - إضافة منتج جديد
- `/admin/products/[id]/edit` - تعديل منتج
- حذف/أرشفة منتجات

### 6.3 إدارة الطلبات
- `/admin/orders` - عرض جميع الطلبات
- تحديث حالة الطلب (pending → confirmed → shipped → delivered)

### 6.4 إدارة المستخدمين
- `/admin/users` - عرض المستخدمين
- تغيير صلاحيات المستخدمين

### 6.5 إحصائيات
- `/admin` - Dashboard بإحصائيات
- عدد المنتجات، الطلبات، الإيرادات
- أحدث الطلبات

---

## المرحلة 7: صفحة المنتجات (Products) المحسنة

### 7.1 Pagination
- إضافة pagination للصفحة
- أو infinite scroll
- استخدام `limit` و `offset` في Supabase query

### 7.2 فلاتر حقيقية
- فلتر حسب السعر (range slider)
- فلتر حسب التقييم
- فلتر حسب التوفر (متوفر/غير متوفر)
- فلتر حسب الماركة (Brand)
- فلتر حسب المتجر (Store)

### 7.3 ترتيب (Sorting)
- ترتيب حسب السعر (الأقل → الأعلى، الأعلى → الأقل)
- ترتيب حسب الأحدث
- ترتيب حسب الأكثر تقييماً
- ترتيب حسب الأكثر مبيعاً

### 7.4 بحث محسّن
- Debounced search
- Autocomplete suggestions
- بحث في الوصف أيضاً

---

## المرحلة 8: صفحة Gift Boxes الحقيقية

### 8.1 ربط مع Supabase
- إنشاء جدول `gift_boxes` (أو استخدام المنتجات العادية مع category "gift-box")
- إنشاء API route لجلب صناديق الهدايا
- تعديل `gift-boxes/page.tsx` لعرض البيانات الحقيقية

### 8.2 طلب Custom Box
- نموذج for طلب صندوق مخصص
- إدخال المناسبة، الميزانية، المنتجات المطلوبة
- إرسال الطلب للإدارة

---

## المرحلة 9: صفحة Custom Print المحسنة

### 9.1 رفع الصور لـ Supabase Storage
- رفع صورة التصميم المخصص لـ Supabase Storage
- عرض URL الصورة المرفوعة

### 9.2 أسعار حسب المنتج
- T-Shirt: $29.99
- Mug: $19.99
- Phone Case: $24.99
- Poster: $34.99

### 9.3 حفظ التصميمات
- حفظ التصميمات المخصصة في Supabase
- ربطها بطلبات المستخدم

---

## المرحلة 10: SEO و Performance

### 10.1 Metadata لكل صفحة
- إضافة `generateMetadata` لكل صفحة
- Open Graph tags
- Twitter cards
- Structured data (JSON-LD) للمنتجات

### 10.2 صفحات Client → Server
- تحويل `products/page.tsx` لـ server component مع React Query prefetch
- تحويل `gallery/page.tsx` لـ server component
- تحويل `gift-boxes/page.tsx` لـ server component

### 10.3 Image Optimization
- استخدام `next/image` بشكل صحيح مع `sizes` و `priority`
- إزالة Unsplash URLs واستخدام Supabase Storage
- إضافة `blur` placeholder للصور

### 10.4 Caching
- إعداد React Query staleTime بشكل صحيح
- استهداف revalidation للصفحات الثابتة

---

## المرحلة 11: RTL + i18n

### 11.1 توحيد الاتجاه
- إزالة `dir="rtl"` من جميع الصفحات
- استخدام CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`)
- استخدام `flex-row-read` بدلاً من `flex-row` للعربية

### 11.2 نظام ترجمة (اختياري)
- استخدام `next-intl` أو حل بسيط
- ترجمة جميع النصوص للعربية
- تبديل بين اللغات

---

## المرحلة 12: صفحة المستخدم (Profile)

### 12.1 الملف الشخصي
- `/profile` - عرض وتعديل البيانات
- تغيير كلمة المرور
- رفع صورة الملف الشخصي

### 12.2 طلباتي
- `/profile/orders` - عرض جميع الطلبات
- تفاصيل كل طلب

### 12.3 عنواني
- `/profile/addresses` - إدارة عناوين الشحن
- إضافة/تعديل/حذف عنوان
- تحديد العنوان الافتراضي

---

## المرحلة 13: صفحة联系我们 + السياسات

### 13.1 صفحة اتصل بنا
- `/contact` - نموذج اتصال
- حفظ الرسائل في Supabase
- إرسال إيميل للإدارة

### 13.2 صفحة الشحن والتوصيل
- `/shipping` - سياسة الشحن
- الأسعار والمواعيد

### 13.3 صفحة الإرجاع
- `/returns` - سياسة الإرجاع والاستبدال

### 13.4 صفحة الخصوصية
- `/privacy` - سياسة الخصوصية

---

## المرحلة 14: Email System

### 14.1 تأكيد الطلب
- إرسال إيميل تأكيد بعد إتمام الطلب
- يحتوي على: رقم الطلب، المنتجات، المجموع، العنوان

### 14.2 تحديث حالة الطلب
- إرسال إيميل عند تغيير حالة الطلب
- "تم شحن طلبك"، "في الطريق إليك"

### 14.3 Resend Integration
- تثبيت `resend` package
- إنشاء API route لإرسال الإيميلات
- استخدام Resend أو SendGrid

---

## المرحلة 15: اختبارات

### 15.1 Unit Tests
- اختبار cartStore
- اختبار المنتجات helpers

### 15.2 Integration Tests
- اختبار تسجيل الدخول
- اختبار إضافة للسلة
- اختبار إتمام الطلب

### 15.3 E2E Tests
- استخدام Playwright أو Cypress
- اختبار رحلة المستخدم الكاملة

---

## المرحلة 16: إعداد للإنتاج

### 16.1 Environment Variables
- نقل جميع المتغيرات لـ `.env.local`
- التأكد من عدم وجود secrets في `.env` الم tracké
- إعداد متغيرات الإنتاج في Vercel

### 16.2 Vercel Deployment
- ربط المشروع بـ GitHub
- إعداد Vercel project
- إعداد الدومين
- إعداد Supabase للإنتاج

### 16.3 Monitoring
- إعداد Vercel Analytics
- إعداد Error Tracking (Sentry)
- إعداد Logging

### 16.4 Security
- مراجعة RLS policies
- تأكد من عدم وجود SQL injection
- إعداد Rate limiting للـ API routes
- تأكد من CORS settings

---

## ترتيب التنفيذ المقترح

| الأولوية | المرحلة | الوقت المقدر |
|----------|---------|-------------|
| عالية جداً | 0: إصلاحات حرجة | يوم |
| عالية جداً | 1: إصلاح Gallery | يوم |
| عالية جداً | 2: نظام الطلبات | يومان |
| عالية جداً | 3: نظام الدفع | يومان |
| عالية | 4: Wishlist | يوم |
| عالية | 5: التقييمات | يوم |
| عالية | 7: صفحة المنتجات المحسنة | يومان |
| متوسطة | 8: Gift Boxes الحقيقية | يوم |
| متوسطة | 9: Custom Print المحسنة | يوم |
| متوسطة | 6: صفحة Admin | 3 أيام |
| منخفضة | 10: SEO و Performance | يومان |
| منخفضة | 11: RTL + i18n | يوم |
| منخفضة | 12: صفحة المستخدم | يومان |
| منخفضة | 13: صفحات السياسات | يوم |
| منخفضة | 14: Email System | يوم |
| منخفضة | 15: اختبارات | يومان |
| أخيراً | 16: إعداد للإنتاج | يوم |

**المجموع التقريبي: ~25-30 يوم عمل**

---

## ملخص الملفات المطلوب إنشاؤها/تعديلها

### ملفات جديدة
```
app/
├── admin/
│   ├── page.tsx                    # Dashboard
│   ├── products/
│   │   ├── page.tsx                # قائمة المنتجات
│   │   ├── new/page.tsx            # إضافة منتج
│   │   └── [id]/edit/page.tsx      # تعديل منتج
│   ├── orders/page.tsx             # إدارة الطلبات
│   └── users/page.tsx              # إدارة المستخدمين
├── checkout/
│   ├── page.tsx                    # صفحة الدفع
│   ├── success/page.tsx            # نجاح الدفع
│   └── cancel/page.tsx             # إلغاء الدفع
├── orders/
│   ├── page.tsx                    # طلباتي
│   └── [id]/page.tsx               # تفاصيل طلب
├── wishlist/page.tsx               # قائمة الأمنيات
├── profile/
│   ├── page.tsx                    # الملف الشخصي
│   ├── orders/page.tsx             # طلباتي
│   └── addresses/page.tsx          # عناويني
├── contact/page.tsx                # اتصل بنا
├── shipping/page.tsx               # سياسة الشحن
├── returns/page.tsx                # سياسة الإرجاع
└── privacy/page.tsx                # سياسة الخصوصية

app/api/
├── orders/
│   ├── route.js                    # CRUD للطلبات
│   └── [id]/route.js               # تفاصيل طلب
├── wishlist/route.js               # CRUD لل Wishlist
├── reviews/route.js                # CRUD للتقييمات
├── upload/route.js                 # رفع الملفات
├── contact/route.js                # نموذج الاتصال
└── email/route.js                  # إرسال الإيميلات

lib/
├── stripe.ts                       # Stripe configuration
└── email.ts                        # Email service

supabase/migrations/
├── create_orders_tables.sql        # جداول الطلبات
├── create_wishlist_table.sql       # جدول Wishlist
├── create_reviews_table.sql        # جدول التقييمات
├── create_gallery_table.sql        # جدول Gallery
├── create_admin_table.sql          # جدول Admin
└── create_profiles_table.sql       # جدول الملفات الشخصية
```

### ملفات تحتاج تعديل
```
app/
├── login/page.jsx                  # استخدام Supabase client مباشرة
├── register/page.tsx               # استخدام Supabase client مباشرة
├── cart/page.tsx                   # إصلاح العملة + checkout حقيقي
├── products/page.tsx               # pagination + فلاتر
├── product-details/[id]/
│   └── productDetailsClient.jsx    # إصلاح RTL + quantity + wishlist
├── gallery/page.tsx                # بيانات حقيقية
├── gift-boxes/page.tsx             # بيانات حقيقية
├── custom-print/page.tsx           # رفع صور + أسعار
├── components/
│   ├── Navbar.tsx                  # رابط wishlist + admin
│   ├── Footer.tsx                  # روابط حقيقية
│   └── ProductCard.tsx             # wishlist حقيقي
├── hooks/
│   ├── useLogin.jsx                # إصلاح mutationKey
│   ├── signUphook.jsx              # إصلاح mutationKey
│   └── useGetGallary.jsx           # بيانات حقيقية
├── lib/
│   └── auth-context.tsx            # إصلاح session sync
└── stores/
    └── cartStore.ts                # إصلاح localStorage side effects
```
