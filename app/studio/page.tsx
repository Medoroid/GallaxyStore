"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Palette,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import { validateArtwork } from "@/lib/design-studio/validate";
import type { ArtworkValidation } from "@/lib/design-studio/validate";
import { resolveDesignTitle } from "@/lib/design-studio/design-input";
import { ARTWORK_LIMITS } from "@/lib/design-studio/types";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import Dropzone from "@/app/components/studio/Dropzone";
import DesignCard from "@/app/components/studio/DesignCard";
import type { DesignCardData } from "@/app/components/studio/DesignCard";
import ConfirmDialog from "@/app/components/studio/ConfirmDialog";

type ListPayload = {
  success: boolean;
  code?: string;
  message?: string;
  designs?: DesignCardData[];
  page?: number;
  per_page?: number;
  total?: number;
  has_more?: boolean;
};

type PendingUpload = {
  file: File;
  validation: ArtworkValidation;
  previewUrl: string;
  title: string;
};

const PER_PAGE = 12;

export default function StudioPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [designs, setDesigns] = useState<DesignCardData[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Upload flow
  const [pickError, setPickError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState<DesignCardData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const previewRef = useRef<string | null>(null);

  const serverMessage = useCallback(
    (payload: { code?: string; message?: string } | null | undefined, fallback: string) => {
      const code = payload?.code;
      if (isMappedErrorCode(code)) {
        return code === "invalid_title"
          ? t("studio_err_title_required")
          : t(`studio_err_${code}`);
      }
      return payload?.message || fallback;
    },
    [t]
  );

  // --- list load (inline effect, wishlist-style: no sync call in the body) --
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        const res = await fetch(
          `/api/designs?page=${page}&per_page=${PER_PAGE}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const payload: ListPayload = await res.json();
        if (!payload?.success) {
          throw new Error(serverMessage(payload, t("studio_load_error")));
        }
        if (cancelled) return;
        setDesigns(payload.designs ?? []);
        setTotal(payload.total ?? 0);
        setHasMore(Boolean(payload.has_more));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("studio_load_error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, getToken, reload, page, serverMessage, t]);

  // --- upload --------------------------------------------------------------
  const handlePick = useCallback(
    async (file: File) => {
      setPickError(null);
      setCreateError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const validation = validateArtwork(bytes, {
          filename: file.name,
          mimeType: file.type,
        });
        if (!validation.ok) {
          setPickError(
            serverMessage({ code: validation.code }, t("studio_err_invalid_file"))
          );
          return;
        }
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        const previewUrl = URL.createObjectURL(file);
        previewRef.current = previewUrl;
        setPending({
          file,
          validation,
          previewUrl,
          title: resolveDesignTitle("", file.name),
        });
      } catch {
        setPickError(t("studio_err_invalid_file"));
      }
    },
    [serverMessage, t]
  );

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const closePending = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPending(null);
    setCreateError(null);
    setPickError(null);
  }, []);

  const createDesign = useCallback(async () => {
    if (!pending || creating) return; // duplicate-submit guard
    const title = pending.title.trim();
    if (!title) {
      setCreateError(t("studio_err_title_required"));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", pending.file);
      form.append("title", title);
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await res.json();
      if (!payload?.success) {
        throw new Error(serverMessage(payload, t("studio_err_generic")));
      }
      const createdId = payload.design?.id;
      if (typeof createdId !== "string") {
        throw new Error(t("studio_err_generic"));
      }
      // Navigate into the editor — keep `creating` so nothing re-fires.
      router.push(`/studio/${createdId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("studio_err_generic"));
      setCreating(false);
    }
  }, [pending, creating, getToken, router, serverMessage, t]);

  // --- delete --------------------------------------------------------------
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/designs/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!payload?.success) {
        throw new Error(serverMessage(payload, t("studio_err_generic")));
      }
      setDeleteTarget(null);
      // If we just removed the last item on this page, step back one page.
      if (designs.length === 1 && page > 1) setPage((current) => current - 1);
      else setReload((current) => current + 1);
    } catch (err) {
      setDeleteTarget(null);
      setError(err instanceof Error ? err.message : t("studio_err_generic"));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, getToken, designs.length, page, serverMessage, t]);

  // --- gates ---------------------------------------------------------------
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
          <p className="text-muted-foreground mb-4">{t("creator_login_required")}</p>
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

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
            {t("studio_title")}
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold">
            <span className="text-gradient-neon">{t("studio_my_designs")}</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("studio_subtitle")}</p>
        </div>
        <Link
          href="/creator"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold hover:border-pink-500/40 transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" />
          {t("creator_dashboard")}
        </Link>
      </div>

      {/* Upload */}
      <div className="mb-8">
        <Dropzone
          onFile={(file) => void handlePick(file)}
          hint={t("studio_upload_hint")}
          formats={t("studio_upload_formats")}
          disabled={creating}
          compact
        />
        {pickError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {pickError}
          </div>
        )}
      </div>

      {/* List states */}
      {loading && designs.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="glass-strong rounded-2xl overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-white/[0.04]" />
              <div className="p-3.5 space-y-2">
                <div className="h-4 bg-white/[0.06] rounded w-3/4" />
                <div className="h-4 bg-white/[0.06] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error && designs.length === 0 ? (
        <div className="glass-strong rounded-3xl p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-400 mb-3" />
          <p className="text-muted-foreground text-sm mb-5 break-words">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setReload((current) => current + 1);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            {t("common_retry")}
          </button>
        </div>
      ) : designs.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-secondary mb-3" />
          <h2 className="text-xl font-extrabold mb-1">{t("studio_empty_title")}</h2>
          <p className="text-muted-foreground text-sm">{t("studio_empty_body")}</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {designs.map((design) => (
              <DesignCard
                key={design.id}
                design={design}
                badgeLabel={t(`status_${design.status}`)}
                deleteLabel={t("common_delete")}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>

          {(totalPages > 1 || page > 1) && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                aria-label={t("common_previous")}
                className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 transition-colors disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("studio_page")} {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasMore || loading}
                aria-label={t("common_next")}
                className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 transition-colors disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload dialog */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("studio_upload_title")}
          onClick={creating ? undefined : closePending}
        >
          <div
            className="glass-strong rounded-3xl w-full max-w-lg overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-extrabold">{t("studio_upload_title")}</h2>
              <button
                type="button"
                onClick={closePending}
                disabled={creating}
                aria-label={t("common_cancel")}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex gap-4">
                <div className="h-24 w-24 shrink-0 rounded-xl border border-white/10 bg-[#0b0b12] flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pending.previewUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0 text-sm space-y-1">
                  <p className="font-semibold truncate" title={pending.file.name}>
                    {pending.file.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {pending.validation.format?.toUpperCase()}
                    {pending.validation.widthPx && pending.validation.heightPx
                      ? ` · ${pending.validation.widthPx}×${pending.validation.heightPx}px`
                      : ""}
                    {` · ${(pending.file.size / (1024 * 1024)).toFixed(1)} MB`}
                  </p>
                  {pending.validation.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="text-xs text-amber-300 flex items-start gap-1.5"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {t(
                        warning === "low_source_resolution"
                          ? "studio_warn_low_resolution"
                          : "studio_warn_mime_mismatch"
                      )}
                    </p>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-sm font-semibold text-muted-foreground mb-2">
                  {t("studio_design_title")}
                </span>
                <input
                  type="text"
                  value={pending.title}
                  maxLength={ARTWORK_LIMITS.maxTitleLength}
                  onChange={(event) =>
                    setPending((current) =>
                      current ? { ...current, title: event.target.value } : current
                    )
                  }
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50 transition-colors"
                  placeholder={t("studio_design_title_ph")}
                />
              </label>

              {createError && (
                <p className="text-sm text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {createError}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePending}
                disabled={creating}
                className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold hover:border-white/25 transition-colors disabled:opacity-50"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                onClick={() => void createDesign()}
                disabled={creating}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-neon text-white text-sm font-semibold hover:scale-[1.03] transition-transform disabled:opacity-60 disabled:hover:scale-100"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {creating ? t("studio_creating") : t("studio_create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("studio_delete_title")}
        body={t("studio_delete_body")}
        confirmLabel={t("common_delete")}
        cancelLabel={t("common_cancel")}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
