"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  Truck,
  Printer,
  Star,
} from "lucide-react";

type DashboardData = {
  dashboard: {
    total_revenue?: number;
    total_orders?: number;
    total_products?: number;
    pending_shipments?: number;
    active_products?: number;
  };
  monthly_stats: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
  top_products: Array<{
    product_name: string;
    total_sold: number;
    total_revenue: number;
  }>;
  pending_shipments: Array<{
    id: string;
    order_id: string;
    status: string;
  }>;
  printing_queue: Array<{
    id: string;
    status: string;
  }>;
  conversion_metrics: {
    conversion_rate?: number;
    view_to_cart_rate?: number;
  };
  refund_rate: {
    refund_rate?: number;
    total_refunds?: number;
  };
};

export default function VendorDashboardPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
              <div className="h-8 bg-white/[0.05] rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const d = data?.dashboard || {};

  const statCards = [
    {
      label: "Total Revenue",
      value: formatCurrency(d.total_revenue || 0),
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Total Orders",
      value: d.total_orders || 0,
      icon: ShoppingBag,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Active Products",
      value: d.active_products || d.total_products || 0,
      icon: Package,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Pending Shipments",
      value: d.pending_shipments || 0,
      icon: Truck,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendor Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back! Here&apos;s your store overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Top Products */}
      {data?.top_products && data.top_products.length > 0 && (
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
                {data.top_products.map((product, i) => (
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

      {/* Pending Shipments */}
      {data?.pending_shipments && data.pending_shipments.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Pending Shipments</h2>
          <div className="space-y-3">
            {data.pending_shipments.map((shipment) => (
              <div key={shipment.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02]">
                <div>
                  <span className="text-sm font-medium text-white">Order #{shipment.order_id.slice(0, 8)}</span>
                  <span className="text-xs text-gray-500 block">{shipment.status}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data?.conversion_metrics && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Conversion Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Conversion Rate</span>
                <span className="text-sm font-semibold text-white">{data.conversion_metrics.conversion_rate || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">View to Cart Rate</span>
                <span className="text-sm font-semibold text-white">{data.conversion_metrics.view_to_cart_rate || 0}%</span>
              </div>
            </div>
          </div>
        )}

        {data?.refund_rate && (
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Refund Rate</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Refund Rate</span>
                <span className="text-sm font-semibold text-white">{data.refund_rate.refund_rate || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Total Refunds</span>
                <span className="text-sm font-semibold text-white">{data.refund_rate.total_refunds || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
