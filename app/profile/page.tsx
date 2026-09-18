"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { supabase } from "@/lib/supabaseClient";

export default function ProfilePage() {
  const { user, updatePassword } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

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
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          My Account
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          <span className="text-gradient-neon">My</span> Profile
        </h1>
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
        <QuickLinks />
      )}
    </div>
  );
}

function ProfileInfo({ user }: { user: { id?: string; email?: string; user_metadata?: Record<string, string> } }) {
  const [name, setName] = useState(user.user_metadata?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: name },
      });

      if (authError) {
        setMessage({ type: "error", text: authError.message || "Failed to update profile" });
        return;
      }

      // Update profiles table
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", user.id);

      if (profileError) {
        console.error("Profile table update failed:", profileError);
        // Still show success since auth metadata was updated
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

function QuickLinks() {
  const links = [
    { href: "/orders", label: "My Orders", desc: "View order history and track deliveries", icon: ShoppingBag },
    { href: "/wishlist", label: "My Wishlist", desc: "Your saved products and favorites", icon: Heart },
    { href: "/cart", label: "Shopping Cart", desc: "Review items in your cart", icon: Settings },
  ];

  return (
    <div className="glass-strong rounded-3xl p-6">
      <h2 className="text-xl font-extrabold flex items-center gap-2 mb-6">
        <Settings className="h-5 w-5 text-accent" />
        Quick Links
      </h2>

      <div className="space-y-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-4 p-4 glass rounded-xl hover:pink-glow transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-gradient-neon grid place-items-center shrink-0 group-hover:scale-110 transition-transform">
              <link.icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold">{link.label}</p>
              <p className="text-sm text-muted-foreground">{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
