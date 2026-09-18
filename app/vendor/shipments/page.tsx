"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Truck, Package, ExternalLink } from "lucide-react";

type Shipment = {
  id: string;
  order_id: string;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  orders: {
    id: string;
    total: number;
    shipping_address_snapshot: { full_name: string } | null;
  } | null;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  shipped: { label: "Shipped", color: "text-blue-400", bg: "bg-blue-400/10" },
  in_transit: { label: "In Transit", color: "text-purple-400", bg: "bg-purple-400/10" },
  delivered: { label: "Delivered", color: "text-green-400", bg: "bg-green-400/10" },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-400/10" },
};

export default function VendorShipmentsPage() {
  const { getToken } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchShipments();
  }, []);

  const fetchShipments = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setShipments(data.dashboard?.pending_shipments || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const filtered = shipments.filter(
    (s) => statusFilter === "all" || s.status === statusFilter
  );

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
        <h1 className="text-2xl font-bold text-white">Shipments</h1>
        <p className="text-gray-400 mt-1">Track and manage your shipments</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {["all", "pending", "shipped", "in_transit", "delivered", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              statusFilter === status
                ? "bg-gradient-neon text-white"
                : "glass text-gray-400 hover:text-white"
            }`}
          >
            {status === "all" ? "All" : STATUS_MAP[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Shipments List */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No shipments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((shipment) => {
            const status = STATUS_MAP[shipment.status] || STATUS_MAP.pending;
            return (
              <div key={shipment.id} className="glass rounded-2xl p-5 hover:border-white/[0.12] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">Order #{shipment.order_id?.slice(0, 8) || "N/A"}</span>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {shipment.orders?.shipping_address_snapshot?.full_name || "N/A"}
                      </p>
                      {shipment.tracking_number && (
                        <p className="text-xs text-gray-400 mt-1">
                          Tracking: {shipment.tracking_number}
                          {shipment.carrier && ` (${shipment.carrier})`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {shipment.shipped_at && (
                      <p className="text-xs text-gray-500">Shipped: {new Date(shipment.shipped_at).toLocaleDateString()}</p>
                    )}
                    {shipment.delivered_at && (
                      <p className="text-xs text-green-400">Delivered: {new Date(shipment.delivered_at).toLocaleDateString()}</p>
                    )}
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
