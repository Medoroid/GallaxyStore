"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Lock,
  ShoppingBag,
  Heart,
  Settings,
  Save,
  Loader2,
  Eye,
  EyeOff,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";

export default function ProfilePage() {
  const { user, updatePassword, signOut, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <User className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to view your profile.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
            My Account
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold">
            <span className="text-gradient-neon">My</span> Profile
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-pink-500/40 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 text-sm font-bold transition-all shadow-md hover:scale-105"
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin Dashboard
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 text-sm font-bold transition-all shadow-md hover:scale-105"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {[
          { id: "profile", label: "Profile", icon: User },
          { id: "security", label: "Security", icon: Lock },
          { id: "quick", label: "Quick Links", icon: Settings },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-gradient-neon text-white"
                : "glass text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <ProfileInfo user={user} />
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <SecuritySettings updatePassword={updatePassword} />
      )}

      {/* Quick Links Tab */}
      {activeTab === "quick" && (
        <QuickLinks onSignOut={handleSignOut} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function ProfileInfo({ user }: { user: { id?: string; email?: string; user_metadata?: Record<string, string> } }) {
  const { getToken } = useAuth();
  const [name, setName] = useState(user.user_metadata?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Your session has expired. Please sign in again." });
        return;
      }

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ full_name: name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || "Could not update your profile. Please try again.",
        });
        return;
      }

      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch {
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="glass-strong rounded-3xl p-6 space-y-6">
      <h2 className="text-xl font-extrabold flex items-center gap-2">
        <User className="h-5 w-5 text-accent" />
        Profile Information
      </h2>

      <div className="flex items-center gap-4 mb-6">
        <div className="h-20 w-20 rounded-full bg-gradient-neon grid place-items-center text-white text-2xl font-extrabold">
          {(name || user.email || "?")[0].toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-lg">{name || "No name set"}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold mb-1 block">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="text-sm font-semibold mb-1 block">Email</label>
          <input
            type="email"
            value={user.email || ""}
            disabled
            className="w-full h-11 px-4 rounded-xl glass text-sm opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
        </div>
      </div>

      {(user.user_metadata?.userName || user.user_metadata?.age) && (
        <div className="grid md:grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div>
            <p className="text-xs text-muted-foreground">Username</p>
            <p className="text-sm text-white">{user.user_metadata?.userName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date of birth</p>
            <p className="text-sm text-white">{user.user_metadata?.age || "—"}</p>
          </div>
          <p className="md:col-span-2 text-[11px] text-muted-foreground">
            Captured at sign-up and kept in your account metadata. The profiles table has no
            username/date-of-birth columns, so these are read-only here.
          </p>
        </div>
      )}

      {message && (
        <div
          className={`p-3 text-sm rounded-xl text-center ${
            message.type === "success"
              ? "text-green-400 bg-green-950/40 border border-green-500/30"
              : "text-red-400 bg-red-950/40 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="h-12 px-6 rounded-xl bg-gradient-neon text-white font-bold flex items-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Save className="h-5 w-5" />
            Save Changes
          </>
        )}
      </button>
    </form>
  );
}

function SecuritySettings({ updatePassword }: { updatePassword?: (newPassword: string) => Promise<{ error?: string }> }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    try {
      if (updatePassword) {
        const result = await updatePassword(newPassword);
        if (result.error) {
          setMessage({ type: "error", text: result.error });
        } else {
          setMessage({ type: "success", text: "Password updated successfully!" });
          setNewPassword("");
          setConfirmPassword("");
        }
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update password" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handlePasswordChange} className="glass-strong rounded-3xl p-6 space-y-6">
      <h2 className="text-xl font-extrabold flex items-center gap-2">
        <Lock className="h-5 w-5 text-accent" />
        Change Password
      </h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold mb-1 block">New Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-11 px-4 pr-10 rounded-xl glass outline-none focus:pink-glow text-sm"
              placeholder="••••••••"
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold mb-1 block">Confirm Password</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
            placeholder="••••••••"
            minLength={6}
          />
        </div>
      </div>

      {message && (
        <div
          className={`p-3 text-sm rounded-xl text-center ${
            message.type === "success"
              ? "text-green-400 bg-green-950/40 border border-green-500/30"
              : "text-red-400 bg-red-950/40 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !newPassword || !confirmPassword}
        className="h-12 px-6 rounded-xl bg-gradient-neon text-white font-bold flex items-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Lock className="h-5 w-5" />
            Update Password
          </>
        )}
      </button>
    </form>
  );
}

function QuickLinks({ onSignOut, isAdmin }: { onSignOut?: () => void; isAdmin?: boolean }) {
  const links = [
    ...(isAdmin
      ? [
          {
            href: "/admin",
            label: "Admin Dashboard",
            desc: "Manage products, orders, settings, and store analytics",
            icon: LayoutDashboard,
            highlight: true,
          },
        ]
      : []),
    { href: "/orders", label: "My Orders", desc: "View order history and track deliveries", icon: ShoppingBag },
    { href: "/wishlist", label: "My Wishlist", desc: "Your saved products and favorites", icon: Heart },
    { href: "/cart", label: "Shopping Cart", desc: "Review items in your cart", icon: Settings },
  ];

  return (
    <div className="glass-strong rounded-3xl p-6 space-y-6">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-accent" />
          Quick Links
        </h2>

        <div className="space-y-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-4 p-4 rounded-xl transition-all group ${
                link.highlight
                  ? "bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-pink-500/40 pink-glow"
                  : "glass hover:pink-glow"
              }`}
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-neon grid place-items-center shrink-0 group-hover:scale-110 transition-transform">
                <link.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-bold flex items-center gap-2">
                  {link.label}
                  {link.highlight && (
                    <span className="text-[10px] bg-pink-500 text-white px-2 py-0.5 rounded-full font-bold">
                      Admin
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{link.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Account Actions / Sign Out */}
      <div className="pt-4 border-t border-white/10">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Account Actions
        </h3>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 transition-all text-left group"
        >
          <div className="h-12 w-12 rounded-xl bg-red-500/20 text-red-400 grid place-items-center shrink-0 group-hover:scale-110 transition-transform">
            <LogOut className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold text-red-400">Sign Out</p>
            <p className="text-sm text-muted-foreground">Sign out of your Galaxy account on this device</p>
          </div>
        </button>
      </div>
    </div>
  );
}
