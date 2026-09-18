import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="glass-strong rounded-3xl p-8 max-w-md">
        <h1 className="text-6xl font-extrabold text-gradient-neon mb-4">404</h1>
        <h2 className="text-2xl font-extrabold mb-2">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground mb-6">
          يبدو أن هذه الصفحة قد اختفت في الفضاء. لا تقلق، يمكنك العودة.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
