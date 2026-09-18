"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Printer, Clock, CheckCircle, AlertCircle, RotateCw } from "lucide-react";

type PrintJob = {
  id: string;
  order_id: string;
  status: string;
  product_name: string;
  variant_info: string;
  quantity: number;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  queued: { label: "Queued", color: "text-gray-400", bg: "bg-gray-400/10", icon: Clock },
  printing: { label: "Printing", color: "text-blue-400", bg: "bg-blue-400/10", icon: Printer },
  completed: { label: "Completed", color: "text-green-400", bg: "bg-green-400/10", icon: CheckCircle },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-400/10", icon: AlertCircle },
};

export default function VendorPrintingPage() {
  const { getToken } = useAuth();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setJobs(data.dashboard?.printing_queue || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const filtered = jobs.filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  const statusCounts = {
    all: jobs.length,
    queued: jobs.filter((j) => j.status === "queued").length,
    printing: jobs.filter((j) => j.status === "printing").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Print Queue</h1>
          <p className="text-gray-400 mt-1">Manage your printing jobs</p>
        </div>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-4 h-10 rounded-xl glass text-gray-400 hover:text-white transition-colors"
        >
          <RotateCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(["all", "queued", "printing", "completed", "failed"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              statusFilter === status
                ? "bg-gradient-neon text-white"
                : "glass text-gray-400 hover:text-white"
            }`}
          >
            {status === "all" ? "All" : STATUS_MAP[status]?.label || status}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              statusFilter === status ? "bg-white/20" : "bg-white/[0.05]"
            }`}>
              {statusCounts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Print Jobs List */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Printer className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No print jobs found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const status = STATUS_MAP[job.status] || STATUS_MAP.queued;
            const StatusIcon = status.icon;
            return (
              <div key={job.id} className="glass rounded-2xl p-5 hover:border-white/[0.12] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${status.bg} flex items-center justify-center`}>
                      <StatusIcon className={`w-5 h-5 ${status.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{job.product_name}</span>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Order #{job.order_id?.slice(0, 8) || "N/A"} • {job.variant_info} • Qty: {job.quantity}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {job.status === "queued" && (
                      <button className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">
                        Start Printing
                      </button>
                    )}
                    {job.status === "printing" && (
                      <button className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors">
                        Mark Complete
                      </button>
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
