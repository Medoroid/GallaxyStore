"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

type Refund = {
  id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
  payment_reference?: string | null;
  orders?: {
    id: string;
    order_number?: string | null;
    total: number;
    currency: string;
    status: string;
  };
};

type Order = {
  id: string;
  order_number?: string | null;
  total: number;
  currency: string;
  status: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  processing: "bg-blue-500/10 text-blue-400",
  completed: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
};

const REFUNDABLE_STATUSES = [
  "paid",
  "processing",
  "printing",
  "shipped",
  "delivered",
  "partially_refunded",
];

export default function AdminRefundsPage() {
  const { getToken } = useAuth();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const authHeaders = useCallback(async () => {
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
  }, [getToken]);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const headers = await authHeaders();
      const [refundsRes, ordersRes] = await Promise.all([
        fetch("/api/admin/refunds", { headers }),
        fetch("/api/admin/orders", { headers }),
      ]);

      const refundsData = await refundsRes.json().catch(() => ({}));
      if (!refundsRes.ok || !refundsData.success) {
        throw new Error(refundsData.message || "Failed to load refunds");
      }
      setRefunds(refundsData.refunds || []);

      // Orders only power the "issue refund" form; a failure here must not hide
      // the refund list.
      const ordersData = await ordersRes.json().catch(() => ({}));
      if (ordersRes.ok && ordersData.success) {
        setOrders(ordersData.orders || []);
      } else {
        setOrders([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reservedByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const refund of refunds) {
      if (refund.status === "failed") continue;
      map.set(refund.order_id, (map.get(refund.order_id) || 0) + Number(refund.amount || 0));
    }
    return map;
  }, [refunds]);

  const refundableOrders = useMemo(
    () => orders.filter((order) => REFUNDABLE_STATUSES.includes(order.status)),
    [orders]
  );

  const selectedOrder = refundableOrders.find((order) => order.id === orderId);

  const selectOrder = (id: string) => {
    setOrderId(id);
    const order = refundableOrders.find((candidate) => candidate.id === id);
    if (!order) {
      setAmount("");
      return;
    }
    const remaining = Number(order.total || 0) - (reservedByOrder.get(order.id) || 0);
    setAmount(remaining > 0 ? remaining.toFixed(2) : "");
  };

  const handleIssueRefund = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);

    const parsedAmount = Number(amount);
    if (!orderId) {
      setActionError("Select an order to refund.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError("Enter a refund amount greater than zero.");
      return;
    }
    if (reason.trim().length < 3) {
      setActionError("Enter a refund reason.");
      return;
    }

    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue_refund",
          order_id: orderId,
          amount: parsedAmount,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create refund");
      }

      setOrderId("");
      setAmount("");
      setReason("");
      await fetchData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create refund");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefundAction = async (refund: Refund, action: "mark_completed" | "mark_failed") => {
    setActionError(null);

    const body: Record<string, unknown> = { action, refund_id: refund.id };

    if (action === "mark_completed") {
      const reference = window.prompt(
        "Confirm the money has already been sent back to the customer.\n\n" +
          "Optional payment/transfer reference (leave blank if not applicable):",
        ""
      );
      // Cancelling the prompt aborts the action.
      if (reference === null) return;
      body.payment_reference = reference.trim() || null;

      const confirmed = window.confirm(
        `Mark ${formatCurrency(refund.amount, refund.orders?.currency || "USD")} as refunded?\n\n` +
          "Only do this after the transfer has actually been completed outside the store."
      );
      if (!confirmed) return;
    } else {
      const note = window.prompt("Why did the refund fail? (optional)", "");
      if (note === null) return;
      body.reason = note.trim() || null;
    }

    setBusyId(refund.id);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update refund");
      }
      await fetchData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update refund");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = refunds.filter((refund) =>
    filter === "all" ? true : refund.status === filter
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Refunds Management</h1>
        <p className="text-gray-400 mt-1">
          Record refund requests, then mark them completed only after the money has been sent.
        </p>
      </div>

      <form onSubmit={handleIssueRefund} className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-[#FF4FD8]" />
          <h2 className="text-lg font-semibold text-white">Issue a refund</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="refund-order" className="block text-sm text-gray-400 mb-2">
              Order
            </label>
            <select
              id="refund-order"
              value={orderId}
              onChange={(event) => selectOrder(event.target.value)}
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF4FD8]"
            >
              <option value="">Select an order…</option>
              {refundableOrders.map((order) => (
                <option key={order.id} value={order.id} className="bg-[#1a1a1a]">
                  {order.order_number || `#${order.id.slice(0, 8)}`} —{" "}
                  {formatCurrency(order.total, order.currency)} ({order.status})
                </option>
              ))}
            </select>
            {orders.length === 0 && !loading && (
              <p className="text-xs text-yellow-400/80 mt-1">
                Orders could not be loaded, so this form is unavailable.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="refund-amount" className="block text-sm text-gray-400 mb-2">
              Amount{selectedOrder ? ` (${selectedOrder.currency})` : ""}
            </label>
            <input
              id="refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF4FD8]"
            />
            {selectedOrder && (
              <p className="text-xs text-gray-500 mt-1">
                Order total {formatCurrency(selectedOrder.total, selectedOrder.currency)}
                {reservedByOrder.get(selectedOrder.id)
                  ? ` · already reserved ${formatCurrency(
                      reservedByOrder.get(selectedOrder.id) || 0,
                      selectedOrder.currency
                    )}`
                  : ""}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="refund-reason" className="block text-sm text-gray-400 mb-2">
              Reason
            </label>
            <input
              id="refund-reason"
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Damaged item, customer request…"
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FF4FD8]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || refundableOrders.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create refund request
          </button>
          <p className="text-xs text-gray-500">
            New refunds are created as <span className="text-yellow-400">pending</span>. No money is
            moved by this action.
          </p>
        </div>
      </form>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="space-y-2">
            <p>{error}</p>
            <button onClick={fetchData} className="underline hover:text-red-200">
              Retry
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="flex-1">{actionError}</div>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {["pending", "processing", "completed", "failed", "all"].map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === value
                ? "bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white"
                : "bg-white/[0.05] text-gray-400 hover:text-white"
            }`}
          >
            {value.charAt(0).toUpperCase() + value.slice(1)}
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
          <p className="text-gray-400">No {filter === "all" ? "" : filter} refunds</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Refund</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Order</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Reason</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Date</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((refund) => {
                const currency = refund.orders?.currency || "USD";
                const canResolve = refund.status === "pending" || refund.status === "processing";
                return (
                  <tr key={refund.id} className="hover:bg-white/[0.02]">
                    <td className="py-4">
                      <span className="text-sm font-medium text-white">#{refund.id.slice(0, 8)}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-400">
                        {refund.orders?.order_number || `#${refund.order_id.slice(0, 8)}`}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm font-semibold text-white">
                        {formatCurrency(refund.amount, currency)}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-400 max-w-[220px] truncate block">
                        {refund.reason || "N/A"}
                      </span>
                      {refund.payment_reference && (
                        <span className="text-xs text-gray-500">Ref: {refund.payment_reference}</span>
                      )}
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[refund.status] || STATUS_COLORS.pending
                        }`}
                      >
                        {refund.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-400">
                        {new Date(refund.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      {canResolve ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleRefundAction(refund, "mark_completed")}
                            disabled={busyId === refund.id}
                            className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            title="Mark refunded (money already sent)"
                          >
                            {busyId === refund.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRefundAction(refund, "mark_failed")}
                            disabled={busyId === refund.id}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            title="Mark failed"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
