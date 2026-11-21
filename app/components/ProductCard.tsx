"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, Heart, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/data/products";
import { useCartStore } from "../stores/cartStore";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type RemoteProductCard = {
  id: string | number;
  title?: string;
  name?: string;
  thumbnail?: string;
  image?: string;
  category?: string;
  price?: number;
  /** Monetary price before discount. Never use this as the current price. */
  originalPrice?: number | null;
  discountPercentage?: number;
  currency?: string;
  rating?: number;
  badge?: string;
};

export type ProductCardProduct = Product | RemoteProductCard;

export interface ProductCardProps {
  product: ProductCardProduct;
  href?: string;
}

const FALLBACK_IMAGE = "/product-tshirt.jpg";

export function ProductCard({ product, href }: ProductCardProps) {
  const title = ("title" in product ? product.title ?? product.name : product.name) ?? "Untitled product";
  const image = ("thumbnail" in product ? product.thumbnail ?? product.image : product.image) ?? FALLBACK_IMAGE;
  const price = Number(product.price ?? 0);
  const rawComparePrice =
    "originalPrice" in product
      ? product.originalPrice
      : "oldPrice" in product
        ? product.oldPrice
        : null;
  const comparePrice =
    rawComparePrice != null && Number(rawComparePrice) > price ? Number(rawComparePrice) : null;
  const currency = (("currency" in product && product.currency) || "USD").toUpperCase();
  const rating = Number(product.rating ?? 0);
  const addItem = useCartStore((s) => s.addItem);
  const { user, getToken } = useAuth();
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(false);
  const [wishPending, setWishPending] = useState(false);

  // A missing Storage object must not leave a broken image in the grid.
  const [imageSrc, setImageSrc] = useState(image);
  useEffect(() => setImageSrc(image), [image]);

  const productId = "id" in product && product.id != null ? String(product.id) : "";
  const targetHref = href ?? (productId ? `/product-details/${productId}` : "#");

  // Calculate discount percentage if available
  const discountPercent =
    comparePrice && comparePrice > price
      ? Math.round(((comparePrice - price) / comparePrice) * 100)
      : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      // Fallback key for id-less products; runs in a click handler, never
      // during render (false positive of the compiler purity rule).
      // eslint-disable-next-line react-hooks/purity -- Date.now() is safe here
      product_id: productId || String(Date.now()),
      name: title,
      price,
      currency,
      image: imageSrc,
    });
    toast.success(`${title} added to cart`, {
      description: formatCurrency(price, currency),
      duration: 2500,
    });
  };

  const handleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push("/login");
      return;
    }
    if (!productId || wishPending) return;

    setWishPending(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setWishlisted(data.action === "added");
      }
    } catch {
      // ignore
    } finally {
      setWishPending(false);
    }
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetHref && targetHref !== "#") router.push(targetHref);
  };

  return (
    <div className="group relative flex flex-col justify-between h-full glass rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 transition-all duration-300 hover:-translate-y-1 hover:pink-glow">
      {/* Top Media Container */}
      <div className="relative aspect-square overflow-hidden rounded-xl sm:rounded-2xl bg-white/10">
        <Link href={targetHref} className="block relative w-full h-full" tabIndex={-1}>
          <Image
            src={imageSrc}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setImageSrc(FALLBACK_IMAGE)}
          />
        </Link>

        {/* Badges: Discount & Custom Badge */}
        <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
          {discountPercent !== null && (
            <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-accent text-accent-foreground shadow-md">
              -{discountPercent}%
            </span>
          )}
          {product.badge && (
            <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-gradient-neon text-white shadow-md">
              {product.badge}
            </span>
          )}
        </div>

        {/* Action Buttons: Wishlist & Quick View */}
        <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 flex flex-col gap-1.5 z-10">
          <button
            className={`h-8 w-8 sm:h-8 sm:w-8 grid place-items-center rounded-full transition-all shadow-xl backdrop-blur-md border ${
              wishlisted
                ? "bg-pink-500 text-white border-pink-400 pink-glow scale-105"
                : "bg-black/75 border-white/20 text-pink-400 hover:text-white hover:bg-gradient-neon hover:border-pink-500 hover:scale-110 active:scale-95"
            }`}
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wishlisted}
            disabled={wishPending}
            onClick={handleWishlist}
          >
            <Heart className={`h-4 w-4 ${wishlisted ? "fill-white" : "fill-current"}`} />
          </button>

          <button
            className="hidden sm:grid h-8 w-8 place-items-center rounded-full bg-black/75 border border-white/20 text-white/90 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-gradient-neon hover:border-pink-500 hover:scale-110 active:scale-95 transition-all shadow-xl backdrop-blur-md"
            aria-label="Quick view"
            onClick={handleQuickView}
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Product Information */}
      <div className="flex flex-col flex-1 justify-between pt-2.5 sm:pt-3">
        <div className="space-y-1">
          {/* Category & Rating Row */}
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] text-muted-foreground min-h-[16px]">
            {product.category && product.category !== "Product" ? (
              <span className="uppercase tracking-wider font-semibold truncate max-w-[70%]">
                {product.category}
              </span>
            ) : (
              <span />
            )}

            {/* Display rating only if it exists (> 0) */}
            {rating > 0 ? (
              <div className="inline-flex items-center gap-0.5 text-accent font-medium shrink-0">
                <Star className="h-3 w-3 fill-current" />
                <span>{rating.toFixed(1)}</span>
              </div>
            ) : null}
          </div>

          {/* Title with uniform 2-line height */}
          <Link href={targetHref} className="block group-hover:text-pink-300 transition-colors">
            <h3 className="font-semibold leading-snug text-xs sm:text-sm line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]">
              {title}
            </h3>
          </Link>
        </div>

        {/* Price & Quick Add Button Row */}
        <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-white/5">
          <div className="flex flex-col min-w-0">
            <span className="text-sm sm:text-base md:text-lg font-extrabold text-gradient-gold truncate">
              {formatCurrency(price, currency)}
            </span>
            {comparePrice !== null && (
              <span className="text-[10px] sm:text-xs text-muted-foreground line-through -mt-0.5">
                {formatCurrency(comparePrice, currency)}
              </span>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 rounded-lg sm:rounded-xl bg-gradient-neon text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md shrink-0 pink-glow"
            aria-label="Add to cart"
            title="Add to cart"
          >
            <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
