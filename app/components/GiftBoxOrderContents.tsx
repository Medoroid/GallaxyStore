"use client";

import { Gift, Package } from "lucide-react";
import { useLanguage } from "@/app/lib/language-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";

/**
 * Historical gift box composition for an order line.
 * Renders the FROZEN snapshot rows written by `checkout()` — later admin edits
 * to the box can never change what is shown here.
 */

export type OrderGiftBoxContent = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  variant_options?: Record<string, string> | null;
  unit_price: number;
  quantity: number;
  display_order?: number;
  image?: string | null;
};

export default function GiftBoxOrderContents({
  rows,
  currency = "USD",
}: {
  rows: OrderGiftBoxContent[] | null | undefined;
  currency?: string;
}) {
  const { t } = useLanguage();

  if (!rows || rows.length === 0) return null;

  return (
    <div
      data-testid="gift-box-order-contents"
      className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
    >
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
        <Gift className="w-3.5 h-3.5 text-[var(--brand-2)]" />
        <span className="font-medium">{t("gift_box_order_contents")}</span>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row, index) => {
          const options = row.variant_options
            ? Object.values(row.variant_options).filter(Boolean).join(" / ")
            : "";
          const key = row.id ?? `${row.product_id ?? "item"}-${index}`;
          return (
            <li key={key} className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-6 h-6 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
                <Package className="w-3 h-3 text-gray-600" />
              </span>
              <span className="text-gray-300 truncate">{row.product_name}</span>
              {options && <span className="shrink-0">({options})</span>}
              <span className="text-[var(--brand-2)] shrink-0">×{row.quantity}</span>
              <span className="shrink-0">
                {formatCurrency(Number(row.unit_price ?? 0), currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
