"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type Order = {
  id: string;
  status: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  coupon_code: string | null;
  shipping_address_snapshot: {
    full_name: string;
    city: string;
    country: string;
  } | null;
  customer_note: string;
  created_at: string;
};

const STATUS_MAP: Record<string, { label: string; icon: typeof Package; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-yellow-400" },
  confirmed: { label: "Confirmed", icon: CheckCircle2, color: "text-blue-400" },
  paid: { label: "Paid", icon: CheckCircle2, color: "text-blue-400" },
  processing: { label: "Processing", icon: Package, color: "text-purple-400" },
  printing: { label: "Printing", icon: Package, color: "text-indigo-400" },
  shipped: { label: "Shipped", icon: Truck, color: "text-cyan-400" },
  delivered: { label: "Delivered", icon: CheckCircle2, color: "text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-400" },
  refunded: { label: "Refunded", icon: XCircle, color: "text-gray-400" },
};

export default function OrdersPage() {
  const { user, getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const fetchOrders = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!cancelled) {
          if (data.success) {
            setOrders(data.orders);
          } else {
            setError(data.message || "Failed to load orders");
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error");
          setLoading(false);
        }
      }
    };

    fetchOrders();
    return () => { cancelled = true; };
  }, [user, getToken]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to view your orders.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <XCircle className="h-12 w-12 mx-auto text-red-400 mb-3" />
          <h1 className="text-2xl font-extrabold mb-2">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          My Account
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          <span className="text-gradient-neon">My</span> Orders
        </h1>
        <p className="text-muted-foreground mt-2">
          {orders.length === 0 ? "No orders yet" : `${orders.length} order(s)`}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-extrabold mb-2">No Orders Yet</h2>
          <p className="text-muted-foreground mb-6">Start shopping to see your orders here.</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending;
            const StatusIcon = statusInfo.icon;
            const date = new Date(order.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });

            return (
              <Link
                href={`/orders/${order.id}`}
                key={order.id}
                className="block glass-strong rounded-3xl p-6 hover:pink-glow transition-all"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Order ID</p>
                    <p className="font-mono text-sm font-semibold">{order.id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground mt-1">{date}</p>
                  </div>
                  <div className={`flex items-center gap-2 ${statusInfo.color}`}>
                    <StatusIcon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{statusInfo.label}</span>
                  </div>
                </div>

                {order.shipping_address_snapshot && (
                  <div className="glass rounded-xl p-3 mb-4 text-sm">
                    <p className="text-muted-foreground">
                      {order.shipping_address_snapshot.full_name}, {order.shipping_address_snapshot.city},{" "}
                      {order.shipping_address_snapshot.country}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Items: </span>
                    <span className="font-semibold">{order.subtotal > 0 ? formatCurrency(order.subtotal) : "-"}</span>
                    {order.discount_amount > 0 && (
                      <span className="text-green-400 ml-2">
                        -{formatCurrency(order.discount_amount)} discount
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-extrabold text-gradient-gold">
                      {formatCurrency(order.total)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
