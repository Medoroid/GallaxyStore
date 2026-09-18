'use client';
import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight, Palette, Truck, Star, Rocket, Gift } from "lucide-react";
import { ProductCard } from "./components/ProductCard";
import { products, categories, heroImg } from "@/data/products";
import { useQuery } from "@tanstack/react-query";
import { fetchFeaturedProducts, toProductCardProduct } from "@/lib/products";
const featured = products.slice(0, 6);
const giftBoxes = ["Birthday", "Couples", "Anime", "Gaming", "Graduation"];
const reviews = [
  { name: "Layla M.", text: "The neon mug looks insane. Better than the preview!", rating: 5 },
  { name: "Karim A.", text: "Custom tee printing is top tier. Colors stay vivid after washes.", rating: 5 },
  { name: "Sara K.", text: "Got the Anime gift box for my brother — he flipped out.", rating: 5 },
  { name: "Yusuf E.", text: "Fast shipping and the packaging itself feels premium.", rating: 5 },
];
export default function Home() {
  const {data, isLoading, error} = useQuery({
    queryKey: ["homeProducts"],
    queryFn: () => fetchFeaturedProducts(8),
  });

  const homeProducts = data?.map(toProductCardProduct) ?? [];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-24">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl glass-strong min-h-[520px] ">
        {/* Background image */}
        <Image
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
              <Sparkles className="h-3.5 w-3.5 text-accent" /> New drop · Galactic Edition 2026
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
              <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-secondary" /> Worldwide shipping</span>
              <span className="flex items-center gap-2"><Star className="h-4 w-4 text-accent" /> 4.9 / 12k+ reviews</span>
              <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> 48h dispatch</span>
            </div>
          </div>
          {/* Hero floating product cards */}
          <div className="relative hidden md:flex items-center justify-center min-h-[380px]">
            <div className="absolute -inset-10 bg-gradient-neon opacity-25 blur-3xl rounded-full" />
            <div className="relative w-full animate-float-y">
              {/* Main card */}
              <div className="glass-strong rounded-3xl p-4 rotate-3 pink-glow overflow-hidden mx-auto" style={{ width: 260 }}>
                <div className="relative w-full" style={{ height: 260 }}>
                  <Image
                    src={featured[0].image}
                    alt={featured[0].name}
                    fill
                    sizes="260px"
                    className="rounded-2xl object-cover"
                  />
                </div>
              </div>
              {/* Bottom-left mini card */}
              <div
                className="absolute -bottom-10 -left-4 glass rounded-2xl p-3 -rotate-6 neon-glow animate-float-y overflow-hidden"
                style={{ width: 140, animationDelay: "1.2s" }}
              >
                <div className="relative w-full" style={{ height: 130 }}>
                  <Image
                    src={featured[1].image}
                    alt={featured[1].name}
                    fill
                    sizes="140px"
                    className="rounded-xl object-cover"
                  />
                </div>
              </div>
              {/* Top-right mini card */}
              <div
                className="absolute -top-8 -right-4 glass rounded-2xl p-3 rotate-12 gold-glow animate-float-y overflow-hidden"
                style={{ width: 130, animationDelay: "0.6s" }}
              >
                <div className="relative w-full" style={{ height: 120 }}>
                  <Image
                    src={featured[3].image}
                    alt={featured[3].name}
                    fill
                    sizes="130px"
                    className="rounded-xl object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured slider (marquee) */}
      <section className="mt-16">
        <SectionHeading eyebrow="Trending" title="Featured Drops" />
        <div className="relative overflow-hidden mt-6 mask-fade">
          <div className="flex gap-5 animate-slide-x w-max">
            {isLoading && <div className="w-[280px] shrink-0 glass rounded-2xl p-6 text-sm text-muted-foreground">Loading...</div>}
            {error && <div className="w-[280px] shrink-0 glass rounded-2xl p-6 text-sm text-red-400">Unable to load products.</div>}
            {homeProducts.map((p, i) => (
              <div key={i} className="w-[280px] shrink-0">
                <ProductCard product={p} href={`/product-details/${p.id}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mt-20">
        <SectionHeading eyebrow="Explore" title="Shop by Category" />
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {categories.map((c) => (
            <Link
              key={c.id}
              href="/products"
              className="group glass rounded-2xl p-4 text-center hover:pink-glow hover:-translate-y-1 transition-all"
            >
              {/* position:relative is REQUIRED for next/image fill to work */}
              <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-background/40">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 15vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-[11px] text-muted-foreground">{c.count} items</p>
            </Link>
          ))}
        </div>
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

      {/* Gift boxes */}
      <section className="mt-20">
        <SectionHeading eyebrow="For Every Occasion" title="Themed Gift Boxes" />
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          {giftBoxes.map((g, i) => (
            <Link
              key={g}
              href="/gift-boxes"
              className="group relative glass rounded-2xl overflow-hidden hover:pink-glow transition-all"
              style={{ aspectRatio: "3/4" }}
            >
              <Image
                src={products[(i * 2) % products.length].image}
                alt={g}
                fill
                sizes="(max-width: 640px) 45vw, 20vw"
                className="object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <Gift className="h-5 w-5 text-accent mb-2" />
                <h3 className="font-extrabold text-lg">{g}</h3>
                <p className="text-xs text-muted-foreground">Curated box</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section className="mt-20">
        <SectionHeading eyebrow="Loved by gamers" title="Customer Reviews" />
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {reviews.map((r) => (
            <div key={r.name} className="glass rounded-2xl p-5 hover:pink-glow transition-all">
              <div className="flex gap-0.5 text-accent">
                {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
              </div>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">&quot;{r.text}&quot;</p>
              <p className="mt-4 text-sm font-semibold">{r.name}</p>
            </div>
          ))}
        </div>
      </section>

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
