"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type Order = {
  id: string;
  user_id: string;
  status: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  coupon_code: string | null;
  shipping_address_snapshot: {
    full_name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
  } | null;
  customer_note: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-400" },
  { value: "paid", label: "Paid", icon: CheckCircle2, color: "text-blue-400" },
  { value: "processing", label: "Processing", icon: Package, color: "text-purple-400" },
  { value: "printing", label: "Printing", icon: Package, color: "text-indigo-400" },
  { value: "shipped", label: "Shipped", icon: Truck, color: "text-cyan-400" },
  { value: "delivered", label: "Delivered", icon: CheckCircle2, color: "text-green-400" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-400" },
];

export default function AdminOrdersPage() {
  const { user, getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const fetchData = async () => {
      try {
        const token = await getToken();

        // Check admin
        const adminRes = await fetch("/api/admin", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const adminData = await adminRes.json();

        if (!adminData.is_admin) {
          if (!cancelled) setLoading(false);
          return;
        }

        if (!cancelled) setIsAdmin(true);

        // Fetch orders
        const ordersRes = await fetch("/api/admin/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ordersData = await ordersRes.json();

        if (!cancelled) {
          if (ordersData.success) {
            setOrders(ordersData.orders);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user, getToken]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      });

      const data = await res.json();

      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, status: newStatus } : o
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to access admin panel.</p>
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <XCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You don&apos;t have admin privileges.</p>
        </div>
      </div>
    );
  }

  const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      <div className="mb-8">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          Manage <span className="text-gradient-neon">Orders</span>
        </h1>
        <p className="text-muted-foreground mt-2">{orders.length} total orders</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {["all", "pending", "paid", "shipped", "delivered", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              filter === f
                ? "bg-gradient-neon text-white"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? `All (${orders.length})` : `${f} (${orders.filter((o) => o.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-extrabold mb-2">No Orders</h2>
          <p className="text-muted-foreground">No orders match the selected filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusInfo = STATUS_OPTIONS.find((s) => s.value === order.status) || STATUS_OPTIONS[0];
            return (
              <div key={order.id} className="glass-strong rounded-2xl p-5 hover:pink-glow transition-all">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="font-mono text-sm font-semibold">{order.id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {updating === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary" />
                    ) : (
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`h-9 px-3 rounded-lg glass text-sm font-semibold ${statusInfo.color} bg-transparent outline-none cursor-pointer`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-black text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {order.shipping_address_snapshot && (
                  <div className="glass rounded-xl p-3 mb-4 text-sm">
                    <p className="font-semibold">{order.shipping_address_snapshot.full_name}</p>
                    <p className="text-muted-foreground">
                      {order.shipping_address_snapshot.address}, {order.shipping_address_snapshot.city}, {order.shipping_address_snapshot.country}
                    </p>
                    <p className="text-muted-foreground">{order.shipping_address_snapshot.phone}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                  <div className="text-sm">
                    {order.coupon_code && (
                      <span className="text-secondary">Coupon: {order.coupon_code}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-extrabold text-gradient-gold">{formatCurrency(order.total)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
