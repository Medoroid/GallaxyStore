# تقرير تنفيذ واجهة الدفع (Vodafone Cash) — Frontend Engineer

**التاريخ:** 2026-10-02
**النطاق:** 25 مهمة (Frontend Engineer brief) — checkout → صفحة الطلب → التحقق في لوحة الإدارة، مع تحسينات الشحن والحالة والأخطاء والاختبارات.
**حد الدور (TASK 24):** لا تعديل على قاعدة البيانات (لا SQL / لا CREATE أو ALTER أو POLICY أو FUNCTION أو BUCKET أو TRIGGER أو CRON). كل ما أُنجز من كود على مستوى `app/**` فقط. الملفات المُنشأة في `supabase/migrations/` من إعداد المهندس/الـ Backend ولم يُطبَّق أي منها من قِبلي — قراءتها تمت فقط عبر MCP للقراءة.

---

## 1. الملفات الجديدة

| الملف | الغرض |
|---|---|
| `app/lib/payment-status.ts` | نموذج مشترك للحالة: `toPaymentProvider` (طبقة توافق للقيم القديمة)، `PAYMENT_PROVIDER_LABELS`، `resolveWalletNumber` (يرفض placeholder)، `pickPayment`، `isExplicitlyRejected`، `getVodafoneState` (آلة الحالات)، `canSubmitReceipt`، `VODAFONE_STATE_COPY` + `TONE_CLASS`، `formatDeliveryEstimate` / `describeShippingMethod`، وتفعيل الـ hint المحلي (`rememberVodafoneOrder` / `isVodafoneHintedOrder` / `clearVodafoneHint`). |
| `app/lib/api-error-message.ts` | `apiErrorMessage(status, body, fallback)` يمنع تسريب الأسرار/SQL/Stack traces، و`storageErrorMessage` لرسائل رفع الملفات. |
| `app/components/payment/ReceiptUploader.tsx` | نموذج رفع الإيصال: تحقق من النوع/الحجم/الهاتف/المرجع، معاينة Blob مع إلغاء الرابط عند التغيير، رفع إلى `payment-receipts` ثم `POST /api/payments/vodafone-cash`، حالة نجاح/خطأ + "Try again"، وحارس `inFlight`. |
| `app/components/payment/ReceiptViewer.tsx` | صورة مصغّرة + Lightbox (`role="dialog"`, Esc/Backdrop, قفل التمرير)، تحميل/خطأ مع Retry عبر `key` remount، وجدول `meta`. |
| `app/components/payment/VodafoneInstructions.tsx` | خطوات التحويل: المبلغ + رقم الطلب + زر نسخ، تنبيه "رقم غير مُهيّأ" عند غياب الرقم، وإعادة ترقيم الخطوات تلقائياً. |
| `app/api/orders/[id]/receipt/route.js` | `GET` يُرجع Signed URL مؤقّت (TTL 3600s) للإيصال — بصلاحيات المالك فقط (RLS)، مع 401/400/404/500/503. |
| `__tests__/payment-ui.test.tsx` | 36 اختباراً للنموذج المشترك + التحقق + المكوّنات الثلاثة. |

## 2. الملفات المعدّلة (ضمن هذا الطلب)

| الملف | التغيير |
|---|---|
| `app/checkout/page.tsx` | خيارات دفع `cod / stripe / vodafone_cash` كـ `radiogroup`؛ تحقّق من المزوّد ومن اختيار الشحن قبل إنشاء الطلب؛ إرسال `payment_method: provider` (بدون fallback صامت إلى COD)؛ `rememberVodafoneOrder` عند اختيار Vodafone؛ إصلاح حارس السلة الفارغ (`cartRequired`) الذي كان يُفرغ خطوة الدفع بعد `clearCart()`؛ تحويل جلب الشحن إلى حالة مشتقّة (أزال error `react-hooks/set-state-in-effect`); عرض السعر + المدة لكل خيار شحن؛ خطوة Vodafone تعرض `VodafoneInstructions` + `ReceiptUploader` + رابط "لاحقاً"؛ خطوة النجاح تعرض "Receipt Submitted" + "Track this order". |
| `app/orders/[id]/page.tsx` | إعادة بناء كاملة على `useQuery(["order", id], retry:false)` + `useMutation` للإلغاء؛ `useQuery(["order-receipt", …])` للـ Signed URL؛ بطاقة Payment (المبلغ/المزوّد/الحالة)؛ لوحة Vodafone مع السبب + كل البيانات + `ReceiptViewer`؛ نموذج رفع جديد بعد الرفض/المهلة؛ `describeShippingMethod` في ملخص الطلب؛ hint من `?pay=vodafone_cash` داخل `useState` initializer (بدون setState في effect). |
| `app/admin/orders/page.tsx` | إعادة بناء على `useQuery` (فحص `is_admin` + قائمة الطلبات) و`useMutation` مع `invalidateQueries` بعد كل PATCH (لأن الـ PATCH لا يُرجع بيانات)؛ فلاتر: All / Awaiting verification / Paid / Rejected / COD / Vodafone Cash + فلتر حالة الطلب؛ `ReceiptViewer` بدل الرابط الخام؛ حوار تأكيد "Confirm that the transferred amount matches the order total؟"؛ رفض مع سبب (`note`) داخل النموذج؛ إخفاء Confirm/Reject عند غياب الإيصال؛ "Awaiting verification" أبداً "Rejected" في حالة المهلة. |
| `app/api/orders/[id]/route.js` | إثراء الاستجابة بـ `shipping_method` (يحاول `orders.shipping_method_id` ثم `shipments.shipping_method_id` ثم صف `shipping_methods` — كلها غير قاتلة). |

## 3. نقاط النهاية

- **جديدة:** `GET /api/orders/[id]/receipt?payment=<id>` — Signed URL خاص بالعميل.
- **مُستخدَمة كما هي (بلا تعديل داخلي):** `POST /api/orders`، `GET /api/orders/[id]`، `POST /api/payments/vodafone-cash`، `GET /api/admin`، `GET|PATCH /api/admin/orders`، `GET /api/shipping`.
- **لا يوجد أي service-role أو تجاوز لـ RLS** في أي كود كتبته.

## 4. الاختبارات والتحقق (TASK 22 / 25)

| الفحص | النتيجة |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint` على كل ملفات هذا الطلب | **0 errors, 0 warnings** |
| `npx eslint .` (المستودع كاملاً) | 51 error / 60 warning — **كلها موجودة مسبقاً** في ملفات خارج الطلب (`app/vendor/*`, `app/components/Navbar.tsx`, `app/lib/language-context.tsx`, `app/products/page.tsx`, `productDetailsClient.jsx`, قيّم اختبارات سابقة). لاحظ: خطأ `app/checkout/page.tsx` القديم (`react-hooks/set-state-in-effect`) **أُزيل**. |
| `npx jest` | **197/197** (الخط الأساس 161 + 36 الجديدة) |
| `npx next build` | **exit 0** — `Compiled successfully in 15.0s`، كل المسارات تُبنى |
| HTTP smoke على `:3000` | `/` → 200 · `/products` → 200 · `/checkout` → 307 `/login` · `/orders` → 307 `/login` · `/admin/orders` → 307 `/login` |

محتوى `__tests__/payment-ui.test.tsx`: قيم المزوّدات الحقيقية مقابل القدامية (`card → stripe`)، رفض placeholder للرقم، اختيار محاولات الدفع، **الفرز بين `rejected` و `timed_out`**، آلة الحالات، قابلية إعادة الرفع، الـ hint المحلي، نسخ الشحن، منع تسريب الأسرار في رسائل الخطأ، مُصادقات ملف/هاتف/مرجع، تعليمات التحويل (مهيّأ/غير مهيّأ)، Lightbox، ومسار الرفع الكامل (نجاح / رفض من الـ Backend / فشل التخزين).

## 5. فحوص يدوية لم أستطع تنفيذها

لا توجد حسابات تجريبية/إدارة في المستودع، لذا **لم يُختبَر** بشكل فعلي على المتصفح: رفع إيصال حقيقي، فتح Signed URL، وتأكيد/رفض الدفع كمدير. المسارات محمية بـ `middleware` وتُرجِع 307 كما هو متوقَّع، والبناء نظيف، لكن هذا ليس بديلاً عن تجربة مستخدم مُصادَق عليه.

## 6. تبعيات الـ Backend (تحتاج تنفيذ المهام الخاصة بها)

1. **RPC `submit_vodafone_cash_receipt` غير موجودة** — يتحقق `pg_proc`: مفقودة، لذا `POST /api/payments/vodafone-cash` يرجع 400 برسالة تقنية (الواجهة تعرضها عبر `apiErrorMessage` بشكل آمن).
2. **RPC `verify_vodafone_cash_payment` غير موجودة** — يتحقق `pg_proc`: مفقودة، لذا Confirm/Reject في لوحة الإدارة سيفشل بنص تقني حتى بعد ظهور الـ UI.
3. **قيمة enum `payment_provider='vodafone_cash'` غير موجودة** — لازمة قبل (1).
4. **Bucket `payment-receipts` + سياساته غير موجودة** — الرفع يفشل والواجهة تعرض "Receipt upload is not available yet. Please contact support before transferring."
5. **`orders.payment_method` مفقود** — قبل إرسال أول إيصال لا يمكن للـ Backend تمييز طلب Vodafone عن طلب كرت (Stripe لا يكتب صف `payments` قبل الـ webhook). لذلك استخدمنا **hint غير مُلزِم** على المتصفح (`localStorage` + `?pay=vodafone_cash`)، وهو يُستخدم للعرض فقط ولا يُقرِّر الملكية أو النجاح. **يجب توثيق هذا كفجوة backend.**
6. **`orders.shipping_method_id` + RPC `set_order_shipping_method` مفقودان** — اختيار الشحن يُرسل لكنه لا يُحفظ، و`GET /api/orders/[id]` يعيد `shipping_method: null` (الواجهة تعرض "Delivery not set" بدل أن تكذب).
7. **`NEXT_PUBLIC_VODAFONE_CASH_NUMBER` ما تزال placeholder** = `01XXXXXXXXX` → `configured: false` → يظهر تنبيه "رقم غير مُهيّأ" بدل عرض رقم خاطئ.
8. **لا يوجد إشعار للإدارة عند رفع إيصال** (لا email/realtime) — على الإدارة تصفّح القائمة.
9. **`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PAYMOB_HMAC_SECRET` غير مضبوطة** — دفع الكرت يفشل؛ لم نُعِد قراءة هذا من env هذا الجلسة، لكنه معروف من الجلسات السابقة.
10. **`reconcile_payments`** تُعلّن `failed` بدون `rejected: true` بعد 24 ساعة → الواجهة تظهر "Awaiting verification" (وليس "Rejected")، وهو المطلوب. المصحِّح `supabase/migrations/20261002_payment_reconciliation_guard.sql` بانتظار التطبيق.

## 7. الخطوات التالية المقترحة

1. تطبيق الـ migrations الستة الموجودة (من جهة الـ Backend) ثم إعادة تجربة رفع الإيصال والتأكيد.
2. ضبط `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` برقم حقيقي.
3. اختبار مصادَق يدوياً: checkout → Vodafone → لاحقاً → رفع إيصال → ظهوره للمدير → Confirm/Reject مع السبب.
4. (اختياري) تحويل `app/orders/page.tsx` إلى `useQuery` لتطابق صفحتَي التفاصيل والإدارة.
