"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Store, Mail, Phone, MapPin, Megaphone, Share2, Wallet } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import {
  EMPTY_EXTERNAL_WALLET_SETTINGS,
  isExternalWalletSettings,
  type ExternalWalletSettings,
} from "@/app/lib/payment-status";

type SettingsForm = {
  store_name: string;
  support_email: string;
  support_phone: string;
  currency: string;
  free_shipping_threshold: string;
  default_shipping_fee: string;
  announcement: string;
  address: string;
  instagram_url: string;
  facebook_url: string;
  twitter_url: string;
};

const DEFAULTS: SettingsForm = {
  // Displayed as the starting value when no store_name row exists yet.
  // The owner should confirm/replace it — it is saved only when they press Save.
  store_name: "Galaxy Store",
  support_email: "",
  support_phone: "",
  currency: "USD",
  free_shipping_threshold: "0",
  default_shipping_fee: "0",
  announcement: "",
  address: "",
  instagram_url: "",
  facebook_url: "",
  twitter_url: "",
};

export default function AdminSettingsPage() {
  const { getToken } = useAuth();
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [wallet, setWallet] = useState<ExternalWalletSettings>(
    EMPTY_EXTERNAL_WALLET_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setMessage({ type: "error", text: data?.message || "Could not load settings." });
          return;
        }
        if (!cancelled) {
          const settings = data.settings || {};
          setForm({
            store_name: String(settings.store_name ?? DEFAULTS.store_name),
            support_email: String(settings.support_email ?? ""),
            support_phone: String(settings.support_phone ?? ""),
            currency: String(settings.currency ?? "USD"),
            free_shipping_threshold: String(settings.free_shipping_threshold ?? "0"),
            default_shipping_fee: String(settings.default_shipping_fee ?? "0"),
            announcement: String(settings.announcement ?? ""),
            address: String(settings.address ?? ""),
            instagram_url: String(settings.instagram_url ?? ""),
            facebook_url: String(settings.facebook_url ?? ""),
            twitter_url: String(settings.twitter_url ?? ""),
          });
          setWallet(
            isExternalWalletSettings(settings.external_wallet)
              ? settings.external_wallet
              : EMPTY_EXTERNAL_WALLET_SETTINGS
          );
        }
      } catch {
        if (!cancelled) {
          setMessage({ type: "error", text: "Network error while loading settings." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const update = (field: keyof SettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateWallet = (
    field: keyof ExternalWalletSettings,
    value: string | boolean
  ) => {
    setWallet((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            ...form,
            free_shipping_threshold: Number(form.free_shipping_threshold || 0),
            default_shipping_fee: Number(form.default_shipping_fee || 0),
            external_wallet: wallet,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Failed to save settings." });
        return;
      }
      setMessage({ type: "success", text: "Settings saved." });
    } catch {
      setMessage({ type: "error", text: "Network error while saving settings." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-2xl p-6 animate-pulse">
          <div className="h-5 bg-white/[0.05] rounded w-1/3 mb-4" />
          <div className="h-10 bg-white/[0.05] rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Store details shown to customers</p>
      </div>

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

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Store className="w-5 h-5 text-[#FF4FD8]" /> Store profile
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Store name">
            <input
              value={form.store_name}
              onChange={(e) => update("store_name", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Store currency">
            <select
              value={form.currency}
              onChange={(e) => update("currency", e.target.value)}
              className={INPUT_CLASS}
            >
              {["USD", "EGP", "EUR", "GBP", "SAR", "AED"].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Support email">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={form.support_email}
                onChange={(e) => update("support_email", e.target.value)}
                className={`${INPUT_CLASS} pl-10`}
                placeholder="support@example.com"
              />
            </div>
          </Field>
          <Field label="Support phone">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={form.support_phone}
                onChange={(e) => update("support_phone", e.target.value)}
                className={`${INPUT_CLASS} pl-10`}
                placeholder="+20 ..."
              />
            </div>
          </Field>
        </div>

        <Field label="Address">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className={`${INPUT_CLASS} pl-10`}
            />
          </div>
        </Field>

        <Field label="Announcement bar">
          <div className="relative">
            <Megaphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={form.announcement}
              onChange={(e) => update("announcement", e.target.value)}
              className={`${INPUT_CLASS} pl-10`}
              placeholder="Free shipping over ..."
            />
          </div>
        </Field>
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="text-white font-semibold">Shipping display</div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Free shipping threshold">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.free_shipping_threshold}
              onChange={(e) => update("free_shipping_threshold", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Fallback shipping fee">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.default_shipping_fee}
              onChange={(e) => update("default_shipping_fee", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          These values are for display and fallbacks only. Checkout always recalculates the shipping
          fee from the shipping rates table on the server.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Wallet className="w-5 h-5 text-[#FF4FD8]" /> Wallet transfers (e.g. Vodafone Cash)
        </div>
        <p className="text-sm text-gray-400">
          Set the receiving account (such as your Vodafone Cash number) that customers transfer to.
          These details are shown only to authenticated customers at checkout when they choose a
          manual wallet transfer. They are stored privately and are never exposed on the public
          storefront. Uploading a receipt never marks an order paid — you verify each transfer
          under Orders.
        </p>

        <label className="flex items-center gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={wallet.enabled}
            onChange={(e) => updateWallet("enabled", e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
          Enable mobile wallet transfers
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Provider name">
            <input
              value={wallet.provider_name}
              onChange={(e) => updateWallet("provider_name", e.target.value)}
              maxLength={60}
              className={INPUT_CLASS}
              placeholder="e.g. Vodafone Cash"
            />
          </Field>
          <Field label="Account name">
            <input
              value={wallet.account_name}
              onChange={(e) => updateWallet("account_name", e.target.value)}
              maxLength={100}
              className={INPUT_CLASS}
              placeholder="Name on the receiving account"
            />
          </Field>
          <Field label="Account number / handle">
            <input
              value={wallet.account_number}
              onChange={(e) => updateWallet("account_number", e.target.value)}
              maxLength={80}
              className={INPUT_CLASS}
              placeholder="e.g. Vodafone Cash number, IBAN or transfer handle"
            />
          </Field>
          <Field label="Extra instructions (optional)">
            <input
              value={wallet.instructions}
              onChange={(e) => updateWallet("instructions", e.target.value)}
              maxLength={500}
              className={INPUT_CLASS}
              placeholder="e.g. Send as a personal transfer"
            />
          </Field>
        </div>

        {!wallet.enabled && (
          <p className="text-xs text-amber-300">
            Wallet transfers are currently hidden at checkout. Cash on delivery remains available.
          </p>
        )}
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Share2 className="w-5 h-5 text-[#FF4FD8]" /> Social links
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Instagram">
            <input
              value={form.instagram_url}
              onChange={(e) => update("instagram_url", e.target.value)}
              className={INPUT_CLASS}
              placeholder="https://instagram.com/..."
            />
          </Field>
          <Field label="Facebook">
            <input
              value={form.facebook_url}
              onChange={(e) => update("facebook_url", e.target.value)}
              className={INPUT_CLASS}
              placeholder="https://facebook.com/..."
            />
          </Field>
          <Field label="X / Twitter">
            <input
              value={form.twitter_url}
              onChange={(e) => update("twitter_url", e.target.value)}
              className={INPUT_CLASS}
              placeholder="https://x.com/..."
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-semibold hover:shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Not editable here</h3>
        <p className="text-sm text-gray-500">
          Email API keys and admin bootstrap values live in environment variables. Card payment
          providers are disabled in this deployment. The mobile wallet account details you enter
          above are the only payment transfer details stored in the database.
        </p>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
