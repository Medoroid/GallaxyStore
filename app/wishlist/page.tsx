"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, ShoppingBag, Trash2, Loader2, Package } from "lucide-react";
import { useAuth } from "../lib/auth-context";

type WishlistItem = {
  id: string;
  variant_id: string;
  product_id: string | null;
  product_name: string;
  product_price: number;
  product_slug: string;
  product_image: string | null;
  added_at: string;
  note: string | null;
};

export default function WishlistPage() {
  const { user, getToken } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(() => !!user);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const fetchWishlist = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/wishlist", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!cancelled) {
          if (data.success) {
            setItems(data.items);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWishlist();
    return () => { cancelled = true; };
  }, [user, getToken]);

  const handleRemove = async (itemId: string) => {
    setRemoving(itemId);
    try {
      const token = await getToken();
      await fetch(`/api/wishlist?item_id=${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch {
      // ignore
    } finally {
      setRemoving(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to view your wishlist.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          My Account
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          <span className="text-gradient-neon">My</span> Wishlist
        </h1>
        <p className="text-muted-foreground mt-2">
          {items.length === 0 ? "No items saved" : `${items.length} item(s)`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-extrabold mb-2">Wishlist is Empty</h2>
          <p className="text-muted-foreground mb-6">Save products you love for later.</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="glass-strong rounded-3xl p-4 md:p-5 flex gap-4 items-center hover:pink-glow transition-all animate-fade-in-up"
            >
              <div className="relative h-24 w-24 md:h-28 md:w-28 rounded-2xl overflow-hidden shrink-0 bg-white/5">
                {item.product_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.product_image}
                    alt={item.product_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-muted-foreground">
                    <Package className="h-8 w-8" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base md:text-lg truncate">
                  {item.product_name || "Product"}
                </h3>
                {item.product_price > 0 && (
                  <p className="text-sm text-secondary font-semibold mt-1">
                    ${Number(item.product_price).toFixed(2)}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Added {new Date(item.added_at).toLocaleDateString()}
                </p>
                {item.product_id && (
                  <Link
                    href={`/product-details/${item.product_id}`}
                    className="text-sm text-secondary hover:text-secondary/80 mt-2 inline-block"
                  >
                    View Product →
                  </Link>
                )}
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={removing === item.id}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition-all disabled:opacity-50"
                  aria-label="Remove from wishlist"
                >
                  {removing === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
                {item.product_id && (
                  <Link
                    href={`/product-details/${item.product_id}`}
                    className="text-secondary hover:text-secondary/80 p-2 rounded-lg transition-all"
                    aria-label="View product"
                  >
                    <ShoppingBag className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
