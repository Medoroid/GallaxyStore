"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { RotateCcw, Check, X, Clock, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

type Refund = {
  id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
  orders?: { id: string; total: number; status: string };
};

export default function AdminRefundsPage() {
  const { getToken } = useAuth();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    fetchRefunds();
  }, []);

  const fetchRefunds = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/refunds", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setRefunds(data.refunds || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleRefundAction = async (refundId: string, action: string) => {
    try {
      const token = await getToken();
      await fetch("/api/admin/refunds", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          refund_id: refundId,
        }),
      });
      fetchRefunds();
    } catch {
      // ignore
    }
  };

  const filtered = refunds.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400",
    completed: "bg-green-500/10 text-green-400",
    failed: "bg-red-500/10 text-red-400",
    processing: "bg-blue-500/10 text-blue-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Refunds Management</h1>
        <p className="text-gray-400 mt-1">Process and track refund requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending", "completed", "failed", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? "bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white"
                : "bg-white/[0.05] text-gray-400 hover:text-white"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
              <div className="h-3 bg-white/[0.05] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <RotateCcw className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No {filter} refunds</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Refund ID</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Order</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Date</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((refund) => (
                <tr key={refund.id} className="hover:bg-white/[0.02]">
                  <td className="py-4">
                    <span className="text-sm font-medium text-white">#{refund.id.slice(0, 8)}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-400">#{refund.order_id.slice(0, 8)}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm font-semibold text-white">{formatCurrency(refund.amount)}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-400 max-w-[200px] truncate block">{refund.reason || "N/A"}</span>
                  </td>
                  <td className="py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[refund.status] || STATUS_COLORS.pending}`}>
                      {refund.status}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-400">{new Date(refund.created_at).toLocaleDateString()}</span>
                  </td>
                  <td className="py-4 text-right">
                    {refund.status === "pending" && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleRefundAction(refund.id, "mark_completed")}
                          className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                          title="Mark Completed"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRefundAction(refund.id, "mark_failed")}
                          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Mark Failed"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
