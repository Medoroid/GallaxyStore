"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/lib/auth-context";
import type { StoreThemeRow } from "@/lib/themes/types";
import ThemeEditor from "../components/ThemeEditor";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * /admin/theme-studio/[id] — the Theme Editor route. Loads one theme (any
 * status) through the admin API and hands it to ThemeEditor; the list API's
 * 503 THEME_MIGRATION_REQUIRED state is surfaced honestly here too.
 */

type EditorResponse = {
  success: boolean;
  code?: string;
  message?: string;
  theme?: StoreThemeRow;
};

// `text` carries server messages (English API contract); `textKey` is ours.
type LoadError = { text?: string; textKey?: string };

export default function ThemeEditorPage() {
  const { user, getToken } = useAuth();
  const { t } = useAdminT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [theme, setTheme] = useState<StoreThemeRow | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/themes/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data: EditorResponse = await res.json().catch(() => null);
      if (res.status === 503 && data?.code === "THEME_MIGRATION_REQUIRED") {
        setMigrationRequired(true);
        return;
      }
      if (!res.ok || !data?.success || !data.theme) {
        setError({ text: data?.message || undefined, textKey: "studioEditor.notFound" });
        return;
      }
      setTheme(data.theme);
    } catch {
      setError({ textKey: "studioEditor.loadNetwork" });
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Redirect only after auth has resolved. Pushing during render bounced even
  // signed-in admins on the first pass (user starts null while loading=true).
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">
        Login required
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

  if (migrationRequired) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="glass-strong rounded-3xl p-8 border border-amber-500/30">
          <h1 className="text-xl font-extrabold text-white mb-2">{t("admin.migration.title")}</h1>
          <p className="text-sm text-gray-400">
            {t("studioEditor.migration.before")}{" "}
            <code className="text-emerald-300 font-mono">
              supabase/migrations/20261110100000_theme_management.sql
            </code>{" "}
            {t("studioEditor.migration.after")}
          </p>
        </div>
      </div>
    );
  }

  if (error || !theme) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-xl font-extrabold text-white mb-2">{t("studioEditor.unavailable")}</h1>
          <p className="text-sm text-gray-400 mb-4">
            {error?.text ?? (error?.textKey ? t(error.textKey) : t("studioEditor.notFound"))}
          </p>
          <Link
            href="/admin/theme-studio"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("studioEditor.back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/theme-studio"
            className="p-2 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-colors"
            aria-label={t("studioEditor.back")}
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-white">{theme.name}</h1>
            <p className="text-sm text-gray-400">
              <span className="font-mono">/{theme.slug}</span> ·{" "}
              {t(`theme.status.${theme.status}`)} · {t("studioEditor.priority")}{" "}
              {theme.priority}
            </p>
          </div>
        </div>
      </div>

      <ThemeEditor
        theme={theme}
        getToken={getToken}
        onSaved={(updated) => setTheme(updated)}
      />
    </div>
  );
}
