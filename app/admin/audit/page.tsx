"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { AlertTriangle, ClipboardList } from "lucide-react";

type AuditEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_TYPES = [
  { value: "", label: "All entities" },
  { value: "user", label: "Users" },
  { value: "store", label: "Stores" },
  { value: "order", label: "Orders" },
  { value: "refund", label: "Refunds" },
  { value: "return", label: "Returns" },
  { value: "payout_request", label: "Payouts" },
];

export default function AdminAuditPage() {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "100" });
      if (entityType) params.set("entity_type", entityType);

      const res = await fetch(`/api/admin/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load audit log");
      }
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [entityType, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 mt-1">
            Role, moderation, order and refund actions taken by administrators.
          </p>
        </div>

        <label className="text-sm text-gray-400">
          <span className="sr-only">Filter by entity</span>
          <select
            value={entityType}
            onChange={(event) => {
              setLoading(true);
              setEntityType(event.target.value);
            }}
            className="rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF4FD8]"
          >
            {ENTITY_TYPES.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#1a1a1a]">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="space-y-2">
            <p>{error}</p>
            <button onClick={load} className="underline hover:text-red-200">
              Retry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
              <div className="h-3 bg-white/[0.05] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No audit entries yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">When</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Admin</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Action</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Entity</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/[0.02]">
                  <td className="py-4 text-sm text-gray-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="py-4 text-sm text-gray-300">
                    {entry.actor_email || entry.actor_id?.slice(0, 8) || "system"}
                  </td>
                  <td className="py-4">
                    <code className="text-xs rounded-lg bg-white/[0.05] px-2 py-1 text-[#FF4FD8]">
                      {entry.action}
                    </code>
                  </td>
                  <td className="py-4 text-sm text-gray-400">
                    {entry.entity_type}
                    {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="py-4 text-xs text-gray-500 max-w-[320px]">
                    <span className="block truncate" title={JSON.stringify(entry.details)}>
                      {entry.details && Object.keys(entry.details).length > 0
                        ? JSON.stringify(entry.details)
                        : "—"}
                    </span>
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
