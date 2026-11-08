"use client";
import { SafeImage } from "@/app/components/SafeImage";
import { Eye } from "lucide-react";
import useGetGallary from "../hooks/useGetGallary";
import Spinner from "../components/spinner";

const heights = [
  "h-64", "h-80", "h-96", "h-72", "h-[28rem]", "h-72",
  "h-80", "h-64", "h-[26rem]", "h-72", "h-80", "h-96",
];

/**
 * B4/A3 — the gallery shows only real entries from the `gallery_images`
 * table. The previously mixed-in Unsplash stock photos and the fabricated
 * before/after section were removed: we never present stock imagery as
 * "prints we've shipped".
 */
type GalleryImage = { id: string; image_url: string; title: string; category: string };

export default function Gallery() {
  const { isLoading, data: galleryImages, error } = useGetGallary();

  const allImages: GalleryImage[] = (galleryImages ?? []) as GalleryImage[];

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
          Real custom prints from our studio.
        </p>
      </header>

      {error && (
        <div className="mt-10 glass rounded-2xl p-6 text-sm text-red-400">
          Unable to load gallery images.
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : allImages.length === 0 && !error ? (
        <div className="mt-10 glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          No gallery images have been published yet. Check back soon — or start designing your
          own print in the <a href="/custom-print" className="text-secondary hover:text-foreground">Custom Print Studio</a>.
        </div>
      ) : (
        <div className="mt-10 columns-2 md:columns-3 lg:columns-4 gap-5 space-y-5">
          {allImages.map((p, i) => (
            <div
              key={p.id}
              className={`group relative break-inside-avoid overflow-hidden rounded-2xl glass hover:pink-glow transition-all ${
                heights[i % heights.length]
              }`}
            >
              <SafeImage
                src={p.image_url || "/product-tshirt.jpg"}
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
                  <span className="h-10 w-10 rounded-full bg-gradient-neon grid place-items-center text-white">
                    <Eye className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
