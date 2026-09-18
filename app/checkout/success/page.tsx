"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Package, ArrowRight, Loader2 } from "lucide-react";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [verifying, setVerifying] = useState(() => !!sessionId);

  useEffect(() => {
    if (!sessionId) return;

    const timer = setTimeout(() => {
      setVerifying(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong rounded-3xl p-8 text-center max-w-md w-full">
        {verifying ? (
          <>
            <Loader2 className="h-16 w-16 mx-auto text-secondary animate-spin mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Verifying Payment...</h1>
            <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
          </>
        ) : (
          <>
            <div className="h-20 w-20 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            </div>
            <h1 className="text-3xl font-extrabold mb-2">
              Payment <span className="text-green-400">Successful!</span>
            </h1>
            <p className="text-muted-foreground mb-6">
              Thank you for your purchase. Your order has been confirmed.
            </p>

            {sessionId && (
              <div className="glass rounded-xl p-4 mb-6 text-sm">
                <p className="text-muted-foreground mb-1">Session ID</p>
                <p className="font-mono text-xs break-all">{sessionId}</p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Link
                href="/orders"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
              >
                <Package className="h-4 w-4" />
                My Orders
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
              >
                Continue Shopping
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
