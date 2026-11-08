"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Store, Check, X, PauseCircle, PlayCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

type Vendor = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  owner_id: string;
  owner?: { full_name: string | null; email: string | null } | null;
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500/10 text-green-400",
  pending: "bg-yellow-500/10 text-yellow-400",
  suspended: "bg-red-500/10 text-red-400",
  rejected: "bg-red-500/10 text-red-400",
};

export default function AdminVendorsPage() {
  const { getToken } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const fetchVendors = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/vendors", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not load vendors.");
        return;
      }
      setVendors(data.vendors || []);
    } catch {
      setError("Network error while loading vendors.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleVendorAction = async (storeId: string, action: string) => {
    setActingId(storeId);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/vendors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, store_id: storeId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not update this vendor.");
        return;
      }
      await fetchVendors();
    } catch {
      setError("Network error while updating the vendor.");
    } finally {
      setActingId(null);
    }
  };

  const filtered = vendors.filter((v) => (filter === "all" ? true : v.status === filter));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendors Management</h1>
        <p className="text-gray-400 mt-1">Manage vendor stores and approvals</p>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "approved", "suspended", "rejected"].map((f) => (
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
          <Store className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No {filter === "all" ? "" : filter} vendors</p>
        </div>
      ) : (
        <div className="overflow-x-auto glass rounded-2xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Store</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Owner</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Created</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((vendor) => {
                const busy = actingId === vendor.id;
                return (
                  <tr key={vendor.id} className="hover:bg-white/[0.02]">
                    <td className="p-4">
                      <div>
                        <span className="text-sm font-medium text-white">{vendor.name}</span>
                        <span className="text-xs text-gray-500 block">{vendor.slug}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-gray-300">
                        {vendor.owner?.full_name || "Unnamed owner"}
                      </span>
                      <span className="text-xs text-gray-500 block">
                        {vendor.owner?.email || vendor.owner_id}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[vendor.status] || STATUS_COLORS.pending
                        }`}
                      >
                        {vendor.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-gray-400">
                        {new Date(vendor.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex gap-2 justify-end items-center">
                        <Link
                          href={`/stores/${vendor.slug}`}
                          target="_blank"
                          className="p-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors"
                          title="View store"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        {vendor.status === "pending" && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => handleVendorAction(vendor.id, "approve_store")}
                              className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => handleVendorAction(vendor.id, "reject_store")}
                              className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {vendor.status === "approved" && (
                          <button
                            disabled={busy}
                            onClick={() => handleVendorAction(vendor.id, "suspend_store")}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            title="Suspend"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                        )}
                        {vendor.status === "suspended" && (
                          <button
                            disabled={busy}
                            onClick={() => handleVendorAction(vendor.id, "reinstate_store")}
                            className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            title="Reinstate"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
