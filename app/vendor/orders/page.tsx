"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { ShoppingBag, Search, Eye, Truck, AlertCircle, ChevronUp } from "lucide-react";
import Link from "next/link";

type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  status: string | null;
};

type Order = {
  id: string;
  order_number?: string | null;
  status: string;
  total: number;
  currency?: string | null;
  created_at: string;
  customer_name?: string | null;
  items: OrderItem[];
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  paid: { label: "Paid", color: "text-blue-400", bg: "bg-blue-400/10" },
  processing: { label: "Processing", color: "text-purple-400", bg: "bg-purple-400/10" },
  printing: { label: "Printing", color: "text-indigo-400", bg: "bg-indigo-400/10" },
  shipped: { label: "Shipped", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  delivered: { label: "Delivered", color: "text-green-400", bg: "bg-green-400/10" },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-400/10" },
  refunded: { label: "Refunded", color: "text-red-400", bg: "bg-red-400/10" },
  partially_refunded: {
    label: "Partially Refunded",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
  },
};

export default function VendorOrdersPage() {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/vendor/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load your orders");
      }

      setOrders(data.orders || []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load your orders"
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = orders.filter((order) => {
    const term = search.trim().toLowerCase();
    const matchSearch =
      !term ||
      order.id.toLowerCase().includes(term) ||
      (order.order_number?.toLowerCase().includes(term) ?? false) ||
      (order.customer_name?.toLowerCase().includes(term) ?? false) ||
      order.items.some((item) => item.product_name?.toLowerCase().includes(term));

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

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
          <button onClick={fetchOrders} className="underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by order ID, customer or product..."
            className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-gray-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-12 px-4 rounded-2xl glass bg-transparent text-sm outline-none"
        >
          <option value="all" className="bg-black">
            All Status
          </option>
          {Object.entries(STATUS_MAP).map(([key, value]) => (
            <option key={key} value={key} className="bg-black">
              {value.label}
            </option>
          ))}
        </select>
      </div>

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
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Order
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Customer
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Items
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Status
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Total
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Date
                  </th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((order) => {
                  const status = STATUS_MAP[order.status] || STATUS_MAP.pending;
                  const expanded = expandedId === order.id;
                  const itemCount = order.items.reduce(
                    (total, item) => total + Number(item.quantity ?? 0),
                    0
                  );

                  return (
                    <>
                      <tr key={order.id} className="hover:bg-white/[0.02]">
                        <td className="p-4">
                          <span className="text-sm font-medium text-white">
                            #{order.order_number || order.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-gray-400">
                            {order.customer_name || "Customer"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-gray-400">
                            {itemCount} item(s)
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-semibold text-white">
                            {formatCurrency(order.total, order.currency || "USD")}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm text-gray-400">
                            {new Date(order.created_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setExpandedId(expanded ? null : order.id)}
                              className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors"
                              aria-label={`${expanded ? "Hide" : "Show"} items for order ${order.order_number || order.id}`}
                            >
                              {expanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                            {(order.status === "paid" ||
                              order.status === "processing" ||
                              order.status === "printing") && (
                              <Link
                                href="/vendor/shipments"
                                className="p-2 rounded-lg hover:bg-blue-500/10 text-gray-400 hover:text-blue-400 transition-colors"
                                aria-label="Open shipments"
                              >
                                <Truck className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${order.id}-details`} className="bg-white/[0.02]">
                          <td colSpan={7} className="p-4">
                            <div className="space-y-2">
                              {order.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-4 text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="text-white truncate">
                                      {item.product_name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {item.quantity} ×{" "}
                                      {formatCurrency(
                                        item.unit_price,
                                        order.currency || "USD"
                                      )}
                                      {item.status ? ` · ${item.status}` : ""}
                                    </p>
                                  </div>
                                  <span className="text-gray-300 whitespace-nowrap">
                                    {formatCurrency(item.line_total, order.currency || "USD")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Customer email, phone and delivery address are intentionally not exposed in the
        vendor panel.
      </p>
    </div>
  );
}
