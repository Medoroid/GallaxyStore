# نظام الدفع — الدفع عند الاستلام وتحويل Vodafone Cash اليدوي

> آخر تحديث: 2026-10-29.
> هذا المستند يوثّق آلية الدفع **المعتمدة والمنفّذة فعليًا** في الكود، بعد جولة المراجعة
> والتعديل الأخيرة. لا يصف أحلامًا مستقبلية: كل بند هنا موجود في ملفات المشروع أو مُعلّم
> بوضوح بأنه يعتمد على Migration غير مُطبَّق.

## 1. طرق الدفع المعتمدة

المتجر يقبل طريقتين فقط للطلبات الجديدة:

| الطريقة | القيمة في قاعدة البيانات | ملاحظات |
|---|---|---|
| الدفع عند الاستلام | `cod` | لا يُعتبر مدفوعًا إلا بعد تسجيل تحصيل الأدمن |
| التحويل اليدوي (Vodafone Cash) | `external_wallet` | رقم الحساب يضبطه الأدمن من الإعدادات؛ رفع الإيصال ≠ دفع ناجح |

**ممنوع تمامًا:** Stripe وPaymob والمحفظة الداخلية (`wallet`). المسارات المغلقة على مستوى
الـ API وليس مجرد إخفاء في الواجهة:

- `POST /api/checkout` و`GET /api/checkout/verify` ترجع `410 Gone` (بطاقات معطّلة).
- `POST /api/paymob/webhook` و`GET` ترجع `410`.
- `POST /api/stripe/webhook` يُ acknowledged بـ `settled:false` حتى تتوقف إعادة المحاولة؛ سجلات Stripe القديمة تبقى مقروءة.
- `POST /api/wallet` (الدفع من رصيد المحفظة الداخلية) ترجع `410 Gone` — **أُغلقت في هذه الجولة**؛ قراءة الرصيد عبر `GET` باقية للتاريخية.
- `POST /api/orders` و`POST /api/orders/[id]/payment` يقبلان فقط `cod` و`external_wallet`
  عبر `normalizeCheckoutPaymentMethod()` في `lib/payment-settings.ts`؛ أي طريقة أخرى تُرفض بـ 400.
- على مستوى قاعدة البيانات، Migration `20261028` (غير مُطبَّق بعد) يضيف
  `orders_payment_method_check IN ('cod','external_wallet',…legacy)` ويشدّد صلاحيات RPC.
- رفع إيصال Vodafone Cash على طلب `cod`/`external_wallet` ممنوع عبر trigger
  `guard_vodafone_receipt_method` (في نفس الـ migration).

## 2. آلية الدفع عند الاستلام (COD)

1. العميل يختار `cod` في صفحة الدفع ويؤكد الطلب → `POST /api/orders` يستدعي `checkout()`
   RPC ثم `pay_with_cod(p_order_id)` — يُنشئ سطر دفعة بحالة **`pending`** ويحفظ
   `orders.payment_method='cod'` (بعد تطبيق 20261028؛ في انتظاره يستخدم RPC الأقدم القديم).
2. حالة الطلب `pending` (أو ما يحدده سير التحويل)، وحالة الدفع `pending` — **المبلغ غير مُحصّل**.
3. عند استلام النقد فعليًا يضغط الأدمن "Mark cash collected" في الطلبات
   → `PATCH /api/admin/orders` بإجراء `mark_cod_collected` → RPC `mark_cod_collected(p_payment_id)`:
   الدفعة `succeeded` + `captured_at`، والطلب `pending → paid`، مع سجل في `admin_audit_log`
   (`order.cod_collected` + `collected_by = auth.uid()` داخل الـ RPC).
4. التحصيل المكرر مستحيل: الـ RPC idempotent ويرفض دفعة ليست `pending`؛ الواجهة لا تعرض الزر
   إلا لدفعة `pending` وغير الملغاة.
5. الطلبات مجانية القيمة (كوبون يغطي الكل) تكتمل `paid` مباشرة بدون سطر دفعة عبر
   `complete_zero_total_order()` (يُرجع 503 باستقباله إذا لم يكن الـ RPC مُطبَّقًا — لا fallback غير آمن).

## 3. آلية التحويل اليدوي عبر Vodafone Cash

### 3.1 إعداد رقم التحويل

- الأدمن يضبط الحساب في **Admin → Settings → Wallet transfers**: اسم المزود (مثل Vodafone
  Cash)، اسم صاحب الحساب، الرقم/الـ handle، وتعليمات اختيارية.
- يُخزَّن مرة واحدة في `store_settings` تحت المفتاح `external_wallet` (خاص، غير عام).
- التفعيل يشترط اكتمال الحقول (`normalizeExternalWalletSettings(strict)` يرفض الحفظ الناقص).
- العملاء المسجّلين فقط يحصلون على الرقم عبر `GET /api/payment-methods` (حقول عرض فقط).
- **لا يوجد رقم ثابت أو وهمي في الكود.** قبل الضبط: الخيار معطّل في صفحة الدفع مع سبب واضح،
  و`POST /api/orders` يرفض `external_wallet` بـ 409 قبل إنشاء الطلب، وفحص القدرة
  (`lib/payment-capabilities.ts`) يمنع рекламة الطريقة إذا لم تكن RPC جاهزة.

### 3.2 تأكيد الطلب

- بعد إنشاء الطلب تظهر صفحة التحويل: رقم الطلب، إجمالي المبلغ، رقم الحساب المستقبِل واسمه،
  وتعليمات. **من هذه الجولة:** تفاصيل الحساب المستقبِل تظهر أيضًا **قبل** إتمام الطلب في
  خطوة الدفع (`data-testid="checkout-wallet-preview"`) — الرقم دائمًا من إعدادات الأدمن لا من الكود.
- النص يوضّح أن رفع الإيصال لا يكمل الدفع: الطلب يبقى **Awaiting payment verification**.

### 3.3 رفع الإيصال

`POST /api/payments/external-wallet` (والمسار القديم `/api/payments/vodafone-cash` للطلبات
التاريخية) عبر `app/api/payments/_lib/submit-receipt.js`:

- مصادقة إلزامية؛ ملكية المسار الإجبارية: `receipt_path` يجب أن يبدأ بـ `<auth.uid>/<order_id>/`
  (يمنع إرفاق إيصال بطلب شخص آخر أو تسلل المسارات).
- تنزيل الملف عبر JWT المستخدم نفسه (RLS التخزين أول بوابة)، تحقق من الحد الأقصى 5MB ومن
  الـ magic bytes (JPEG/PNG/GIF/WEBP/HEIC/AVIF)، وحذف الرفض من التخزين.
- الـ RPC `submit_external_wallet_receipt` يتحقق ملكية الطلب وحالته وطريقته، ويرفض مرجع تحويل
  مستخدم في طلب آخر (فهرس فريد `payment_receipts_reference_uidx`)، ويرقّم الإيصال السابق إلى
  `superseded` بدل حذفه (سجل المحاولات محفوظ).
- حالة الدفع بعد الرفع: `pending` (= بانتظار المراجعة). **لا يتحول إلى `succeeded` أبدًا بمجرد الصورة.**
- rate limit 5/دقيقة/IP بوضع fail-closed.

### 3.4 المراجعة في لوحة الأدمن

`app/admin/orders/page.tsx` — فلاتر الدفع: All / Awaiting verification / Paid / Rejected / COD /
Wallet transfer + فلتر حالة الطلب. لكل طلب تحويل لوحة تضم:

- رقم الطلب واسم العميل والإجمالي و**رقم الحساب المستقبِل** (من إعدادات الأدمن، لإعادة
  المطابقة — أضيف في هذه الجولة) ومرجع التحويل وهاتف المُحويل وتاريخ رفع الإيصال.
- صورة الإيصال بروابط موقّعة مؤقتة (ساعة) عبر `ReceiptViewer`.
- أزرار **Confirm payment** (بنافذة تأكيد تعرض الإجمالي) و**Reject** مع سبب إلزامي للرفض
  يظهر للعميل.
- **سجل المحاولات السابقة** لكل محاولة تحويل سابقة مع حالتها ومرجعها وملاحظة القرار
  (أُضيف في هذه الجولة؛ البيانات كانت تأتي من الـ API دون عرض).
- الطلبات بدون إيصال بعد تعرض "لا يوجد إيصال بعد"؛ `canVerify` لا يسمح بالموافقة بلا إيصال مرئي.
- الطلبات COD تعرض لوحة "Mark cash collected" منفصلة تمامًا عن مراجعة الإيصالات.

### 3.5 القبول والرفض

- `PATCH /api/admin/orders` مع `action: "verify_payment"` و`approve: true|false` صريح
  (طلب متشوّه لا يوافق بصمت) — يختار الخادم الـ RPC حسب مزوّد الدفعة، لا المتصفح.
- الموافقة: `verify_external_wallet_payment(p_order_id, true, note)` → دفعة `succeeded`،
  طلب `pending → paid`، `verified_by = auth.uid()` و`verified_at = now()`، ورفض تسوية ثانية
  (الـ RPC يرفض طلبًا غير `pending`/المُلغى، و`20261030_confirm_order_payment_partial_index`
  يمنع دفعة ناجحة ثانية على نفس الطلب).
- الرفض: دفعة `failed` مع `raw_response.rejected=true` وسبب الرفض؛ حالة الطلب لا تتغير،
  والإيصال المرفوض يبقى محفوظًا، والعميل يستطيع إعادة الإرسال (`canSubmitReceipt` يسمح
  بحالتين `rejected` و`timed_out` لطلب `pending` فقط).
- كل قرار يُسجَّل في `admin_audit_log` (`order.payment_verified` / `order.payment_rejected`)
  بهوية الأدمن ووقت القرار.

## 4. حالات الدفع المعروضة (لا تُخترع حالات جديدة)

| المعنى | في payments | في payment_receipts | في الواجهة |
|---|---|---|---|
| لم يُسدد | `pending` | — | COD: "Due on delivery" / تحويل: "Receipt required" |
| بانتظار المراجعة | `pending`/`processing` بعد رفع الإيصال | `pending` | "Awaiting verification" |
| تم التحقق من استلام المبلغ | `succeeded` | `approved` | "Paid" / "Payment confirmed" |
| مرفوض من الأدمن | `failed` + `raw_response.rejected` | `rejected` | "Rejected" + السبب |
| انتهت المهلة (كوب موافقة) | `failed` بدون رفض أدمن | — | يُعامل كـ "بانتظار مراجعة" لا كرفض |
| مُرقّم بإيصال أحدث | — | `superseded` | سجل تاريخي فقط |
| مُردود (استرجاع) | `refunded`/`partially_refunded` | — | عبر مسار المرتجعات |

حالة الطلب (`order_status`) منفصلة تمامًا عن حالة الدفع: `pending, paid, processing, printing,
shipped, delivered, cancelled, refunded, partially_refunded`.

## 5. ما نُفّذ فعليًا في جولة 2026-10-29

كل ما ورد أعلاه كان قائمًا باستثناء البنود التالية التي نُفّذت الآن:

1. **إغلاق `POST /api/wallet`** (`app/api/wallet/route.js`) بـ `410 Gone` — الدفع من رصيد
   المحفظة الداخلية كان مسارًا مفتوحًا للاستدعاء المباشر رغم كونه غير معتمد. `GET` (قراءة
   الرصيد للتاريخية) بقي كما هو.
2. **عرض رقم التحويل قبل إتمام الطلب** (`app/checkout/page.tsx`): لوحة `ExternalWalletInstructions`
   داخل خطوة الدفع عند اختيار التحويل اليدوي — الرقم دائمًا من `store_settings`.
3. **رقم الحساب المستقبِل في لوحة مراجعة الأدمن** (`app/admin/orders/page.tsx`): يجلب الحساب
   المُهيّأ من `/api/admin/settings` ويعرضه بجانب المبلغ لإعادة المطابقة.
4. **سجل المحاولات السابقة** في لوحة مراجعة الأدمن: كل محاولات التحويل السابقة لطلب ما
   (حالة، مرجع، مُحويل، ملاحظة القرار) من مصفوفة `payments` التي يرجعها الـ API.
5. **حالة الدفع في قائمة طلبات العميل** (`app/orders/page.tsx` + `GET /api/orders`): ملخص
   دفع لكل طلب (`payment_summary` — مملوك عبر RLS) وشارة تفرّق: بانتظار المراجعة / مرفوض /
   تم التأكيد / يُدفع عند التسليم / نقدي محصّل.
6. **نصوص إعدادات الأدمن**: القسم يوضّح أن الأدمن يضبط رقم Vodafone Cash المستقبِل، وأن رفع
   الإيصال لا يعتمد الدفاع أبدًا.

## 6. المigrations — الحالة

الملفات الجاهزة في `supabase/migrations/` **لم تُطبَّق على الإنتاج** (ومن الممنوع تطبيقها
ضمن هذه المهمة):

- `20261028_payment_methods_external_wallet.sql` — القيمة `external_wallet`،
  `orders.payment_method`، RPC التحويل اليدوي المُقوّى، منع إيصالات Vodafone على طلبات
  COD/تحويل، وتنظيف صلاحيات `PUBLIC` على RPC الدفع.
- `20261029_order_payment_completion.sql` — إتمام الطلبات المجانية + تقوية
  `set_order_shipping_method`.
- `20261030_order_status_cod_transitions.sql` — انتقالات حالات طلبات COD للتنفيذ
  (`pending→processing`, `paid→shipped`, `processing→shipped`).
- `20261030_confirm_order_payment_partial_index.sql` — منع التسوية المزدوجة.
- `20261030_checkout_coupon_shipping_hardening.sql` و`20261030_product_images_bucket.sql`.

**الوضع المحلي:** Docker متاح في بيئة العمل هذه وتم رفع محرك Supabase المحلي؛ تُطبَّق
الـ migrations على قاعدة محلية فقط (`supabase db reset` / `supabase migration up`)، وليس
على المشروع المرتبط بالإنتاج (`httywgkwfqvrbuwuzutu`) — راجع `docs/TODO.md` لتحديث حالة
التطبيق المحلي.

الفشل الآمن مُفعّل: إذا غابت RPC (قبل تطبيق 20261028/29) ترجع واجهات الدفع 409/503 مع رقم
الطلب للاسترجاع، ولا تُستبدل قواعد الأعمال بخدمة الدور (service role).

## 7. ضوابط الأمان المطبّقة

- لا يُوثق بأي مبلغ أو حالة أو مالك أو مزوّد يرسله المتصفح؛ الإجماليات تُحسب في الخادم
  (`checkout` RPC + `cart_totals` + `get_shipping_options`).
- ملكية الطلب تُتحقق عند الرفع (RLS + بادئة المسار) وعند الاستعراض (روابط موقّعة خاصة).
- الموافقة وتسجيل التحصيل عبر `verifyAdmin()` + `is_admin()` في قاعدة البيانات؛ الخدمة
  الدورية (service role) لا تستطيع تغيير حالة الطلب بنفسها.
- لا تسوية مزدوجة: فهرس فريد للمرجع + قيود حالة الدفعة في الـ RPC + مانع الدفعة الناجحة
  الثانية.
- rate limit fail-closed على كل مسار يمسّ المال.
- مفاتيح الخدمة لا تصل المتصفح إطلاقًا (تُستخدم في مسارات الخادم فقط).
- سجل تدقيق (`admin_audit_log`) لكل قرار دفع: موافقة، رفض، تحصيل نقدي.

## 8. ما تبقّى (معتمد على Migration/تشغيل)

- تطبيق الـ migrations الست على بيئة Staging معزولة ثم الإنتاج — يتطلب موافقة صريحة.
- ضبط رقم Vodafone Cash فعليًا من لوحة الأدمن بعد تطبيق 20261028 (الإعداد قبل التطبيق
  يُظهر الخيار معطّلًا برسالة واضحة).
- سيناريوهات Staging الاثنا عشر في `docs/FINAL-REPORT.md` §K.
