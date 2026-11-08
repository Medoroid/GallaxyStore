# مراجعة Migration الدفع وطرق الدفع الخارجية

> المشروع: `galaxy-store` (`httywgkwfqvrbuwuzutu`)
> الملف قيد المراجعة: `supabase/migrations/20261028_payment_methods_external_wallet.sql`
> تاريخ المراجعة: 2026-10-23
> حالة التنفيذ: **الملف لم يُطبَّق، ولم يُنفَّذ أي تغيير على قاعدة الإنتاج خلال هذه المراجعة.**

---

## 1. الخلاصة التنفيذية

- التعديل البرمجي لطرق الدفع (COD + محفظة خارجية) موجود في الكود، لكن **قاعدة البيانات
  الحية لا تزال ما قبل الترحيل**: لا يوجد `external_wallet` في `payment_provider`،
  ولا يوجد عمود `orders.payment_method`، ودوال المحفظة الخارجية غير موجودة.
- ملف `20261028` **جاهز للاختبار التجريبي (Staging)** بعد الإصلاحات الموضحة في هذا
  التقرير، لكنه **غير جاهز للإنتاج قبل**: (1) تطبيقه على مشروع تجريبي منفصل، (2) نجاح
  اختبارات سيناريوهات COD والمحفظة والإيصالات القديمة، (3) التحقق من صلاحيات الدوال
  والـ trigger على قاعدة حقيقية.
- لم يُطبَّق الملف ولم تُنفَّذ أي `SQL mutations` أو migrations على القاعدة الحية. كل
  الفحص الحي كان **قراءة فقط**.
- نتائج التحقق المحلي بعد الإصلاحات:
  - `npx tsc --noEmit`: **ناجح**.
  - `npm run lint`: **0 أخطاء**، 22 تحذيرًا فقط من نوع `react-hooks/set-state-in-effect`.
  - `npm test`: **14 suites / 154 tests ناجحة** (منها suite جديد لعقد الترحيل).
  - `npm run build`: **ناجح** (Next.js 16.2.9).

---

## 2. نطاق المراجعة

راجعنا:

- `20261028_payment_methods_external_wallet.sql` (الملف الأساسي).
- migrations الدفع السابقة: `20261023_production_readiness.sql`, `20261025_refund_hardening.sql`,
  `20261026_admin_audit_log.sql`, `20261001_vodafone_cash.sql`,
  `20261002_payment_receipts_table.sql`, `20261002_payment_reconciliation_guard.sql`,
  `20260913_fix_confirm_order_payment_security.sql`.
- الدوال الحية المرتبطة بالدفع والملكية والـ triggers.
- سياسات RLS والـ Storage والـ grants للجداول والدوال.
- كود التطبيق: `app/api/orders/route.js`, `app/api/orders/[id]/route.js`,
  `app/api/admin/orders/route.js`, `app/api/payments/_lib/submit-receipt.js`,
  `lib/payment-settings.ts`, `app/lib/payment-status.ts`.

---

## 3. الوضع الحي الحالي (قراءة فقط)

| العنصر | الحالة الحية |
|---|---|
| `payment_provider` | `stripe`, `paymob`, `cod`, `wallet`, `vodafone_cash` — لا يوجد `external_wallet` |
| `orders.payment_method` | غير موجود |
| `guard_vodafone_receipt_method` | غير موجود |
| دوال `initiate_external_wallet_payment` / `submit_external_wallet_receipt` / `verify_external_wallet_payment` | غير موجودة |
| `pay_with_cod` | موجودة لكنها لا تحفظ `payment_method`، ولا تتحقق من وجود دفعة ناجحة أخرى، ولا تتحقق من حالة الطلب |
| `mark_cod_collected` | موجودة لكنها تكتفي بتحديث الدفعة |
| `sync_order_payment_status()` | موجودة وتُفعَّل عند نجاح أي دفعة، وتحوّل الطلب من `pending` إلى `paid` إذا بلغ مجموع المدفوعات الناجحة إجمالي الطلب وكان `total > 0` |
| الطلبات | 12 طلبًا؛ 7 `pending`؛ 7 لديها payments |
| المدفوعات | 2 Stripe succeeded، 1 Stripe failed، 4 COD failed؛ لا توجد دفعات مفتوحة، ولا توجد طلبات بأكثر من succeeded واحد |
| `payment_receipts` | 0 صفوف؛ لا توجد payments Vodafone حية |
| RLS | `orders`: اختيار للمالك/الأدمن، وتحديث للأدمن فقط. `payments`: اختيار للمالك/الأدمن، ولا سياسات كتابة. `payment_receipts`: اختيار للمالك/الأدمن، ولا سياسات كتابة |
| Storage | bucket `payment-receipts` خاص، الحد 5MB، وأنواع صور محددة |

### تصحيح مهم

الوثائق السابقة كانت تقول إن `mark_cod_collected` القديمة لا تحوّل الطلب إلى `paid`.
هذا صحيح بالنسبة للدالة نفسها، لكن **الـ trigger الحي `sync_order_payment_status()` يحوّل
الطلب إلى `paid` تلقائيًا** عند نجاح دفعة COD بقيمة تساوي إجمالي الطلب. لذلك سلوك COD
الحي فعليًا يعلّم الطلب مدفوعًا، والفرق الحقيقي أن الدالة القديمة لا تحفظ
`orders.payment_method` ولا تمنع settlement مزدوجًا.

---

## 4. المشكلات المكتشفة

### 4.1 خطورة عالية — `confirm_order_payment` قابلة للاستدعاء من `PUBLIC`

- الدالة `confirm_order_payment(...)` هي `SECURITY DEFINER`، ولا تحتوي على أي تحقق من
  الملكية أو صلاحية الأدمن، ويمكنها تعليم أي طلب `pending` مدفوعًا.
- الـ migration `20261023` حاولت تقييدها لكنها عملت:
  `revoke ... from anon, authenticated` فقط، وهذا **لا يزيل المنحة الافتراضية `PUBLIC`**؛
  لذلك ظل `anon` قادرًا على استدعائها فعليًا.
- الإصلاح في `20261028`: `revoke execute ... from public, anon, authenticated` مع
  `grant ... to service_role` فقط.

### 4.2 خطورة متوسطة — منح `PUBLIC` الافتراضي على دوال الدفع القديمة والجديدة

- نفس المشكلة ظهرت في `submit_vodafone_cash_receipt` و`verify_vodafone_cash_payment`
  (منحة `PUBLIC` افتراضية).
- الدوال الجديدة في `20261028` كانت تنفذ `revoke ... from anon` فقط، لذا قد تظل منحة
  `PUBLIC` قائمة.
- تم الإصلاح لكل دوال الدفع: `revoke ... from public, anon` ثم
  `grant ... to authenticated, service_role`.

### 4.3 خطورة عالية — دالة `submit_vodafone_cash_receipt` تتحقق من مجلد المستخدم فقط

- الدالة الحية تقبل أي مسار يبدأ بـ `<auth.uid>/`، ولا تشترط `<auth.uid>/<order_id>/`،
  ولا تتحقق من أن `payment.provider = vodafone_cash` أو أن الدفعة تخص نفس الطلب.
- تم إصلاح ذلك على مستوى الجدول عبر trigger `guard_vodafone_receipt_method`:
  - يتحقق أن `new.user_id` هو مالك الطلب.
  - يتحقق أن `new.receipt_url` يطابق `<user_id>/<order_id>/...` بالضبط.
  - يرفض `..` و`\`.
  - يتحقق أن الدفعة المُرتبطة هي فعلاً `vodafone_cash`.
  - يرفض الإرفاق على طلبات COD/المحفظة الخارجية أو عند وجود دفعة COD/محفظة مفتوحة.

### 4.4 خطورة متوسطة — عدم وجود حماية من settlement مزدوج

- الدالة القديمة `mark_cod_collected` لا تتحقق من وجود دفعة ناجحة أخرى على نفس الطلب.
- `verify_external_wallet_payment` الجديدة كانت تقبل الحجز حتى لو سبق نجاح دفعة أخرى.
- الإصلاح:
  - COD: رفض التحصيل إذا وُجدت دفعة ناجحة أخرى.
  - المحفظة الخارجية: رفض الموافقة إذا وُجدت دفعة ناجحة أخرى.

### 4.5 خطورة منخفضة — ترتيب الأقفال في `mark_cod_collected`

- الدالة القديمة/المرشحة كانت تقفل `payments` ثم `orders`، بينما باقي الدوال تقفل
  `orders` ثم `payments`، ما قد يسبب deadlock نادرًا مع إعادة محاولة الدفع.
- تم إصلاحها لتقفل `orders` أولاً ثم `payments`، مع إعادة التحقق بعد القفل.

### 4.6 ملاحظة — تحديث `paid -> paid` ينتج سجل حالة مكررًا

- كانت `mark_cod_collected` تُحدّث `status` حتى لو كان الطلب `paid` بالفعل (بسبب trigger
  المزامنة)، ما يولّد سجل `order_status_history` من نوع `paid -> paid`.
- تم فصل التحديث: تحديث الحالة فقط عندما تكون `pending`، وتحديث `payment_method` في
  تحديث منفصل لا يلمس `status`.

---

## 5. ما تم إصلاحه في الملف

| # | الإصلاح | الملف |
|---|---|---|
| 1 | إزالة `PUBLIC`/`anon` من كل دوال الدفع (الجديدة والقديمة) ومنح `authenticated/service_role` | `20261028_...sql` |
| 2 | تقييد `confirm_order_payment` بـ `service_role` فقط | `20261028_...sql` |
| 3 | تقوية guard الفودافون: الملكية + المسار الدقيق + provider + منع التداخل | `20261028_...sql` |
| 4 | COD: قفل order ثم payment + منع settlement مزدوج + فصل تحديث الحالة/الطريقة | `20261028_...sql` |
| 5 | المحفظة الخارجية: منع الموافقة عند وجود دفعة ناجحة أخرى | `20261028_...sql` |
| 6 | اختبار عقد ثابت للترحيل | `__tests__/payment-migration-contract.test.ts` |
| 7 | تصحيح تعليق `notifyOrderStatus` ليعكس سلوك trigger الحي | `app/api/admin/orders/route.js` |
| 8 | تحديث التوثيق `docs/*` | `FINAL-REPORT`, `PRODUCTION-READINESS`, `DATABASE-BASELINE`, `TODO` |

---

## 6. تحليل التكرارية والترتيب ومخاطر الفشل الجزئي

### 6.1 التكرارية

- `alter type ... add value if not exists`: آمنة للتكرار.
- `add column if not exists`: آمنة.
- الـ backfill مقيّد بـ `payment_method is null`: لا يعيد الكتابة عند إعادة التنفيذ.
- `do $$ ... if not exists pg_constraint ... $$`: لا يعيد إنشاء القيد.
- `create index if not exists`: آمن.
- `create or replace function`: آمن بشرط ثبات نوع الإرجاع، وهو كذلك.
- `drop trigger if exists` ثم `create trigger`: آمن ويعيد الإنشاء.
- `revoke/grant`: آمنة وقابلة للتكرار.

### 6.2 الترتيب

الترتيب الحالي صحيح:

1. إضافة قيمة الـ enum.
2. إضافة العمود + backfill + check + index.
3. دوال الدفع.
4. trigger guard.
5. إصلاح صلاحيات الدوال.

### 6.3 مخاطر جزئية

- لو انهار التنفيذ في منتصف migration داخل transaction: سيتم rollback غالبًا، لكن
  اعتمادًا على طريقة تشغيل Supabase قد تبقى كائنات جزئية؛ الملف idempotent في معظمه
  ويعالج ذلك.
- القيد `orders_payment_method_check` لا يُعاد إنشاؤه لو وُجد باسمه بتعريف مختلف من
  محاولة جزئية سابقة. احتمال منخفض، ويُفحص في staging.
- إضافة قيمة enum واستخدامها في نفس الـ transaction قد يسبب
  `unsafe use of new value`، لكن الملف **لا يستخدم** القيمة الجديدة في أي DML أثناء
  التنفيذ؛ الاستخدام فقط داخل أجسام دوال `plpgsql` تُنفَّذ لاحقًا.
- لا يوجد `drop table` أو `truncate` أو `delete from` للبيانات التاريخية.

---

## 7. فحص الصلاحيات و RLS

- `orders`: `SELECT` للمالك/الأدمن؛ `UPDATE` للأدمن فقط؛ لا سياسة `INSERT`/`DELETE` من
  العميل. إنشاء الطلب يتم عبر `checkout` المعرفة بـ `SECURITY DEFINER`.
- `payments`: `SELECT` للمالك/الأدمن؛ لا سياسات كتابة. الكتابة عبر دوال `SECURITY DEFINER`.
- `payment_receipts`: `SELECT` للمالك/الأدمن؛ لا سياسات كتابة. الكتابة عبر دوال
  `SECURITY DEFINER` أو service role.
- `payment-receipts` bucket خاص، وRLS تسمح للمستخدم بالكتابة داخل مجلده فقط.
- الدوال الجديدة/القديمة تتحقق من `auth.uid()` والملكية وصلاحية الأدمن داخليًا.
- إصلاحات ACL أزالت `PUBLIC`، ما يمنع وصول `anon` حتى قبل الوصول لفحص `auth.uid()`.
- ملاحظة دفاعية: ACL على مستوى الجداول يمنح `anon`/`authenticated` صلاحيات واسعة، لكن
  RLS الحالية لا تسمح بالكتابة على جداول الدفع/الإيصالات. **لا نوصي بإلغاء واسع** دون
  فحص مسار `admin` الذي يحدّث `orders` مباشرة عبر RLS.

---

## 8. حفظ البيانات القديمة

- لم يُحذف أي جدول أو عمود أو قيمة enum.
- `stripe`, `paymob`, `wallet`, `vodafone_cash` باقية.
- الـ backfill لا يكتب فوق طريقة موجودة، ويترك الطلبات ذات المحاولات الفاشلة فقط بـ
  `NULL`.
- الإيصالات والمدفوعات القديمة لا تُحذف.
- `submit_vodafone_cash_receipt` و`verify_vodafone_cash_payment` باقيتان كما هما وظيفيًا،
  مع تشديد ACL وguard الطلبات الجديدة.
- `payment_receipts` الحية فارغة (0 صفوف)، ولا توجد payments Vodafone حية؛ لذلك لا يوجد
  تعارض بيانات فعلي في القاعدة الحية.

---

## 9. خطة الاختبار على مشروع Staging منفصل

> يجب تطبيق `20261028` على مشروع Supabase **تجريبي منفصل** أولاً. لا تُنفَّذ هذه
> الخطوات على مشروع الإنتاج.

### 9.1 فحص المخطط بعد التطبيق

- تأكيد وجود `external_wallet` في `payment_provider`.
- تأكيد وجود `orders.payment_method` + check + index.
- تأكيد وجود الدوال الجديدة و`guard_vodafone_receipt_method`.
- فحص `proacl` للدوال: لا يوجد `=X` (`PUBLIC`) على دوال الدفع؛
  `confirm_order_payment` ممنوحة لـ `service_role` فقط.

### 9.2 COD

1. إنشاء طلب جديد → تأكيد وجود دفعة `cod` بحالة `pending` و`orders.payment_method='cod'`.
2. استدعاء `pay_with_cod` مرة ثانية (retry) → يجب أن تعيد نفس الدفعة دون إنشاء دفعة ثانية.
3. محاولة إنشاء COD على طلب عليه دفعة succeeded → يجب الفشل.
4. الأدمن ينفذ `mark_cod_collected` → الدفعة `succeeded` والطلب `paid`.
5. إعادة `mark_cod_collected` → idempotent، لا settlement ثانٍ.
6. محاولة تحصيل COD على طلب مدفوع بدفعة أخرى → يجب الفشل.

### 9.3 المحفظة الخارجية

1. إنشاء طلب بالمحفظة → `initiate_external_wallet_payment` → دفعة `pending`.
2. رفع إيصال في مسار `<user>/<order>/...` ثم `submit_external_wallet_receipt` → receipt
   `pending` والدفع `pending`.
3. محاولة رفع إيصال بمسار مستخدم/طلب آخر → يجب الفشل.
4. الأدمن يرفض → receipt `rejected` والدفع `failed` والطلب يبقى `pending`.
5. إعادة إرسال إيصال جديد → `superseded` للإيصال القديم + receipt `pending` جديد.
6. الأدمن يوافق → receipt `approved` والدفع `succeeded` والطلب `paid`.
7. محاولة الموافقة مرة ثانية → idempotent، لا تغيير.
8. محاولة موافقة على دفعة محفظة لطلب مدفوع مسبقًا → يجب الفشل.
9. إعادة استخدام نفس `transfer_reference` على طلب آخر → يجب الفشل (409).

### 9.4 Vodafone القديم

1. محاولة إرفاق إيصال Vodafone على طلب COD/محفظة → يجب الرفض من الـ trigger.
2. محاولة إرفاق إيصال Vodafone بمسار لا يخص نفس الطلب أو بنفس المستخدم فقط → يجب الرفض.
3. رفع إيصال Vodafone على طلب قديم `payment_method IS NULL` → يجب النجاح.
4. موافقة الأدمن على Vodafone → الدفع `succeeded` والطلب `paid`.

### 9.5 صلاحيات سلبية

- `anon` يستدعي كل دوال الدفع → يجب أن يُرفض أو يفشل بسبب عدم وجود `auth.uid()`.
- مستخدم عادي يستدعي `mark_cod_collected` / `verify_external_wallet_payment` →
  يجب أن يُرفض (`Admin only`).
- `anon`/`authenticated` يستدعي `confirm_order_payment` → يجب أن يُرفض لعدم وجود EXECUTE
  بعد إصلاح ACL.

### 9.6 تحقق الـ trigger الحي

- تنفيذ COD ثم التأكد من أن الطلب انتقل إلى `paid` عبر `sync_order_payment_status()`.
- التأكد من عدم ظهور سجل `paid -> paid` بعد الإصلاح.
- التأكد من أن `sync_order_payment_status()` لا تعكس حالة طلب `cancelled`/`processing`.

---

## 10. المخاطر المتبقية

1. **السلوك الفعلي لـ SQL غير مُختبَر**: لم ننفّذ الملف على أي قاعدة. الاختبارات الحالية
   ثابتة/وحدات وتمثّل طبقة RPC، وليست اختبارًا لقاعدة بيانات.
2. **الطلبات ذات الإجمالي صفر**: قيد `payments.amount > 0` يعني أن إنشاء دفعة COD/محفظة
   بإجمالي 0 سيفشل، ويبقى الطلب `pending` بلا دفعة. هذا سلوك قائم مسبقًا، ويجب اختباره أو
   معالجته بمنتج/كوبون.
3. **`verify_vodafone_cash_payment` القديمة** لا تحتوي بعد على حماية settlement مزدوج.
   لا توجد بيانات Vodafone حية الآن، لكنها مخاطرة نظرية إن عادت الطلبات القديمة للعمل.
4. **تغيير ACL على `confirm_order_payment`**: أي عميل قديم يعتمد عليه بـ JWT مستخدم
   سيتوقف؛ لا يوجد أي استدعاء له في الكود الحالي، لكن يجب التأكد من الـ webhooks
   الخارجية قبل الإنتاج.
5. **فشل إنشاء الدفعة بعد إنشاء الطلب**: `/api/orders` ينشئ الطلب أولاً ثم يبدأ الدفع.
   لو فشل RPC الدفع (مثلاً إجمالي 0)، يبقى الطلب بلا `payment_method`. API يعيد رقم الطلب
   للمعالجة اليدوية، لكن لا توجد إعادة محاولة تلقائية.
6. **ACL الواسع على الجداول**: `anon`/`authenticated` يملكان صلاحيات جدول واسعة رغم أن
   RLS يمنع الكتابة على جداول الدفع. الإصلاح الكامل يتطلب تدقيقًا منفصلاً لمسارات الأدمن
   التي تكتب في `orders` مباشرة.
7. **قيود بيئة العمل**: `supabase db dump` متوقف لعدم توفر Docker؛ بعض أوامر CLI الحية
   تفشل أحيانًا بخطأ صلاحيات مؤقت (`cli_login_postgres`). الفحص الحي تم جزئيًا عبر MCP
   قراءة فقط.
8. **بيانات Resend وWallet**: تحتاج إعدادًا يدويًا، ولا يمكن اختبار رسائل البريد أو
   المحفظة فعليًا قبل ذلك.
9. **Rate limiting**: حاليًا in-memory لكل instance، ويحتاج Redis/Upstash للإنتاج
   متعدد النسخ.

---

## 11. الخطوات المطلوبة قبل طلب الموافقة على الإنتاج

1. تطبيق `20261028` على مشروع staging منفصل.
2. تنفيذ سيناريوهات 9.1–9.6 وتسجيل النتائج الفعلية.
3. فحص `proacl`/`pg_policies`/`pg_trigger` على staging والتأكد من عدم وجود `PUBLIC`.
4. تجربة طلب COD حقيقي وطلب محفظة حقيقية (قيمة صغيرة) + دورة رفض/إعادة إرسال/موافقة.
5. تجربة طلب Vodafone قديم أو محاكاة بياناته.
6. التأكد من إعداد Resend، وWallet، والنسخ الاحتياطي/schema snapshot.
7. بعد نجاح staging: طلب موافقة صريحة لتطبيق الملف على الإنتاج.
8. تطبيق الملف على الإنتاج ثم نشر الكود، ثم smoke test إنتاجي.

---

## 12. الحكم النهائي

- **جاهز للاختبار التجريبي (Staging): نعم**، بعد الإصلاحات والاختبار الثابت الجديد.
- **جاهز للإنتاج: لا** حتى يُطبَّق على staging وينجح اختبار السيناريوهات أعلاه، ثم تتم
  الموافقة الصريحة.
- **لم يتم تطبيق الـ migration، ولم يتم تغيير قاعدة الإنتاج، ولم تُنفَّذ أي SQL
  mutations خلال هذه المراجعة.**
