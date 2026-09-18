"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RotateCcw, CheckCircle2, XCircle, AlertTriangle, Loader2, Package } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  items: OrderItem[];
};

type ReturnRequest = {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  created_at: string;
};

export default function ReturnsPage() {
  const { user, getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"request" | "history">("request");

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const token = await getToken();

        const [ordersRes, returnsRes] = await Promise.all([
          fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/returns", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const ordersData = await ordersRes.json();
        const returnsData = await returnsRes.json();

        if (ordersData.success) {
          const eligibleOrders = ordersData.orders.filter((o: Order) =>
            ["delivered", "paid", "confirmed"].includes(o.status)
          );
          setOrders(eligibleOrders);
        }

        if (returnsData.success) {
          setReturns(returnsData.returns || []);
        }
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, getToken]);

  const handleSelectItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSubmitReturn = async () => {
    if (!selectedOrder || selectedItems.length === 0 || !reason.trim()) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          items: selectedItems.map((itemId) => ({
            order_item_id: itemId,
            quantity: 1,
          })),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Return request submitted successfully!" });
        setSelectedOrder(null);
        setSelectedItems([]);
        setReason("");
        setTab("history");
        // Refresh returns list
        const returnsRes = await fetch("/api/returns", { headers: { Authorization: `Bearer ${token}` } });
        const returnsData = await returnsRes.json();
        if (returnsData.success) setReturns(returnsData.returns || []);
      } else {
        setMessage({ type: "error", text: data.message || "Failed to submit return request" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to manage returns.</p>
          <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform">
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

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <header className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">My Account</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Returns & <span className="text-gradient-neon">Exchanges</span>
        </h1>
      </header>

      {message && (
        <div className={`mb-6 p-4 rounded-xl text-sm ${
          message.type === "success"
            ? "text-green-400 bg-green-950/40 border border-green-500/30"
            : "text-red-400 bg-red-950/40 border border-red-500/30"
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setTab("request")}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            tab === "request" ? "bg-gradient-neon text-white" : "glass text-muted-foreground"
          }`}
        >
          Request Return
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
            tab === "history" ? "bg-gradient-neon text-white" : "glass text-muted-foreground"
          }`}
        >
          Return History ({returns.length})
        </button>
      </div>

      {tab === "request" && (
        <div className="glass-strong rounded-3xl p-6 space-y-6">
          {/* Policy */}
          <section className="glass rounded-xl p-4 border border-secondary/30">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-neon grid place-items-center shrink-0">
                <RotateCcw className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold">30-Day Return Window</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You have 30 days from the date of delivery to initiate a return.
                </p>
              </div>
            </div>
          </section>

          {/* Order Selection */}
          <div>
            <h2 className="text-lg font-extrabold mb-3">Select an Order</h2>
            {orders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No eligible orders for return.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedOrder(selectedOrder?.id === order.id ? null : order);
                      setSelectedItems([]);
                    }}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      selectedOrder?.id === order.id
                        ? "bg-gradient-neon/20 border border-secondary"
                        : "glass hover:bg-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{order.order_number || order.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="font-bold text-sm text-gradient-gold">{formatCurrency(order.total)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Item Selection */}
          {selectedOrder && (
            <div>
              <h2 className="text-lg font-extrabold mb-3">Select Items to Return</h2>
              <div className="space-y-2">
                {(selectedOrder.items || []).map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                      selectedItems.includes(item.id)
                        ? "bg-gradient-neon/20 border border-secondary"
                        : "glass hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={() => handleSelectItem(item.id)}
                      className="accent-pink-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.product_name_snapshot}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} | {formatCurrency(item.unit_price_snapshot)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          {selectedItems.length > 0 && (
            <div>
              <h2 className="text-lg font-extrabold mb-3">Reason for Return</h2>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Please describe the reason for your return..."
                className="w-full glass rounded-xl p-4 outline-none focus:pink-glow resize-none text-sm"
                required
              />
            </div>
          )}

          {/* Submit */}
          {selectedItems.length > 0 && reason.trim() && (
            <button
              onClick={handleSubmitReturn}
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="h-5 w-5" />
                  Submit Return Request
                </>
              )}
            </button>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="glass-strong rounded-3xl p-6">
          {returns.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-extrabold mb-2">No Returns Yet</h2>
              <p className="text-muted-foreground">You haven&apos;t submitted any return requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {returns.map((ret) => (
                <div key={ret.id} className="glass rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">Return #{ret.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        Order: {ret.order_id.slice(0, 8)} | {new Date(ret.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Reason: {ret.reason}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      ret.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                      ret.status === "approved" ? "bg-green-500/20 text-green-400" :
                      ret.status === "rejected" ? "bg-red-500/20 text-red-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {ret.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Policy Sections */}
      <div className="mt-8 glass-strong rounded-3xl p-6 space-y-6">
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            Eligible for Return
          </h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            {["Items in original, unused condition", "Items with original tags attached", "Defective or damaged products", "Wrong item received", "Items within the 30-day window"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" />
            Not Eligible for Return
          </h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            {["Custom or personalized items (unless defective)", "Items without original tags", "Items worn, washed, or altered", "Gift cards", "Items purchased on sale (final sale)"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="text-center pt-4 border-t border-white/10">
          <AlertTriangle className="h-8 w-8 mx-auto text-accent mb-3" />
          <p className="text-muted-foreground mb-4 text-sm">Questions about returns?</p>
          <a href="mailto:support@galaxystore.com" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform text-sm">
            Contact Support
          </a>
        </section>
      </div>
    </div>
  );
}
