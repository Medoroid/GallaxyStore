"use client";
import Link from "next/link";
import Image from "next/image";
import { Eye, Heart, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@/data/products";
import { useCartStore } from "../stores/cartStore";

type RemoteProductCard = {
  id: string | number;
  title?: string;
  name?: string;
  thumbnail?: string;
  image?: string;
  category?: string;
  price?: number;
  discountPercentage?: number;
  rating?: number;
  badge?: string;
};

type ProductCardProduct = Product | RemoteProductCard;

interface ProductCardProps {
  product: ProductCardProduct;
  href?: string;
}

export function ProductCard({ product, href }: ProductCardProps) {
  const title = ("title" in product ? product.title ?? product.name : product.name) ?? "Untitled product";
  const image = ("thumbnail" in product ? product.thumbnail ?? product.image : product.image) ?? "/product-tshirt.jpg";
  const currentPrice = ("discountPercentage" in product ? product.discountPercentage ?? product.price : product.price) ?? 0;
  const comparePrice = "oldPrice" in product ? product.oldPrice : product.price;
  const rating = product.rating ?? 0;
  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const productId = String(("id" in product ? product.id : Date.now()));
    addItem({
      product_id: productId,
      name: title,
      price: currentPrice,
      image,
    });
  };

  const card = (
    <div className="group relative glass rounded-3xl p-3 transition-all duration-500 hover:-translate-y-1 hover:pink-glow cursor-pointer">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white">
      
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {product.badge && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-neon text-white shadow-lg">
            {product.badge}
          </span>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
          <button
            className="h-9 w-9 grid place-items-center rounded-full text-[#9835fd] glass hover:pink-glow"
            aria-label="Wishlist"
            onClick={(e) => e.preventDefault()}
          >
            <Heart className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 grid place-items-center rounded-full glass text-[#9835fd] hover:pink-glow"
            aria-label="Quick view"
            onClick={(e) => e.preventDefault()}
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
              ${currentPrice.toFixed(2)}
            </span>
            {comparePrice && comparePrice !== currentPrice && (
              <span className="text-xs text-muted-foreground line-through">
                ${comparePrice.toFixed(2)}
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
