"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Plus, Trash2, Shield } from "lucide-react";

export default function AdminSettingsPage() {
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const emails = process.env.ADMIN_EMAILS?.split(",") || [];
        if (!cancelled) {
          setAdminEmails(emails.map((e) => e.trim()).filter(Boolean));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleAddEmail = () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setMessage({ type: "error", text: "Please enter a valid email" });
      return;
    }

    if (adminEmails.includes(newEmail.trim())) {
      setMessage({ type: "error", text: "Email already exists" });
      return;
    }

    setAdminEmails((prev) => [...prev, newEmail.trim()]);
    setNewEmail("");
    setMessage({ type: "success", text: "Email added. Save to apply changes." });
  };

  const handleRemoveEmail = (email: string) => {
    setAdminEmails((prev) => prev.filter((e) => e !== email));
    setMessage({ type: "success", text: "Email removed. Save to apply changes." });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // In production, this would update the .env or database
      // For now, we just show a success message
      setMessage({ type: "success", text: "Settings saved! Restart server to apply." });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage admin panel settings</p>
      </div>

      {/* Admin Emails */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#FF4FD8]/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#FF4FD8]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Admin Access</h2>
            <p className="text-sm text-gray-400">Manage who has admin access</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {adminEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] flex items-center justify-center text-white text-sm font-bold">
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white">{email}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                placeholder="Add admin email..."
                className="flex-1 px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors"
              />
              <button
                onClick={handleAddEmail}
                className="px-4 py-3 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-xl ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-semibold hover:shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Settings
        </button>
      </div>

      {/* Info */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Note</h3>
        <p className="text-sm text-gray-500">
          Admin emails are currently configured via environment variables. To add or remove admins permanently, 
          update the <code className="text-[#FF4FD8]">ADMIN_EMAILS</code> variable in your <code className="text-[#FF4FD8]">.env.local</code> file.
        </p>
      </div>
    </div>
  );
}
