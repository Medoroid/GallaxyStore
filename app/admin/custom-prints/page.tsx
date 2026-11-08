"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Palette,
  Loader2,
  ExternalLink,
  Save,
  Search,
  Mail,
  Phone,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type CustomPrintRequest = {
  id: string;
  request_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  product_type: string;
  size: string | null;
  color: string | null;
  custom_text: string | null;
  notes: string | null;
  status: string;
  quoted_amount: number | null;
  currency: string;
  admin_notes: string | null;
  design_url: string | null;
  created_at: string;
};

const STATUSES = [
  "new",
  "reviewing",
  "quoted",
  "accepted",
  "in_production",
  "completed",
  "cancelled",
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-yellow-500/10 text-yellow-400",
  reviewing: "bg-blue-500/10 text-blue-400",
  quoted: "bg-purple-500/10 text-purple-400",
  accepted: "bg-cyan-500/10 text-cyan-400",
  in_production: "bg-fuchsia-500/10 text-fuchsia-400",
  completed: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
};

export default function AdminCustomPrintsPage() {
  const { getToken } = useAuth();
  const [requests, setRequests] = useState<CustomPrintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; quoted_amount: string; admin_notes: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/custom-prints", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not load custom print requests.");
        return;
      }
      const list = (data.requests ?? []) as CustomPrintRequest[];
      setRequests(list);
      setDrafts(
        Object.fromEntries(
          list.map((request) => [
            request.id,
            {
              status: request.status,
              quoted_amount:
                request.quoted_amount == null ? "" : String(request.quoted_amount),
              admin_notes: request.admin_notes || "",
            },
          ])
        )
      );
    } catch {
      setError("Network error while loading custom print requests.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (request: CustomPrintRequest) => {
    const draft = drafts[request.id];
    if (!draft) return;
    setSavingId(request.id);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/custom-prints", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: request.id,
          status: draft.status,
          quoted_amount: draft.quoted_amount === "" ? null : Number(draft.quoted_amount),
          admin_notes: draft.admin_notes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not save the request.");
        return;
      }
      setRequests((prev) =>
        prev.map((row) => (row.id === request.id ? { ...row, ...data.request } : row))
      );
    } catch {
      setError("Network error while saving the request.");
    } finally {
      setSavingId(null);
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = requests.filter((request) => {
    if (filter !== "all" && request.status !== filter) return false;
    if (!query) return true;
    return (
      request.request_number.toLowerCase().includes(query) ||
      request.customer_name.toLowerCase().includes(query) ||
      request.customer_email.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Custom Print Requests</h1>
        <p className="text-gray-400 mt-1">
          Review artwork, send quotes and move requests through production.
        </p>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {["all", ...STATUSES].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all ${
                filter === status
                  ? "bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white"
                  : "bg-white/[0.05] text-gray-400 hover:text-white"
              }`}
            >
              {status.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request, name or email"
            className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50"
          />
        </div>
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
          <Palette className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No custom print requests</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((request) => {
            const draft = drafts[request.id];
            const busy = savingId === request.id;
            return (
              <div key={request.id} className="glass rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">
                        {request.request_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                          STATUS_COLORS[request.status] || STATUS_COLORS.new
                        }`}
                      >
                        {request.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">
                      {request.customer_name} · <span className="capitalize">{request.product_type}</span>
                      {request.size ? ` · ${request.size}` : ""}
                      {request.color ? ` · ${request.color}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                      <a
                        href={`mailto:${request.customer_email}`}
                        className="inline-flex items-center gap-1 hover:text-[#FF4FD8]"
                      >
                        <Mail className="w-3 h-3" /> {request.customer_email}
                      </a>
                      {request.customer_phone && (
                        <a
                          href={`tel:${request.customer_phone}`}
                          className="inline-flex items-center gap-1 hover:text-[#FF4FD8]"
                        >
                          <Phone className="w-3 h-3" /> {request.customer_phone}
                        </a>
                      )}
                      <span>{new Date(request.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {request.design_url ? (
                    <a
                      href={request.design_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] text-sm text-gray-300 hover:bg-white/[0.1]"
                    >
                      <ExternalLink className="w-4 h-4" /> Open artwork
                    </a>
                  ) : (
                    <span className="text-xs text-red-400">Artwork link unavailable</span>
                  )}
                </div>

                {(request.custom_text || request.notes) && (
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {request.custom_text && (
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500 mb-1">Custom text</p>
                        <p className="text-gray-200 whitespace-pre-line">{request.custom_text}</p>
                      </div>
                    )}
                    {request.notes && (
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500 mb-1">Customer notes</p>
                        <p className="text-gray-200 whitespace-pre-line">{request.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {draft && (
                  <div className="grid md:grid-cols-[160px_160px_1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Status</label>
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], status: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white"
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Quote ({request.currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.quoted_amount}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], quoted_amount: e.target.value },
                          }))
                        }
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Message to customer (optional)
                      </label>
                      <input
                        value={draft.admin_notes}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [request.id]: { ...prev[request.id], admin_notes: e.target.value },
                          }))
                        }
                        placeholder="Details included in the status email"
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white"
                      />
                    </div>
                    <button
                      onClick={() => save(request)}
                      disabled={busy}
                      className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                )}

                {request.quoted_amount != null && (
                  <p className="text-xs text-gray-400">
                    Current quote:{" "}
                    <strong className="text-white">
                      {formatCurrency(Number(request.quoted_amount), request.currency)}
                    </strong>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
