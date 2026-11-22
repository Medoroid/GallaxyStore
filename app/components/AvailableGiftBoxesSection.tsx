"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { Gift, Package, ArrowRight, Sparkles, ShoppingBag, Eye, Heart } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/app/lib/language-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { productImageUrlFromPath } from "@/lib/products";
import { useCartStore } from "../stores/cartStore";

export type PublicGiftBox = {
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

const FALLBACK_BOXES: PublicGiftBox[] = [
  {
    id: "box-cyberpunk",
    name: "Cyberpunk Gamer Gift Box",
    slug: "cyberpunk-gamer-box",
    short_description: "Premium curated bundle featuring gaming apparel, neon accessories, stickers & themed collectibles.",
    base_price: 79.99,
    compare_at_price: 110.0,
    currency: "USD",
    image: "/product-giftbox.jpg",
    item_count: 5,
    contents_value: 110.0,
    savings: 30.01,
  },
  {
    id: "box-anime-deluxe",
    name: "Anime Deluxe Mystery Box",
    slug: "anime-deluxe-box",
    short_description: "Exclusive anime themed items: oversized hoodie, collector mug, desk mat, and enamel pin.",
    base_price: 64.99,
    compare_at_price: 85.0,
    currency: "USD",
    image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=600&q=80",
    item_count: 4,
    contents_value: 85.0,
    savings: 20.01,
  },
  {
    id: "box-galaxy-starter",
    name: "Galaxy Starter Gift Box",
    slug: "galaxy-starter-box",
    short_description: "The perfect cosmic gift: custom graphic tee, insulated bottle, phone case, and galaxy stickers.",
    base_price: 49.99,
    compare_at_price: 70.0,
    currency: "USD",
    image: "/product-frame.jpg",
    item_count: 4,
    contents_value: 70.0,
    savings: 20.01,
  },
  {
    id: "box-birthday-cosmic",
    name: "Birthday Celebration Box",
    slug: "birthday-celebration-box",
    short_description: "Handcrafted celebration pack with greeting card, customized drinkware, tee, and galaxy treats.",
    base_price: 59.99,
    compare_at_price: 80.0,
    currency: "USD",
    image: "/product-mug.jpg",
    item_count: 4,
    contents_value: 80.0,
    savings: 20.01,
  },
];

export function AvailableGiftBoxesSection() {
  const { t } = useLanguage();
  const addItem = useCartStore((s) => s.addItem);

  const { data, isLoading } = useQuery<{ success: boolean; boxes?: PublicGiftBox[] }>({
    queryKey: ["availableGiftBoxes"],
    queryFn: async () => {
      const res = await fetch("/api/gift-boxes");
      if (!res.ok) return { success: false, boxes: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  const apiBoxes = data?.boxes ?? [];
  const boxes = apiBoxes.length > 0 ? apiBoxes : FALLBACK_BOXES;

  const handleAddToCart = (e: React.MouseEvent, box: PublicGiftBox) => {
    e.preventDefault();
    e.stopPropagation();

    const imageUrl = box.image ? (productImageUrlFromPath(box.image) ?? "/product-giftbox.jpg") : "/product-giftbox.jpg";

    addItem({
      product_id: String(box.id),
      name: box.name,
      price: Number(box.base_price),
      currency: box.currency || "USD",
      image: imageUrl,
    });

    toast.success(`${box.name} added to cart!`);
  };

  return (
    <section className="mt-20">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 glass px-3 py-1 rounded-full text-xs font-semibold text-secondary mb-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Curated For Every Occasion</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Gift className="h-7 w-7 text-pink-400" />
            <span>{t("gift_boxes_title") || "Available Gift Boxes"}</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {t("gift_boxes_subtitle") || "Ready-to-deliver premium themed boxes curated with out-of-this-world items."}
          </p>
        </div>

        <Link
          href="/gift-boxes"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-secondary hover:text-white transition-colors group shrink-0"
        >
          <span>See all boxes</span>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180 transition-transform" />
        </Link>
      </div>

      {/* Grid of Available Gift Boxes */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-3xl p-4 aspect-[3/4] animate-pulse space-y-3">
              <div className="aspect-square rounded-2xl bg-white/5" />
              <div className="h-4 bg-white/5 rounded w-3/4" />
              <div className="h-4 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {boxes.map((box) => {
            const rawImage = box.image ? (productImageUrlFromPath(box.image) ?? "/product-giftbox.jpg") : "/product-giftbox.jpg";
            const targetHref = `/product-details/${box.id}`;
            const savings = box.savings && box.savings > 0 ? box.savings : (box.compare_at_price && box.compare_at_price > box.base_price ? box.compare_at_price - box.base_price : null);

            return (
              <div
                key={box.id}
                className="group relative flex flex-col justify-between h-full glass rounded-3xl p-3 sm:p-4 transition-all duration-300 hover:-translate-y-1 hover:pink-glow"
              >
                {/* Media Container */}
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/5 mb-3">
                  <Link href={targetHref} className="block relative w-full h-full" tabIndex={-1}>
                    <Image
                      src={rawImage}
                      alt={box.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/product-giftbox.jpg";
                      }}
                    />
                  </Link>

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-neon text-white shadow-md flex items-center gap-1">
                      <Gift className="h-3 w-3" /> Box
                    </span>
                    {box.item_count > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 backdrop-blur-md text-white/90 border border-white/10 shadow-sm">
                        {box.item_count} items
                      </span>
                    )}
                  </div>

                  {/* Savings Badge */}
                  {savings && savings > 0 ? (
                    <div className="absolute top-2.5 right-2.5 z-10">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md shadow-md">
                        Save {formatCurrency(savings, box.currency)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Box Information */}
                <div className="flex flex-col flex-1 justify-between">
                  <div>
                    <Link href={targetHref} className="block group-hover:text-pink-300 transition-colors">
                      <h3 className="font-bold text-sm sm:text-base leading-snug line-clamp-1 mb-1">
                        {box.name}
                      </h3>
                    </Link>
                    {box.short_description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {box.short_description}
                      </p>
                    )}
                  </div>

                  {/* Price & Add to Cart */}
                  <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-white/10">
                    <div className="flex flex-col min-w-0">
                      <span className="text-base sm:text-lg font-extrabold text-gradient-gold truncate">
                        {formatCurrency(box.base_price, box.currency)}
                      </span>
                      {box.compare_at_price && box.compare_at_price > box.base_price ? (
                        <span className="text-xs text-muted-foreground line-through -mt-0.5">
                          {formatCurrency(box.compare_at_price, box.currency)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={targetHref}
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl glass hover:pink-glow text-white/90 hover:text-white flex items-center justify-center transition-all shadow-md"
                        title="View Box Details"
                        aria-label="View Box Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={(e) => handleAddToCart(e, box)}
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-neon text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md pink-glow"
                        title="Add Box to Cart"
                        aria-label="Add Box to Cart"
                      >
                        <ShoppingBag className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Gift Box Callout Banner */}
      <div className="mt-8 rounded-3xl glass-strong border border-pink-500/20 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-44 w-44 bg-gradient-neon blur-3xl opacity-30 rounded-full pointer-events-none" />
        <div className="relative space-y-2 text-center md:text-left rtl:md:text-right">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
            <Package className="h-4 w-4" />
            <span>{t("gift_boxes_custom") || "Looking for a custom box?"}</span>
          </div>
          <h4 className="text-xl md:text-2xl font-extrabold text-white">
            Build Your Own Custom Themed Gift Box
          </h4>
          <p className="text-sm text-muted-foreground max-w-xl">
            Choose your budget, occasion, recipient preferences and add a personalized note. Our creators will handpick the ideal set.
          </p>
        </div>

        <Link
          href="/gift-boxes"
          className="relative px-6 py-3 rounded-2xl bg-gradient-neon text-white font-bold text-sm inline-flex items-center gap-2 hover:scale-105 transition-transform pink-glow shadow-xl shrink-0"
        >
          <span>{t("gift_boxes_request") || "Customize a Box"}</span>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
    </section>
  );
}
