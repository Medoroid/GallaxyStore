"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Loader2,
  Palette,
  Pin,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import type { StoreThemeRow, ThemeConflict, ThemeSettingsRow } from "@/lib/themes/types";
import { THEME_PRESETS, presetToConfig } from "@/lib/themes/presets";
import ThemeCard from "./components/ThemeCard";
import StatCard from "./components/StatCard";
import AdminLanguageToggle from "@/app/components/AdminLanguageToggle";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Theme Studio dashboard: the inventory of every store theme with its
 * lifecycle state, the conflicts resolution would report right now, and the
 * two resolution controls (default theme + manual override).
 *
 * Honest degraded state: while the theme migration is not applied the list
 * API answers 503 THEME_MIGRATION_REQUIRED and this page says exactly that
 * instead of pretending the feature works.
 */

type ResolvedInfo = { id: string | null; name: string; source: string };

type ListResponse = {
  success: boolean;
  code?: string;
  message?: string;
  themes?: StoreThemeRow[];
  settings?: ThemeSettingsRow | null;
  conflicts?: ThemeConflict[];
  resolved?: ResolvedInfo;
};

// `text` carries server messages (English API contract); `textKey` is used
// for everything the client owns so it re-translates on language toggle.
type Message = { type: "success" | "error"; text?: string; textKey?: string } | null;

const STATUS_FILTERS = ["all", "active", "scheduled", "draft", "archived"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const INPUT_CLASS =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm";

export default function ThemeStudio() {
  const { user, getToken } = useAuth();
  const { t } = useAdminT();
  const router = useRouter();
  const [themes, setThemes] = useState<StoreThemeRow[]>([]);
  const [settings, setSettings] = useState<ThemeSettingsRow | null>(null);
  const [conflicts, setConflicts] = useState<ThemeConflict[]>([]);
  const [resolved, setResolved] = useState<ResolvedInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState<string>("blank");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/themes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data: ListResponse = await res.json().catch(() => null);
      if (res.status === 503 && data?.code === "THEME_MIGRATION_REQUIRED") {
        setMigrationRequired(true);
        return;
      }
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || undefined, textKey: "studio.msg.loadFailed" });
        return;
      }
      setThemes(data.themes ?? []);
      setSettings(data.settings ?? null);
      setConflicts(data.conflicts ?? []);
      setResolved(data.resolved ?? null);
    } catch {
      setMessage({ type: "error", textKey: "studio.msg.loadNetwork" });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleThemes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return themes.filter((theme) => {
      if (statusFilter !== "all" && theme.status !== statusFilter) return false;
      if (!query) return true;
      return (
        theme.name.toLowerCase().includes(query) ||
        theme.slug.includes(query) ||
        theme.category.includes(query)
      );
    });
  }, [themes, search, statusFilter]);

  const stats = useMemo(() => {
    const byStatus = (status: string) => themes.filter((row) => row.status === status).length;
    return {
      total: themes.length,
      active: byStatus("active"),
      scheduled: byStatus("scheduled"),
      draft: byStatus("draft"),
      conflicts: conflicts.length,
    };
  }, [themes, conflicts]);

  /** Run a list-mutating action and refresh from the API. */
  async function runAction(
    actionLabel: string,
    id: string | null,
    fn: (token: string) => Promise<Response>
  ) {
    setBusyId(id ?? "__settings__");
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: t("studio.msg.session") });
        return;
      }
      const res = await fn(token);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || t("studio.msg.fail").replace("{action}", actionLabel),
        });
        return;
      }
      setMessage({ type: "success", text: t("studio.msg.succeed").replace("{action}", actionLabel) });
      await load();
    } catch {
      setMessage({
        type: "error",
        text: t("studio.msg.network").replace("{action}", actionLabel),
      });
    } finally {
      setBusyId(null);
    }
  }

  const handleToggleActive = (theme: StoreThemeRow) =>
    runAction(
      theme.status === "active" ? t("studio.action.deactivate") : t("studio.action.activate"),
      theme.id,
      (token) =>
        fetch(`/api/admin/themes/${theme.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: theme.status === "active" ? "archived" : "active",
          }),
        })
    );

  const handleSetOverride = (theme: StoreThemeRow) =>
    runAction(t("studio.action.override"), theme.id, (token) =>
      fetch("/api/admin/theme-settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ manual_override_theme_id: theme.id }),
      })
    );

  const handleClearOverride = () =>
    runAction(t("studio.action.clearOverride"), null, (token) =>
      fetch("/api/admin/theme-settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ manual_override_theme_id: null }),
      })
    );

  const handleSetDefault = (themeId: string | null) =>
    runAction(t("studio.action.default"), null, (token) =>
      fetch("/api/admin/theme-settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ default_theme_id: themeId }),
      })
    );

  const handleDelete = (theme: StoreThemeRow) => {
    if (
      !confirm(t("studio.msg.deleteConfirm").replace("{name}", theme.name))
    ) {
      return;
    }
    runAction(t("studio.action.delete"), theme.id, (token) =>
      fetch(`/api/admin/themes/${theme.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
    );
  };

  /** Clone into a new draft — the copy never goes live on its own. */
  const handleDuplicate = (theme: StoreThemeRow) =>
    runAction(t("studio.action.duplicate"), theme.id, (token) =>
      fetch(`/api/admin/themes/${theme.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const chosen = THEME_PRESETS.find((preset) => preset.id === newPreset);
    setCreatingBusy(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/themes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // A preset becomes a normal draft config the admin can edit freely.
        body: JSON.stringify(
          chosen ? { name, category: chosen.category, theme_config: presetToConfig(chosen.config) } : { name }
        ),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503 && data?.code === "THEME_MIGRATION_REQUIRED") {
        setMigrationRequired(true);
        return;
      }
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || t("studio.msg.createFailed"),
        });
        return;
      }
      setMessage({
        type: "success",
        text: chosen
          ? t("studio.msg.createdPreset").replace("{name}", name).replace("{preset}", chosen.name)
          : t("studio.msg.createdDraft").replace("{name}", name),
      });
      setNewName("");
      setNewPreset("blank");
      setCreating(false);
      await load();
    } catch {
      setMessage({ type: "error", text: t("studio.msg.createNetwork") });
    } finally {
      setCreatingBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">{t("admin.login.required")}</h1>
          <p className="text-muted-foreground">{t("studio.login.body")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  // Honest state until the owner applies the prepared migration.
  if (migrationRequired) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="glass-strong rounded-3xl p-8 border border-amber-500/30">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <h1 className="text-xl font-extrabold text-white">{t("admin.migration.title")}</h1>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{t("studio.migration.body")}</p>
          <code className="block mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-xs text-emerald-300 font-mono break-all">
            supabase/migrations/20261110100000_theme_management.sql
          </code>
          <p className="text-xs text-gray-500 mt-4">{t("studio.migration.note")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Palette className="w-6 h-6 text-[var(--brand)]" /> {t("studio.header.title")}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{t("studio.header.desc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminLanguageToggle />
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            {creating ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {creating ? t("studio.create.cancel") : t("studio.create.new")}
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {creating && (
        <form onSubmit={handleCreate} className="glass-strong rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("studio.create.namePlaceholder")}
              maxLength={100}
              className={`${INPUT_CLASS} flex-1`}
            />
            <button
              type="submit"
              disabled={creatingBusy || !newName.trim()}
              className="px-5 py-2 rounded-xl bg-[var(--brand)] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
            >
              {creatingBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("studio.create.submit")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setNewPreset("blank")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                newPreset === "blank"
                  ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
              }`}
            >
              {t("studio.create.blank")}
            </button>
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => {
                  setNewPreset(preset.id);
                  if (!newName.trim()) setNewName(preset.name);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  newPreset === preset.id
                    ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                    : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
          {newPreset !== "blank" && (
            <p className="text-xs text-gray-500">
              {t("studio.create.presetNote").replace(
                "{description}",
                THEME_PRESETS.find((preset) => preset.id === newPreset)?.description ?? ""
              )}
            </p>
          )}
        </form>
      )}

      {/* Messages */}
      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {message.text ?? (message.textKey ? t(message.textKey) : null)}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label={t("studio.stat.themes")} value={stats.total} icon={Palette} />
        <StatCard
          label={t("studio.stat.active")}
          value={stats.active}
          icon={Sparkles}
          accent="#34d399"
          hint={
            resolved?.source === "scheduled"
              ? t("studio.stat.nowLive").replace("{name}", resolved.name)
              : undefined
          }
        />
        <StatCard
          label={t("studio.stat.scheduled")}
          value={stats.scheduled}
          icon={Sparkles}
          accent="#38bdf8"
        />
        <StatCard label={t("studio.stat.drafts")} value={stats.draft} icon={Plus} accent="#9ca3af" />
        <StatCard
          label={t("studio.stat.conflicts")}
          value={stats.conflicts}
          icon={AlertTriangle}
          accent={stats.conflicts > 0 ? "#fbbf24" : "#34d399"}
        />
      </div>

      {/* Conflicts panel — only when resolution has competing themes */}
      {conflicts.length > 0 && (
        <div className="glass-strong rounded-2xl p-5 border border-amber-500/30">
          <h2 className="font-bold text-white flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {t("studio.conflicts.title").replace("{count}", String(conflicts.length))}
          </h2>
          <ul className="space-y-2">
            {conflicts.map((conflict) => {
              const winner =
                conflict.winnerId === conflict.a.id ? conflict.a : conflict.b;
              const loser = winner === conflict.a ? conflict.b : conflict.a;
              return (
                <li key={`${conflict.a.id}-${conflict.b.id}`} className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{winner.name}</span>{" "}
                  {t("studio.conflicts.row")
                    .replace("{loser}", loser.name)
                    .replace("{a}", String(winner.priority))
                    .replace("{b}", String(loser.priority))}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Resolution controls */}
      <div className="glass-strong rounded-2xl p-5">
        <h2 className="font-bold text-white flex items-center gap-2 mb-4">
          <Crown className="w-4 h-4 text-[var(--brand)]" /> {t("studio.resolution.title")}
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">
              {t("studio.resolution.defaultLabel")}
            </label>
            <select
              value={settings?.default_theme_id ?? ""}
              onChange={(e) => handleSetDefault(e.target.value || null)}
              disabled={busyId === "__settings__"}
              className={INPUT_CLASS}
            >
              <option value="">{t("studio.resolution.builtinOption")}</option>
              {themes
                .filter((row) => row.status !== "archived")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">
              {t("studio.resolution.overrideLabel")}
            </label>
            <div className="flex gap-2">
              <select
                value={settings?.manual_override_theme_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    handleClearOverride();
                  } else {
                    const overrideTheme = themes.find((row) => row.id === id);
                    if (overrideTheme) handleSetOverride(overrideTheme);
                  }
                }}
                disabled={busyId === "__settings__"}
                className={INPUT_CLASS}
              >
                <option value="">{t("studio.resolution.noOverride")}</option>
                {themes
                  .filter((row) => row.status !== "archived")
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              {settings?.manual_override_theme_id && (
                <button
                  onClick={handleClearOverride}
                  disabled={busyId === "__settings__"}
                  title={t("studio.resolution.clearTitle")}
                  className="px-3 py-2 rounded-xl bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-colors text-xs font-bold shrink-0 inline-flex items-center gap-1"
                >
                  <Pin className="w-3.5 h-3.5" /> {t("studio.resolution.clear")}
                </button>
              )}
            </div>
          </div>
        </div>
        {settings?.manual_override_theme_id && (
          <p className="text-xs text-fuchsia-300/80 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("studio.resolution.overrideActive")}
          </p>
        )}
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("studio.search.placeholder")}
            className={`${INPUT_CLASS} ps-9`}
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
              }`}
            >
              {t(`studio.filter.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Theme grid */}
      {visibleThemes.length === 0 ? (
        <div className="glass-strong rounded-2xl p-10 text-center">
          <Palette className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {themes.length === 0 ? t("studio.empty.noneTitle") : t("studio.empty.noMatchTitle")}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {themes.length === 0 ? t("studio.empty.noneBody") : t("studio.empty.noMatchBody")}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isLive={resolved?.id === theme.id}
              isDefault={settings?.default_theme_id === theme.id}
              isOverride={settings?.manual_override_theme_id === theme.id}
              busy={busyId === theme.id}
              onEdit={(row) => router.push(`/admin/theme-studio/${row.id}`)}
              onDuplicate={handleDuplicate}
              onToggleActive={handleToggleActive}
              onSetOverride={handleSetOverride}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
