"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Gift, Loader2, Package, RefreshCw } from "lucide-react";
import { useLanguage } from "@/app/lib/language-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";

/**
 * Public gift boxes grid (used on /gift-boxes).
 * Lists published+visible `products` rows that carry a `gift_boxes` marker.
 * Loading / empty / error states included; a pending migration responds with
 * an empty list and the section stays silent.
 */

type PublicBox = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  base_price: number;
  compare_at_price: number | null;
  currency: string;
  image: string | null;
  item_count: number;
  contents_value: number | null;
  savings: number | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; boxes: PublicBox[] };

export default function GiftBoxesGrid() {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/gift-boxes");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", boxes: data.boxes ?? [] });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div data-testid="gift-boxes-grid" className="space-y-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("gift_boxes_loading")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl overflow-hidden animate-pulse">
              <div className="h-40 bg-white/[0.05]" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-white/[0.05] rounded w-2/3" />
                <div className="h-4 bg-white/[0.05] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        data-testid="gift-boxes-grid"
        className="glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {t("gift_boxes_load_error")}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-300 text-xs hover:bg-white/[0.1] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("gift_box_retry")}
        </button>
      </div>
    );
  }

  if (state.boxes.length === 0) {
    return (
      <div data-testid="gift-boxes-grid" className="glass rounded-2xl p-10 text-center">
        <Gift className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">{t("gift_boxes_empty")}</p>
      </div>
    );
  }

  return (
    <div data-testid="gift-boxes-grid" className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Gift className="w-5 h-5 text-[var(--brand-2)]" />
          {t("gift_boxes_title")}
        </h2>
        <p className="text-gray-400 text-sm mt-1">{t("gift_boxes_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.boxes.map((box) => {
          const image = box.image ? productImageUrlFromPath(box.image) : null;
          return (
            <Link
              key={box.id}
              href={`/product-details/${box.id}`}
              className="glass rounded-2xl overflow-hidden group hover:border-[var(--brand)]/50 transition-colors"
            >
              <div className="h-40 bg-white/[0.03] flex items-center justify-center overflow-hidden">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={box.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                  />
                ) : (
                  <Package className="w-10 h-10 text-gray-600" />
                )}
              </div>

              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white font-semibold line-clamp-1 group-hover:text-[var(--brand-2)] transition-colors">
                    {box.name}
                  </h3>
                  {box.savings != null && box.savings > 0 && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400">
                      −{formatCurrency(box.savings, box.currency)}
                    </span>
                  )}
                </div>

                {box.short_description && (
                  <p className="text-gray-500 text-xs line-clamp-2">{box.short_description}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--brand-2)] font-semibold">
                      {formatCurrency(box.base_price, box.currency)}
                    </span>
                    {box.compare_at_price != null && box.compare_at_price > box.base_price && (
                      <span className="text-gray-600 line-through text-xs">
                        {formatCurrency(box.compare_at_price, box.currency)}
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {t("gift_box_items_count").replace("{n}", String(box.item_count))}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
