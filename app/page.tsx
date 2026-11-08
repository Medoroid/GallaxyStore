'use client';
import { SafeImage } from "@/app/components/SafeImage";
import Link from "next/link";
import { Sparkles, ArrowRight, Palette, Truck, Star, Gift } from "lucide-react";
import { ProductCard } from "./components/ProductCard";
import { heroImg } from "@/data/products";
import { useQuery } from "@tanstack/react-query";
import {
  fetchFeaturedProducts,
  fetchCategoriesWithCounts,
  toProductCardProduct,
} from "@/lib/products";
import { supabase } from "@/lib/supabaseClient";
import { ContentZone } from "./components/SiteContent";

/**
 * B4 — store identity: every claim on this page is backed by real data.
 * - Featured products, hero cards and gift-box tiles use real DB products.
 * - Categories show the real published-product count.
 * - The reviews section renders only when approved reviews exist (RLS:
 *   status = 'approved'); it is hidden otherwise. No invented ratings,
 *   review counts or dispatch promises remain.
 */
type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
};

async function fetchApprovedReviews(): Promise<PublicReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, title, body")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) throw error;
  return (data ?? []) as PublicReview[];
}

export default function Home() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["homeProducts"],
    queryFn: () => fetchFeaturedProducts(8),
  });
  const categoriesQuery = useQuery({
    queryKey: ["homeCategories"],
    queryFn: fetchCategoriesWithCounts,
    staleTime: 60_000,
  });
  const reviewsQuery = useQuery({
    queryKey: ["homeReviews"],
    queryFn: fetchApprovedReviews,
    staleTime: 60_000,
  });

  const homeProducts = data?.map(toProductCardProduct) ?? [];
  const categories = categoriesQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24">
      {/* Admin-managed announcement strip */}
      <ContentZone page="home" zone="top_strip" className="mb-5" />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl glass-strong min-h-[520px] ">
        {/* Background image */}
        <SafeImage
          src={heroImg}
          alt="Galaxy Store Hero"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-45"
          style={{ zIndex: 0 }}
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to right, rgba(18,0,24,.90) 0%, rgba(18,0,24,.60) 50%, rgba(18,0,24,.25) 100%)",
            zIndex: 1,
          }}
        />
        <div className="relative grid md:grid-cols-2 gap-8 p-8 md:p-12 lg:p-16 items-center" style={{ zIndex: 2 }}>
          <div className="space-y-5 animate-fade-in-up">
            <span className="inline-flex items-center gap-2 glass px-3 py-1.5 rounded-full text-xs">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Custom prints &amp; themed gifts
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05]">
              Print Your <span className="text-gradient-neon">Galaxy</span>.<br />
              Wear the <span className="text-gradient-gold">Cosmos</span>.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg">
              Premium custom printing &amp; gaming-inspired gifts. Tees, mugs, posters, phone cases
              and themed gift boxes — designed in the multiverse, delivered to your door.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/products" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform animate-pulse-glow">
                Shop Now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/custom-print" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all">
                <Palette className="h-4 w-4" /> Design Your Own
              </Link>
            </div>
            <div className="flex flex-wrap gap-5 pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-secondary" /> Shipping options &amp; rates shown at checkout</span>
            </div>
          </div>
          {/* Hero floating product cards — real products from the catalog */}
          <div className="relative hidden md:flex items-center justify-center min-h-[380px]">
            <div className="absolute -inset-10 bg-gradient-neon opacity-25 blur-3xl rounded-full" />
            {isLoading && (
              <div className="glass-strong rounded-3xl p-4 rotate-3 overflow-hidden mx-auto space-y-3" style={{ width: 260 }}>
                <div className="rounded-2xl bg-white/5 animate-pulse" style={{ height: 260 }} />
                <div className="h-4 rounded bg-white/5 animate-pulse w-2/3" />
              </div>
            )}
            {!isLoading && homeProducts.length === 0 && (
              <div className="glass-strong rounded-3xl p-8 rotate-3 text-center text-sm text-muted-foreground" style={{ width: 260 }}>
                Fresh drops are on the way.
              </div>
            )}
            {homeProducts.length > 0 && (
              <div className="relative w-full animate-float-y">
                {/* Main card */}
                <div className="glass-strong rounded-3xl p-4 rotate-3 pink-glow overflow-hidden mx-auto" style={{ width: 260 }}>
                  <div className="relative w-full" style={{ height: 260 }}>
                    <SafeImage
                      src={homeProducts[0].image}
                      alt={homeProducts[0].name}
                      fill
                      sizes="260px"
                      className="rounded-2xl object-cover"
                    />
                  </div>
                </div>
                {homeProducts[1] && (
                  <div
                    className="absolute -bottom-10 -left-4 glass rounded-2xl p-3 -rotate-6 neon-glow animate-float-y overflow-hidden"
                    style={{ width: 140, animationDelay: "1.2s" }}
                  >
                    <div className="relative w-full" style={{ height: 130 }}>
                      <SafeImage
                        src={homeProducts[1].image}
                        alt={homeProducts[1].name}
                        fill
                        sizes="140px"
                        className="rounded-xl object-cover"
                      />
                    </div>
                  </div>
                )}
                {homeProducts[2] && (
                  <div
                    className="absolute -top-8 -right-4 glass rounded-2xl p-3 rotate-12 gold-glow animate-float-y overflow-hidden"
                    style={{ width: 130, animationDelay: "0.6s" }}
                  >
                    <div className="relative w-full" style={{ height: 120 }}>
                      <SafeImage
                        src={homeProducts[2].image}
                        alt={homeProducts[2].name}
                        fill
                        sizes="130px"
                        className="rounded-xl object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Admin-managed content below the hero */}
      <ContentZone page="home" zone="after_hero" className="mt-16" />

      {/* Featured slider (marquee) */}
      <section className="mt-16">
        <SectionHeading eyebrow="Trending" title="Featured Drops" />
        {/* Pause-on-hover works via the CSS rule in globals.css */}
        <div className="relative overflow-hidden mt-6 mask-fade marquee-track">
          <div className="flex gap-5 animate-slide-x w-max">
            {isLoading && <div className="w-[280px] shrink-0 glass rounded-2xl p-6 text-sm text-muted-foreground">Loading...</div>}
            {error && <div className="w-[280px] shrink-0 glass rounded-2xl p-6 text-sm text-red-400">Unable to load products.</div>}
            {homeProducts.map((p, i) => (
              <div key={i} className="w-[280px] shrink-0">
                <ProductCard product={p} href={`/product-details/${p.id}`} />
              </div>
            ))}
            {/* Duplicate for seamless infinite loop */}
            {homeProducts.map((p, i) => (
              <div key={`dup-${i}`} className="w-[280px] shrink-0" aria-hidden="true">
                <ProductCard product={p} href={`/product-details/${p.id}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories — real, with real published-product counts */}
      <section className="mt-20">
        <SectionHeading eyebrow="Explore" title="Shop by Category" />
        {categoriesQuery.isLoading && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse">
                <div className="aspect-square rounded-xl bg-white/5 mb-3" />
                <div className="h-4 bg-white/5 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}
        {!categoriesQuery.isLoading && categories.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/products?category_id=${encodeURIComponent(c.id)}`}
                className="group glass rounded-2xl p-4 text-center hover:pink-glow hover:-translate-y-1 transition-all"
              >
                <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-background/40 grid place-items-center">
                  <Gift className="h-8 w-8 text-secondary group-hover:scale-125 transition-transform duration-500" />
                </div>
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.count} {c.count === 1 ? "item" : "items"}
                </p>
              </Link>
            ))}
          </div>
        )}
        {!categoriesQuery.isLoading && categories.length === 0 && !categoriesQuery.error && (
          <p className="mt-8 glass rounded-2xl p-6 text-sm text-muted-foreground">
            Categories will appear here once products are published.
          </p>
        )}
      </section>

      {/* Featured products */}
      <section className="mt-20">
        <div className="flex items-end justify-between">
          <SectionHeading eyebrow="Hand-picked" title="Featured Products" />
          <Link href="/products" className="hidden md:inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
            See all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {isLoading && <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">Loading products...</div>}
          {error && <div className="glass rounded-2xl p-6 text-sm text-red-400">Unable to load products.</div>}
          {homeProducts.map((p) => (
            <ProductCard key={p.id} product={p} href={`/product-details/${p.id}`} />
          ))}
        </div>
      </section>

      {/* Admin-managed content mid page */}
      <ContentZone page="home" zone="mid_page" className="mt-20" />

      {/* Gift boxes — themed request page backed by real products */}
      <section className="mt-20">
        <SectionHeading eyebrow="For Every Occasion" title="Themed Gift Boxes" />
        <p className="text-sm text-muted-foreground mt-2">
          Tell us the occasion and budget — we&apos;ll curate a box from the real catalog.
        </p>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {["Birthday", "Couples", "Anime", "Gaming", "Graduation"].map((g, i) => (
            <Link
              key={g}
              href="/gift-boxes"
              className="group relative glass rounded-2xl overflow-hidden hover:pink-glow transition-all"
              style={{ aspectRatio: "3/4" }}
            >
              <SafeImage
                src={homeProducts[i % Math.max(homeProducts.length, 1)]?.image ?? "/product-giftbox.jpg"}
                alt={`${g} gift box`}
                fill
                sizes="(max-width: 640px) 45vw, 20vw"
                className="object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <Gift className="h-5 w-5 text-accent mb-2" />
                <h3 className="font-extrabold text-lg">{g}</h3>
                <p className="text-xs text-muted-foreground">Request a curated box</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Customer reviews — rendered only when approved reviews exist */}
      {reviews.length > 0 && (
        <section className="mt-20">
          <SectionHeading eyebrow="Loved by customers" title="Customer Reviews" />
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {reviews.map((r) => (
              <div key={r.id} className="glass rounded-2xl p-5 hover:pink-glow transition-all">
                <div className="flex gap-0.5 text-accent">
                  {Array.from({ length: Math.min(5, Math.max(1, r.rating)) }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                {r.title && <p className="text-sm font-semibold mt-3">{r.title}</p>}
                {r.body && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">&quot;{r.body}&quot;</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin-managed content before the footer CTA */}
      <ContentZone page="home" zone="before_footer" className="mt-20" />

      {/* CTA */}
      <section className="mt-20">
        <div className="relative overflow-hidden glass-strong rounded-3xl p-8 md:p-14 text-center animate-pulse-glow">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-60 w-60 bg-gradient-neon blur-3xl opacity-50 rounded-full" />
          <div className="relative space-y-5 max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-2 glass px-3 py-1.5 rounded-full text-xs">
              <Palette className="h-3.5 w-3.5 text-accent" /> Custom Print Studio
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold">
              Have an idea? <span className="text-gradient-neon">We&apos;ll print it.</span>
            </h2>
            <p className="text-muted-foreground">
              Upload your artwork or pick a template — preview it live on real product mockups
              and we&apos;ll handle the rest.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/custom-print" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform">
                Start Designing <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/gallery" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass font-semibold">
                See Our Work
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">{eyebrow}</p>
      <h2 className="text-3xl md:text-4xl font-extrabold">{title}</h2>
    </div>
  );
}
