"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { ShoppingBag, Search, Eye, Truck } from "lucide-react";
import Link from "next/link";

type Order = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  shipping_address_snapshot: { full_name: string } | null;
  items: Array<{ product_name: string; quantity: number }>;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  paid: { label: "Paid", color: "text-blue-400", bg: "bg-blue-400/10" },
  processing: { label: "Processing", color: "text-purple-400", bg: "bg-purple-400/10" },
  printing: { label: "Printing", color: "text-indigo-400", bg: "bg-indigo-400/10" },
  shipped: { label: "Shipped", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  delivered: { label: "Delivered", color: "text-green-400", bg: "bg-green-400/10" },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-400/10" },
};

export default function VendorOrdersPage() {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.recent_orders || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const filtered = orders.filter((order) => {
    const matchSearch =
      !search ||
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.shipping_address_snapshot?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || order.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-8 bg-white/[0.05] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Orders</h1>
        <p className="text-gray-400 mt-1">View and manage your store orders</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID or customer..."
            className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-gray-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-12 px-4 rounded-2xl glass bg-transparent text-sm outline-none"
        >
          <option value="all" className="bg-black">All Status</option>
          {Object.entries(STATUS_MAP).map(([key, val]) => (
            <option key={key} value={key} className="bg-black">{val.label}</option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No orders found</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Order</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Items</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Status</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Total</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Date</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((order) => {
                  const status = STATUS_MAP[order.status] || STATUS_MAP.pending;
                  return (
                    <tr key={order.id} className="hover:bg-white/[0.02]">
                      <td className="p-4">
                        <span className="text-sm font-medium text-white">#{order.id.slice(0, 8)}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-gray-400">{order.shipping_address_snapshot?.full_name || "N/A"}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-gray-400">{order.items?.length || 0} item(s)</span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-semibold text-white">{formatCurrency(order.total)}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/orders/${order.id}`} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                            <Eye className="w-4 h-4" />
                          </Link>
                          {order.status === "paid" && (
                            <button className="p-2 rounded-lg hover:bg-blue-500/10 text-gray-400 hover:text-blue-400 transition-colors">
                              <Truck className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
