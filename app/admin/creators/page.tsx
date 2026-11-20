"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Package,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useAdminT } from "@/lib/admin-i18n";
import ConfirmDialog from "@/app/components/studio/ConfirmDialog";
import { GalleryCover } from "@/app/components/GalleryCover";
import { designPreviewUrl } from "@/lib/creator/media";
import TemplateManager from "./TemplateManager";

type Stats = {
  products: number;
  products_pending: number;
  gallery: number;
  gallery_pending: number;
};

type Creator = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_featured: boolean;
  is_active: boolean;
  can_publish: boolean;
  created_at: string;
  stats: Stats;
};

type QueueRow = {
  kind: "product" | "gallery";
  id: string;
  status: string;
  submitted_at: string | null;
  created_at?: string;
  rejection_reason?: string | null;
  product_id?: string | null;
  fulfillment_mode?: string;
  stock_buffer?: number;
  mockups?: Array<{ path?: string }>;
  title?: string;
  preview_path?: string | null;
  template?: { template_key: string; name: string; name_ar?: string | null } | null;
  product?: { id: string; name: string; base_price: number; currency: string } | null;
  creator?: { username: string; display_name: string; avatar_url?: string | null } | null;
};

type LoadError = { key?: string; message?: string; code?: string } | null;

type Counts = {
  products_pending: number;
  gallery_pending: number;
  creators: number;
  queue: number;
};

const QUEUE_FILTERS = ["pending_review", "rejected", "approved", "archived", "all"] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-sky-500/15 text-sky-300",
  pending_review: "bg-amber-500/15 text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  published: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-300",
  archived: "bg-white/[0.06] text-gray-400",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50";

export default function AdminCreatorsPage() {
  const { getToken } = useAuth();
  const { t, locale } = useAdminT();

  const [tab, setTab] = useState<"queue" | "creators" | "templates">("queue");
  const [queueStatus, setQueueStatus] = useState<string>("pending_review");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<{
    target: string;
    id: string;
    title: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<{
    target: string;
    id: string;
    title: string;
  } | null>(null);
  const [archiveCreator, setArchiveCreator] = useState<Creator | null>(null);

  // Monotonic sequence: a slow response can never overwrite a newer one.
  const seqRef = useRef(0);

  // NOTE: intentionally free of `t` — the effect must not re-run when the
  // translation function changes identity every render. Messages are stored
  // as keys (translated at render) or raw API copy (English, per the admin
  // i18n contract for server messages).
  const load = useCallback(
    async (status: string) => {
      const seq = ++seqRef.current;
      try {
        const token = await getToken();
        const res = await fetch(`/api/admin/creators?status=${encodeURIComponent(status)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (seq !== seqRef.current) return;
        if (!res.ok || !data?.success) {
          setError({
            key: data?.message ? undefined : "creators.msg.loadFailed",
            message: data?.message,
            code: data?.code,
          });
          return;
        }
        setCreators(data.creators || []);
        setQueue(data.queue || []);
        setCounts(data.counts || null);
        setError(null);
      } catch {
        if (seq !== seqRef.current) return;
        setError({ key: "creators.msg.loadNetwork" });
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [getToken]
  );

  useEffect(() => {
    void (async () => {
      await load(queueStatus);
    })();
  }, [load, queueStatus]);

  const tf = (key: string, vars: Record<string, string | number>): string => {
    let out = t(key);
    for (const [name, value] of Object.entries(vars)) {
      out = out.replace(`{${name}}`, String(value));
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

  /** Allow-listed PATCH; returns true only on a confirmed success. */
  const runAction = async (
    key: string,
    body: Record<string, unknown>
  ): Promise<boolean> => {
    setBusyKey(key);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/creators", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError({
          key: data?.message ? undefined : "creators.msg.failed",
          message: data?.message,
          code: data?.code,
        });
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError({ key: "creators.msg.network" });
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const submitReview = async (
    target: string,
    id: string,
    decision: "approve" | "reject",
    reason?: string
  ) => {
    const ok = await runAction(`review:${target}:${id}`, {
      action: "review",
      target,
      id,
      decision,
      ...(reason ? { reason } : {}),
    });
    if (ok) load(queueStatus);
    return ok;
  };

  const changeQueueStatus = (status: string) => {
    setQueueStatus(status);
    setLoading(true);
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
      {error.key ? t(error.key) : error.message}
    </div>
  ) : null;

  const tabButton = (id: "queue" | "creators" | "templates", label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
        tab === id
          ? "bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white"
          : "bg-white/[0.05] text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[var(--brand)]" aria-hidden="true" />
            {t("creators.title")}
          </h1>
          <p className="text-gray-400 text-sm mt-1">{t("creators.subtitle")}</p>
        </div>
        {counts && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-gray-300">
              {tf("creators.count.creators", { n: counts.creators })}
            </span>
            <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-amber-300">
              {tf("creators.count.pendingProducts", { n: counts.products_pending })}
            </span>
            <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-amber-300">
              {tf("creators.count.pendingGallery", { n: counts.gallery_pending })}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabButton("queue", t("creators.tab.queue"))}
        {tabButton("creators", t("creators.tab.creators"))}
        {tabButton("templates", t("creators.tab.templates"))}
      </div>

      {renderError}

      {/* ------------------------------ Queue ------------------------------ */}
      {tab === "queue" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => changeQueueStatus(status)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  queueStatus === status
                    ? "bg-white/[0.1] text-white border border-white/15"
                    : "bg-white/[0.04] text-gray-400 hover:text-white"
                }`}
              >
                {t(`creators.queue.filter.${status}`)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-2xl p-6 animate-pulse">
                  <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
                  <div className="h-3 bg-white/[0.05] rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-400">{t("creators.queue.empty")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((row) => {
                const rowKey = `${row.kind}:${row.id}`;
                const busy = busyKey === rowKey || busyKey === `review:${row.kind}:${row.id}`;
                const pending = row.status === "pending_review";

                // Up to three unique generated mockups for product rows.
                const thumbs: string[] = [];
                const seen = new Set<string>();
                for (const record of row.mockups ?? []) {
                  const path = typeof record?.path === "string" ? record.path : "";
                  if (!path || seen.has(path)) continue;
                  seen.add(path);
                  thumbs.push(path);
                  if (thumbs.length >= 3) break;
                }

                const displayName =
                  row.creator?.display_name || row.creator?.username || "—";
                const title =
                  row.kind === "product"
                    ? row.product?.name || row.template?.name || "—"
                    : row.title || "—";

                return (
                  <div
                    key={rowKey}
                    className="glass rounded-2xl p-4 flex flex-col gap-4 md:flex-row"
                  >
                    {/* Preview thumbs */}
                    <div className="flex gap-2 shrink-0">
                      {row.kind === "gallery" ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/[0.04]">
                          <GalleryCover
                            title={row.title || "—"}
                            previewPath={row.preview_path ?? null}
                          />
                        </div>
                      ) : (
                        thumbs.map((path) => {
                          const url = designPreviewUrl(path);
                          if (!url) return null;
                          return (
                            <a
                              key={path}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="w-14 h-14 rounded-lg overflow-hidden bg-white/[0.04] block"
                              title={t("creators.queue.openPreview")}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          );
                        })
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            row.kind === "product"
                              ? "bg-sky-500/15 text-sky-300"
                              : "bg-violet-500/15 text-violet-300"
                          }`}
                        >
                          {row.kind === "product" ? (
                            <Package className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <ImageIcon className="w-3 h-3" aria-hidden="true" />
                          )}
                          {t(`creators.queue.kind.${row.kind}`)}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            STATUS_STYLES[row.status] ?? "bg-white/[0.06] text-gray-400"
                          }`}
                        >
                          {t(`creators.status.${row.status}`)}
                        </span>
                        {row.kind === "product" && row.template && (
                          <span className="text-[11px] text-gray-500">
                            {row.template.name_ar || row.template.name}
                          </span>
                        )}
                        {row.product_id && (
                          <a
                            href={`/product-details/${row.product_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--brand)] hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            {t("creators.queue.viewListing")}
                          </a>
                        )}
                      </div>

                      <p className="text-sm font-medium text-white truncate">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {tf("creators.queue.by", { name: displayName })} (@
                        {row.creator?.username ?? "—"}) ·{" "}
                        {tf("creators.queue.submitted", {
                          date: fmtDate(row.submitted_at ?? row.created_at),
                        })}
                      </p>

                      {row.kind === "product" && (
                        <p
                          className={`text-[11px] mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                            row.fulfillment_mode === "configured"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {row.fulfillment_mode === "configured"
                            ? tf("creators.queue.fulfillmentConfigured", {
                                n: row.stock_buffer ?? 0,
                              })
                            : t("creators.queue.fulfillmentUnconfigured")}
                        </p>
                      )}

                      {row.rejection_reason && (
                        <p className="text-[11px] text-rose-300/90 mt-1.5">
                          {tf("creators.queue.rejection", { reason: row.rejection_reason })}
                        </p>
                      )}

                      {row.kind === "product" && thumbs.length > 0 && (
                        <p className="text-[11px] text-gray-600 mt-1.5">
                          {tf("creators.queue.mockups", { n: thumbs.length })}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row md:flex-col gap-2 md:w-40 shrink-0 md:items-stretch">
                      {pending && (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void submitReview(row.kind, row.id, "approve")}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                          >
                            {busyKey === `review:${row.kind}:${row.id}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            {t("creators.queue.approve")}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              setRejectReason("");
                              setRejectTarget({ target: row.kind, id: row.id, title });
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            {t("creators.queue.reject")}
                          </button>
                        </>
                      )}
                      {row.status !== "archived" && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            setArchiveTarget({ target: row.kind, id: row.id, title })
                          }
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          {t("creators.queue.archive")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------- Creators ---------------------------- */}
      {tab === "creators" && (
        <div className="space-y-4">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="glass rounded-2xl p-6 animate-pulse">
                  <div className="h-4 bg-white/[0.05] rounded w-1/2 mb-4" />
                  <div className="h-3 bg-white/[0.05] rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : creators.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-400">{t("creators.list.empty")}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {creators.map((creator) => {
                const featureBusy = busyKey === `toggle:${creator.id}:feature`;
                const publishBusy = busyKey === `toggle:${creator.id}:permissions`;
                const activeBusy = busyKey === `toggle:${creator.id}:archive`;
                const anyBusy = featureBusy || publishBusy || activeBusy;

                const toggle = async (
                  action: "feature" | "permissions" | "archive",
                  value: boolean
                ) => {
                  const ok = await runAction(`toggle:${creator.id}:${action}`, {
                    action,
                    creator_id: creator.id,
                    value,
                  });
                  if (ok) load(queueStatus);
                };

                return (
                  <div key={creator.id} className="glass rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      {creator.avatar_url?.startsWith("http") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={creator.avatar_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] flex items-center justify-center text-white font-bold text-sm">
                          {(creator.display_name || creator.username)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {creator.display_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          @{creator.username} ·{" "}
                          {tf("creators.list.joined", { date: fmtDate(creator.created_at) })}
                        </p>
                      </div>
                      {creator.is_featured && (
                        <Star
                          className="w-4 h-4 text-amber-400 fill-amber-400"
                          aria-label={t("creators.action.featured")}
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                      <span className="rounded-md bg-white/[0.05] px-2 py-1 text-gray-300">
                        {tf("creators.list.products", { n: creator.stats.products })}
                        {creator.stats.products_pending > 0 &&
                          ` · ${tf("creators.list.pending", { n: creator.stats.products_pending })}`}
                      </span>
                      <span className="rounded-md bg-white/[0.05] px-2 py-1 text-gray-300">
                        {tf("creators.list.gallery", { n: creator.stats.gallery })}
                        {creator.stats.gallery_pending > 0 &&
                          ` · ${tf("creators.list.pending", { n: creator.stats.gallery_pending })}`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void toggle("feature", !creator.is_featured)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          creator.is_featured
                            ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
                            : "border-white/10 bg-white/[0.04] text-gray-400 hover:text-white"
                        }`}
                      >
                        {featureBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Star className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {creator.is_featured
                          ? t("creators.action.unfeature")
                          : t("creators.action.feature")}
                      </button>

                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void toggle("permissions", !creator.can_publish)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          creator.can_publish
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                            : "border-rose-500/30 bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        {publishBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : creator.can_publish ? (
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {creator.can_publish
                          ? t("creators.action.allowPublish")
                          : t("creators.action.blockPublish")}
                      </button>

                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => {
                          if (creator.is_active) {
                            setArchiveCreator(creator);
                          } else {
                            void toggle("archive", true);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          creator.is_active
                            ? "border-white/10 bg-white/[0.04] text-gray-400 hover:text-white"
                            : "border-gray-500/40 bg-gray-500/15 text-gray-300"
                        }`}
                      >
                        {activeBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {creator.is_active
                          ? t("creators.action.active")
                          : t("creators.action.archived")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --------------------------- Templates --------------------------- */}
      {tab === "templates" && <TemplateManager getToken={getToken} />}

      {/* Reject modal (reason required by the API) */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("creators.queue.rejectTitle")}
          onClick={() => {
            if (!busyKey) setRejectTarget(null);
          }}
        >
          <div
            className="glass-strong rounded-3xl p-6 w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold text-white">
              {t("creators.queue.rejectTitle")}
            </h2>
            <p className="text-sm text-gray-400 mt-1">{t("creators.queue.rejectBody")}</p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder={t("creators.queue.rejectPlaceholder")}
              className={`${INPUT_CLASS} mt-3 resize-none`}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-gray-300 hover:border-white/25 transition-colors disabled:opacity-50"
              >
                {t("creators.queue.cancel")}
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || Boolean(busyKey)}
                onClick={() => {
                  void (async () => {
                    const ok = await submitReview(
                      rejectTarget.target,
                      rejectTarget.id,
                      "reject",
                      rejectReason.trim()
                    );
                    if (ok) setRejectTarget(null);
                  })();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-sm font-semibold text-white hover:scale-[1.03] transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {busyKey === `review:${rejectTarget.target}:${rejectTarget.id}` && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                )}
                {t("creators.queue.confirmReject")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive submission confirm */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={t("creators.queue.confirmArchiveTitle")}
        body={t("creators.queue.confirmArchiveBody")}
        confirmLabel={t("creators.queue.archive")}
        cancelLabel={t("creators.queue.cancel")}
        danger
        busy={Boolean(busyKey)}
        onConfirm={() => {
          void (async () => {
            if (!archiveTarget) return;
            const ok = await runAction(
              `archive:${archiveTarget.target}:${archiveTarget.id}`,
              { action: "archive_submission", target: archiveTarget.target, id: archiveTarget.id }
            );
            setArchiveTarget(null);
            if (ok) load(queueStatus);
          })();
        }}
        onCancel={() => setArchiveTarget(null)}
      />

      {/* Archive creator confirm */}
      <ConfirmDialog
        open={Boolean(archiveCreator)}
        title={t("creators.confirm.archiveTitle")}
        body={
          archiveCreator
            ? tf("creators.confirm.archiveBody", { name: archiveCreator.display_name })
            : ""
        }
        confirmLabel={t("creators.action.archived")}
        cancelLabel={t("creators.queue.cancel")}
        danger
        busy={Boolean(busyKey)}
        onConfirm={() => {
          void (async () => {
            if (!archiveCreator) return;
            const ok = await runAction(`toggle:${archiveCreator.id}:archive`, {
              action: "archive",
              creator_id: archiveCreator.id,
              value: false,
            });
            setArchiveCreator(null);
            if (ok) load(queueStatus);
          })();
        }}
        onCancel={() => setArchiveCreator(null)}
      />
    </div>
  );
}
