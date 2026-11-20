"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Images,
  Loader2,
  Send,
  ShoppingBag,
  X,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import { supabase } from "@/lib/supabaseClient";
import StatusBadge from "./StatusBadge";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import type { ProductRowView } from "@/lib/design-studio/product-input";
import { useTemplateCatalog } from "./useTemplateCatalog";

type Props = {
  open: boolean;
  designId: string;
  designTitle: string;
  designDescription?: string;
  onClose: () => void;
  /** Parent refreshes the catalog/gallery after a successful submit. */
  onPublished: (target: "product" | "gallery") => void;
};

type CategoryOption = { id: string; name: string };

/** Map an API error payload to a translated message (code → studio_err_*). */
function mapPayloadError(
  payload: unknown,
  fallback: string,
  t: (key: string) => string
): string {
  const body = payload as { code?: string; message?: string } | null;
  if (typeof body?.code === "string" && isMappedErrorCode(body.code)) {
    return t(`studio_err_${body.code}`);
  }
  if (typeof body?.message === "string" && body.message) return body.message;
  return fallback;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-sm text-white placeholder:text-muted-foreground/70 focus:border-pink-500/50 focus:outline-none transition-colors disabled:opacity-60";
const LABEL_CLASS = "mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground font-bold";

/**
 * Publish dialog (Phase 7): two honest targets.
 *
 *  A. Store product — pick one configured product row, review its status and
 *     previews, set name/price/description/category. The server creates the
 *     listing as a HIDDEN DRAFT; nothing is public until an admin approves.
 *  B. Creator gallery — share the artwork without selling it.
 *
 * Everything is server-validated (allow-list + RPC re-check); this dialog only
 * collects presentation data and shows mapped errors inline. Single-flight
 * submit, no optimistic writes: the parent refetches on success.
 */
export default function PublishDialog({
  open,
  designId,
  designTitle,
  designDescription,
  onClose,
  onPublished,
}: Props) {
  const { t, locale } = useLanguage();
  const { getToken } = useAuth();
  const { byKey: getTemplate } = useTemplateCatalog();

  const [target, setTarget] = useState<"product" | "gallery">("product");
  const [rows, setRows] = useState<ProductRowView[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsReload, setRowsReload] = useState(0);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Product form
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Gallery form
  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"product" | "gallery" | null>(null);

  const callbacksRef = useRef({ getToken, t });
  useEffect(() => {
    callbacksRef.current = { getToken, t };
  });

  // Reset every time the dialog opens — no state leaks between runs.
  useEffect(() => {
    if (!open) return;
    setTarget("product");
    setRows(null);
    setRowsError(null);
    setCategories(null);
    setSelectedId(null);
    setName(designTitle);
    setPrice("");
    setDescription(designDescription ?? "");
    setShortDescription("");
    setCategoryId("");
    setGalleryTitle(designTitle);
    setGalleryDescription(designDescription ?? "");
    setTagsText("");
    setVisibility("public");
    setBusy(false);
    setError(null);
    setSuccess(null);
  }, [open, designId, designTitle, designDescription]);

  // Rows: the caller's own product configurations (owner-scoped by RLS).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const token = await callbacksRef.current.getToken();
        if (!alive) return;
        if (!token) {
          setRows(null);
          setRowsError(callbacksRef.current.t("studio_err_generic"));
          return;
        }
        const response = await fetch(`/api/designs/${designId}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!alive) return;
        if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
          setRows(null);
          setRowsError(
            mapPayloadError(
              payload,
              callbacksRef.current.t("studio_err_generic"),
              callbacksRef.current.t
            )
          );
          return;
        }
        const products = (payload as { products?: ProductRowView[] } | null)?.products;
        const list = Array.isArray(products) ? products : [];
        setRowsError(null);
        setRows(list);
        // Auto-select the first row that can actually be published.
        const firstPublishable =
          list.find(
            (row) =>
              (row.status === "draft" || row.status === "rejected") &&
              row.mockups.some((mockup) =>
                String(mockup.path ?? "").startsWith(`mockups/${designId}/`)
              )
          ) ?? null;
        setSelectedId(firstPublishable ? firstPublishable.id : null);
      } catch {
        if (alive) {
          setRows(null);
          setRowsError(callbacksRef.current.t("studio_err_network"));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, designId, rowsReload]);

  // Categories (public read): a failed read hides the dropdown instead of
  // blocking the publish — the product simply lands uncategorized.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name");
        if (!alive) return;
        if (categoriesError) {
          setCategories(null);
          return;
        }
        setCategories(
          Array.isArray(data) ? (data as CategoryOption[]) : []
        );
      } catch {
        if (alive) setCategories(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const selectedRow = rows?.find((row) => row.id === selectedId) ?? null;
  const priceValid =
    price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0;
  const productReady =
    selectedRow !== null && name.trim().length > 0 && priceValid;
  const galleryReady = galleryTitle.trim().length >= 2;
  const submitDisabled = busy || (target === "product" ? !productReady : !galleryReady);

  const submit = async () => {
    if (submitDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const token = await callbacksRef.current.getToken();
      if (!token) {
        setError(t("studio_err_generic"));
        return;
      }
      const body =
        target === "product"
          ? {
              target: "product",
              design_product_id: selectedId,
              name: name.trim(),
              base_price: Number(price),
              description: description.trim() || null,
              short_description: shortDescription.trim() || null,
              category_id: categoryId || null,
            }
          : {
              target: "gallery",
              title: galleryTitle.trim(),
              description: galleryDescription.trim() || null,
              tags: tagsText
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              visibility,
            };
      const response = await fetch(`/api/designs/${designId}/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
        setError(mapPayloadError(payload, t("studio_err_generic"), t));
        return;
      }
      setSuccess(target);
      onPublished(target);
    } catch {
      setError(t("studio_err_network"));
    } finally {
      setBusy(false);
    }
  };

  const targetCard = (
    cardTarget: "product" | "gallery",
    icon: ReactNode,
    labelKey: string,
    hintKey: string
  ) => (
    <button
      type="button"
      onClick={() => setTarget(cardTarget)}
      className={`rounded-xl border p-3 text-left transition-colors ${
        target === cardTarget
          ? "border-pink-500/60 bg-pink-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/25"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold text-white">
        {icon}
        {t(labelKey)}
      </span>
      <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
        {t(hintKey)}
      </span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("publish_title")}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="glass-strong my-auto w-full max-w-lg rounded-3xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-pink-500/30 bg-pink-500/15 text-pink-300">
              <Send className="h-4 w-4" />
            </div>
            <h2 className="text-base font-extrabold text-white">{t("publish_title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common_cancel")}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          /* ----- success panel ----- */
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-white">
              {success === "product" ? t("publish_success_product") : t("publish_success_gallery")}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {t("publish_success_note")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              {t("publish_done")}
            </button>
          </div>
        ) : (
          <>
            {/* ----- target cards ----- */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">
              {t("publish_target")}
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {targetCard(
                "product",
                <ShoppingBag className="h-4 w-4 text-pink-300" />,
                "publish_target_product",
                "publish_target_product_hint"
              )}
              {targetCard(
                "gallery",
                <Images className="h-4 w-4 text-pink-300" />,
                "publish_target_gallery",
                "publish_target_gallery_hint"
              )}
            </div>

            {target === "product" ? (
              /* ----- product form ----- */
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">
                  {t("publish_product_row")}
                </p>

                {rowsError ? (
                  <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs leading-relaxed text-rose-200">{rowsError}</p>
                    <button
                      type="button"
                      onClick={() => setRowsReload((value) => value + 1)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold hover:border-pink-500/40 transition-colors"
                    >
                      {t("common_retry")}
                    </button>
                  </div>
                ) : rows === null ? (
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("common_loading")}
                  </div>
                ) : rows.length === 0 ? (
                  <p className="mb-3 text-xs text-muted-foreground">{t("publish_no_products")}</p>
                ) : (
                  <div className="mb-3 space-y-1.5">
                    {rows.map((row) => {
                      const template = getTemplate(row.template_key);
                      const hasPreviews = row.mockups.some((mockup) =>
                        String(mockup.path ?? "").startsWith(`mockups/${designId}/`)
                      );
                      const publishable =
                        (row.status === "draft" || row.status === "rejected") && hasPreviews;
                      const checked = publishable && selectedId === row.id;
                      return (
                        <label
                          key={row.id}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                            checked
                              ? "border-pink-500/60 bg-pink-500/10"
                              : "border-white/10 bg-white/[0.03]"
                          } ${publishable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                        >
                          <input
                            type="radio"
                            name="publish-row"
                            checked={checked}
                            disabled={!publishable}
                            onChange={() => setSelectedId(row.id)}
                            className="h-3.5 w-3.5 shrink-0 accent-pink-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-white">
                              {locale === "ar" ? template?.nameAr : template?.name}
                            </span>
                            {!hasPreviews ? (
                              <span className="block text-[10px] leading-snug text-amber-300/90">
                                {t("publish_need_previews")}
                              </span>
                            ) : null}
                          </span>
                          <StatusBadge status={row.status} label={t(`status_${row.status}`)} />
                        </label>
                      );
                    })}
                  </div>
                )}

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_name")}</span>
                  <input
                    type="text"
                    value={name}
                    maxLength={200}
                    onChange={(event) => setName(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_price")}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>

                {categories && categories.length > 0 ? (
                  <label className="mb-2.5 block">
                    <span className={LABEL_CLASS}>{t("publish_category")}</span>
                    <select
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">{t("publish_category_none")}</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_description")}</span>
                  <textarea
                    value={description}
                    rows={3}
                    maxLength={5000}
                    onChange={(event) => setDescription(event.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                </label>

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_short_description")}</span>
                  <textarea
                    value={shortDescription}
                    rows={2}
                    maxLength={1000}
                    onChange={(event) => setShortDescription(event.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                </label>

                {selectedRow?.fulfillment_mode === "unconfigured" ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200/90">
                    {t("publish_fulfillment_notice")}
                  </p>
                ) : null}
              </div>
            ) : (
              /* ----- gallery form ----- */
              <div>
                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_gallery_title")}</span>
                  <input
                    type="text"
                    value={galleryTitle}
                    maxLength={120}
                    onChange={(event) => setGalleryTitle(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_description")}</span>
                  <textarea
                    value={galleryDescription}
                    rows={3}
                    maxLength={2000}
                    onChange={(event) => setGalleryDescription(event.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                  />
                </label>

                <label className="mb-2.5 block">
                  <span className={LABEL_CLASS}>{t("publish_tags")}</span>
                  <input
                    type="text"
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder={t("publish_tags_hint")}
                    className={INPUT_CLASS}
                  />
                </label>

                <div className="mb-2.5">
                  <span className={LABEL_CLASS}>{t("publish_visibility")}</span>
                  <div className="flex gap-2">
                    {(["public", "unlisted"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setVisibility(option)}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                          visibility === option
                            ? "border-pink-500/60 bg-pink-500/10 text-white"
                            : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/25"
                        }`}
                      >
                        {t(
                          option === "public"
                            ? "publish_visibility_public"
                            : "publish_visibility_unlisted"
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("publish_preview_note")}
                </p>
              </div>
            )}

            {error ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}

            {/* ----- footer ----- */}
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/25 disabled:opacity-50"
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitDisabled}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] disabled:scale-100 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy
                  ? t("publish_submitting")
                  : target === "product"
                    ? t("publish_submit_product")
                    : t("publish_submit_gallery")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
