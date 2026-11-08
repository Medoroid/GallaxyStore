"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Keep the real message out of the visitor's view (C6): production errors can
  // carry internals (DB errors, missing config). The full error goes to the
  // browser console for debugging; visitors get a generic message plus the
  // digest correlation id for support.
  if (process.env.NODE_ENV !== "production") {
    console.error("Route error:", error);
  } else {
    console.error("Route error:", error.digest, error.name);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="glass-strong rounded-3xl p-8 max-w-md">
        <h1 className="text-3xl font-extrabold mb-2">Something Went Wrong</h1>
        <p className="text-muted-foreground mb-2">
          Something went wrong. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 mb-4 font-mono">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-4">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
