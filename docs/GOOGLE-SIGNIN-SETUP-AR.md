# دليل تفعيل دخول Google (Google Sign-In)

> **تاريخ الإعداد:** 10 نوفمبر 2026
> **الحالة الحية:** مزوّد Google **معطّل** في Supabase → الزر يعرض رسالة صريحة
> `Google sign-in has not been set up on this store yet.` (هذا تصميم أمين في `app/login/page.jsx`)
>
> الموقع يعمل حالياً بالبريد وكلمة السر — لا يتعطّل شيء أثناء هذه الخطوات.

## نظرة سريعة — 3 أجزاء

| # | أين | الوقت |
|---|---|---|
| 1 | Google Cloud Console → إنشاء OAuth Client ID | ~5 دقائق |
| 2 | Supabase Dashboard → تفعيل المزوّد + الروابط | ~3 دقائق |
| 3 | التحقق من العمل (الفريق) | ~1 دقيقة |

---

## الجزء 1 — Google Cloud Console

1. افتح: **https://console.cloud.google.com/apis/credentials**
2. إن لم يكن لديك مشروع: أعلى الشريط → **مشروع جديد** → الاسم `Gallaxy Store` → **إنشاء** (ينتظر دقيقة).
3. **شاشة الموافقة (OAuth consent screen)** — أول مرة فقط:
   - User Type: **External** → **إنشاء**
   - App name: `Gallaxy Store` · User support email + Developer contact: بريدك → **حفظ والمتابعة**
   - Scopes: اتركها الافتراضية (`email`, `profile`, `openid`) → **حفظ**
   - تبويب **Test users** → **Add users** → أضف **بريدك الإلكتروني**
     ⚠️ **مهم:** ما دام التطبيق في وضع `Testing`، الدخول متاح **للمستخدمين المُضافين فقط**.
4. **Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `Gallaxy Store Web`
   - **Authorized redirect URIs → Add URI** — الصق حرفياً (بدون مسافات/شرطة في النهاية):

     ```
     https://httywgkwfqvrbuwuzutu.supabase.co/auth/v1/callback
     ```

   - (لا تضف *JavaScript origins* — غير مطلوبة في هذا التدفق.)
   - **Create** → انسخ فوراً:
     - **Client ID**
     - **Client Secret**
5. (اختياري) لإتاحة الدخول للجميع بلا إضافتهم كاختبار:
   - لوحة الموافقة → **Publish app** → تأكيد.
   - قد تظهر شاشة `unverified app` لغير المُضيفين — يتجاوزونها: **Advanced → Go to (name)**.
     (نطاقات `email/profile` الأساسية لا تتطلب تحقق Google.)

---

## الجزء 2 — Supabase Dashboard

1. **https://supabase.com/dashboard** → اختر مشروع **Gallaxy_Store**
   (المشروع: `httywgkwfqvrbuwuzutu`)
2. **Authentication → URL Configuration**:
   - **Site URL:**

     ```
     https://gallaxy-store.vercel.app
     ```

   - **Redirect URLs** → **Add URL**:

     ```
     https://gallaxy-store.vercel.app/**
     ```

   → **Save**
   (الزر يستخدم تحديداً `https://gallaxy-store.vercel.app/auth/callback?next=/`)
3. **Authentication → Sign In → Providers**
   (أو القديم: Configuration → Auth → Providers):
   - اختر **Google** → **Enable** → الصق **Client ID** و **Client Secret** من الجزء 1 → **Save**
4. انتظر **~30 ثانية** للانتشار.

---

## الجزء 3 — التحقق

**الحالة الحية (تحقّق 19 نوفمبر 2026):**
- بيانات `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` محفوظة محلياً في `.env.local`
  (لا تُطبع في السجلات أو الردود — لا حاجة لإضافتها يدوياً مرة أخرى).
- ✅ **تم تفعيل مزوّد Google في مشروع Supabase المستضاف** عبر الـ CLI وملف
  `supabase/config.toml` المحدود (5 خصائص: client_id, secret, enabled,
  skip_nonce_check, additional_redirect_urls). الاستعلام المباشر الآن يعيد
  `302 Location: https://accounts.google.com/o/oauth2/v2/auth?...`.
- ✅ `GET /api/auth/google-status` يفحص الآن أيضاً رابط Google نفسه: يستخرج
  `authError` المُرمَّز base64url من استجابة `accounts.google.com` ويكتشف
  `redirect_uri_mismatch` قبل أن يضغط المستخدم الزر.
- ⚠️ **خطوة خارجية واحدة متبقية على Google Cloud Console**: قائمة
  **Authorized redirect URIs** لهذا الـ OAuth Client لا تحتوي بعد على رابط
  Supabase. الفحص الحي يعيد الآن:

  ```json
  {"enabled": true, "configured": false, "redirectUri": "https://httywgkwfqvrbuwuzutu.supabase.co/auth/v1/callback"}
  ```

  وصفحة الدخول تعرض الرابط المطلوب للمستخدم داخل رسالة واضحة بدل تركه على
  صفحة خطأ Google الخام. الرابط المطلوب إضافته **حرفياً**:

  ```
  https://httywgkwfqvrbuwuzutu.supabase.co/auth/v1/callback
  ```

  من: Google Cloud Console → APIs & Services → Credentials → افتح OAuth Client
  الذي يملك الـ Client ID → Authorized redirect URIs → Add URI → Save.
  (قد يستغرق نشر التغيير دقيقة أو دقيقتين.)

**الفريق يفحص بعد إضافة الرابط في Google:**
- `GET /api/auth/google-status` → `{"enabled": true}` بدون `configured:false`
- الضغط على **Sign in with Google** → صفحة موافقة Google (لا صفحة `oauth/error`)
- بعد الموافقة → العودة إلى `/auth/callback` ثم إنشاء جلسة Supabase وتوجيه إلى `/`

**أنت تجرّب:** افتح https://gallaxy-store.vercel.app/login → **Sign in with Google**
(أضف نفسك كـ test user إن كنت في وضع Testing).

---

## استكشاف الأخطاء

| الرسالة | السبب والحل |
|---|---|
| `access_blocked` أو `app not verified` | أنت في وضع Testing وغير مُضاف كـ test user → أضف بريدك في Test users، أو اختفِ خلف **Advanced → Go to…**، أو انشر التطبيق |
| `redirect_mismatch` / `invalid redirect_uri` | رابط Google غير مطابق حرفياً — أعد لصقه من الجزء 1 (https، بدون مسافات). عند الضغط على الزر تظهر رسالة داخل صفحة الدخول تعرض الرابط المطلوب إضافته في Google Cloud Console |
| الزر لا يفعل شيئاً | انتظر 30 ثانية ثم `Ctrl+F5` (الكشف يُخزَّن مؤقتاً في المسار) |
| دخول ناجح لكن يعود لصفحة الدخول | تأكد أن Site URL + Redirect URLs في Supabase مضبوطة كما في الجزء 2 |

## ملفات الكود المرتبطة

- `app/login/page.jsx` — الزر، فحص `skipBrowserRedirect` + `/api/auth/google-status`
- `app/api/auth/google-status/route.ts` — كاشف الحالة (rate-limited، يرسل `apikey`، يفحص جسم الخطأ، ويفشل نحو `enabled:true` فقط عند أعطال الشبكة/التقييد لا عند تعطيل المزوّد)
- `app/login/page.jsx` — يرسل الآن `access_type=offline` + `prompt=consent` (القيم الصحيحة عند Google؛ `access_type=consent` كان غير صالح)
- `app/auth/callback/route.ts` — استقبال `?next=/` مع منع open redirect (يُعيد رابطاً مطلقاً في Next 16)
- `supabase/config.toml` — إعداد Google المُطبَّق على المشروع المستضاف (بيانات الاعتماد من المتغيرات، لا تُخزَّن في الملف)
- `__tests__/google-auth-contract.test.ts` + `__tests__/auth-callback-contract.test.ts` — 12 اختباراً
- `__tests__/google-auth-contract.test.ts` — 7 اختبارات: كشف التعطيل، الصيغة النصية، النجاح، الأخطاء غير ذات الصلة، أعطال الشبكة، التقييد، وعدم تسريب البيانات
- `.env.local` — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (محلياً فقط؛ Supabase المستضاف يقرأ الإعدادات من لوحة التحكم أو Management API)
- `.env.example` — `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (لـ Supabase المحلي فقط)
