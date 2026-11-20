"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useAdminT } from "@/lib/admin-i18n";
import ConfirmDialog from "@/app/components/studio/ConfirmDialog";

type Template = {
  id: string;
  template_key: string;
  name: string;
  name_ar?: string | null;
  category: string;
  dimensions_mm: Record<string, unknown>;
  views: unknown[];
  colors: unknown[];
  sizes: unknown[];
  mockup_format: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
};

/** Editable snapshot — JSON columns travel as text so the admin can fix geometry directly. */
type Draft = {
  id: string;
  name: string;
  name_ar: string;
  category: string;
  sort_order: string;
  views: string;
  colors: string;
  sizes: string;
  dimensions_mm: string;
};

type TmError = { key?: string; field?: string; message?: string; code?: string } | null;

const FIELD_LABEL_KEYS: Record<string, string> = {
  name: "creators.templates.field.name",
  name_ar: "creators.templates.field.nameAr",
  category: "creators.templates.field.category",
  sort_order: "creators.templates.field.sort",
  views: "creators.templates.viewsJson",
  colors: "creators.templates.colorsJson",
  sizes: "creators.templates.sizesJson",
  dimensions_mm: "creators.templates.dimensionsJson",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50";
const LABEL_CLASS = "block text-xs font-semibold text-gray-400 mb-1";

function toDraft(template: Template): Draft {
  return {
    id: template.id,
    name: template.name,
    name_ar: template.name_ar ?? "",
    category: template.category,
    sort_order: String(template.sort_order ?? 0),
    views: JSON.stringify(template.views ?? [], null, 2),
    colors: JSON.stringify(template.colors ?? [], null, 2),
    sizes: JSON.stringify(template.sizes ?? [], null, 2),
    dimensions_mm: JSON.stringify(template.dimensions_mm ?? {}, null, 2),
  };
}

/**
 * Template/area management for the Creator Studio catalog: geometry (views,
 * print areas), color and size variants as validated JSON, plus activation
 * and deletion. `template_key` is immutable here (it namespaces generated
 * mockup folders), and an in-use template answers with the server's
 * deactivate-instead guidance instead of a silent failure.
 */
export default function TemplateManager({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const { t, locale } = useAdminT();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TmError>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/creator-templates", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setError({
            key: data?.message ? undefined : "creators.templates.loadFailed",
            message: data?.message,
            code: data?.code,
          });
          return;
        }
        setTemplates(data.templates || []);
        setError(null);
      } catch {
        if (cancelled) return;
        setError({ key: "creators.templates.network" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const tf = (key: string, vars: Record<string, string>): string => {
    let out = t(key);
    for (const [name, value] of Object.entries(vars)) {
      out = out.replace(`{${name}}`, value);
    }
    return out;
  };

  const fmtDate = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return "—";
    return new Date(time).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const refresh = async (): Promise<void> => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/creator-templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setTemplates(data.templates || []);
        setError(null);
      }
    } catch {
      // The list already on screen stays valid; nothing to surface here.
    }
  };

  const patch = async (
    key: string,
    body: Record<string, unknown>
  ): Promise<boolean> => {
    setBusyKey(key);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/creator-templates", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError({
          key: data?.message ? undefined : "creators.templates.msg.failed",
          message: data?.message,
          code: data?.code,
        });
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError({ key: "creators.templates.network" });
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const toggleActive = async (template: Template): Promise<void> => {
    const ok = await patch(`toggle:${template.id}`, {
      id: template.id,
      is_active: !template.is_active,
    });
    if (ok) await refresh();
  };

  const openEditor = (template: Template): void => {
    setExpandedId(template.id);
    setDraft(toDraft(template));
    setError(null);
  };

  const closeEditor = (): void => {
    setExpandedId(null);
    setDraft(null);
  };

  const setDraftField = (field: keyof Draft, value: string): void => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!draft) return false;

    // JSON syntax is checked here so the admin gets an instant, translated
    // error naming the exact field; shapes are validated by the server.
    const parsed: Record<string, unknown> = {};
    for (const field of ["views", "colors", "sizes", "dimensions_mm"] as const) {
      try {
        parsed[field] = JSON.parse(draft[field]);
      } catch {
        setError({ key: "creators.templates.jsonInvalid", field });
        return false;
      }
    }

    const ok = await patch(`save:${draft.id}`, {
      id: draft.id,
      name: draft.name,
      name_ar: draft.name_ar || null,
      category: draft.category,
      sort_order: Number(draft.sort_order),
      views: parsed.views,
      colors: parsed.colors,
      sizes: parsed.sizes,
      dimensions_mm: parsed.dimensions_mm,
    });
    if (ok) {
      closeEditor();
      await refresh();
    }
    return ok;
  };

  /** Save the draft, then promote it to the published geometry snapshot. */
  const publishGeometry = async (): Promise<void> => {
    if (!draft) return;
    setError(null);
    const saved = await saveDraft();
    if (!saved) return;
    setBusyKey(`publish:${draft.id}`);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/creator-templates/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError({ message: data?.message ?? "Unable to publish template geometry." });
        return;
      }
      await refresh();
    } catch {
      setError({ key: "creators.templates.network" });
    } finally {
      setBusyKey(null);
    }
  };

  const removeTemplate = async (): Promise<void> => {
    if (!deleteTarget) return;
    setBusyKey(`delete:${deleteTarget.id}`);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/admin/creator-templates?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError({
          key:
            data?.code === "template_in_use"
              ? "creators.templates.inUse"
              : data?.message
                ? undefined
                : "creators.templates.msg.failed",
          message: data?.code === "template_in_use" ? undefined : data?.message,
          code: data?.code,
        });
        setDeleteTarget(null);
        return;
      }
      setError(null);
      setTemplates((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) closeEditor();
      setDeleteTarget(null);
    } catch {
      setError({ key: "creators.templates.network" });
      setDeleteTarget(null);
    } finally {
      setBusyKey(null);
    }
  };

  const isMigration = error?.code === "MIGRATION_REQUIRED";

  const renderError = error ? (
    <div
      className={`rounded-2xl border p-4 text-sm ${
        isMigration
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
      }`}
      role="alert"
    >
      {isMigration && (
        <p className="font-semibold mb-1">{t("creators.migration.title")}</p>
      )}
      {error.key
        ? error.field
          ? tf(error.key, { field: t(FIELD_LABEL_KEYS[error.field] ?? error.field) })
          : t(error.key)
        : error.message}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-3 bg-white/[0.05] rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderError}

      {templates.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <AlertTriangle
            className="w-12 h-12 text-gray-600 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-gray-400">{t("creators.templates.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const expanded = expandedId === template.id;
            const toggleBusy = busyKey === `toggle:${template.id}`;
            const saveBusy = busyKey === `save:${template.id}`;
            const deleteBusy = busyKey === `delete:${template.id}`;

            return (
              <div key={template.id} className="glass rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">
                        {template.name_ar || template.name}
                      </p>
                      <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-gray-400">
                        {template.template_key}
                      </code>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          template.is_active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-white/[0.06] text-gray-400"
                        }`}
                      >
                        {template.is_active
                          ? t("creators.templates.active")
                          : t("creators.templates.inactive")}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {t("creators.templates.category")}: {template.category}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-gray-500">
                      <span>{tf("creators.templates.views", { n: String((template.views ?? []).length) })}</span>
                      <span>{tf("creators.templates.colors", { n: String((template.colors ?? []).length) })}</span>
                      <span>{tf("creators.templates.sizes", { n: String((template.sizes ?? []).length) })}</span>
                      <span>{fmtDate(template.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={toggleBusy || saveBusy || deleteBusy}
                      onClick={() => void toggleActive(template)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        template.is_active
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                          : "border-white/10 bg-white/[0.04] text-gray-400 hover:text-white"
                      }`}
                    >
                      {toggleBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : template.is_active ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {template.is_active
                        ? t("creators.templates.active")
                        : t("creators.templates.inactive")}
                    </button>

                    <button
                      type="button"
                      disabled={saveBusy || deleteBusy}
                      onClick={() => (expanded ? closeEditor() : openEditor(template))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      {expanded ? t("creators.templates.close") : t("creators.templates.edit")}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      disabled={toggleBusy || saveBusy || deleteBusy}
                      onClick={() => setDeleteTarget(template)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {t("creators.templates.delete")}
                    </button>
                  </div>
                </div>

                {/* Geometry editor */}
                {expanded && draft && (
                  <div className="mt-4 border-t border-white/[0.08] pt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={LABEL_CLASS} htmlFor={`name-${template.id}`}>
                          {t("creators.templates.field.name")}
                        </label>
                        <input
                          id={`name-${template.id}`}
                          value={draft.name}
                          maxLength={80}
                          onChange={(event) => setDraftField("name", event.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLASS} htmlFor={`name-ar-${template.id}`}>
                          {t("creators.templates.field.nameAr")}
                        </label>
                        <input
                          id={`name-ar-${template.id}`}
                          value={draft.name_ar}
                          maxLength={80}
                          onChange={(event) => setDraftField("name_ar", event.target.value)}
                          className={INPUT_CLASS}
                          dir="rtl"
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLASS} htmlFor={`category-${template.id}`}>
                          {t("creators.templates.field.category")}
                        </label>
                        <input
                          id={`category-${template.id}`}
                          value={draft.category}
                          maxLength={40}
                          onChange={(event) => setDraftField("category", event.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLASS} htmlFor={`sort-${template.id}`}>
                          {t("creators.templates.field.sort")}
                        </label>
                        <input
                          id={`sort-${template.id}`}
                          value={draft.sort_order}
                          inputMode="numeric"
                          onChange={(event) => setDraftField("sort_order", event.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {(
                        [
                          ["views", "viewsJson"],
                          ["colors", "colorsJson"],
                          ["sizes", "sizesJson"],
                          ["dimensions_mm", "dimensionsJson"],
                        ] as Array<[keyof Draft, string]>
                      ).map(([field, labelKey]) => (
                        <div key={field}>
                          <label
                            className={LABEL_CLASS}
                            htmlFor={`${field}-${template.id}`}
                          >
                            {t(labelKey)}
                          </label>
                          <textarea
                            id={`${field}-${template.id}`}
                            value={draft[field]}
                            rows={field === "views" ? 6 : 4}
                            spellCheck={false}
                            onChange={(event) => setDraftField(field, event.target.value)}
                            className={`${INPUT_CLASS} font-mono text-xs resize-y`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={saveBusy}
                        onClick={closeEditor}
                        className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-gray-300 hover:border-white/25 transition-colors disabled:opacity-50"
                      >
                        {t("creators.templates.close")}
                      </button>
                      <button
                        type="button"
                        disabled={saveBusy || deleteBusy}
                        onClick={() => void saveDraft()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-sm font-semibold text-white hover:scale-[1.03] transition-transform disabled:opacity-50 disabled:hover:scale-100"
                      >
                        {saveBusy && (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        )}
                        {saveBusy ? t("creators.templates.saving") : t("creators.templates.save")}
                      </button>
                      <button
                        type="button"
                        disabled={saveBusy || deleteBusy || busyKey?.startsWith("publish:")}
                        onClick={() => void publishGeometry()}
                        title="Validates and promotes this draft to the published geometry used by the studio and mockup renderer."
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300 hover:border-emerald-400/60 transition-colors disabled:opacity-50"
                      >
                        Publish geometry
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("creators.templates.deleteTitle")}
        body={
          deleteTarget
            ? tf("creators.templates.deleteBody", { name: deleteTarget.name })
            : ""
        }
        confirmLabel={t("creators.templates.delete")}
        cancelLabel={t("creators.queue.cancel")}
        danger
        busy={Boolean(busyKey)}
        onConfirm={() => void removeTemplate()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
