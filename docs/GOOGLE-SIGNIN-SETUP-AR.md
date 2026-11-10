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

**الفريق يفحص:**
- `GET /api/auth/google-status` → يجب أن يعود `{"enabled": true}`
  (الآن يعيد `{"enabled": false}` — والصفحة تعرض الرسالة بناءً عليه)
- إعادة التوجيه من `/auth/v1/authorize?provider=google` بدل `400 provider is not enabled`

**أنت تجرّب:** افتح https://gallaxy-store.vercel.app/login → **Sign in with Google**
(أضف نفسك كـ test user إن كنت في وضع Testing).

---

## استكشاف الأخطاء

| الرسالة | السبب والحل |
|---|---|
| `access_blocked` أو `app not verified` | أنت في وضع Testing وغير مُضاف كـ test user → أضف بريدك في Test users، أو اختفِ خلف **Advanced → Go to…**، أو انشر التطبيق |
| `redirect_mismatch` / `invalid redirect_uri` | رابط Google غير مطابق حرفياً — أعد لصقه من الجزء 1 (https، بدون مسافات) |
| الزر لا يفعل شيئاً | انتظر 30 ثانية ثم `Ctrl+F5` (الكشف يُخزَّن مؤقتاً في المسار) |
| دخول ناجح لكن يعود لصفحة الدخول | تأكد أن Site URL + Redirect URLs في Supabase مضبوطة كما في الجزء 2 |

## ملفات الكود المرتبطة

- `app/login/page.jsx` — الزر، فحص `skipBrowserRedirect` + `/api/auth/google-status`
- `app/api/auth/google-status/route.ts` — كاشف الحالة (rate-limited، يفشل نحو `enabled:true`)
- `app/auth/callback/route.ts` — استقبال `?next=/`
- `.env.example:69` — `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` (للتطوير المحلي فقط)
