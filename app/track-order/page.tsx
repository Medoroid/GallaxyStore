"use client";

import { useState } from "react";
import { Search, Package, Clock, CheckCircle2, Truck, XCircle, Printer, CreditCard, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

type OrderItem = {
  product_name_snapshot: string | null;
  sku_snapshot?: string | null;
  quantity: number;
  unit_price_snapshot: number;
  line_total: number | null;
  status?: string | null;
};

type Order = {
  id: string;
  order_number: string | null;
  status: string;
  subtotal: number;
  tax: number | null;
  shipping_fee: number | null;
  discount_amount: number | null;
  total: number;
  currency: string | null;
  placed_at: string | null;
  items: OrderItem[];
  shipping_address_snapshot: { full_name?: string; city?: string; country?: string } | null;
};

const STATUS_MAP: Record<string, { label: string; icon: typeof Package; color: string }> = {
  pending: { label: "Pending payment", icon: Clock, color: "text-yellow-400" },
  paid: { label: "Paid", icon: CreditCard, color: "text-emerald-400" },
  processing: { label: "Processing", icon: Package, color: "text-purple-400" },
  printing: { label: "Printing", icon: Printer, color: "text-fuchsia-400" },
  shipped: { label: "Shipped", icon: Truck, color: "text-cyan-400" },
  delivered: { label: "Delivered", icon: CheckCircle2, color: "text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-400" },
  refunded: { label: "Refunded", icon: RotateCcw, color: "text-amber-400" },
  partially_refunded: { label: "Partially Refunded", icon: RotateCcw, color: "text-amber-400" },
};

export default function TrackOrderPage() {
  const [orderRef, setOrderRef] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderRef.trim() || !email.trim()) return;

    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const params = new URLSearchParams({ order_id: orderRef.trim(), email: email.trim() });
      const res = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data.order) {
        setOrder(data.order);
      } else {
        setError(data?.message || "Order not found. Please check your order number and email.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const statusInfo = order ? STATUS_MAP[order.status] || STATUS_MAP.pending : null;
  const currency = order?.currency || "USD";
  const placedAt = order?.placed_at;
  const orderLabel = order?.order_number || order?.id?.slice(0, 8);

  return (
    <div className="min-h-screen py-20 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] bg-clip-text text-transparent">
              Track Your Order
            </span>
          </h1>
          <p className="text-gray-400">
            Enter your order number and the email used for the purchase
          </p>
        </div>

        {/* Search Form */}
        <div className="glass rounded-3xl p-8 mb-8 animate-fade-in">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Order Number</label>
              <input
                type="text"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                placeholder="e.g., GS-2026-000123"
                className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-bold hover:shadow-[0_0_30px_rgba(255,79,216,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Track Order
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded-2xl p-6 border border-red-500/30 mb-8 animate-fade-in">
            <p className="text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* Order Result */}
        {order && statusInfo && (
          <div className="glass rounded-3xl p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-gray-400">Order</p>
                <p className="text-lg font-bold text-white">#{orderLabel}</p>
              </div>
              <div className={`flex items-center gap-2 ${statusInfo.color}`}>
                <statusInfo.icon className="w-5 h-5" />
                <span className="font-semibold">{statusInfo.label}</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Placed</span>
                <span className="text-white">
                  {placedAt ? new Date(placedAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">{formatCurrency(order.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Shipping</span>
                <span className="text-white">
                  {Number(order.shipping_fee || 0) === 0
                    ? "Free"
                    : formatCurrency(Number(order.shipping_fee || 0), currency)}
                </span>
              </div>
              {Number(order.tax || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tax</span>
                  <span className="text-white">{formatCurrency(Number(order.tax), currency)}</span>
                </div>
              )}
              {Number(order.discount_amount || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-emerald-400">
                    -{formatCurrency(Number(order.discount_amount), currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-white/[0.08] pt-3">
                <span className="text-gray-400">Total</span>
                <span className="text-white font-bold">{formatCurrency(order.total, currency)}</span>
              </div>
              {order.shipping_address_snapshot?.city && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Deliver to</span>
                  <span className="text-white">
                    {order.shipping_address_snapshot.city}
                    {order.shipping_address_snapshot.country
                      ? `, ${order.shipping_address_snapshot.country}`
                      : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="border-t border-white/[0.08] pt-4">
              <p className="text-sm text-gray-400 mb-3">Items</p>
              <div className="space-y-2">
                {order.items?.length ? (
                  order.items.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm gap-3">
                      <span className="text-white">
                        {item.product_name_snapshot || item.sku_snapshot || "Item"} × {item.quantity}
                      </span>
                      <span className="text-gray-400 whitespace-nowrap">
                        {formatCurrency(
                          Number(item.line_total ?? item.unit_price_snapshot * item.quantity),
                          currency
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No items recorded for this order.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Help */}
        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">
            Need help?{" "}
            <a href="/contact" className="text-[#FF4FD8] hover:text-[#FF6FE0] transition-colors">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
