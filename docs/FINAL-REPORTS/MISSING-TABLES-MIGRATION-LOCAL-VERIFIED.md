# Missing Tables Migration — تم إنشاؤها والتحقق منها محلياً

## الملف
`supabase/migrations/20261120100000_create_missing_production_tables.sql`

- 56,538 بايت
- 16 `CREATE TABLE IF NOT EXISTS`
- 28 `CREATE INDEX IF NOT EXISTS`
- 53 قيد محمي بـ `DO $guard$`
- 19 سياسة RLS محمية بـ `DO $guard$`
- 14 trigger محمي بـ `DROP TRIGGER IF EXISTS`
- 2 دالة gift-box منسوخة حرفياً من `20261117140000_gift_box_bundles.sql`
- GRANTs منسوخة حرفياً من الـ migrations المعتمدة
- صفر `DROP TABLE` / `DROP SCHEMA` / `TRUNCATE` / `DELETE FROM`
- صفر `BEGIN/COMMIT/ROLLBACK`

## التحقق على Staging المحلي
تم إنشاء قاعدة `galaxy_missing_test` نظيفة، وتطبيق baseline الإنتاج (75 جدولاً)، ثم تطبيق الـ migration:

| الفحص | النتيجة |
|---|---|
| تطبيق أول | PASS (exit 0) |
| تطبيق ثانٍ (idempotency) | PASS (exit 0) |
| عدد الجداول بعد التطبيق | 91 |
| الجداول الـ16 الناقصة | 0 مفقودة |
| الدوال المطلوبة | `owns_design`, `is_admin`, `set_updated_at`, `enforce_gift_box_item_rules`, `enforce_gift_box_registration` موجودة |
| السياسات | 19 |
| الـ triggers | 43 (منها 14 للجداول الجديدة) |

## حالة Production
**لم يُطبَّق أي شيء على Production.**

سبب تقني: أدوات `supabase.execute_sql` / `supabase.apply_migration` اختفت من جلسة OpenCode بعد محاولة معالجة فشل DNS، وأصبحت غير قابلة للاستدعاء. لم يتم تعديل بيانات أو مخطط الإنتاج.

> لا يُعد هذا التقرير إثباتاً على جاهزية Production؛ الملف جاهز للتنفيذ اليدوي بعد استعادة أدوات Supabase أو عبر SQL Editor.
