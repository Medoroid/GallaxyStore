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

type ProductCardProduct = Product | RemoteProductCard;

interface ProductCardProps {
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

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
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
    const target = href ?? (productId ? `/product-details/${productId}` : null);
    if (target) router.push(target);
  };

  const card = (
    <div className="group relative glass rounded-3xl p-3 transition-all duration-500 hover:-translate-y-1 hover:pink-glow cursor-pointer">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/10">
        <Image
          src={imageSrc}
          alt={title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          onError={() => setImageSrc(FALLBACK_IMAGE)}
        />
        {product.badge && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-neon text-white shadow-lg">
            {product.badge}
          </span>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
          <button
            className="h-9 w-9 grid place-items-center rounded-full glass text-[#9835fd] hover:pink-glow disabled:opacity-50"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wishlisted}
            disabled={wishPending}
            onClick={handleWishlist}
          >
            <Heart className={`h-4 w-4 ${wishlisted ? "fill-current" : ""}`} />
          </button>
          <button
            className="h-9 w-9 grid place-items-center rounded-full glass text-[#9835fd] hover:pink-glow"
            aria-label="Quick view"
            onClick={handleQuickView}
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
        <div className="absolute inset-x-3 bottom-3 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
          <button
            className="w-full h-10 rounded-xl bg-gradient-neon text-white text-sm font-semibold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
            onClick={handleAddToCart}
          >
            <ShoppingBag className="h-4 w-4" /> Add to Cart
          </button>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {product.category ?? "Product"}
        </p>
        <h3 className="font-semibold leading-tight">{title}</h3>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-gradient-gold">
              {formatCurrency(price, currency)}
            </span>
            {comparePrice !== null && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(comparePrice, currency)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-accent">
            <Star className="h-3.5 w-3.5 fill-current" />
            <span className="font-medium">{rating.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
