"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import type { ThemeAssets } from "@/lib/themes/types";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Assets tab — two halves of the same job:
 *
 * 1. Text/URL config for the seasonal banner and backgrounds (edited here,
 *    validated by validateThemeConfig on save like every other field);
 * 2. Uploads into the public `theme-assets` bucket, with one-click "Use in
 *    theme" that writes the returned URL into the matching config field —
 *    no copy/paste, no broken paths.
 */

type AssetRow = {
  id: string;
  theme_id: string;
  asset_type: string;
  asset_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type AssetsTabProps = {
  themeId: string;
  assets: ThemeAssets;
  onChange: (assets: ThemeAssets) => void;
  getToken: () => Promise<string | null>;
};

const ASSET_TYPES = [
  { value: "banner_desktop", labelKey: "assets.type.bannerDesktop" },
  { value: "banner_mobile", labelKey: "assets.type.bannerMobile" },
  { value: "background_desktop", labelKey: "assets.type.backgroundDesktop" },
  { value: "background_mobile", labelKey: "assets.type.backgroundMobile" },
  { value: "icon", labelKey: "assets.type.icon" },
  { value: "logo", labelKey: "assets.type.logo" },
  { value: "artwork", labelKey: "assets.type.artwork" },
] as const;

/** Which config field an uploaded asset type fills (null = upload only). */
const TYPE_TO_FIELD: Partial<Record<string, keyof ThemeAssets>> = {
  banner_desktop: "bannerDesktop",
  banner_mobile: "bannerMobile",
  background_desktop: "backgroundDesktop",
  background_mobile: "backgroundMobile",
};

const URL_FIELDS: Array<{ key: keyof ThemeAssets; labelKey: string }> = [
  { key: "bannerDesktop", labelKey: "assets.url.bannerDesktop" },
  { key: "bannerMobile", labelKey: "assets.url.bannerMobile" },
  { key: "backgroundDesktop", labelKey: "assets.url.backgroundDesktop" },
  { key: "backgroundMobile", labelKey: "assets.url.backgroundMobile" },
];

const INPUT_CLASS =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm";

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 block mb-1.5">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} font-mono text-xs`}
      />
    </label>
  );
}

export default function AssetsTab({ themeId, assets, onChange, getToken }: AssetsTabProps) {
  const { t } = useAdminT();
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<string>("banner_desktop");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/assets?theme_id=${themeId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setRows(data.assets ?? []);
    } catch {
      /* transient */
    } finally {
      setLoading(false);
    }
  }, [themeId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof ThemeAssets, value: string) =>
    onChange({ ...assets, [key]: value });

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      form.append("theme_id", themeId);
      form.append("asset_type", assetType);
      const res = await fetch("/api/admin/themes/assets", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || t("assets.msg.uploadFailed"),
        });
        return;
      }
      setMessage({ type: "success", text: t("assets.msg.uploaded").replace("{name}", file.name) });
      await load();
    } catch {
      setMessage({ type: "error", text: t("assets.msg.uploadNetwork") });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(asset: AssetRow) {
    if (!confirm(t("assets.msg.deleteConfirm"))) return;
    setBusyId(asset.id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/assets?id=${asset.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || t("assets.msg.deleteFailed") });
        return;
      }
      setMessage({ type: "success", text: t("assets.msg.deleted") });
      await load();
    } catch {
      setMessage({ type: "error", text: t("assets.msg.deleteNetwork") });
    } finally {
      setBusyId(null);
    }
  }

  function attachAsset(asset: AssetRow) {
    const field = TYPE_TO_FIELD[asset.asset_type];
    if (!field) return;
    set(field, asset.asset_url);
    setMessage({
      type: "success",
      text: t("assets.msg.attached").replace("{field}", field),
    });
  }

  return (
    <div className="space-y-6">
      {/* Banner content */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">{t("assets.banner.title")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t("assets.banner.desc")}</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={assets.bannerEnabled}
            onChange={(e) => onChange({ ...assets, bannerEnabled: e.target.checked })}
            className="w-4 h-4 accent-[var(--brand)]"
          />
          <span className="text-sm text-gray-200">{t("assets.banner.show")}</span>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <LabeledField
            label={t("assets.field.bannerTitle")}
            value={assets.bannerTitle}
            onChange={(v) => set("bannerTitle", v)}
            placeholder={t("assets.field.bannerTitle.hint")}
          />
          <LabeledField
            label={t("assets.field.bannerSubtitle")}
            value={assets.bannerSubtitle}
            onChange={(v) => set("bannerSubtitle", v)}
            placeholder={t("assets.field.bannerSubtitle.hint")}
          />
          <LabeledField
            label={t("assets.field.bannerLink")}
            value={assets.bannerLink}
            onChange={(v) => set("bannerLink", v)}
            placeholder={t("assets.field.bannerLink.hint")}
          />
          <LabeledField
            label={t("assets.field.announcement")}
            value={assets.announcement}
            onChange={(v) => set("announcement", v)}
            placeholder={t("assets.field.announcement.hint")}
          />
        </div>
      </section>

      {/* File URLs */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">{t("assets.urls.title")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t("assets.urls.desc")}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {URL_FIELDS.map((field) => (
            <LabeledField
              key={field.key}
              label={t(field.labelKey)}
              value={String(assets[field.key] ?? "")}
              onChange={(v) => set(field.key, v)}
              placeholder="https://…"
            />
          ))}
        </div>
      </section>

      {/* Uploads */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">{t("assets.uploads.title")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {t("assets.uploads.descA")}
            <code className="font-mono">theme-assets</code>
            {t("assets.uploads.descB")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className={`${INPUT_CLASS} sm:w-56`}
          >
            {ASSET_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {t(type.labelKey)}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand)]/15 text-[var(--brand)] hover:bg-[var(--brand)]/25 transition-colors text-sm font-bold cursor-pointer disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? t("assets.upload.uploading") : t("assets.upload.choose")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>

        {message && (
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--brand)]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
            <ImagePlus className="w-7 h-7 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{t("assets.list.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.asset_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover bg-black/30 border border-white/10 shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {t(
                      ASSET_TYPES.find((type) => type.value === asset.asset_type)?.labelKey ??
                        ""
                    ) || asset.asset_type}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate font-mono">{asset.asset_url}</p>
                </div>
                <button
                  onClick={() => attachAsset(asset)}
                  disabled={busyId === asset.id || !TYPE_TO_FIELD[asset.asset_type]}
                  className="px-3 py-1.5 rounded-lg bg-[var(--brand)]/15 text-[var(--brand)] hover:bg-[var(--brand)]/25 transition-colors text-xs font-bold shrink-0 disabled:opacity-50"
                  title={
                    TYPE_TO_FIELD[asset.asset_type]
                      ? t("assets.action.useTitle")
                      : t("assets.action.noFieldTitle")
                  }
                >
                  {t("assets.action.use")}
                </button>
                <button
                  onClick={() => handleDelete(asset)}
                  disabled={busyId === asset.id}
                  className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0 disabled:opacity-50"
                  aria-label={t("assets.action.deleteAria")}
                >
                  {busyId === asset.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
