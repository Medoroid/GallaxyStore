"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Package, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

type VerifiedOrder = {
  order_number: string;
  status: string;
  total: number;
  currency: string;
};

type VerifyState =
  | { phase: "loading" }
  | { phase: "paid"; order: VerifiedOrder | null }
  | { phase: "pending"; order: VerifiedOrder | null; message: string }
  | { phase: "disabled"; message: string }
  | { phase: "error"; message: string };

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [state, setState] = useState<VerifyState>({ phase: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({
        phase: "pending",
        order: null,
        message:
          "No payment session was provided. If you completed a card payment, check your orders page for the verified status.",
      });
      return;
    }

    let cancelled = false;
    fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.disabled) {
          setState({
            phase: "disabled",
            message:
              data?.message ||
              "Card payments are turned off on this store. Please use cash on delivery or a mobile wallet transfer.",
          });
          return;
        }
        if (!res.ok || !data?.success) {
          setState({
            phase: "error",
            message: data?.message || "We could not verify this payment.",
          });
          return;
        }
        if (data.paid) {
          setState({ phase: "paid", order: data.order ?? null });
        } else {
          setState({
            phase: "pending",
            order: data.order ?? null,
            message:
              "The payment provider has not confirmed this payment yet. This page will not mark an order as paid until the provider does.",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ phase: "error", message: "Network error while verifying the payment." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong rounded-3xl p-8 text-center max-w-md w-full">
        {state.phase === "loading" ? (
          <>
            <Loader2 className="h-16 w-16 mx-auto text-secondary animate-spin mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Verifying Payment...</h1>
            <p className="text-muted-foreground">
              Checking the payment provider. This page never marks an order paid on its own.
            </p>
          </>
        ) : state.phase === "paid" ? (
          <>
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-400 mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Payment Confirmed</h1>
            <p className="text-muted-foreground mb-6">
              Your payment was verified by the provider. We are preparing your order.
            </p>
            {state.order && (
              <div className="glass rounded-2xl p-4 text-sm space-y-1 mb-6">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-mono">{state.order.order_number}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold">
                    {formatCurrency(state.order.total, state.order.currency)}
                  </span>
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Link
                href="/orders"
                className="px-5 py-3 rounded-xl bg-gradient-neon text-white font-semibold inline-flex items-center gap-2"
              >
                <Package className="h-4 w-4" /> My Orders
              </Link>
              <Link
                href="/products"
                className="px-5 py-3 rounded-xl glass font-semibold inline-flex items-center gap-2"
              >
                Shop <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : state.phase === "pending" ? (
          <>
            <Clock className="h-16 w-16 mx-auto text-yellow-400 mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Awaiting Confirmation</h1>
            <p className="text-muted-foreground mb-6">{state.message}</p>
            <Link
              href="/orders"
              className="px-5 py-3 rounded-xl bg-gradient-neon text-white font-semibold inline-flex items-center gap-2"
            >
              <Package className="h-4 w-4" /> Check My Orders
            </Link>
          </>
        ) : state.phase === "disabled" ? (
          <>
            <AlertTriangle className="h-16 w-16 mx-auto text-amber-400 mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Card Payments Unavailable</h1>
            <p className="text-muted-foreground mb-6">{state.message}</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link
                href="/orders"
                className="px-5 py-3 rounded-xl bg-gradient-neon text-white font-semibold inline-flex items-center gap-2"
              >
                <Package className="h-4 w-4" /> My Orders
              </Link>
              <Link
                href="/checkout"
                className="px-5 py-3 rounded-xl glass font-semibold inline-flex items-center gap-2"
              >
                Back to Checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="h-16 w-16 mx-auto text-red-400 mb-4" />
            <h1 className="text-2xl font-extrabold mb-2">Verification Failed</h1>
            <p className="text-muted-foreground mb-6">{state.message}</p>
            <Link
              href="/orders"
              className="px-5 py-3 rounded-xl bg-gradient-neon text-white font-semibold inline-flex items-center gap-2"
            >
              <Package className="h-4 w-4" /> My Orders
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
