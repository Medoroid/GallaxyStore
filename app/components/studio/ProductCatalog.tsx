"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import ProductConfigCard from "./ProductConfigCard";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import type { ProductRowView } from "@/lib/design-studio/product-input";
import { useTemplateCatalog } from "./useTemplateCatalog";
import type { PrintableArea, Transform } from "@/lib/design-studio/types";

type Props = {
  designId: string;
  /** Current design file — Add stays disabled without artwork (honest hint). */
  fileId: string | null;
  transform: Transform;
  area: PrintableArea;
  artworkUrl: string | null;
  artworkReady: boolean;
  /** Bumped by the editor after a publish → refetch so statuses stay true. */
  refreshSignal?: number;
};

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

/**
 * The studio's product catalog section: one design → many products.
 *
 * - Renders the registry's 8 templates as add-able cards; a configured design
 *   shows an "added" control that expands the per-product config card.
 * - Rows load once per design through the caller's JWT (owner-only by RLS);
 *   mutations flow through the allow-listed products API and replace the local
 *   row with the server's response — server truth only, no optimistic writes.
 * - Single-flight Add: one in-flight create at a time, so a double submit can
 *   never race itself (the API's idempotent read-before-insert backstops it).
 */
export default function ProductCatalog({
  designId,
  fileId,
  transform,
  area,
  artworkUrl,
  artworkReady,
  refreshSignal = 0,
}: Props) {
  const { t, locale } = useLanguage();
  const { getToken } = useAuth();
  const {
    templates: catalogTemplates,
    loading: templatesLoading,
    error: templatesError,
  } = useTemplateCatalog();
  const templates = [...catalogTemplates.values()];

  const [rows, setRows] = useState<ProductRowView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const callbacksRef = useRef({ getToken, t });
  useEffect(() => {
    callbacksRef.current = { getToken, t };
  });

  const canAdd = Boolean(fileId) && artworkReady;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const token = await callbacksRef.current.getToken();
        if (!token) {
          if (alive) {
            setRows(null);
            setLoadError(callbacksRef.current.t("studio_err_generic"));
          }
          return;
        }
        const response = await fetch(`/api/designs/${designId}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!alive) return;
        if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
          setRows(null);
          setLoadError(
            mapPayloadError(payload, callbacksRef.current.t("studio_err_generic"), callbacksRef.current.t)
          );
          return;
        }
        const products = (payload as { products?: ProductRowView[] } | null)?.products;
        setLoadError(null);
        setRows(Array.isArray(products) ? products : []);
      } catch {
        if (alive) {
          setRows(null);
          setLoadError(callbacksRef.current.t("studio_err_network"));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [designId, reload, refreshSignal]);

  const addProduct = async (templateKey: string) => {
    if (addingKey || !canAdd) return;
    setAddingKey(templateKey);
    setActionError(null);
    try {
      const token = await callbacksRef.current.getToken();
      if (!token) {
        setActionError(callbacksRef.current.t("studio_err_generic"));
        return;
      }
      const response = await fetch(`/api/designs/${designId}/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ template_key: templateKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || (payload as { success?: boolean } | null)?.success !== true) {
        setActionError(
          mapPayloadError(payload, callbacksRef.current.t("studio_err_generic"), callbacksRef.current.t)
        );
        return;
      }
      const product = (payload as { product?: ProductRowView } | null)?.product;
      if (product) {
        // `created:false` returns an existing row — the same merge keeps the
        // list correct either way (unique per design×template by design).
        setRows((prev) => {
          const current = prev ?? [];
          const deduped = current.filter(
            (item) => item.id !== product.id && item.template_key !== product.template_key
          );
          return [...deduped, product];
        });
        setExpandedId(product.id);
      }
    } catch {
      setActionError(callbacksRef.current.t("studio_err_network"));
    } finally {
      setAddingKey(null);
    }
  };

  const handleRowChange = (updated: ProductRowView) => {
    setRows((prev) => (prev ?? []).map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleRowRemoved = (rowId: string) => {
    setRows((prev) => (prev ?? []).filter((item) => item.id !== rowId));
    setExpandedId((prev) => (prev === rowId ? null : prev));
  };

  // Only rows whose template has a valid PUBLISHED geometry can be configured.
  const expandedRow =
    rows?.find(
      (item) =>
        item.id === expandedId && catalogTemplates.has(item.template_key)
    ) ?? null;

  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-1">
        {t("product_catalog_title")}
      </h3>
      <p className="text-xs text-muted-foreground mb-3">{t("product_catalog_hint")}</p>

      {!canAdd && !loadError ? (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200/90">
          {t("product_need_artwork")}
        </p>
      ) : null}

      {templatesError ? (
        <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {templatesError}
        </p>
      ) : null}
      {templatesLoading ? (
        <p className="mb-3 text-xs text-muted-foreground">{t("common_loading")}</p>
      ) : null}

      {loadError ? (
        <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="text-xs leading-relaxed text-rose-200">{loadError}</p>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold hover:border-pink-500/40 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            {t("common_retry")}
          </button>
        </div>
      ) : rows === null ? (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("common_loading")}
        </div>
      ) : null}

      {rows !== null && rows.length === 0 && !loadError ? (
        <p className="mb-3 text-xs text-muted-foreground">{t("product_empty")}</p>
      ) : null}

      {rows !== null ? (
        <div className="grid grid-cols-2 gap-2">
          {templates.map((template) => {
            const row = rows.find((item) => item.template_key === template.key) ?? null;
            const expanded = row !== null && expandedId === row.id;
            return (
              <div
                key={template.key}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {locale === "ar" ? template.nameAr : template.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t(`product_cat_${template.category}`)}
                  </p>
                </div>
                {row ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                    title={t("product_added")}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      expanded
                        ? "border-pink-500/60 bg-pink-500/10 text-white"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/60"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {expanded ? t("product_hide") : t("product_configure")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canAdd || addingKey !== null}
                    onClick={() => void addProduct(template.key)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-pink-500/40 hover:text-white transition-colors disabled:opacity-50 disabled:hover:border-white/10 disabled:hover:text-muted-foreground"
                  >
                    {addingKey === template.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {addingKey === template.key ? t("product_adding") : t("product_add")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </p>
      ) : null}

      {expandedRow ? (
        <div className="mt-3">
          <ProductConfigCard
            designId={designId}
            fileId={fileId}
            artworkUrl={artworkUrl}
            artworkReady={artworkReady}
            baseTransform={transform}
            area={area}
            row={expandedRow}
            onRowChange={handleRowChange}
            onRowRemoved={handleRowRemoved}
          />
        </div>
      ) : null}
    </section>
  );
}
