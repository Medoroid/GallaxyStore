"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Shield, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

type AppUser = {
  id: string;
  full_name: string;
  email: string | null;
  role: "customer" | "vendor" | "admin" | string;
  admin_role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-[#FF4FD8]/10 text-[#FF4FD8]",
  vendor: "bg-cyan-500/10 text-cyan-400",
  customer: "bg-white/[0.05] text-gray-300",
};

export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not load users.");
        return;
      }
      setUsers(data.users || []);
      setCurrentUserId(data.current_user_id || null);
    } catch {
      setError("Network error while loading users.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdatingId(userId);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not update this user.");
        return;
      }
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role: data.role } : user))
      );
    } catch {
      setError("Network error while updating the user.");
    } finally {
      setUpdatingId(null);
    }
  };

  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(query) ||
      (user.email || "").toLowerCase().includes(query)
  );

  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1">
          {users.length} registered users · {adminCount} administrators
        </p>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="glass rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-12 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors"
          />
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/[0.05] rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-2" />
                  <div className="h-3 bg-white/[0.05] rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No users found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const isSelf = user.id === currentUserId;
            const busy = updatingId === user.id;
            return (
              <div key={user.id} className="glass rounded-2xl p-4 hover:border-white/[0.12] transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] flex items-center justify-center text-white font-bold shrink-0">
                      {(user.full_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">
                        {user.full_name}
                        {isSelf && <span className="text-xs text-gray-500 ml-2">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email || "No email"}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                        {user.last_sign_in_at
                          ? ` · Last seen ${new Date(user.last_sign_in_at).toLocaleDateString()}`
                          : " · Never signed in"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${
                        ROLE_COLORS[user.role] || ROLE_COLORS.customer
                      }`}
                    >
                      <Shield className="w-3 h-3" />
                      {user.role}
                    </span>
                    {user.admin_role === "super_admin" && (
                      <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                        SUPER ADMIN
                      </span>
                    )}
                    <select
                      value={user.role}
                      disabled={busy || isSelf || user.admin_role === "super_admin"}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white disabled:opacity-50"
                      title={
                        isSelf
                          ? "You cannot change your own role"
                          : user.admin_role === "super_admin"
                            ? "Super administrator role cannot be changed here"
                            : "Change role"
                      }
                    >
                      <option value="customer">Customer</option>
                      <option value="vendor">Vendor</option>
                      <option value="admin">Admin</option>
                    </select>
                    {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
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
