"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Clock, Loader2, Plus, Rocket, Undo2 } from "lucide-react";
import type { StoreThemeRow } from "@/lib/themes/types";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Versions tab — snapshot / publish / restore.
 *
 * Publishing snapshots the current state, then moves the theme to its live
 * status (`active`, or `scheduled` when a window is set). Restoring copies an
 * old snapshot back onto the theme and appends a NEW version, so a restore
 * is itself undoable. Both actions hit the dedicated endpoints
 * (`/publish`, `/versions`) — this component never assembles mutations.
 */

type VersionRow = {
  id: string;
  version: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type VersionsTabProps = {
  themeId: string;
  getToken: () => Promise<string | null>;
  onThemeUpdated: (theme: StoreThemeRow) => void;
};

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionsTab({ themeId, getToken, onThemeUpdated }: VersionsTabProps) {
  const { t, locale } = useAdminT();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/${themeId}/versions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setVersions(data.versions ?? []);
    } catch {
      /* transient — the list stays as-is */
    } finally {
      setLoading(false);
    }
  }, [themeId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  /** `id` identifies the in-flight action; `actionLabel` is what the admin reads. */
  async function post(id: string, actionLabel: string, body: Record<string, unknown>) {
    setBusy(id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/${themeId}/versions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || t("versions.msg.fail").replace("{action}", actionLabel),
        });
        return;
      }
      setMessage({ type: "success", text: t("versions.msg.done").replace("{action}", actionLabel) });
      setNote("");
      await load();
    } catch {
      setMessage({ type: "error", text: t("versions.msg.network").replace("{action}", actionLabel) });
    } finally {
      setBusy(null);
    }
  }

  const handleSnapshot = () =>
    post("Snapshot", t("versions.action.snapshot"), { note: note.trim() || undefined });

  const handleRestore = (version: number) => {
    const actionLabel = t("versions.action.restoreVersion").replace("{v}", String(version));
    if (!confirm(t("versions.confirm.restore").replace("{v}", String(version)))) {
      return;
    }
    post(`Restore v${version}`, actionLabel, { restore: version });
  };

  const handlePublish = async () => {
    const actionLabel = t("versions.action.publish");
    setBusy("publish");
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/${themeId}/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({
          type: "error",
          text: data?.message || t("versions.msg.fail").replace("{action}", actionLabel),
        });
        return;
      }
      setMessage({
        type: "success",
        text: t("versions.msg.published")
          .replace("{v}", String(data.version))
          .replace("{status}", t(`theme.status.${data.theme.status}`)),
      });
      setNote("");
      onThemeUpdated(data.theme);
      await load();
    } catch {
      setMessage({ type: "error", text: t("versions.msg.network").replace("{action}", actionLabel) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("versions.note.placeholder")}
            maxLength={300}
            className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSnapshot}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-xs font-bold disabled:opacity-50"
            >
              {busy === "Snapshot" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {t("versions.action.snapshot")}
            </button>
            <button
              onClick={handlePublish}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              title={t("versions.action.publishTitle")}
            >
              {busy === "publish" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Rocket className="w-3.5 h-3.5" />
              )}
              {t("versions.action.publish")}
            </button>
          </div>
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
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
        </div>
      ) : versions.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Archive className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400 font-medium">{t("versions.empty.title")}</p>
          <p className="text-xs text-gray-500 mt-1">{t("versions.empty.body")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  v{version.version}
                  {version.note ? (
                    <span className="font-normal text-gray-400"> — {version.note}</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> {formatDate(version.created_at, locale)}
                </p>
              </div>
              <button
                onClick={() => handleRestore(version.version)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-xs font-semibold disabled:opacity-50 shrink-0"
                title={t("versions.action.restoreTitle")}
              >
                {busy === `Restore v${version.version}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Undo2 className="w-3.5 h-3.5" />
                )}
                {t("versions.action.restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
