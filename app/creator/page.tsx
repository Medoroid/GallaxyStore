"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Images,
  LayoutDashboard,
  Loader2,
  Package,
  Palette,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { useLanguage } from "../lib/language-context";
import { SOCIAL_LINK_KEYS } from "@/lib/creator/profile-validation";
import { formatDate, designPreviewUrl } from "@/lib/creator/media";

type DesignStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "archived";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  is_featured: boolean;
  is_active: boolean;
  can_publish: boolean;
  created_at: string;
  updated_at: string;
};

type DesignRow = {
  id: string;
  title: string;
  status: DesignStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  download_count: number;
};

type ProductRow = {
  id: string;
  status: DesignStatus;
  rejection_reason: string | null;
  design_id: string;
  product_id: string | null;
  fulfillment_mode: "unconfigured" | "configured";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  template: {
    template_key: string;
    name: string;
    name_ar: string | null;
    mockup_format: string;
  } | null;
  design: { id: string; title: string; status: DesignStatus } | null;
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    visibility: string;
  } | null;
};

type GalleryRow = {
  id: string;
  title: string;
  status: DesignStatus;
  rejection_reason: string | null;
  visibility: string;
  preview_path: string | null;
  tags: string[];
  product_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type Stats = {
  designs: number;
  products: number;
  gallery: number;
  published_products: number;
  pending: number;
  rejected: number;
};

type DashboardData = {
  profile: Profile | null;
  stats: Stats;
  sections: {
    designs: { items: DesignRow[]; total: number };
    products: { items: ProductRow[]; total: number };
    gallery: { items: GalleryRow[]; total: number };
  };
};

const TAB_KEYS = [
  "overview",
  "designs",
  "products",
  "gallery",
  "drafts",
  "pending",
  "rejected",
  "settings",
] as const;

type TabKey = (typeof TAB_KEYS)[number];

type TFunction = (key: string) => string;

const TABS: Array<{ key: TabKey; labelKey: string; icon: LucideIcon }> = [
  { key: "overview", labelKey: "creator_overview", icon: LayoutDashboard },
  { key: "designs", labelKey: "creator_tab_designs", icon: Palette },
  { key: "products", labelKey: "creator_tab_products", icon: Package },
  { key: "gallery", labelKey: "creator_tab_gallery", icon: Images },
  { key: "drafts", labelKey: "creator_tab_drafts", icon: FileText },
  { key: "pending", labelKey: "creator_tab_pending", icon: Clock },
  { key: "rejected", labelKey: "creator_tab_rejected", icon: XCircle },
  { key: "settings", labelKey: "creator_tab_settings", icon: Settings },
];

const STATUS_STYLES: Record<DesignStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  pending_review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  archived: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

const KIND_ICONS: Record<string, LucideIcon> = {
  design: Palette,
  product: Package,
  gallery: Images,
};

const KIND_LABELS: Record<string, string> = {
  design: "creator_tab_designs",
  product: "creator_tab_products",
  gallery: "creator_tab_gallery",
};

function isTabKey(value: string | null): value is TabKey {
  return Boolean(value) && (TAB_KEYS as readonly string[]).includes(value as string);
}

function StatusBadge({ status, t }: { status: DesignStatus; t: TFunction }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex shrink-0 items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${style}`}
    >
      {t(`status_${status}`)}
    </span>
  );
}

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="text-center py-14 px-6">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function CountNote({
  shown,
  total,
}: {
  shown: number;
  total: number;
}) {
  if (total <= shown) return null;
  return (
    <p className="text-xs text-muted-foreground mt-3 text-center">
      {shown} / {total}
    </p>
  );
}

type MergedItem = {
  kind: "design" | "product" | "gallery";
  id: string;
  title: string;
  status: DesignStatus;
  reason: string | null;
  date: string | null;
};

export default function CreatorDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-secondary" />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { user, loading: authLoading, getToken } = useAuth();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const tab: TabKey = isTabKey(rawTab) ? rawTab : "overview";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    display_name: "",
    bio: "",
  });
  const [social, setSocial] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    message?: string;
    errors?: Record<string, string>;
  }>({ kind: "idle" });

  // Re-fetch trigger for retry and post-save refresh: the effect below owns
  // the fetch (inline, wishlist-style) so no stateful call runs synchronously
  // in the effect body, and the identity churn of `getToken` (the auth
  // provider re-renders on cart changes) never re-triggers a load.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const fetchDashboard = async () => {
      try {
        const token = await getToken();
        setError(null);
        const res = await fetch("/api/creator/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!payload?.success) {
          throw new Error(payload?.message || "Request failed");
        }
        if (cancelled) return;
        setData(payload as DashboardData);
        if (payload.profile) {
          setForm({
            username: payload.profile.username ?? "",
            display_name: payload.profile.display_name ?? "",
            bio: payload.profile.bio ?? "",
          });
          setSocial({ ...(payload.profile.social_links ?? {}) });
        }
        setDirty(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, getToken, reload]);

  // Real unsaved-changes guard while the settings form is edited.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setTab = useCallback(
    (next: TabKey) => {
      router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, {
        scroll: false,
      });
    },
    [router, pathname]
  );

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaveState({ kind: "saving" });
    try {
      const token = await getToken();
      const socialLinks = Object.fromEntries(
        Object.entries(social)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value !== "")
      );
      const res = await fetch("/api/creator/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username.trim().toLowerCase(),
          display_name: form.display_name.trim(),
          bio: form.bio.trim(),
          social_links: socialLinks,
        }),
      });
      const payload = await res.json();
      if (!payload?.success) {
        setSaveState({
          kind: "error",
          message: payload?.message || t("common_error"),
          errors: payload?.errors,
        });
        return;
      }
      setSaveState({ kind: "saved", message: t("creator_profile_saved") });
      // Refresh from the server so normalized values (lowercased username,
      // derived defaults) replace what was typed.
      setDirty(false);
      setReload((current) => current + 1);
    } catch {
      setSaveState({ kind: "error", message: t("common_error") });
    }
  };

  const mergedItems = useMemo<MergedItem[]>(() => {
    if (!data) return [];
    const wanted: DesignStatus =
      tab === "drafts" ? "draft" : tab === "pending" ? "pending_review" : "rejected";
    const items: MergedItem[] = [];
    for (const row of data.sections.designs.items) {
      items.push({
        kind: "design",
        id: row.id,
        title: row.title,
        status: row.status,
        reason: row.rejection_reason,
        date: row.updated_at,
      });
    }
    for (const row of data.sections.products.items) {
      items.push({
        kind: "product",
        id: row.id,
        title: row.design?.title ?? row.template?.name ?? "—",
        status: row.status,
        reason: row.rejection_reason,
        date: row.updated_at,
      });
    }
    for (const row of data.sections.gallery.items) {
      items.push({
        kind: "gallery",
        id: row.id,
        title: row.title,
        status: row.status,
        reason: row.rejection_reason,
        date: row.updated_at,
      });
    }
    return items
      .filter((item) => item.status === wanted)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [data, tab]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <Palette className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">{t("nav_login")}</h1>
          <p className="text-muted-foreground mb-4">
            {t("creator_login_required")}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            {t("nav_login")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <AlertTriangle className="h-14 w-14 mx-auto text-amber-400 mb-4" />
          <h1 className="text-xl font-extrabold mb-2">{t("common_error")}</h1>
          <p className="text-muted-foreground text-sm mb-5 break-words">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setReload((current) => current + 1);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            <RefreshCw className="h-4 w-4" />
            {t("common_retry")}
          </button>
        </div>
      </div>
    );
  }

  const profile = data?.profile ?? null;

  // First visit: no persona yet — the onboarding form is the whole page.
  if (data && !profile) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-28 pb-20">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
            {t("creator_dashboard")}
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold">
            <span className="text-gradient-neon">{t("creator_no_profile_title")}</span>
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            {t("creator_no_profile_body")}
          </p>
        </div>

        <form onSubmit={saveProfile} className="glass-strong rounded-3xl p-6 space-y-5">
          <SaveBanner saveState={saveState} t={t} />
          <Field
            label={t("creator_username")}
            hint={t("creator_username_hint")}
            error={saveState.errors?.username}
          >
            <input
              type="text"
              value={form.username}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, username: event.target.value }));
                setDirty(true);
              }}
              placeholder="your_name"
              autoComplete="username"
              className={INPUT_CLASS}
              required
            />
          </Field>
          <Field label={t("creator_display_name")} error={saveState.errors?.display_name}>
            <input
              type="text"
              value={form.display_name}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, display_name: event.target.value }));
                setDirty(true);
              }}
              placeholder="Your Name"
              className={INPUT_CLASS}
              required
            />
          </Field>
          <Field label={t("creator_bio")} error={saveState.errors?.bio}>
            <textarea
              value={form.bio}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, bio: event.target.value }));
                setDirty(true);
              }}
              rows={3}
              maxLength={500}
              placeholder="…"
              className={INPUT_CLASS}
            />
          </Field>
          <button
            type="submit"
            disabled={saveState.kind === "saving"}
            className="w-full px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {saveState.kind === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t("creator_create_profile")}
          </button>
        </form>
      </div>
    );
  }

  const stats = data?.stats;
  const sections = data?.sections;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
            {t("creator_dashboard")}
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold">
            <span className="text-gradient-neon">{profile?.display_name}</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            @{profile?.username}
            {profile?.is_featured ? " · ★" : ""}
          </p>
        </div>
        {profile && (
          <Link
            href={`/creators/${profile.username}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold hover:border-pink-500/40 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            {t("creator_view_public_profile")}
          </Link>
        )}
      </div>

      {!profile?.can_publish && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("creator_publishing_disabled")}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-8 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                tab === key
                  ? "bg-gradient-neon text-white"
                  : "border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white hover:border-white/20"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
              {key === "pending" && (stats?.pending ?? 0) > 0 && (
                <span className="ms-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/25 text-amber-200">
                  {stats?.pending}
                </span>
              )}
              {key === "rejected" && (stats?.rejected ?? 0) > 0 && (
                <span className="ms-1 text-xs px-1.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200">
                  {stats?.rejected}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {saveState.kind === "saved" && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("creator_profile_saved")}
        </div>
      )}
      {saveState.kind === "error" && saveState.message && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {saveState.message}
        </div>
      )}

      {/* Overview */}
      {tab === "overview" && stats && sections && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Palette}
              value={stats.designs}
              label={t("creator_stat_designs")}
            />
            <StatCard
              icon={Package}
              value={stats.published_products}
              label={t("creator_stat_published_products")}
            />
            <StatCard
              icon={Images}
              value={stats.gallery}
              label={t("creator_stat_gallery")}
            />
            <StatCard
              icon={Clock}
              value={stats.pending}
              label={t("creator_stat_pending")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <RecentList
              title={t("creator_tab_designs")}
              emptyMessage={t("creator_empty_designs")}
              onShowAll={() => setTab("designs")}
              t={t}
            >
              {sections.designs.items.slice(0, 5).map((row) => (
                <MiniRow
                  key={row.id}
                  title={row.title}
                  status={row.status}
                  date={row.updated_at}
                  locale={locale}
                  t={t}
                />
              ))}
            </RecentList>
            <RecentList
              title={t("creator_tab_products")}
              emptyMessage={t("creator_empty_products")}
              onShowAll={() => setTab("products")}
              t={t}
            >
              {sections.products.items.slice(0, 5).map((row) => (
                <MiniRow
                  key={row.id}
                  title={row.design?.title ?? row.template?.name ?? "—"}
                  status={row.status}
                  date={row.updated_at}
                  locale={locale}
                  t={t}
                />
              ))}
            </RecentList>
            <RecentList
              title={t("creator_tab_gallery")}
              emptyMessage={t("creator_empty_gallery")}
              onShowAll={() => setTab("gallery")}
              t={t}
            >
              {sections.gallery.items.slice(0, 5).map((row) => (
                <MiniRow
                  key={row.id}
                  title={row.title}
                  status={row.status}
                  date={row.updated_at}
                  locale={locale}
                  t={t}
                />
              ))}
            </RecentList>
          </div>
        </div>
      )}

      {/* Designs */}
      {tab === "designs" && sections && (
        <section>
          <div className="mb-4 flex justify-end">
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-neon text-white text-sm font-semibold hover:scale-105 transition-transform"
            >
              <Palette className="h-4 w-4" />
              {t("studio_title")}
            </Link>
          </div>
          {sections.designs.items.length === 0 ? (
            <div className="glass-strong rounded-3xl">
              <EmptyState icon={Palette} message={t("creator_empty_designs")} />
            </div>
          ) : (
            <>
              <div className="glass-strong rounded-3xl divide-y divide-white/5 overflow-hidden">
                {sections.designs.items.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/studio/${row.id}`}
                        className="font-semibold truncate hover:text-pink-300 transition-colors"
                      >
                        {row.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {row.is_public ? "🌐" : "🔒"} · ⬇ {row.download_count}
                      </p>
                    </div>
                    <StatusBadge status={row.status} t={t} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(row.updated_at, locale)}
                    </span>
                  </div>
                ))}
              </div>
              <CountNote shown={sections.designs.items.length} total={sections.designs.total} />
            </>
          )}
        </section>
      )}

      {/* Products */}
      {tab === "products" && sections && (
        <section>
          {sections.products.items.length === 0 ? (
            <div className="glass-strong rounded-3xl">
              <EmptyState icon={Package} message={t("creator_empty_products")} />
            </div>
          ) : (
            <>
              <div className="glass-strong rounded-3xl divide-y divide-white/5 overflow-hidden">
                {sections.products.items.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">
                        {row.design?.title ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {locale === "ar" && row.template?.name_ar
                          ? row.template.name_ar
                          : row.template?.name ?? "—"}
                        {row.product ? ` · ${row.product.name}` : ""}
                      </p>
                    </div>
                    {row.product?.status === "published" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-sky-500/15 text-sky-300 border-sky-500/30">
                        {t("status_published")}
                      </span>
                    )}
                    <StatusBadge status={row.status} t={t} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(row.updated_at, locale)}
                    </span>
                  </div>
                ))}
              </div>
              <CountNote shown={sections.products.items.length} total={sections.products.total} />
            </>
          )}
        </section>
      )}

      {/* Gallery */}
      {tab === "gallery" && sections && (
        <section>
          {sections.gallery.items.length === 0 ? (
            <div className="glass-strong rounded-3xl">
              <EmptyState icon={Images} message={t("creator_empty_gallery")} />
            </div>
          ) : (
            <>
              <div className="glass-strong rounded-3xl divide-y divide-white/5 overflow-hidden">
                {sections.gallery.items.map((row) => {
                  const thumb = designPreviewUrl(row.preview_path);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 px-4 py-4"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover border border-white/10"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center">
                          <Images className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{row.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.visibility === "public" ? "🌐" : "🔗"}
                          {row.tags.length > 0 ? ` · ${row.tags.join(", ")}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={row.status} t={t} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(row.published_at ?? row.updated_at, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <CountNote shown={sections.gallery.items.length} total={sections.gallery.total} />
            </>
          )}
        </section>
      )}

      {/* Drafts / Pending / Rejected */}
      {(tab === "drafts" || tab === "pending" || tab === "rejected") && (
        <section>
          {mergedItems.length === 0 ? (
            <div className="glass-strong rounded-3xl">
              <EmptyState icon={FileText} message={t("creator_empty_section")} />
            </div>
          ) : (
            <div className="glass-strong rounded-3xl divide-y divide-white/5 overflow-hidden">
              {mergedItems.map((item) => {
                const Icon = KIND_ICONS[item.kind] ?? FileText;
                return (
                  <div key={`${item.kind}-${item.id}`} className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="h-9 w-9 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-secondary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(KIND_LABELS[item.kind] ?? "creator_tab_designs")}
                        </p>
                      </div>
                      <StatusBadge status={item.status} t={t} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.date, locale)}
                      </span>
                    </div>
                    {tab === "rejected" && item.reason && (
                      <p className="mt-2 ms-12 text-xs text-rose-300/90 border-s-2 border-rose-500/40 ps-3">
                        <span className="font-semibold">
                          {t("creator_rejection_feedback")}:
                        </span>{" "}
                        {item.reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Settings */}
      {tab === "settings" && (
        <form onSubmit={saveProfile} className="glass-strong rounded-3xl p-6 max-w-2xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">{t("creator_tab_settings")}</h2>
            {dirty && (
              <span className="text-xs text-amber-300 inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("creator_unsaved_changes")}
              </span>
            )}
          </div>

          <Field
            label={t("creator_username")}
            hint={t("creator_username_hint")}
            error={saveState.errors?.username}
          >
            <input
              type="text"
              value={form.username}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, username: event.target.value }));
                setDirty(true);
              }}
              autoComplete="username"
              className={INPUT_CLASS}
              required
            />
          </Field>
          <Field
            label={t("creator_display_name")}
            error={saveState.errors?.display_name}
          >
            <input
              type="text"
              value={form.display_name}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, display_name: event.target.value }));
                setDirty(true);
              }}
              className={INPUT_CLASS}
              required
            />
          </Field>
          <Field label={t("creator_bio")} error={saveState.errors?.bio}>
            <textarea
              value={form.bio}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, bio: event.target.value }));
                setDirty(true);
              }}
              rows={4}
              maxLength={500}
              className={INPUT_CLASS}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-semibold text-muted-foreground mb-3">
              {t("creator_social_links")}
            </legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {[...SOCIAL_LINK_KEYS].sort().map((key) => (
                <div key={key}>
                  <label
                    htmlFor={`social-${key}`}
                    className="block text-xs uppercase tracking-wider text-muted-foreground mb-1"
                  >
                    {key}
                  </label>
                  <input
                    id={`social-${key}`}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={social[key] ?? ""}
                    onChange={(event) => {
                      setSocial((prev) => ({ ...prev, [key]: event.target.value }));
                      setDirty(true);
                    }}
                    className={INPUT_CLASS}
                  />
                  {saveState.errors?.[`social_links.${key}`] && (
                    <p className="text-xs text-rose-400 mt-1">
                      {saveState.errors[`social_links.${key}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {saveState.errors?.social_links && (
              <p className="text-xs text-rose-400 mt-2">
                {saveState.errors.social_links}
              </p>
            )}
          </fieldset>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saveState.kind === "saving" || !dirty}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform disabled:opacity-60"
            >
              {saveState.kind === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("common_save")}
            </button>
            {saveState.kind === "saved" && (
              <span className="text-sm text-emerald-300 inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                {t("creator_profile_saved")}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-2">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}

function SaveBanner({
  saveState,
  t,
}: {
  saveState: { kind: string; message?: string };
  t: TFunction;
}) {
  if (saveState.kind === "error" && saveState.message) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {saveState.message}
      </div>
    );
  }
  if (saveState.kind === "saved") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {t("creator_profile_saved")}
      </div>
    );
  }
  return null;
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="glass-strong rounded-2xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-gradient-neon/15 border border-pink-500/30 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-pink-300" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

function MiniRow({
  title,
  status,
  date,
  locale,
  t,
}: {
  title: string;
  status: DesignStatus;
  date: string;
  locale: string;
  t: TFunction;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(date, locale)}
        </p>
      </div>
      <StatusBadge status={status} t={t} />
    </div>
  );
}

function RecentList({
  title,
  emptyMessage,
  onShowAll,
  t,
  children,
}: {
  title: string;
  emptyMessage: string;
  onShowAll: () => void;
  t: TFunction;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="glass-strong rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-extrabold">{title}</h3>
        <button
          type="button"
          onClick={onShowAll}
          className="text-xs text-secondary hover:text-white transition-colors"
        >
          {t("common_view_all")}
        </button>
      </div>
      {hasChildren ? (
        <div className="divide-y divide-white/5">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
