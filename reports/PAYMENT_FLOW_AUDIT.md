# تقرير فحص الدفع — Vodafone Cash وربط الـBackend

**التاريخ:** 2026-10-02
**النطاق:** تتبّع كامل لعملية الدفع (خاصة Vodafone Cash) من الـFrontend لحد قاعدة البيانات، + فحص ربط بقية مهام الـBackend.
**طريقة الفحص:** قراءة كل الملفات المعنية، استعلام مschemas/functions/triggers/policies/cron jobs من قاعدة البيانات مباشرة، تشغيل `tsc` + `eslint` + `jest`، وطلبات HTTP حقيقية على السيرفر المحلي.

---

## 1. الخلاصة التنفيذية

| | |
|---|---|
| **كود الـFrontend و الـAPI** | ✅ مكتوب، متسق، وبيصفّي من غير أخطاء (`tsc` 0 errors، `eslint` 0 errors جديد، **161/161 tests** ✅) |
| **هل الفلو شغال دلوقتي؟** | ❌ **لا** — طبقة الـDatabase كلها ناقصة (4 migrations ما اتنفذوش) |
| **Bug بنيوي اكتشفته** | 🔴 `reconcile_payments()` بيفشّل أى دفع `pending` بعد 24 ساعة — بيكسر Vodafone Cash **و** COD |
| **إصلاحات اتعملت في الجلسة دي** | 6 إصلاحات (كود) + migration جديد لإصلاح الـcron |

**الحكم:** الفلو مصمّم صح ومترابط على الورق، لكنه غير قابل للاستخدام حتى تشغيل الـmigrations، ولو اتنفذت من غير إصلاح الـcron هيتكسر بعد 24 ساعة بالظبط.

---

## 2. حالة قاعدة البيانات الآن (مفحوصة مباشرة)

| المكوّن | النتيجة |
|---|---|
| `payment_provider` enum فيه `vodafone_cash` | ❌ مش موجود (الأسماء الموجودة: stripe, paymob, cod, wallet) |
| bucket `payment-receipts` + 3 سياسات storage | ❌ مش موجودين |
| RPC `submit_vodafone_cash_receipt` | ❌ مش موجودة |
| RPC `verify_vodafone_cash_payment` | ❌ مش موجودة |
| عمود `orders.shipping_method_id` | ❌ مش موجود |
| RPC `set_order_shipping_method` | ❌ مش موجودة |
| backfill الـvariants (لـ `medoroid`, `test product`, `mega`) | ❌ ما اتنفذش |
| RPC `checkout`, `pay_with_cod`, `update_order_status`, `is_admin` | ✅ موجودة |
| RLS على `payments` | ✅ SELECT للمالك/الأدمن فقط — الكتابة كلها لازم عبر SECURITY DEFINER RPC |
| cron `payment-reconciliation` كل 15 دقيقة | ✅ **شغال** — وده مصدر الـbug (بند 4.1) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ موجود في `.env.local` |
| `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` | ⚠️ لسه placeholder = `01XXXXXXXXX` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | ❌ مش موجودين → دفع الكارت هيفشل (غير متعلّق بفودافون) |

---

## 3. تتبّع الفلو خطوة بخطوة

| # | الخطوة | الموقع | الحالة |
|---|---|---|---|
| 1 | الزبون يختار Vodafone Cash | `app/checkout/page.tsx:669` | ✅ |
| 2 | تأكيد الطلب → `POST /api/orders` | `app/api/orders/route.js:109` | ✅ (شغال — 201 مسجّل في اللوج) |
| 3 | حفظ `payment_method` المختار على الطلب | — | ❌ **مش متحفظ** (بـرجّعه بس) |
| 4 | شاشة: المبلغ + رقم المحفظة + رقم الطلب | `app/checkout/page.tsx:349` | ⚠️ الرقم placeholder |
| 5 | رفع صورة الإيصال إلى `payment-receipts` | `app/checkout/page.tsx:312` | ❌ الـbucket مش موجود → الرفع هيفشل |
| 6 | `POST /api/payments/vodafone-cash` | `app/api/payments/vodafone-cash/route.js:15` | ⚠️ الراوت شغال (401 بدون توكن ✓) لكن الـRPC مش موجود → هيرجع 400 |
| 7 | حفظ `payments` صف بحالة `pending` + مرجع + مسار الصورة | قاعدة البيانات | ❌ |
| 8 | الأدمن يشوف اللوحة + signed URL للصورة | `app/api/admin/orders/route.js:119` | ✅ كوداً / ❌ عملياً (مفيش بيانات) |
| 9 | `PATCH action=verify_payment` → RPC → الطلب `paid` | `app/api/admin/orders/route.js:190` | ❌ الـRPC مش موجود |
| 10 | إشعار الزبون "Payment received" | trigger `notify_payment_status_change` | ✅ هيشتغل **تلقائياً** بعد الخطوة9 |
| 11 | تأكيد الانتقال `pending → paid` | trigger `validate_order_status_transition` | ✅ مسموح |
| 12 | الـcron بعد 24 ساعة | `reconcile_payments()` | 🔴 **بيفشل الدفع** →详见 4.1 |

**ملاحظات ربط إيجابية (اتأكدت منها):**
- `owns_product()` → `is_admin()` → الأدمن يقدر يعمل INSERT/UPDATE على `product_variants` ✓
- `payments` RLS: المالك يقدر يقرأ مدفوعاته (اللي بيسمح لصفحة الطلب تعرض حالة الدفع) ✓
- `next.config.ts` بيسمح بمضيف Supabase → صورة الإيصال بـ`next/image` مش هتوقّع ✓
- عميل الرفع = نفس عميل تسجيل الدخول (`lib/supabaseClient.js` + `auth-context`) → التوكن متاح ✓
- سياسة الرفع بتتحقق إن المسار يبدأ بـ`auth.uid()`، والـfrontend بيبني المسار `${user.id}/...` ✓

---

## 4. نواقص الـBackend (مرتّبة بالأهمية)

### 🔴 4.1 — `reconcile_payments()` بيفشّل دفعات مش المفروض تتفشّل
**الإثبات (من `payment_logs`):** كل دفع COD اتحول `pending → failed` بعد 24 ساعة بالظبط و`created_by = null`:
```
01391bd4… created 09-30 20:51 → failed 10-01 21:00:00
6ea72c8f… created 09-29 23:11 → failed 09-30 23:15:00
04792b6a… created 09-29 22:07 → failed 09-30 22:15:00
```
**المصدر:** `cron.job #5 "payment-reconciliation"` كل 15 دقيقة → `reconcile_payments()` →
```sql
update payments set status='failed', failure_code='timeout' …
where status in ('pending','processing') and created_at < now() - interval '24 hours';
```
**التأثير على Vodafone Cash:** الإيصال المترفَع يبقى `failed` بعد يوم →
1. بادج الأدمن يبقى `Vodafone Cash · Rejected` (غلط — حدّ مرفوضش حاجة)
2. **أزرار Confirm/Reject بتختفي** (كانت مربوطة بـ`status === "pending"`)
3. الزبون ياخد إشعار `Payment failed` وهو أصلاً حوّل الفلوس

**التأثير على COD:** أى طلب كاش بيدفع بعد24 ساعة إشعار "Payment failed" لعميل مدفعش أونلاين خالص (4 دفعات COD اتأثرت بالفعل).

✅ **اتصلح** في `supabase/migrations/20261002_payment_reconciliation_guard.sql` (يشمل backfill لرجوع دفعات الـCOD).

### 🔴 4.2 — الـmigrations الأربعة ما اتنفذوش
بدونهم الفلو مش شغال خالص (الجدول في البند 2).
> `alter type … add value` ممكن يتحط في نفس ملف الـmigration عادي لأننا مش بنستخدم القيمة الجديدة جوه نفس الترانزكشن — بس لو الـSQL editor رمّى خطأ، شغّل أول5 lines لوحدهم وبعدين باقي الملف.

### 🟠 4.3 — طريقة الدفع المختارة مش متحفظة على الطلب
`app/api/orders/route.js:90` بيقرأ `payment_method` و`:182` بيرجعه، لكن **مفيش عمود `payment_provider` في `orders` ولا بيتكتب في أى مكان**، والـ`checkout` RPC مش بياخد المعلمة دي.
**النتيجة:**
- الأدمن مش بيفرق بين "اختار فودافون وسهب الإيصال" و"لسه مدفعش"
- لو الزبون سيب الخطوة، مفيش أى أثر إنه اختار فودافون
- لو الـfrontend بعت غلط (مثلاً `vodafone` بدل `vodafone_cash`) → **الطلب بيتبنى عادى وبصمت** (مفيش تحقق)

**الحل المقترح:** عمود `orders.payment_provider` (או على الأقل صف `payments` بحالة `pending` عند الإنشاء) + قائمة قيم مسموحة في `/api/orders`.

### 🟠 4.4 — مفيش تحقق من قيم `payment_method`
`app/api/orders/route.js:136` بيعالج `cod` بس؛ أى قيمة تانية (card / wallet / vodafone_cash / أى كلام) بتمرّ بدون تسجيل. كود الكارت بعدها بيشتغل بناءً على `paymentMethod` في الواجهة مش على المتسجل.

### 🟡 4.5 — مفيش إشعار للأدمن عند رفع إيصال جديد
`notify_payment_status_change` بيشتغل **فقط** على الانتقال إلى `succeeded`/`failed` — رفع الإيصال بيولّد صف `pending` جديد → **مفيش إشعار**. مع إن فيه `create_notification` + cron `notification-queue-dispatch` كل5 دقائق جاهزين للاستخدام.

### 🟡 4.6 — مفيش تفرید على `(order_id, provider)`
الـconstraint الوحيد هو `unique(provider, provider_payment_id)`. لو زبونين/مرّتين submit في نفس اللحظة (`select … limit 1` ثم `insert`) → ممكن يتعمل صفّين بنفس الطلب. النتيجة العملية: أى مشكلة في العرض (الأدمن هيشوف أقدم واحد حسب `order by created_at desc`).

### 🟡 4.7 — مفيش Realtime/تحديث تلقىى للأدمن
مفيش أى `.channel(` أو `postgres_changes` فى المشروع كله (فحصت الكود) → الأدمن لازم يعمل refresh بنفسه علشان يشوف إيصال جديد.

### 🟡 4.8 — مفيش اختبارات لعملية الدفع
الـ161 اختبار كلها cart / RPC / RLS security — **صفر اختبار** لـ`/api/payments/vodafone-cash` أو RPC التحقق أو سياسات الـstorage.

### ⚪ 4.9 — متعلّقات أخرى
- `set_order_shipping_method` مش موجودة → بادج "طبيعة الطلب" في الأدمن هيفضل `Delivery not set` (غير قاتل، متسرّج في اللوج `app/api/admin/orders/route.js:156`)
- `STRIPE_SECRET_KEY` مش موجودة → `/api/checkout` (الكارت) هيفشل — منفصل عن فودافون
- مفيش `payments` INSERT/UPDATE لـ`authenticated` (by design) → أى كتابة جديدة لازم تبقى SECURITY DEFINER RPC

---

## 5. نواقص الـFrontend

### 🔴 5.1 — مكان رفع الإيصال "بعدين" كان وعراً (✅ اتصلح)
رابط **"I will submit the receipt later"** كان بيودّى `/orders` — صفحة **من غير أى فورم رفع**. الزبون اللي يسيب الخطوة (والسلة اتمسحت بالفعل `clearCart()`) **م كانش هيرفع الإيصال خالص** → طلب معلّق للأبد.

✅ **اتعمل:** لوحة رفع كاملة في `app/orders/[id]/page.tsx` + `GET /api/orders/[id]` بقى يرجّع `payment` / `payments`.
وتحسّن الرابط في `app/checkout/page.tsx` علشان يودّى `/orders/${orderId}` مباشرة.

### 🟠 5.2 — أزرار التحقق كانت بتختفي بعد24 ساعة (✅ اتصلح)
`app/admin/orders/page.tsx:545` كان مربوط بـ`status === "pending"` بس → بعد timeout الأدمن م كانش يقدر يقرّر أبداً.

✅ **اتعمل:** الأزرار بتظهر كمان لو `failed` و`raw_response.rejected !== true`، والبادج بيفرّق بين `Rejected` (أكده أدمن) و`Awaiting verification` (اتسحبت من الـcron).

### 🟠 5.3 — رسالة النجاح كانت غلط (✅ اتصلح)
بعد رفع الإيصال، الشاشة كانت بتقول **"Order Placed!"** و"we'll send you a confirmation email" — من غير أى ذكر لإن الدفع لسه تحت المراجعة.

✅ **اتعمل:** العنوان بقى **"Receipt Submitted"** والوصف **"Your order is awaiting payment verification…"**.

### 🟡 5.4 — رقم المحفظة ممكن يبقى فاضى (✅ اتصلح جزئياً)
`NEXT_PUBLIC_VODAFONE_CASH_NUMBER` لسه `01XXXXXXXXX`.

✅ في `app/checkout/page.tsx`: لو الرقم فاضى بيظهر `—` + تحذير "contact support before transferring".
⚠️ **لسه مطلوب:** تغيير القيمة في `.env.local` لرقم حقيقي.

### 🟡 5.5 — الزبون مش بيشوف صورة الإيصال المرفوعة
صفحة الطلب بتعرض "Awaiting verification" + رقم المرجع، لكن **مفيش عرض للصورة** (مع إن `raw_response.receipt_path` متاح وممكن نعمله signed URL من الراوت).

### ⚪ 5.6 — ملاحظات تانية
- مفيش progress bar أثناء رفع الإيصال (زر بس بيبقى `Loader2`)
- لو الرفع نجح وفشل الـAPI بعده → الصورة بتفضل في الـbucket من غير ربط (أرملة) — مفيش تنظيف
- مفيش فلترة/تبويب في الأدمن لـ"طلبات تحت المراجعة"

---

## 6. الإصلاحات اللى اتعملت في الجلسة دي

| الملف | الإصلاح |
|---|---|
| `supabase/migrations/20261002_payment_reconciliation_guard.sql` | **جديد** — الـcron بقى يفشل بس `stripe`/`paymob`؛ COD وwallet وفودافون مستثنين + backfill لدفعات الـCOD |
| `supabase/migrations/20261001_vodafone_cash.sql` | تحديث `verify_vodafone_cash_payment`: انتقال الحالة بقى **محمى** (`and status = 'pending'`) علشان ميقعش فى `Invalid order status transition` لو الأدمن مشى الطلب لـ`processing` قبل التأكيد |
| `app/api/orders/[id]/route.js` | بيرجّع `payment` و`payments` (RLS: المالك بس) — أساس لوحة "ارفع الإيصال بعدين" |
| `app/orders/[id]/page.tsx` | لوحة كاملة: المبلغ + رقم المحفظة + رقم الطلب + (فورم رفع \| حالة "under review") + إعادة الرفع لو اترفض |
| `app/admin/orders/page.tsx` | أزرار التحقق بتفضل ظاهرة لو الـpayment اتسحب بالـtimeout؛ البادج بيفرّق `Rejected` عن `Awaiting verification` |
| `app/checkout/page.tsx` | رسالة نجاح `Receipt Submitted` + تنذير لو الرقم فاضى + روابط "later" لصفحة الطلب مباشرة |

**التحقق بعد التعديلات:** `tsc --noEmit` ✅ · `eslint` 0 أخطاء جديدة (الخطأ الوحيد `app/checkout/page.tsx:74` موجود قبل تعديلاتى) · **161/161 tests** ✅ · `POST /api/payments/vodafone-cash` → 401 بدون توكن ✅ · `/orders` → 307 (auth) ✅

---

## 7. المطلوب تنفيذه (Checklist)

**لازم الأول — غير كده الفلو مش شغال:**
- [ ] شغّل `supabase/migrations/20261001_order_shipping_method.sql`
- [ ] شغّل `supabase/migrations/20261001_vodafone_cash.sql` (لو رمى خطأ على الـenum، شغّل أول5 lines لوحدهم وبعدين باقي الملف)
- [ ] شغّل `supabase/migrations/20261002_backfill_product_variants.sql`
- [ ] شغّل `supabase/migrations/20261002_payment_reconciliation_guard.sql`
- [ ] غيّر `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` في `.env.local` لرقم حقيقي (Next بيعيد التشغيل لوحده)

**اختبار يدوى بعد التشغيل:**
1. زبون: سلة → Checkout → Vodafone Cash → Place Order → شاشة المبلغ → ارفع صورة → Submit
2. افحص: `select provider, status, raw_response from payments order by created_at desc limit 3;`
3. أدمن: `/admin/orders` → لازم تشوف `Awaiting verification` + صورة الإيصال + زرا Confirm/Reject
4. Confirm → الطلب يبقى `paid` + إشعار "Payment received" للزبون
5. صفحة الطلب `/orders/{id}` → لو مرفوع: "Awaiting verification"؛ لو مرفوض: فورم رفع تانى

**مقترحات تانية (مذكورة فوق):** عمود `payment_provider` على `orders`، إشعار للأدمن عند الرفع، Realtime في لوحة الأدمن، اختبارات للـflow.

---

## 8. اللى مقدرتش أتحقق منه

- **مفيش بيانات دخول test/admin** فى المشروع → مقدرتش أجرب أى flow authenticated end-to-end (رفع فعلي، تحقق الأدمن). كل اللى فوق من الكود + استعلامات قاعدة البيانات + طلبات بلا توكن.
- **مقدرتش أشغّل SQL** (اتصال MCP للقراءة فقط → DDL بيرجع `25006`) → الـmigrations مكتوبة ومراجعة يدوياً بس لسه ما اتنفذتش.
- **مفيش اختبارات آليّة** للـVodafone Cash (بند 4.8) — تغطية الاختبار الحالية مفيهاش المدفوعات خالص.
