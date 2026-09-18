# المشاكل المتبقية في مشروع Galaxy Store

**تاريخ الفحص:** 2026-09-16  
**عدد المشاكل:** 34 (7 حرجة + 7 عالية + 11 متوسطة + 9 منخفضة)

---

## 🔴 حرجة (CRITICAL) — تسبب أخطاء أمنية أو تعطّل كامل

---

### ~~1. `proxy.ts` يصدّر `proxy` بدل `middleware`~~ ✅ تم التحقق — ليس مشكلة

**الملف:** `proxy.ts:11`  
**الحالة:** `proxy` هو الاسم الصحيح في Next.js 16 (تم تغييره من `middleware`)  
**التحقق:** `Invoke-WebRequest /admin` يرجع 307 redirect — الحماية تعمل ✅

---

### 2. `admin/setup` يستخدم anon key لتنفيذ SQL

**الملف:** `app/api/admin/setup/route.js:7-10`  
**المشكلة:** يستخدم `NEXT_PUBLIC_SUPABASE_ANON_KEY` لاستدعاء `exec_sql` RPC  
**التأثير:** لوكتشف أي شخص `ADMIN_SETUP_KEY`، يمكنه تنفيذ SQL عشوائي على قاعدة البيانات  
**الإصلاح:** استخدام `SUPABASE_SERVICE_ROLE_KEY` أو حذف الـ endpoint

---

### 3. `admin/setup` يكشف `error.message` للعميل

**الملف:** `app/api/admin/setup/route.js:55`  
**المشكلة:** `return Response.json({ success: false, message: error.message })`  
**التأثير:** تسريب تفاصيل قاعدة البيانات والأخطاء الداخلية  
**الإصلاح:** إرجاع رسالة عامة + تسجيل الخطأ server-side فقط

---

### 4. Paymob HMAC يتحقق من `JSON.stringify(payload)` بدل Raw Body

**الملف:** `app/api/paymob/webhook/route.js:17-19`  
**المشكلة:** إعادة تسلسل JSON تغير ترتيب Keys → HMAC لا يتطابق  
**التأثير:** كل مدفوعات Paymob ستظهر كأنها فاشلة في الـ webhook  
**الإصلاح:** حساب HMAC على `rawBody` بدلاً من `JSON.stringify(payload)`

---

### 5. Rate Limiter لا يعمل في Serverless

**الملف:** `lib/rate-limit.ts:1`  
**المشكلة:** `Map` في الذاكرة يتغير مع كل cold start  
**التأثير:** لا حماية ضد brute force أو DDoS في الإنتاج  
**الإصلاح:** استخدام Redis (مثلاً `@upstash/ratelimit`)

---

### 6. Stripe Webhook — `stripeInstance` قد يتلف

**الملف:** `app/api/stripe/webhook/route.js:4-12`  
**المشكلة:** لوكان `STRIPE_SECRET_KEY` غير معرّف عند أول استدعاء، يتلف Singleton  
**التأثير:** كل استدعاءات Webhook التالية تفشل  
**الإصلاح:** إزالة caching أو إعادة تعيين `stripeInstance = null` عند الخطأ

---

### 7. `verifyAdmin.js` يستخدم anon key للتحقق من الصلاحيات

**الملف:** `app/api/admin/_lib/verifyAdmin.js:8-11`  
**المشكلة:** `getClient()` يستخدم `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
**التأثير:** لوكان RLS غير مكوّن صحيح، يمكن تجاوز فحص الأدمن  
**الإصلاح:** استخدام service role key أو التأكد من RLS policies

---

## 🟠 عالية (HIGH) — ثغرات وظيفية كبيرة

---

### ~~8. لا يوجد ملف `middleware.ts` — لا حماية للمسارات~~ ✅ تم التحقق — ليس مشكلة

**الحالة:** `proxy.ts` مع الدالة `proxy()` هو الاسم الصحيح في Next.js 16  
**التحقق:** كل المسارات المحمية تُعيد 307 redirect للمستخدم غير المسجّل ✅

---

### 9. `verifyAdmin` مكرر — نسختان `.js` و `.ts`

**الملف:** `app/api/admin/_lib/verifyAdmin.js` + `verifyAdmin.ts`  
**المشكلة:** كلاهما موجود، قد يسبب تضارب في الاستيراد  
**الถأثير:** سلوك غير متوقع في بعض الـ routes  
**الإصلاح:** حذف `.js` والاحتفاظ بـ `.ts` فقط

---

### 10. Supabase client على مستوى Module بـ env vars غير معرّفة

**الملف:** `app/api/checkout/route.js:5-8` + 6 ملفات أخرى  
**المشكلة:** `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, ...)` في أعلى الملف  
**التأثير:** لوغير معرّف، كل الـ routes ت crash في أول طلب  
**الإسلام:** استخدام lazy initialization أو null check

---

### 11. `admin/add` يرجع لـ anon key لو `SUPABASE_SERVICE_ROLE_KEY` غير معرّف

**الملف:** `app/api/admin/add/route.js:6-8`  
**المشكلة:** `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)`  
**التأثير:** تحديث `profiles.role` قد يفشل بصمت بسبب RLS  
**الإسلام:** رمي خطأ لو `SUPABASE_SERVICE_ROLE_KEY` غير معرّف

---

### 12. `admin/orders` يستخدم anon key — لا يمكن تحديث كل الطلبات

**الملف:** `app/api/admin/orders/route.js:4-7`  
**المشكلة:** PATCH يستخدم anon key عبر RLS  
**التأثير:** تحديث حالة طلبات المستخدمين الآخرين قد يفشل  
**الإسلام:** استخدام `SUPABASE_SERVICE_ROLE_KEY`

---

### 13. 18 اختبار فاشل (timeout)

**الملف:** `__tests__/gate5-security-negative.test.ts` (17) + `api-routes.test.ts` (1)  
**المشكلة:** `beforeAll` يفشل بسبب timeout في Supabase auth  
**التأثير:** اختبارات الأمان (SQL injection, cross-user isolation) لا تعمل  
**الإسلام:** زيادة timeout أو إصلاح `beforeAll` hook

---

### 14. `checkout` يستخدم anon key لفحص ملكية الطلب

**الملف:** `app/api/checkout/route.js:5-8`  
**المشكلة:** فحص ملكية الطلب عبر RLS مع anon key  
**التأثير:** إنشاء Stripe checkout قد يفشل للمستخدمين الشرعيين  
**الإسلام:** التأكد من RLS policies أو استخدام service role

---

## 🟡 متوسطة (MEDIUM) — جودة الكود والممارسات

---

### 15. 76 `console.log/console.error` في ملفات API

**المشكلة:** يجب استخدام `logger` utility بدلاً من console  
**التأثير:** سجلات noise في الإنتاج  
**الإسلام:** استبدال بـ `logger.error()` / `logger.info()`

---

### 16. `logger.ts` يكتم كل السجلات في الإنتاج

**الملف:** `lib/logger.ts:4`  
**المشكلة:** `if (process.env.NODE_ENV === "production") return;`  
**التأثير:** لا رؤية للأخطاء في الإنتاج  
**الإسلام:** تسجيل الأخطاء دائمًا + استخدام خدمة logging خارجية

---

### 17. `tsconfig.json` يحتوي على ملفات محددة في `include`

**الملف:** `tsconfig.json:32`  
**المشكلة:** ملفات مكتوبة يدويًا بدل glob patterns  
**التأثير:** ملفات جديدة قد لا تُفحص  
**الإسلام:** إزالة القائمة والاعتماد على globs

---

### 18. استخدام `any` في ملفات الاختبار (48 مرة)

**الملف:** `__tests__/component-unit.test.tsx` + 4 ملفات أخرى  
**المشكلة:** `any` يُضعف Type Safety  
**التأثير:** أخطاء نوعية قد تُخفى  
**الإسلام:** استخدام أنواع صحيحة

---

### 19. `catch {}` فارغة في ملفات الاختبار

**الملف:** 3 ملفات اختبار  
**المشكلة:** أخطاء التنظيف تُبتلع بصمت  
**التأثير:** فشل التنظيف غير مرئي  
**الإسلام:** تسجيل الأخطاء على الأقل

---

### 20. `stripe-server.ts` يفرض `!` على env var غير معرّف

**الملف:** `lib/stripe-server.ts:7`  
**المشكلة:** `process.env.STRIPE_SECRET_KEY!`  
**التأثير:** Stripe API calls تفشل runtime برسائل غير مفيدة  
**الإسلام:** رمي خطأ واضح لوغير معرّف

---

### 21. Paymob HMAC لا يستخدم Timing-Safe Comparison

**الملف:** `app/api/paymob/webhook/route.js:46`  
**المشكلة:** `receivedHmac !== expectedHmac` — مقارنة عادية  
**التأثير:** هجوم timing attack محتمل  
**الإسلام:** استخدام `crypto.timingSafeEqual()`

---

### 22. `ADMIN_EMAILS` مكرر في `verifyAdmin.js` و `proxy.ts`

**الملف:** `verifyAdmin.js:3-5` + `proxy.ts:4-8`  
**المشكلة:** تحليل مزدوج للمتغير  
**التأثير:** لوأُحدِث واحد ولم يُحدَث الآخر، تختلف المنطق  
**الإسلام:** استخراج لدالة مشتركة

---

### 23. `verifyAdmin` ينشئ Supabase client جديد في كل طلب

**الملف:** `app/api/admin/_lib/verifyAdmin.js:7-11`  
**المشكلة:** `getClient()` يعمل `createClient()` في كل مرة  
**التأثير:** أداء ضعيف  
**الإسلام:** استخدام singleton pattern

---

### 24. Stripe webhook — حساب المبلغ قد يسبب rounding errors

**الملف:** `app/api/stripe/webhook/route.js:85`  
**المشكلة:** `(session.amount_total || 0) / 100` — float division  
**التأثير:** قد يختلف السنت بـ 1 للمبالغ المعينة  
**الإسلام:** `Math.round()` أو التخزين بالـ cents

---

### 25. `admin/add` يكشف البريد الإلكتروني في رسالة الخطأ

**الملف:** `app/api/admin/add/route.js:40`  
**المشكلة:** `` `User with email ${email} not found` ``  
**التأثير:** User enumeration vulnerability  
**الإسلام:** رسالة عامة: "User not found"

---

## 🟢 منخفضة (LOW) — تحسينات مستقبلية

---

### 26. لا توجد تعليقات TODO/FIXME/HACK  
**الحالة:** ✅ نظيف

---

### 27. npm audit: 9 ثغرات (1 حرجة، 6 عالية، 2 متوسطة)

**التأثير:** Next.js 16.2.9 يحتوي على 11 CVE  
**الإسلام:** `npm audit fix --force` لترقية Next.js إلى 16.3.5+

---

### 28. `admin/setup` ينشئ جداول عبر API — يجب استخدام migrations

**الملف:** `app/api/admin/setup/route.js:24-41`  
**المشكلة:** إنشاء جداول عبر `exec_sql` anti-pattern  
**التأثير:** Schema drift  
**الإسلام:** حذف الـ endpoint + استخدام `supabase/migrations/`

---

### 29. `shipping` يرسل `p_weight_grams: 0` دائماً

**الملف:** `app/api/shipping/route.js:26`  
**المشكلة:** الوزن دائماً 0  
**التأثير:** تكلفة الشحن غير دقيقة  
**الإسلام:** حساب الوزن من بيانات المنتجات

---

### 30. `orders/route.js` POST — إيميل التأكيد يرسل `items: []` فارغ

**الملف:** `app/api/orders/route.js:149`  
**المشكلة:** `items: []` ثابت في الـ email payload  
**التأثير:** إيميلات التأكيد ناقصة  
**الإسلام:** استعلام عناصر الطلب من قاعدة البيانات

---

### 31. `package.json` الإصدار `0.1.0` — pre-release

**التأثير:** تجميلي فقط

---

### 32. `admin/stats` يبتلع الأخطاء بصمت

**الملف:** `app/api/admin/stats/route.js:56`  
**المشكلة:** `catch { return ... }` بدون تسجيل  
**التأثير:** فشل Dashboard غير مرئي  
**الإسلام:** تسجيل بـ `logger.error()`

---

### 33. خلط بين `.js` و `.ts`/`.tsx`

**المشكلة:** API routes كلها `.js`، الصفحات `.tsx`  
**التأثير:** لا Type Safety في API routes  
**الإسلام:** تحتدير تدريجي إلى `.ts`

---

### ~~34. `proxy.ts` يصدّر `config` لكن لا دالة middleware~~ ✅ تم التحقق — ليس مشكلة

**الحالة:** `proxy` + `config` كلاهما يعمل في Next.js 16 ✅

---

## ملخص

| الخطورة | العدد | الموضوعات الرئيسية |
|---------|-------|-------------------|
| **حرجة** | 7 | حماية معطّلة، SQL عبر anon، HMAC bug، rate limiter |
| **عالية** | 7 | لا middleware، admin key fallback، اختبارات فاشلة |
| **متوسطة** | 11 | console.log، logger، type safety، timing attacks |
| **منخفضة** | 9 | npm vulns، email فارغ، mixed JS/TS |

---

## الإجراء الأهم (الأولوية القصوى)

**المشكلة #1:** تغيير اسم الدالة في `proxy.ts` من `proxy` إلى `middleware`

هذا الإصلاح الوحيد يُعيد كل الحماية للمسارات. بدونه، كل صفحة محمية متاحة للجميع.
