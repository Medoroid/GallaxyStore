"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  ShoppingBag,
  DollarSign,
  Clock,
  ArrowUpRight,
  Users,
  Image,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type Stats = {
  total_orders: number;
  total_products: number;
  total_revenue: number;
  pending_orders: number;
  total_users: number;
  total_gallery: number;
  daily_sales: Array<{ date: string; revenue: number; orders: number }>;
  top_products: Array<{ product_name: string; total_revenue: number; total_sold: number }>;
  inventory_alerts: Array<{ product_name: string; variant_sku: string; stock_quantity: number }>;
};

type Order = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  shipping_address_snapshot: { full_name: string } | null;
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

export default function AdminDashboard() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await getToken();
        const statsRes = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statsData = await statsRes.json();

        if (statsData.success) {
          setStats(statsData.stats);
          setRecentOrders(statsData.recent_orders || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [getToken]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
              <div className="h-8 bg-white/[0.05] rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Revenue",
      value: formatCurrency(stats?.total_revenue || 0),
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Total Orders",
      value: stats?.total_orders || 0,
      icon: ShoppingBag,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Pending Orders",
      value: stats?.pending_orders || 0,
      icon: Clock,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      label: "Products",
      value: stats?.total_products || 0,
      icon: Package,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Users",
      value: stats?.total_users || 0,
      icon: Users,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      label: "Gallery Images",
      value: stats?.total_gallery || 0,
      icon: Image,
      color: "text-pink-400",
      bg: "bg-pink-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back! Here&apos;s what&apos;s happening.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className="glass rounded-2xl p-6 hover:border-white/[0.12] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">{card.label}</span>
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Inventory Alerts */}
      {stats?.inventory_alerts && stats.inventory_alerts.length > 0 && (
        <div className="glass rounded-2xl p-6 border border-yellow-500/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white">Low Stock Alerts</h2>
          </div>
          <div className="space-y-2">
            {stats.inventory_alerts.slice(0, 5).map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-yellow-500/5">
                <div>
                  <span className="text-sm font-medium text-white">{alert.product_name}</span>
                  <span className="text-xs text-gray-500 block">{alert.variant_sku}</span>
                </div>
                <span className="text-sm font-bold text-yellow-400">{alert.stock_quantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/admin/orders"
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] hover:border-[#FF4FD8]/30 transition-all"
          >
            <ShoppingBag className="w-5 h-5 text-[#FF4FD8]" />
            <span className="text-sm font-medium text-white">View Orders</span>
          </Link>
          <Link
            href="/admin/products"
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] hover:border-[#FF4FD8]/30 transition-all"
          >
            <Package className="w-5 h-5 text-[#A855F7]" />
            <span className="text-sm font-medium text-white">Products</span>
          </Link>
          <Link
            href="/admin/reviews"
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] hover:border-[#FF4FD8]/30 transition-all"
          >
            <Image className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium text-white">Reviews</span>
          </Link>
          <Link
            href="/admin/vendors"
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] hover:border-[#FF4FD8]/30 transition-all"
          >
            <Users className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium text-white">Vendors</span>
          </Link>
        </div>
      </div>

      {/* Top Products */}
      {stats?.top_products && stats.top_products.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top Products</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Product</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Sold</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {stats.top_products.map((product, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-4">
                      <span className="text-sm font-medium text-white">{product.product_name}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm text-gray-400">{product.total_sold}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm font-semibold text-white">{formatCurrency(product.total_revenue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Recent Orders</h2>
          <Link
            href="/admin/orders"
            className="flex items-center gap-1 text-sm text-[#FF4FD8] hover:text-[#FF6FE0] transition-colors"
          >
            View All <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Order</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Customer</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Total</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {recentOrders.map((order) => {
                  const status = STATUS_MAP[order.status] || STATUS_MAP.pending;
                  return (
                    <tr key={order.id} className="hover:bg-white/[0.02]">
                      <td className="py-4">
                        <span className="text-sm font-medium text-white">#{order.id.slice(0, 8)}</span>
                      </td>
                      <td className="py-4">
                        <span className="text-sm text-gray-400">{order.shipping_address_snapshot?.full_name || "N/A"}</span>
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <span className="text-sm font-medium text-white">{formatCurrency(order.total)}</span>
                      </td>
                      <td className="py-4 text-right">
                        <span className="text-sm text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
