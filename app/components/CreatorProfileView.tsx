"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Images,
  Loader2,
  Package,
  RefreshCw,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "../lib/language-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";
import { designPreviewUrl, formatDate, publicStorageUrl } from "@/lib/creator/media";
import { GalleryItemCard, type GalleryCardItem } from "./GalleryItemCard";
import { SOCIAL_LINK_KEYS } from "@/lib/creator/profile-validation";

/** Persona fields that are safe to expose publicly (the API strips the rest). */
export type CreatorPersona = {
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  is_featured: boolean;
  created_at: string;
};

export type CreatorCounts = {
  products: number;
  gallery: number;
  designs: number;
};

type ProductItem = {
  id: string;
  status: string;
  mockups: Array<Record<string, unknown>> | null;
  fulfillment_mode: string;
  product: {
    id: string;
    name: string;
    slug: string;
    base_price: number;
    compare_at_price: number | null;
    currency: string;
    avg_rating: number | null;
    rating_count: number;
    product_images: Array<{
      id: string;
      storage_path: string;
      alt_text: string | null;
      is_primary: boolean;
      sort_order: number;
    }>;
  } | null;
};

// Shared with the /creators discovery directory — one card, one contract.
type GalleryItem = GalleryCardItem;

type TabKey = "products" | "gallery";

const PER_PAGE = 12;

const CONTENT_LABELS: Record<TabKey, string> = {
  products: "creator_products_count",
  gallery: "creator_gallery_count",
};

const EMPTY_MESSAGES: Record<TabKey, string> = {
  products: "creator_empty_products",
  gallery: "creator_empty_gallery",
};

function socialLabel(key: string): string {
  if (key === "x") return "X";
  if (key === "twitter") return "X";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function avatarSrc(path: string | null): string | null {
  return publicStorageUrl(path, "avatars");
}

function primaryProductImage(item: ProductItem): string | null {
  const images = item.product?.product_images ?? [];
  const primary = images
    .slice()
    .sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
    )
    .find((image) => image.storage_path);
  if (primary) {
    const url = productImageUrlFromPath(primary.storage_path);
    if (url) return url;
  }
  // Fallback: the first persisted mockup (Phase 5+ writes these).
  const firstMockup = item.mockups?.[0];
  const mockupPath =
    typeof firstMockup?.path === "string" ? (firstMockup.path as string) : null;
  return designPreviewUrl(mockupPath);
}

export function CreatorProfileView({
  creator,
  counts,
}: {
  creator: CreatorPersona;
  counts: CreatorCounts;
}) {
  const { t, locale } = useLanguage();

  const [tab, setTab] = useState<TabKey>("products");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<Array<ProductItem | GalleryItem>>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Loading/error transitions are started by the handlers that change the
    // tab, page or reload counter — the effect body itself only fetches, so
    // no setState runs synchronously inside the effect.
    (async () => {
      try {
        const res = await fetch(
          `/api/creators/${encodeURIComponent(creator.username)}/content` +
            `?type=${tab}&page=${page}&per_page=${PER_PAGE}`
        );
        const payload = await res.json().catch(() => null);
        if (!payload?.success) {
          throw new Error(payload?.message || "Request failed");
        }
        if (cancelled) return;
        setItems(payload.items ?? []);
        setTotal(Number(payload.total ?? 0));
        setTotalPages(Math.max(1, Number(payload.total_pages ?? 1)));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error && err.message ? err.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creator.username, tab, page, reload]);

  const switchTab = (next: TabKey) => {
    if (next === tab) return;
    setLoading(true);
    setError(null);
    setTab(next);
    setPage(1);
  };

  const goToPage = (updater: (current: number) => number) => {
    setLoading(true);
    setError(null);
    setPage(updater);
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    setReload((current) => current + 1);
  };

  const avatar = avatarSrc(creator.avatar_url);
  const socialEntries = Object.entries(creator.social_links ?? {}).filter(
    ([key, value]) =>
      SOCIAL_LINK_KEYS.has(key) &&
      typeof value === "string" &&
      /^https?:\/\//.test(value)
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      {/* Persona header */}
      <header className="glass-strong rounded-3xl p-6 md:p-8 mb-8">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="h-20 w-20 shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.05] flex items-center justify-center text-3xl font-extrabold text-gradient-neon">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={creator.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              creator.display_name.charAt(0).toUpperCase()
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
                {t("creator_public_profile")}
              </p>
              {creator.is_featured && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-200 text-xs font-semibold">
                  <Star className="h-3 w-3 fill-current" />
                  {t("creator_featured")}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 break-words">
              {creator.display_name}
            </h1>
            <p className="text-muted-foreground mt-1">@{creator.username}</p>
            {creator.bio && (
              <p className="text-sm text-secondary/90 mt-3 max-w-2xl whitespace-pre-line">
                {creator.bio}
              </p>
            )}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
            <div className="flex flex-wrap gap-2">
              <CountChip
                icon={Package}
                value={counts.products}
                label={t("creator_products_count")}
              />
              <CountChip
                icon={Images}
                value={counts.gallery}
                label={t("creator_gallery_count")}
              />
              <CountChip
                icon={Star}
                value={counts.designs}
                label={t("creator_designs_count")}
              />
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("creator_joined")} {formatDate(creator.created_at, locale)}
            </p>
          </div>
        </div>

        {socialEntries.length > 0 && (
          <div className="mt-6 pt-5 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground me-1">
              {t("creator_social_links")}
            </span>
            {socialEntries.map(([key, value]) => (
              <a
                key={key}
                href={value}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-xs font-semibold text-secondary hover:text-white hover:border-pink-500/40 transition-colors"
              >
                {socialLabel(key)}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {(Object.keys(CONTENT_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-gradient-neon text-white"
                : "border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white hover:border-white/20"
            }`}
          >
            {t(CONTENT_LABELS[key])}
          </button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-amber-400 mb-3" />
          <p className="text-sm text-muted-foreground mb-5 break-words">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-neon text-white text-sm font-semibold hover:scale-105 transition-transform"
          >
            <RefreshCw className="h-4 w-4" />
            {t("common_retry")}
          </button>
        </div>
      ) : loading ? (
        <div className="glass-strong rounded-3xl p-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-secondary" />
          <p className="text-sm text-muted-foreground">{t("common_loading")}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-strong rounded-3xl p-14 text-center">
          <Images className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t(EMPTY_MESSAGES[tab])}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tab === "products"
              ? (items as ProductItem[]).map((item) => (
                  <ProductGridCard key={item.id} item={item} />
                ))
              : (items as GalleryItem[]).map((item) => (
                  <GalleryItemCard key={item.id} item={item} />
                ))}
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-8 flex items-center justify-center gap-4"
              aria-label="Pagination"
            >
              <button
                type="button"
                onClick={() => goToPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-pink-500/40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                {t("common_previous")}
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page} / {totalPages}
                {total > 0 ? ` · ${total}` : ""}
              </span>
              <button
                type="button"
                onClick={() => goToPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-pink-500/40 transition-colors"
              >
                {t("common_next")}
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function CountChip({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-xs font-semibold"
      title={label}
    >
      <Icon className="h-3.5 w-3.5 text-secondary" />
      <span className="tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ProductGridCard({ item }: { item: ProductItem }) {
  const product = item.product;
  if (!product) return null;

  const image = primaryProductImage(item);
  const price = Number(product.base_price ?? 0);
  const compareAt =
    Number(product.compare_at_price ?? 0) > price
      ? Number(product.compare_at_price)
      : null;
  const rating = Number(product.avg_rating ?? 0);
  const ratingCount = Number(product.rating_count ?? 0);

  return (
    <Link
      href={`/product-details/${product.id}`}
      className="group glass rounded-2xl p-2.5 flex flex-col hover:-translate-y-1 hover:pink-glow transition-all"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-white/10 flex items-center justify-center">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground" />
        )}
        {rating > 0 && (
          <span className="absolute top-2 end-2 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[10px] font-bold text-amber-300">
            <Star className="h-3 w-3 fill-current" />
            {rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="pt-2.5 flex-1 flex flex-col">
        <h3 className="text-xs sm:text-sm font-semibold line-clamp-2 group-hover:text-pink-300 transition-colors">
          {product.name}
        </h3>
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span className="text-sm font-extrabold text-gradient-gold">
            {formatCurrency(price, (product.currency || "USD").toUpperCase())}
          </span>
          {compareAt !== null && (
            <span className="text-[10px] text-muted-foreground line-through">
              {formatCurrency(compareAt, (product.currency || "USD").toUpperCase())}
            </span>
          )}
          {ratingCount > 0 && (
            <span className="ms-auto text-[10px] text-muted-foreground">
              ({ratingCount})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

