"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Truck, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  status: string;
  options_snapshot: Record<string, string> | null;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  shipping_address_snapshot: Record<string, string>;
  customer_note: string | null;
  placed_at: string;
  created_at: string;
  items?: OrderItem[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: "Pending", color: "text-yellow-400", icon: Clock },
  paid: { label: "Paid", color: "text-blue-400", icon: CheckCircle2 },
  processing: { label: "Processing", color: "text-blue-400", icon: Package },
  printing: { label: "Printing", color: "text-purple-400", icon: Package },
  shipped: { label: "Shipped", color: "text-orange-400", icon: Truck },
  delivered: { label: "Delivered", color: "text-green-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "text-red-400", icon: XCircle },
  refunded: { label: "Refunded", color: "text-gray-400", icon: XCircle },
  partially_refunded: { label: "Partially Refunded", color: "text-gray-400", icon: XCircle },
};

export default function OrderDetailPage() {
  const params = useParams();
  const { user, getToken } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const orderId = params?.id as string;

  useEffect(() => {
    if (!user || !orderId) return;

    const fetchOrder = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.success && data.order) {
          setOrder(data.order);
        } else {
          setError(data.message || "Order not found");
        }
      } catch {
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [user, orderId, getToken]);

  const handleCancelOrder = async () => {
    if (!order || !confirm("Are you sure you want to cancel this order?")) return;

    setCancelling(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });

      const data = await res.json();
      if (data.success) {
        setOrder({ ...order, status: "cancelled" });
      } else {
        alert(data.message || "Failed to cancel order");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Order Not Found</h1>
          <p className="text-muted-foreground mb-4">{error || "This order does not exist."}</p>
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">
              Order <span className="text-gradient-neon">#{order.order_number || order.id.slice(0, 8)}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Placed on {new Date(order.placed_at || order.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl glass ${statusConfig.color}`}>
            <StatusIcon className="h-4 w-4" />
            <span className="font-semibold">{statusConfig.label}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Order Items */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-strong rounded-3xl p-6">
            <h2 className="text-lg font-extrabold mb-4">Order Items</h2>
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="glass rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{item.product_name_snapshot}</p>
                        <p className="text-sm text-muted-foreground">
                          SKU: {item.sku_snapshot}
                          {item.options_snapshot && Object.entries(item.options_snapshot).map(([k, v]) => (
                            <span key={k}> · {k}: {v}</span>
                          ))}
                        </p>
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold">{formatCurrency(item.line_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Items not loaded. View order list for details.</p>
            )}
          </div>

          {/* Shipping Address */}
          {order.shipping_address_snapshot && (
            <div className="glass-strong rounded-3xl p-6">
              <h2 className="text-lg font-extrabold mb-4">Shipping Address</h2>
              <div className="glass rounded-xl p-4">
                <p className="font-semibold">{order.shipping_address_snapshot.full_name || "N/A"}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address_snapshot.address}, {order.shipping_address_snapshot.city}, {order.shipping_address_snapshot.state} {order.shipping_address_snapshot.zip_code}
                </p>
                <p className="text-sm text-muted-foreground">{order.shipping_address_snapshot.country}</p>
                <p className="text-sm text-muted-foreground">Phone: {order.shipping_address_snapshot.phone || "N/A"}</p>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="md:col-span-1">
          <div className="glass-strong rounded-3xl p-6 h-fit sticky top-28 space-y-4">
            <h3 className="text-lg font-extrabold">Order Summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatCurrency(order.subtotal)}</span>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-semibold">{formatCurrency(order.tax)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className={`font-semibold ${order.shipping_fee === 0 ? "text-green-400" : ""}`}>
                  {order.shipping_fee === 0 ? "Free" : formatCurrency(order.shipping_fee)}
                </span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-semibold text-green-400">-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-extrabold text-lg text-gradient-gold">{formatCurrency(order.total)}</span>
              </div>
            </div>

            {/* Cancel Button */}
            {(order.status === "pending" || order.status === "paid") && (
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="w-full h-10 rounded-xl bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Cancel Order"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
