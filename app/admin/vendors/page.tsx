"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Store, Check, X, Eye } from "lucide-react";

type Vendor = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  owner_id: string;
  profiles?: { full_name: string; email: string };
};

export default function AdminVendorsPage() {
  const { getToken } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/vendors", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setVendors(data.vendors || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleVendorAction = async (storeId: string, action: string) => {
    try {
      const token = await getToken();
      await fetch("/api/admin/vendors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, store_id: storeId }),
      });
      fetchVendors();
    } catch {
      // ignore
    }
  };

  const filtered = vendors.filter((v) =>
    filter === "all" ? true : v.status === filter
  );

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-500/10 text-green-400",
    pending: "bg-yellow-500/10 text-yellow-400",
    suspended: "bg-red-500/10 text-red-400",
    rejected: "bg-red-500/10 text-red-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Vendors Management</h1>
        <p className="text-gray-400 mt-1">Manage vendor stores and approvals</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "active", "pending", "suspended"].map((f) => (
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
          <p className="text-gray-400">No {filter} vendors</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Store</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Owner</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Created</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-white/[0.02]">
                  <td className="py-4">
                    <div>
                      <span className="text-sm font-medium text-white">{vendor.name}</span>
                      <span className="text-xs text-gray-500 block">{vendor.slug}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-400">{vendor.profiles?.full_name || vendor.profiles?.email || "N/A"}</span>
                  </td>
                  <td className="py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[vendor.status] || STATUS_COLORS.pending}`}>
                      {vendor.status}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-400">{new Date(vendor.created_at).toLocaleDateString()}</span>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {vendor.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleVendorAction(vendor.id, "approve_store")}
                            className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleVendorAction(vendor.id, "reject_store")}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
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
