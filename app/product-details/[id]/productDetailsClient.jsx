"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Heart,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  ZoomIn,
} from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { ReviewStars, ReviewStatsDisplay, ReviewForm, ReviewsList } from "@/app/components/Reviews";
import { ProductJsonLd, BreadcrumbJsonLd } from "@/app/components/JsonLd";
import {
  fetchProductById,
  fetchRelatedProducts,
  productCardImage,
  productImageUrl,
  toProductCardProduct,
} from "@/lib/products";
import { useCartStore } from "../../stores/cartStore";
import { useAuth } from "../../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

const COLOR_OPTIONS = [
  { id: "silver", name: "Silver / فضي", hex: "#C0C0C0" },
  { id: "gold", name: "Gold / ذهبي", hex: "#FFD166" },
  { id: "black", name: "Black / أسود", hex: "#120018" },
  { id: "white", name: "White / أبيض", hex: "#F8FAFC" },
];
const NAMED_COLOR_HEX = {
  silver: "#C0C0C0",
  "فضي": "#C0C0C0",
  gold: "#FFD166",
  "ذهبي": "#FFD166",
  black: "#120018",
  "أسود": "#120018",
  white: "#F8FAFC",
  "أبيض": "#F8FAFC",
  navy: "#172554",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#16A34A",
  pink: "#EC4899",
  purple: "#9333EA",
};

const DEFAULT_SIZES = ["One Size"];
const RING_SIZES = ["6", "7", "8", "9", "10", "11", "12"];

function formatDate(value) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(hex) ? hex.toUpperCase() : null;
}

function colorOptionFromValue(value, index) {
  if (typeof value !== "string" || !value.trim()) return null;
  const label = value.trim();
  const hex = normalizeHex(label) ?? NAMED_COLOR_HEX[label.toLowerCase()] ?? NAMED_COLOR_HEX[label];

  if (!hex) return null;

  return {
    id: `${hex}-${index}`,
    name: normalizeHex(label) ? hex : label,
    hex,
  };
}

function getProductOptions(product) {
  const haystack = `${product.name ?? ""} ${product.short_description ?? ""} ${product.description ?? ""} ${product.categories?.name ?? ""}`.toLowerCase();
  const supabaseColors = [
    ...(Array.isArray(product.available_colors) ? product.available_colors : []),
    product.color,
  ]
    .map(colorOptionFromValue)
    .filter(Boolean);

  const colors = [...new Map(supabaseColors.map((item) => [item.hex, item])).values()];

  if (haystack.includes("silver") || haystack.includes("فضة") || haystack.includes("فضي")) {
    colors.push(COLOR_OPTIONS[0]);
  }

  if (haystack.includes("gold") || haystack.includes("ذهبي")) {
    colors.push(COLOR_OPTIONS[1]);
  }

  if (haystack.includes("black") || haystack.includes("أسود")) {
    colors.push(COLOR_OPTIONS[2]);
  }

  if (haystack.includes("white") || haystack.includes("أبيض")) {
    colors.push(COLOR_OPTIONS[3]);
  }

  return {
    colors: colors.length ? colors : COLOR_OPTIONS,
    sizes: haystack.includes("ring") || haystack.includes("خاتم") ? RING_SIZES : DEFAULT_SIZES,
  };
}

function ProductDetailsClient({ id }) {
  const [activeThumb, setActiveThumb] = useState(0);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [tab, setTab] = useState("desc");
  const [wishlisted, setWishlisted] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({ avg_rating: 0, review_count: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const { user, getToken } = useAuth();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["singleProduct", id],
    queryFn: async () => {
      const currentProduct = await fetchProductById(String(id));
      const relatedProducts = await fetchRelatedProducts(currentProduct, 4);

      return { product: currentProduct, related: relatedProducts };
    },
    enabled: Boolean(id),
  });

  const productData = data?.product ?? null;
  const suggestions = data?.related ?? [];

  const productOptions = useMemo(() => {
    if (!productData) return { colors: COLOR_OPTIONS, sizes: DEFAULT_SIZES };
    return getProductOptions(productData);
  }, [productData]);

  // Track product view on mount
  useEffect(() => {
    if (!productData?.id) return;
    const trackView = async () => {
      try {
        const token = user ? await getToken() : null;
        const body = token ? {} : { session_token: localStorage.getItem("cart_session_token") || crypto.randomUUID() };
        await fetch(`/api/products/${productData.id}/track`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch { /* ignore */ }
    };
    trackView();
  }, [productData?.id, user, getToken]);

  // Fetch reviews when product loads or tab changes
  useEffect(() => {
    if (tab === "reviews" && productData?.id) {
      fetchReviews();
    }
  }, [tab, productData?.id]);

  // Auto-fetch reviews when tab changes to reviews
  const handleTabChange = (newTab) => {
    setTab(newTab);
    if (newTab === "reviews" && productData?.id && reviews.length === 0) {
      fetchReviews();
    }
  };
  const fetchReviews = async () => {
    if (!productData?.id) return;
    setReviewsLoading(true);
    try {
      const res = await fetch(`/api/reviews?product_id=${productData.id}`);
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews);
        setReviewStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleWishlistToggle = async () => {
    if (!productData?.id || !user) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productData.id }),
      });
      const data = await res.json();
      if (data.success) {
        setWishlisted(data.action === "added");
      }
    } catch {
      // ignore
    }
  };

  const handleReviewAdded = (review, stats) => {
    setReviews((prev) => [review, ...prev]);
    setReviewStats(stats);
  };

  const handleReviewDeleted = async () => {
    await fetchReviews();
  };

  const handleAddToCart = () => {
    if (!productData) return;
    addItem({
      product_id: String(productData.id),
      name: productData.name,
      price: Number(productData.base_price ?? 0),
      image: thumbs[0] ?? fallbackImage,
      color: selectedColor?.name,
      size: currentSize,
    }, qty);
  };

  if (isLoading) {
    return <ProductInlineSkeleton />;
  }

  if (error || !productData) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-24 pb-20 text-center text-muted-foreground">
        {error?.message ?? "Product not found"}
      </div>
    );
  }

  const currentPrice = Number(productData.base_price ?? 0);
  const comparePrice = productData.compare_at_price ? Number(productData.compare_at_price) : undefined;
  const discount =
    comparePrice && comparePrice > currentPrice ? Math.round((1 - currentPrice / comparePrice) * 100) : 0;
  const rating = Number(productData.avg_rating ?? 0);
  const fallbackImage = productCardImage(productData);
  const currentColor = productOptions.colors.some((item) => item.id === color)
    ? color
    : productOptions.colors[0]?.id || "";
  const currentSize = productOptions.sizes.includes(size) ? size : productOptions.sizes[0] || "";
  const selectedColor = productOptions.colors.find((c) => c.id === currentColor);
  const thumbs = productData.product_images?.length
    ? productData.product_images
        .slice()
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
        .map((image) => productImageUrl({ ...productData, product_images: [image] }))
    : [fallbackImage];
  const productFacts = [
    ["Product ID", productData.id],
    ["Slug", productData.slug],
    ["Store", productData.stores?.name ?? "غير محدد"],
    ["Category", productData.categories?.name ?? "Uncategorized"],
    ["Brand", productData.brands?.name ?? "None"],
    ["Status", productData.status],
    ["Visibility", productData.visibility],
    ["Color", productData.color ?? "غير محدد"],
    ["Available colors", productData.available_colors?.join(", ") || "غير محدد"],
    ["Featured", productData.is_featured ? "Yes" : "No"],
    ["Base price", formatCurrency(productData.base_price, productData.currency)],
    ["Compare price", productData.compare_at_price ? formatCurrency(productData.compare_at_price, productData.currency) : "غير محدد"],
    ["Currency", productData.currency],
    ["Rating", `${rating.toFixed(1)} / 5`],
    ["Rating count", productData.rating_count ?? 0],
    ["Views", productData.view_count ?? 0],
    ["Published", formatDate(productData.published_at)],
    ["Created", formatDate(productData.created_at)],
    ["Updated", formatDate(productData.updated_at)],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <ProductJsonLd
        name={productData.name}
        description={productData.short_description || productData.description}
        image={thumbs[0] || fallbackImage}
        price={currentPrice}
        currency={productData.currency}
        rating={rating}
        reviewCount={productData.rating_count}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "/" },
          { name: "Products", url: "/products" },
          { name: productData.categories?.name || "Product", url: `/products?category=${productData.categories?.slug || ""}` },
          { name: productData.name, url: `/product-details/${productData.id}` },
        ]}
      />
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-2 flex-wrap animate-fade-in-up">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <span>/</span>
        <span className="text-foreground/60">{productData.categories?.name ?? "Product"}</span>
        <span>/</span>
        <span className="text-gradient-neon font-medium">{productData.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="space-y-4 animate-fade-in-up">
          <div className="relative glass-strong rounded-3xl overflow-hidden aspect-square group">
            <Image
              src={thumbs[Math.min(activeThumb, thumbs.length - 1)] ?? fallbackImage}
              alt={productData.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            {discount > 0 && (
              <span className="absolute top-5 right-5 px-3 py-1.5 rounded-full text-xs font-bold bg-accent text-accent-foreground gold-glow">
                -{discount}%
              </span>
            )}
            {productData.is_featured && (
              <span className="absolute top-5 left-5 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-neon text-white pink-glow">
                Featured
              </span>
            )}
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="glass rounded-full p-2">
                <ZoomIn className="h-4 w-4 text-white/70" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {thumbs.map((thumb, i) => (
              <button
                key={`${thumb}-${i}`}
                onClick={() => setActiveThumb(i)}
                aria-label={`View image ${i + 1}`}
                className={`relative glass rounded-2xl overflow-hidden aspect-square transition-all ${
                  activeThumb === i
                    ? "pink-glow ring-2 ring-pink-400/60 scale-[1.04]"
                    : "hover:pink-glow opacity-70 hover:opacity-100"
                }`}
              >
                <Image
                  src={thumb}
                  alt=""
                  fill
                  sizes="20vw"
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 animate-fade-in-up">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
              {productData.categories?.name ?? "Product"} · {productData.stores?.name ?? "Galaxy Store"}
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold mt-2 leading-tight">
              {productData.name}
            </h1>
            {productData.short_description && (
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {productData.short_description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
              <ReviewStars rating={Math.round(rating)} size="h-4 w-4" />
              <span className="text-muted-foreground">- {productData.rating_count ?? 0} تقييم</span>
              <span className="text-muted-foreground">- {productData.view_count ?? 0} مشاهدة</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 flex items-end gap-4 flex-wrap">
            <span className="text-4xl font-extrabold text-gradient-gold">
              {formatCurrency(currentPrice, productData.currency)}
            </span>
            {comparePrice && comparePrice !== currentPrice && (
              <>
                <span className="text-lg text-muted-foreground line-through mb-1">
                  {formatCurrency(comparePrice, productData.currency)}
                </span>
                <span className="ml-auto text-sm font-bold text-secondary mb-1">
                  {comparePrice > currentPrice
                    ? `وفرت ${formatCurrency(comparePrice - currentPrice, productData.currency)}`
                    : " "}
                </span>
              </>
            )}
          </div>

          <p className="text-muted-foreground leading-relaxed">
            {productData.description ?? productData.short_description ?? "No description available."}
          </p>

          <div>
            <p className="text-sm font-semibold mb-3">
              اللون: <span className="text-muted-foreground">{selectedColor?.name ?? "غير محدد"}</span>
              {selectedColor?.hex && <span className="mr-2 text-muted-foreground">({selectedColor.hex})</span>}
            </p>
            <div className="flex gap-3">
              {productOptions.colors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  aria-label={c.name}
                  className={`relative h-10 w-10 rounded-full border-2 transition-all ${
                    currentColor === c.id ? "border-white scale-110 pink-glow" : "border-white/20 hover:scale-105"
                  }`}
                  style={{ background: c.hex }}
                >
                  {currentColor === c.id && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-3">المقاس</p>
            <div className="flex flex-wrap gap-2">
              {productOptions.sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`h-11 min-w-11 px-4 rounded-xl font-semibold text-sm transition-all ${
                    currentSize === s ? "bg-gradient-neon text-white pink-glow" : "glass hover:text-foreground text-foreground/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-4 grid sm:grid-cols-3 gap-3 text-sm">
            <InfoPill label="المتجر" value={productData.stores?.name ?? "غير محدد"} />
            <InfoPill label="التصنيف" value={productData.categories?.name ?? "غير محدد"} />
            <InfoPill label="الحالة" value={productData.status} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="glass rounded-2xl flex items-center h-14 px-2 shrink-0">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="h-10 w-10 grid place-items-center rounded-xl hover:bg-white/5 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-bold text-lg select-none">{qty}</span>
              <button
                onClick={() => setQty(qty + 1)}
                className="h-10 w-10 grid place-items-center rounded-xl hover:bg-white/5 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              id="add-to-cart-btn"
              onClick={handleAddToCart}
              className="flex-1 h-14 rounded-2xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 pink-glow hover:scale-[1.02] transition-transform"
            >
              <ShoppingBag className="h-5 w-5" /> أضف إلى السلة
            </button>

            <button
              onClick={handleWishlistToggle}
              className={`h-14 w-14 grid place-items-center rounded-2xl glass transition-all ${
                wishlisted ? "pink-glow text-pink-400" : "hover:pink-glow"
              }`}
              aria-label="Add to wishlist"
            >
              <Heart className={`h-5 w-5 ${wishlisted ? "fill-current" : ""}`} />
            </button>

            <button
              className="h-14 w-14 grid place-items-center rounded-2xl glass hover:pink-glow transition-all"
              aria-label="Share product"
            >
              <Share2 className="h-5 w-5" />
            </button>
          </div>

          <button
            id="buy-now-btn"
            className="w-full h-12 rounded-2xl border border-accent/40 text-accent font-semibold hover:bg-accent/10 transition-colors"
          >
            اشتري الآن - دفع فوري
          </button>

          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            {[
              { icon: Truck, label: "شحن سريع", sub: "حسب سياسة المتجر" },
              { icon: ShieldCheck, label: "منتج موثق", sub: productData.status === "published" ? "متاح للبيع" : productData.status },
              { icon: Sparkles, label: "قطعة مميزة", sub: productData.is_featured ? "Featured product" : "Galaxy Store" },
            ].map((perk) => (
              <div key={perk.label} className="glass rounded-2xl p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-neon grid place-items-center shrink-0">
                  <perk.icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-xs">
                  <p className="font-semibold">{perk.label}</p>
                  <p className="text-muted-foreground">{perk.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-16">
        <div className="glass rounded-2xl p-1.5 inline-flex gap-1 flex-wrap">
          {[
            ["desc", "الوصف"],
            ["specs", "كل البيانات"],
            ["images", `الصور (${productData.product_images?.length ?? 0})`],
            ["reviews", `التقييمات (${productData.rating_count ?? 0})`],
          ].map(([tabId, label]) => (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={`px-5 h-10 rounded-xl text-sm font-semibold transition-all ${
                tab === tabId ? "bg-gradient-neon text-white pink-glow" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="glass-strong rounded-3xl p-6 md:p-8 mt-4 animate-fade-in-up">
          {tab === "desc" && (
            <div className="prose prose-invert max-w-none space-y-3 text-muted-foreground">
              <p>{productData.description ?? productData.short_description ?? "No description available."}</p>
              <ul className="list-disc pr-6 space-y-1">
                <li>اللون المعروض: {selectedColor?.name ?? "غير محدد"}</li>
                <li>كود اللون: {selectedColor?.hex ?? "غير محدد"}</li>
                <li>المقاس المختار: {currentSize}</li>
                <li>المتجر: {productData.stores?.name ?? "غير محدد"}</li>
                <li>عدد الصور: {productData.product_images?.length ?? 0}</li>
              </ul>
            </div>
          )}

          {tab === "specs" && (
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {productFacts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-5 border-b border-white/10 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold text-left break-all">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {tab === "images" && (
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              {(productData.product_images ?? []).map((image) => (
                <div key={image.id} className="glass rounded-2xl p-4 space-y-2">
                  <p className="font-semibold">{image.alt_text ?? "Product image"}</p>
                  <p className="text-muted-foreground break-all">{image.storage_path}</p>
                  <p className="text-xs text-muted-foreground">
                    {image.is_primary ? "Primary image" : "Gallery image"} · Sort {image.sort_order}
                  </p>
                </div>
              ))}
            </div>
          )}

          {tab === "reviews" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <ReviewStatsDisplay stats={reviewStats} />
              </div>

              <ReviewForm productId={String(productData.id)} onReviewAdded={handleReviewAdded} />

              {reviewsLoading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading reviews...</div>
              ) : (
                <ReviewsList
                  reviews={reviews}
                  productId={String(productData.id)}
                  onReviewDeleted={handleReviewDeleted}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <section className="mt-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
              منتجات مشابهة
            </p>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-1">
              قد يعجبك <span className="text-gradient-neon">أيضًا</span>
            </h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-semibold text-foreground/70 hover:text-foreground transition-colors flex items-center gap-1"
          >
            عرض الكل <ArrowLeft className="h-4 w-4 rotate-180" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {suggestions.map((p) => (
            <ProductCard
              key={p.id}
              product={toProductCardProduct(p)}
              href={`/product-details/${p.id}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold mt-1">{value}</p>
    </div>
  );
}

function ProductInlineSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20" aria-busy="true">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-3xl bg-white/10" />
        <div className="space-y-4">
          <div className="h-4 w-56 animate-pulse rounded-full bg-white/10" />
          <div className="h-12 w-4/5 animate-pulse rounded-2xl bg-white/10" />
          <div className="h-24 w-full animate-pulse rounded-2xl bg-white/10" />
          <div className="h-14 w-full animate-pulse rounded-2xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsClient;
