"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, EyeOff, Gift, Loader2, Package, RefreshCw } from "lucide-react";
import { useLanguage } from "@/app/lib/language-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";

/**
 * Gift box contents block for the product page.
 *
 * Fetches `/api/gift-boxes/[id]`:
 *  - a product that is not a box (or a pending migration) renders NOTHING —
 *    zero impact on the regular product page;
 *  - components that are hidden/draft are shown WITHOUT a link (never a dead
 *    URL), following the server's `publicly_accessible` flag;
 *  - contents value + savings come from the server's shared money math, so
 *    mixed currencies render as "unavailable" instead of fabricated numbers.
 */

type ContentRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  note: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    publicly_accessible: boolean;
    href: string | null;
  } | null;
  image: string | null;
  variant: { id: string; sku: string; label: string } | null;
  unit_price: number;
  in_stock: boolean;
  stock: number;
};

type DetailResponse = {
  success: boolean;
  is_gift_box: boolean;
  schema_pending?: boolean;
  box?: { id: string; name: string; slug: string; currency: string };
  contents?: ContentRow[];
  contents_value?: number | null;
  savings?: number | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DetailResponse };

export default function GiftBoxContents({ productId }: { productId: string }) {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/gift-boxes/${productId}`);
      const data: DetailResponse | null = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", data });
    } catch {
      setState({ status: "error" });
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <section
        data-testid="gift-box-contents"
        className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("gift_box_contents_title")}
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
            <div className="w-10 h-10 rounded-lg bg-white/[0.06]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.06] rounded w-2/3" />
              <div className="h-3 bg-white/[0.06] rounded w-1/3" />
            </div>
          </div>
        ))}
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        data-testid="gift-box-contents"
        className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {t("gift_box_load_error")}
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-300 text-xs hover:bg-white/[0.1] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("gift_box_retry")}
          </button>
        </div>
      </section>
    );
  }

  const { data } = state;
  // Not a gift box (or schema pending) → render nothing at all.
  if (!data.is_gift_box || data.schema_pending) return null;

  const contents = data.contents ?? [];
  const currency = data.box?.currency ?? "USD";

  return (
    <section
      data-testid="gift-box-contents"
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-[var(--brand-2)]" />
        <h3 className="text-white font-semibold text-sm sm:text-base">
          {t("gift_box_contents_title")}
        </h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400">
          {t("gift_box_items_count").replace("{n}", String(contents.length))}
        </span>
      </div>

      {contents.length === 0 ? (
        <p className="text-gray-500 text-sm">{t("gift_box_empty")}</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {contents.map((item) => {
            const image = item.image ? productImageUrlFromPath(item.image) : null;
            const variantLabel = item.variant?.label || item.variant?.sku || "";
            const nameNode = item.product?.publicly_accessible && item.product.href ? (
              <Link
                href={item.product.href}
                className="text-white text-sm font-medium hover:text-[var(--brand-2)] transition-colors"
              >
                {item.product?.name ?? "—"}
              </Link>
            ) : (
              <span className="text-white text-sm font-medium">
                {item.product?.name ?? "—"}
              </span>
            );

            return (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <div className="w-10 h-10 rounded-lg bg-white/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-gray-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {nameNode}
                    {item.product && !item.product.publicly_accessible && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.07] text-gray-400">
                        <EyeOff className="w-3 h-3" />
                        {t("gift_box_hidden_notice")}
                      </span>
                    )}
                    {!item.in_stock && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                        {t("gift_box_out_of_stock")}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="text-[var(--brand-2)] font-medium">
                      ×{item.quantity}
                    </span>
                    {variantLabel && <span>{variantLabel}</span>}
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                  </div>

                  {item.note && (
                    <p className="mt-1 text-xs text-gray-500 italic">{item.note}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {contents.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.07] text-sm">
          <span className="text-gray-400">{t("gift_box_contents_value")}</span>
          {data.contents_value != null ? (
            <span className="text-gray-200 font-medium">
              {formatCurrency(data.contents_value, currency)}
              {data.savings != null && data.savings > 0 && (
                <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold">
                  {t("gift_box_savings")} {formatCurrency(data.savings, currency)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-500 text-xs">—</span>
          )}
        </div>
      )}
    </section>
  );
}
