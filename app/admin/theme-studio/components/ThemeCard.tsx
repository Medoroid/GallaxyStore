"use client";

import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Crown,
  Loader2,
  Pencil,
  Pin,
  Power,
  Archive,
  Trash2,
} from "lucide-react";
import type { StoreThemeRow } from "@/lib/themes/types";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * One theme in the Theme Studio grid: identity, lifecycle badge, schedule
 * window, priority, and the quick actions every admin needs (open editor,
 * duplicate, activate/archive, pin override, delete). Visual-only; all writes
 * go through the parent page so exactly one request is in flight at a time.
 */

type ThemeCardProps = {
  theme: StoreThemeRow;
  isLive: boolean;
  isDefault: boolean;
  isOverride: boolean;
  busy: boolean;
  onEdit: (theme: StoreThemeRow) => void;
  onDuplicate: (theme: StoreThemeRow) => void;
  onToggleActive: (theme: StoreThemeRow) => void;
  onSetOverride: (theme: StoreThemeRow) => void;
  onDelete: (theme: StoreThemeRow) => void;
};

const STATUS_STYLES: Record<string, { labelKey: string; className: string }> = {
  active: { labelKey: "theme.status.active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  scheduled: { labelKey: "theme.status.scheduled", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  draft: { labelKey: "theme.status.draft", className: "bg-white/[0.06] text-gray-400 border-white/10" },
  archived: { labelKey: "theme.status.archived", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export default function ThemeCard({
  theme,
  isLive,
  isDefault,
  isOverride,
  busy,
  onEdit,
  onDuplicate,
  onToggleActive,
  onSetOverride,
  onDelete,
}: ThemeCardProps) {
  const { t, locale } = useAdminT();
  const status = STATUS_STYLES[theme.status] ?? STATUS_STYLES.draft;
  const scheduled = theme.activation_mode === "scheduled";
  const hasWindow = Boolean(theme.starts_at || theme.ends_at);

  return (
    <div
      className={`glass-strong rounded-2xl p-5 flex flex-col gap-4 transition-all ${
        isLive ? "border border-[var(--brand)]/40 shadow-[0_0_24px_rgba(0,0,0,0.25)]" : "border border-white/[0.06]"
      }`}
    >
      {/* Header: name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white truncate">{theme.name}</h3>
            {isLive ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand)]/15 text-[var(--brand)] border border-[var(--brand)]/30">
                <CheckCircle2 className="w-3 h-3" /> {t("theme.badge.live")}
              </span>
            ) : null}
            {isDefault ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300 border border-white/10">
                <Crown className="w-3 h-3" /> {t("theme.badge.default")}
              </span>
            ) : null}
            {isOverride ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30">
                <Pin className="w-3 h-3" /> {t("theme.badge.override")}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono truncate">/{theme.slug}</p>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border shrink-0 ${status.className}`}
        >
          {t(status.labelKey)}
        </span>
      </div>

      {/* Meta: category, priority, schedule */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <p className="text-gray-500">{t("theme.meta.category")}</p>
          <p className="text-gray-200 font-medium truncate">{theme.category}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
          <p className="text-gray-500">{t("theme.meta.priority")}</p>
          <p className="text-gray-200 font-medium">{theme.priority}</p>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 col-span-2 flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <p className="text-gray-300 truncate">
            {scheduled && hasWindow
              ? `${formatDate(theme.starts_at, locale)} → ${formatDate(theme.ends_at, locale)}${
                  theme.is_recurring ? ` · ${t("theme.meta.yearly")}` : ""
                }`
              : scheduled
                ? t("theme.meta.alwaysScheduled")
                : t("theme.meta.manualActivation")}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => onEdit(theme)}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand)]/15 text-[var(--brand)] hover:bg-[var(--brand)]/25 transition-colors text-xs font-semibold disabled:opacity-50"
        >
          <Pencil className="w-3.5 h-3.5" /> {t("theme.action.edit")}
        </button>
        <button
          onClick={() => onDuplicate(theme)}
          disabled={busy}
          title={t("theme.action.duplicateTitle")}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-xs font-semibold disabled:opacity-50"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onToggleActive(theme)}
          disabled={busy}
          title={
            theme.status === "active" ? t("theme.action.deactivateTitle") : t("theme.action.activateTitle")
          }
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-xs font-semibold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : theme.status === "active" ? (
            <Archive className="w-3.5 h-3.5" />
          ) : (
            <Power className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={() => onSetOverride(theme)}
          disabled={busy || isOverride}
          title={isOverride ? t("theme.action.alreadyOverride") : t("theme.action.pinOverride")}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-xs font-semibold disabled:opacity-50"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(theme)}
          disabled={busy}
          title={t("theme.action.deleteTitle")}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-semibold disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
