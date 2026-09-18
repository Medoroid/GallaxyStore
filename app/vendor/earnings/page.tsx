"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowUpRight, Wallet } from "lucide-react";

type EarningsData = {
  total_earnings: number;
  pending_payouts: number;
  completed_payouts: number;
  current_balance: number;
  monthly_earnings: Array<{
    month: string;
    earnings: number;
    orders: number;
  }>;
  recent_payouts: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    created_at: string;
  }>;
};

export default function VendorEarningsPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank_transfer");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        setData({
          total_earnings: result.dashboard?.total_revenue || 0,
          pending_payouts: result.dashboard?.pending_payouts || 0,
          completed_payouts: result.dashboard?.completed_payouts || 0,
          current_balance: result.dashboard?.current_balance || 0,
          monthly_earnings: result.monthly_stats || [],
          recent_payouts: result.recent_payouts || [],
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return;
    setSubmitting(true);
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
      const result = await res.json();
      if (result.success) {
        setShowWithdraw(false);
        setWithdrawAmount("");
        fetchEarnings();
      }
    } catch {
      // ignore
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
      value: data?.completed_payouts || 0,
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
          onClick={() => setShowWithdraw(true)}
          className="flex items-center gap-2 px-5 h-10 rounded-xl bg-gradient-neon text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <ArrowUpRight className="w-4 h-4" /> Withdraw
        </button>
      </div>

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
                      <span className="text-sm text-gray-400">{month.orders}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm font-semibold text-white">{formatCurrency(month.earnings)}</span>
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
            {data.recent_payouts.map((payout) => (
              <div key={payout.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white">{formatCurrency(payout.amount)}</span>
                    <p className="text-xs text-gray-500">{payout.method} • {new Date(payout.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  payout.status === "completed" ? "bg-green-400/10 text-green-400" :
                  payout.status === "pending" ? "bg-yellow-400/10 text-yellow-400" :
                  "bg-gray-400/10 text-gray-400"
                }`}>
                  {payout.status}
                </span>
              </div>
            ))}
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
