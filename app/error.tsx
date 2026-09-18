"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="glass-strong rounded-3xl p-8 max-w-md">
        <h1 className="text-3xl font-extrabold mb-2">حدث خطأ!</h1>
        <p className="text-muted-foreground mb-4">
          {error.message || "Something went wrong. Please try again."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            حاول مرة أخرى
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
