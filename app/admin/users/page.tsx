"use client";

import { useState, useEffect } from "react";
import { Users, Shield, ShieldOff, Search } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { supabase } from "@/lib/supabaseClient";

type User = {
  id: string;
  full_name: string;
  created_at: string;
};

type AdminUser = {
  user_id: string;
};

export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addingAdmin, setAddingAdmin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // Fetch users via profiles table
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, created_at");

        if (!cancelled && profiles) {
          setUsers(
            profiles.map((p) => ({
              id: p.id,
              full_name: p.full_name || "Unknown",
              created_at: p.created_at,
            }))
          );
        }

        // Get admin user IDs - try admin_users first, then fallback to profiles.role
        try {
          const { data: admins } = await supabase
            .from("admin_users")
            .select("user_id");

          if (!cancelled && admins && admins.length > 0) {
            setAdminUserIds(new Set(admins.map((a: AdminUser) => a.user_id)));
          } else {
            throw new Error("no admin_users");
          }
        } catch {
          // Fallback: check profiles.role
          const { data: adminProfiles } = await supabase
            .from("profiles")
            .select("id")
            .in("role", ["admin", "superadmin"]);

          if (!cancelled && adminProfiles) {
            setAdminUserIds(new Set(adminProfiles.map((p) => p.id)));
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  const handleAddAdmin = async (userId: string) => {
    if (!userId) return;
    setAddingAdmin(userId);

    try {
      const token = await getToken();
      const res = await fetch("/api/admin/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await res.json();

      if (data.success) {
        setAdminUserIds((prev) => new Set([...prev, userId]));
      }
    } catch {
      // ignore
    } finally {
      setAddingAdmin(null);
    }
  };

  const isAdmin = (userId: string) => adminUserIds.has(userId);

  const filteredUsers = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1">{users.length} registered users</p>
      </div>

      {/* Search */}
      <div className="glass rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name..."
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
          {filteredUsers.map((user) => (
            <div key={user.id} className="glass rounded-2xl p-4 hover:border-white/[0.12] transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] flex items-center justify-center text-white font-bold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">{user.full_name}</p>
                    <p className="text-xs text-gray-500">
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin(user.id) ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FF4FD8]/10 text-[#FF4FD8] text-xs font-medium">
                      <Shield className="w-3 h-3" />
                      Admin
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddAdmin(user.id)}
                      disabled={addingAdmin === user.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all text-xs font-medium disabled:opacity-50"
                    >
                      <ShieldOff className="w-3 h-3" />
                      {addingAdmin === user.id ? "..." : "Make Admin"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
