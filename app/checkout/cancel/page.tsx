"use client";

import Link from "next/link";
import { XCircle, ArrowRight, ShoppingBag } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong rounded-3xl p-8 text-center max-w-md w-full">
        <div className="h-20 w-20 rounded-full bg-red-500/20 grid place-items-center mx-auto mb-4">
          <XCircle className="h-10 w-10 text-red-400" />
        </div>
        <h1 className="text-3xl font-extrabold mb-2">
          Payment <span className="text-red-400">Cancelled</span>
        </h1>
        <p className="text-muted-foreground mb-6">
          Your payment was cancelled. No charges were made. You can try again whenever you&apos;re ready.
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            <ShoppingBag className="h-4 w-4" />
            Back to Cart
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
          >
            Continue Shopping
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
