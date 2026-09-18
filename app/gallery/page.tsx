"use client";
import Image from "next/image";
import { products } from "@/data/products";
import { Eye } from "lucide-react";
import useGetGallary from "../hooks/useGetGallary";
import Spinner from "../components/spinner";

const heights = [
  "h-64", "h-80", "h-96", "h-72", "h-[28rem]", "h-72",
  "h-80", "h-64", "h-[26rem]", "h-72", "h-80", "h-96",
];

export default function Gallery() {
  const { isLoading, data: galleryImages, error } = useGetGallary();

  const allImages = [
    ...(galleryImages ?? []).map((img: { id: string; image_url: string; title: string; category: string }) => ({
      id: img.id,
      image: img.image_url,
      title: img.title,
      category: img.category,
    })),
    ...products.map((p) => ({
      id: p.name,
      image: p.image,
      title: p.name,
      category: p.category,
    })),
  ].slice(0, 16);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24">
      <header className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
          Portfolio
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Our Print <span className="text-gradient-neon">Gallery</span>
        </h1>
        <p className="text-muted-foreground mt-3">
          A glimpse at recent custom prints we&apos;ve shipped across the galaxy.
        </p>
      </header>

      {error && (
        <div className="mt-10 glass rounded-2xl p-6 text-sm text-red-400">
          Unable to load gallery images.
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="mt-10 columns-2 md:columns-3 lg:columns-4 gap-5 space-y-5">
          {allImages.map((p, i) => (
            <div
              key={p.id}
              className={`group relative break-inside-avoid overflow-hidden rounded-2xl glass hover:pink-glow transition-all ${
                heights[i % heights.length]
              }`}
            >
              <Image
                src={p.image ?? "/product-tshirt.jpg"}
                alt={p.title || "Gallery Image"}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between">
                  <div>
                    {p.category && (
                      <p className="text-xs text-secondary uppercase tracking-widest">
                        {p.category}
                      </p>
                    )}
                    <p className="font-semibold">{p.title}</p>
                  </div>
                  <button className="h-10 w-10 rounded-full bg-gradient-neon grid place-items-center text-white">
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-20 grid md:grid-cols-2 gap-6">
        <BeforeAfter
          label="Plain Tee → Neon Galaxy Print"
          image={products[0].image}
        />
        <BeforeAfter
          label="Blank Mug → Cosmic Glow Mug"
          image={products[1].image}
        />
      </section>
    </div>
  );
}

function BeforeAfter({ label, image }: { label: string; image: string }) {
  return (
    <div className="glass-strong rounded-3xl p-5">
      <p className="text-xs uppercase tracking-widest text-secondary font-semibold mb-3">
        Before / After
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="aspect-square rounded-2xl bg-background/60 grid place-items-center text-muted-foreground text-sm border border-dashed border-white/15">
          Blank
        </div>
        <div className="relative aspect-square rounded-2xl overflow-hidden pink-glow">
          <Image src={image} alt="" fill sizes="50vw" className="object-cover" />
        </div>
      </div>
      <p className="mt-3 font-semibold">{label}</p>
    </div>
  );
}
