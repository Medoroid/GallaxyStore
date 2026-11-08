"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { apiErrorMessage } from "@/app/lib/api-error-message";
import { DollarSign, Clock, CheckCircle, ArrowUpRight, Wallet, AlertCircle } from "lucide-react";

type EarningsData = {
  total_earnings: number;
  pending_payouts: number;
  completed_payouts: number;
  current_balance: number;
  monthly_earnings: Array<{
    month: string;
    revenue: number;
    orders_count: number;
  }>;
  recent_payouts: Array<{
    id: string;
    requested_amount: number;
    status: string;
    notes: string | null;
    rejection_reason: string | null;
    created_at: string;
  }>;
};

const PAYOUT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-400/10 text-yellow-400" },
  approved: { label: "Approved", className: "bg-blue-400/10 text-blue-400" },
  paid: { label: "Paid", className: "bg-green-400/10 text-green-400" },
  completed: { label: "Paid", className: "bg-green-400/10 text-green-400" },
  rejected: { label: "Rejected", className: "bg-red-400/10 text-red-400" },
};

export default function VendorEarningsPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank_transfer");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEarnings = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, payoutsRes] = await Promise.all([
        fetch("/api/vendor/stats", { headers }),
        fetch("/api/vendor/payout", { headers }),
      ]);
      const result = await statsRes.json().catch(() => null);
      const payoutResult = await payoutsRes.json().catch(() => null);
      if (!statsRes.ok || !result?.success) {
        throw new Error(result?.message || "Unable to load your earnings.");
      }
      const summary = payoutResult?.summary || {};
      setData({
        total_earnings: result.dashboard?.total_revenue || 0,
        pending_payouts: summary.pending_amount || 0,
        completed_payouts: summary.paid_amount || 0,
        current_balance: summary.withdrawable_balance || 0,
        monthly_earnings: result.monthly_stats || [],
        recent_payouts: payoutResult?.payouts || [],
      });
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Unable to load your earnings."
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const handleWithdraw = async () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return;
    setSubmitting(true);
    setWithdrawError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/payout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          method: withdrawMethod,
        }),
      });
      const result = await res.json().catch(() => null);
      if (res.ok && result?.success) {
        setShowWithdraw(false);
        setWithdrawAmount("");
        fetchEarnings();
      } else {
        setWithdrawError(
          apiErrorMessage(res.status, result, "Unable to request a payout.")
        );
      }
    } catch {
      setWithdrawError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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

  const statCards = [
    {
      label: "Total Earnings",
      value: formatCurrency(data?.total_earnings || 0),
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Current Balance",
      value: formatCurrency(data?.current_balance || 0),
      icon: Wallet,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Pending Payouts",
      value: formatCurrency(data?.pending_payouts || 0),
      icon: Clock,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      label: "Completed Payouts",
      value: formatCurrency(data?.completed_payouts || 0),
      icon: CheckCircle,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Earnings</h1>
          <p className="text-gray-400 mt-1">Track your earnings and payouts</p>
        </div>
        <button
          onClick={() => {
            setWithdrawError(null);
            setShowWithdraw(true);
          }}
          className="flex items-center gap-2 px-5 h-10 rounded-xl bg-gradient-neon text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <ArrowUpRight className="w-4 h-4" /> Withdraw
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
          <button onClick={fetchEarnings} className="underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
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

      {/* Monthly Earnings */}
      {data?.monthly_earnings && data.monthly_earnings.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Monthly Earnings</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Month</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Orders</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.monthly_earnings.map((month, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="py-4">
                      <span className="text-sm font-medium text-white">{month.month}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm text-gray-400">{month.orders_count}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm font-semibold text-white">{formatCurrency(month.revenue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Payouts */}
      {data?.recent_payouts && data.recent_payouts.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Payouts</h2>
          <div className="space-y-3">
            {data.recent_payouts.map((payout) => {
              const status =
                PAYOUT_STATUS[payout.status] ?? {
                  label: payout.status,
                  className: "bg-gray-400/10 text-gray-400",
                };
              return (
                <div key={payout.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">{formatCurrency(payout.requested_amount)}</span>
                      <p className="text-xs text-gray-500">
                        {new Date(payout.created_at).toLocaleDateString()}
                        {payout.status === "rejected" && payout.rejection_reason
                          ? ` • ${payout.rejection_reason}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Withdraw Funds</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Amount</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full glass rounded-xl h-12 px-4 outline-none focus:pink-glow transition-all"
                  min={0}
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Method</label>
                <select
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl glass bg-transparent outline-none"
                >
                  <option value="bank_transfer" className="bg-black">Bank Transfer</option>
                  <option value="paypal" className="bg-black">PayPal</option>
                  <option value="wallet" className="bg-black">Wallet Credit</option>
                </select>
              </div>
              {withdrawError && (
                <p className="text-sm text-red-400" role="alert">
                  {withdrawError}
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowWithdraw(false)}
                  className="flex-1 h-12 rounded-xl glass text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={submitting || !withdrawAmount || Number(withdrawAmount) <= 0}
                  className="flex-1 h-12 rounded-xl bg-gradient-neon text-white font-medium disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Processing..." : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
