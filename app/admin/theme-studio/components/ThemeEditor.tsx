"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import type { StoreThemeRow, ThemeConfig } from "@/lib/themes/types";
import { validateThemeConfig } from "@/lib/themes/validate";
import { themeToVariableMap } from "@/lib/themes/css";
import ColorsTab from "./ColorsTab";
import TypographyTab from "./TypographyTab";
import ComponentsTab from "./ComponentsTab";
import ScheduleTab, { type ScheduleDraft } from "./ScheduleTab";
import PreviewTab from "./PreviewTab";
import VersionsTab from "./VersionsTab";
import AssetsTab from "./AssetsTab";
import DecorationsTab from "./DecorationsTab";
import { Alert } from "./editorAlert";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Theme editor shell: a working copy of the theme's config, tab navigation,
 * a live mini-storefront preview driven by the exact CSS variables the
 * storefront will receive, and save through the admin API.
 *
 * The draft is re-validated with the same validateThemeConfig the server
 * runs — the preview can never show something the API would reject.
 */

type ThemeEditorProps = {
  theme: StoreThemeRow;
  getToken: () => Promise<string | null>;
  onSaved: (theme: StoreThemeRow) => void;
};

type TabId =
  | "colors"
  | "typography"
  | "components"
  | "schedule"
  | "decorations"
  | "assets"
  | "preview"
  | "versions";

const TABS: Array<{ id: TabId; labelKey: string }> = [
  { id: "colors", labelKey: "editor.tab.colors" },
  { id: "typography", labelKey: "editor.tab.typography" },
  { id: "components", labelKey: "editor.tab.components" },
  { id: "decorations", labelKey: "editor.tab.decorations" },
  { id: "assets", labelKey: "editor.tab.assets" },
  { id: "schedule", labelKey: "editor.tab.schedule" },
  { id: "preview", labelKey: "editor.tab.preview" },
  { id: "versions", labelKey: "editor.tab.versions" },
];

/** The schedule fields tracked alongside the config in one PATCH. */
function initialSchedule(theme: StoreThemeRow): ScheduleDraft {
  return {
    status: theme.status,
    activation_mode: theme.activation_mode,
    starts_at: theme.starts_at,
    ends_at: theme.ends_at,
    timezone: theme.timezone,
    is_recurring: theme.is_recurring,
    priority: theme.priority,
  };
}

export default function ThemeEditor({ theme, getToken, onSaved }: ThemeEditorProps) {
  const { t } = useAdminT();
  const [draft, setDraft] = useState<ThemeConfig>(() => {
    // A malformed stored config falls back to the built-in default so the
    // editor always opens with something valid on screen.
    const stored = validateThemeConfig(theme.theme_config);
    if (stored.ok) return stored.config;
    const fallback = validateThemeConfig({});
    return fallback.ok ? fallback.config : ({} as ThemeConfig);
  });
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => initialSchedule(theme));
  const [tab, setTab] = useState<TabId>("colors");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Same validator as the server: errors block the save; the preview shows
  // the last valid config so typing never blanks the canvas.
  const validation = useMemo(() => validateThemeConfig(draft), [draft]);
  const previewVars = useMemo(() => {
    if (validation.ok) return themeToVariableMap(validation.config);
    const stored = validateThemeConfig(theme.theme_config);
    return stored.ok ? themeToVariableMap(stored.config) : {};
  }, [validation, theme.theme_config]);

  // Window ordering — the same rule the API enforces (ends_at > starts_at).
  // Kept as a boolean so `t` never enters a memo dependency chain.
  const windowInvalid = useMemo(
    () =>
      Boolean(
        schedule.starts_at &&
          schedule.ends_at &&
          Date.parse(schedule.ends_at) <= Date.parse(schedule.starts_at)
      ),
    [schedule.starts_at, schedule.ends_at]
  );
  const windowError = windowInvalid ? t("editor.msg.windowError") : undefined;

  const scheduleDirty = useMemo(
    () => JSON.stringify(initialSchedule(theme)) !== JSON.stringify(schedule),
    [theme, schedule]
  );

  const dirty = useMemo(() => {
    const stored = validateThemeConfig(theme.theme_config);
    if (!stored.ok) return true;
    return JSON.stringify(stored.config) !== JSON.stringify(draft);
  }, [theme.theme_config, draft]);

  /**
   * The theme row changed underneath the editor (save / publish / restore):
   * refresh every draft the admin sees so what is on screen never drifts
   * from what is stored.
   */
  const handleThemeUpdated = (updated: StoreThemeRow) => {
    onSaved(updated);
    setSchedule(initialSchedule(updated));
    const restored = validateThemeConfig(updated.theme_config);
    if (restored.ok) setDraft(restored.config);
  };

  const handleSave = async () => {
    if (!validation.ok) {
      setMessage({
        type: "error",
        text: t("editor.msg.fixFields").replace("{errors}", validation.errors.join("; ")),
      });
      return;
    }
    if (windowInvalid) {
      setMessage({ type: "error", text: t("editor.msg.windowError") });
      return;
    }
    // Only send schedule fields that actually changed (PATCH is partial).
    const body: Record<string, unknown> = { theme_config: validation.config };
    if (scheduleDirty) {
      const initial = initialSchedule(theme);
      (Object.keys(schedule) as Array<keyof ScheduleDraft>).forEach((key) => {
        if (schedule[key] !== initial[key]) body[key] = schedule[key];
      });
    }
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/${theme.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || t("editor.msg.saveFailed") });
        return;
      }
      setMessage({ type: "success", text: t("editor.msg.saved") });
      handleThemeUpdated(data.theme);
    } catch {
      setMessage({ type: "error", text: t("editor.msg.saveNetwork") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`grid gap-6 items-start ${
        tab === "preview" ? "" : "xl:grid-cols-[1fr_340px]"
      }`}
    >
      {/* Left: tabs + fields */}
      <div className="glass-strong rounded-2xl p-5 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  tab === item.id
                    ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                    : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || (!dirty && !scheduleDirty) || !validation.ok}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? t("editor.action.saving") : t("editor.action.save")}
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
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
            {message.text}
          </div>
        )}

        {!validation.ok && (
          <Alert>
            {(validation.errors.length === 1
              ? t("editor.validation.one")
              : t("editor.validation.many").replace("{n}", String(validation.errors.length))
            )
              .replace("{n}", String(validation.errors.length))
              .replace("{errors}", validation.errors.join(" · "))}
          </Alert>
        )}

        {tab === "colors" && (
          <ColorsTab colors={draft.colors} onChange={(colors) => setDraft({ ...draft, colors })} />
        )}
        {tab === "typography" && (
          <TypographyTab
            typography={draft.typography}
            onChange={(typography) => setDraft({ ...draft, typography })}
          />
        )}
        {tab === "components" && (
          <ComponentsTab
            components={draft.components}
            onChange={(components) => setDraft({ ...draft, components })}
          />
        )}
        {tab === "schedule" && (
          <ScheduleTab value={schedule} onChange={setSchedule} error={windowError} />
        )}
        {tab === "decorations" && (
          <DecorationsTab
            decorations={draft.decorations}
            onChange={(decorations) => setDraft({ ...draft, decorations })}
          />
        )}
        {tab === "assets" && (
          <AssetsTab
            themeId={theme.id}
            assets={draft.assets}
            onChange={(assets) => setDraft({ ...draft, assets })}
            getToken={getToken}
          />
        )}
        {tab === "preview" && (
          <PreviewTab config={validation.ok ? validation.config : draft} themeName={theme.name} />
        )}
        {tab === "versions" && (
          <VersionsTab
            themeId={theme.id}
            getToken={getToken}
            onThemeUpdated={handleThemeUpdated}
          />
        )}
      </div>

      {/* Right: live preview using the real emitted variables (hidden while
          the full iframe preview tab owns the width) */}
      {tab !== "preview" && (
      <div className="glass-strong rounded-2xl p-5 xl:sticky xl:top-24">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          {t("editor.preview.title")}
        </p>
        <div
          className="rounded-2xl overflow-hidden border border-white/10 text-sm"
          style={
            {
              ...previewVars,
              background: "var(--background)",
              color: "var(--foreground)",
              fontFamily: "var(--font-body)",
            } as React.CSSProperties
          }
        >
          {/* mini nav */}
          <div
            className="px-4 py-3 flex items-center justify-between backdrop-blur"
            style={{
              background: "linear-gradient(90deg, var(--nav-from), var(--nav-to))",
              borderBottom: "1px solid var(--nav-border)",
            }}
          >
            <span
              className="font-extrabold"
              style={{ fontFamily: "var(--font-heading)", fontWeight: "var(--font-weight-heading)" }}
            >
              Galaxy
            </span>
            <span className="text-xs opacity-80">{t("editor.preview.nav")}</span>
          </div>

          {/* body */}
          <div className="p-4 space-y-3" style={{ background: "var(--background)" }}>
            <h2
              className="leading-tight"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: "var(--font-weight-heading)",
                fontSize: "var(--h2-size)",
                letterSpacing: "var(--letter-spacing-heading)",
              }}
            >
              {t("editor.preview.heading")}
            </h2>
            <p className="text-xs opacity-75" style={{ fontSize: "var(--font-size-base)" }}>
              {t("editor.preview.body")
                .replace("{font}", draft.typography.bodyFont)
                .replace("{size}", String(draft.typography.baseSize))}
            </p>

            <div className="flex gap-2 pt-1">
              <span
                className="px-3 py-1.5 text-xs font-bold"
                style={{
                  background: "linear-gradient(90deg, var(--brand), var(--brand-2))",
                  color: "var(--primary-foreground)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow-pink)",
                }}
              >
                {t("editor.preview.cta")}
              </span>
              <span
                className="px-3 py-1.5 text-xs"
                style={{
                  background: "var(--card)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                {t("editor.preview.secondary")}
              </span>
            </div>

            {/* glass card */}
            <div
              className="p-3 backdrop-blur"
              style={{
                background: "linear-gradient(135deg, var(--glass-from), var(--glass-to))",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-glass)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-semibold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {t("editor.preview.productCard")}
                </span>
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: "var(--sale-bg)",
                    color: "var(--sale-fg)",
                    borderRadius: "calc(var(--radius) / 2)",
                  }}
                >
                  -20%
                </span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                {t("editor.preview.muted")} ·{" "}
                <span style={{ color: "var(--secondary)" }}>{t("editor.preview.link")}</span> ·{" "}
                <span style={{ color: "var(--success)" }}>{t("editor.preview.ok")}</span> ·{" "}
                <span style={{ color: "var(--warning)" }}>!</span> ·{" "}
                <span style={{ color: "var(--error)" }}>{t("editor.preview.err")}</span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-600 mt-3">{t("editor.preview.note")}</p>
      </div>
      )}
    </div>
  );
}
