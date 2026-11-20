"use client";

import { galleryCover, hasGalleryPreview } from "@/lib/creator/gallery-cover";
import { designPreviewUrl } from "@/lib/creator/media";

/**
 * Cover area of a gallery card: the persisted preview when one exists,
 * otherwise a deterministic title card (gradient + initial + title) so
 * entries published without a generated mockup still read as designed
 * pieces — never a broken image or a generic placeholder icon.
 */
export function GalleryCover({
  title,
  previewPath,
  className = "",
}: {
  title: string;
  previewPath: string | null;
  className?: string;
}) {
  const src = hasGalleryPreview(previewPath)
    ? designPreviewUrl(previewPath)
    : null;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={title}
        loading="lazy"
        className={`h-full w-full object-cover transition-transform duration-700 ${className}`}
      />
    );
  }

  const cover = galleryCover(title);
  return (
    <div
      role="img"
      aria-label={title}
      className={`flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${cover.gradient} p-3 ${className}`}
    >
      <span className="text-4xl font-extrabold leading-none text-white/90 drop-shadow">
        {cover.initial}
      </span>
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-white drop-shadow">
        {title}
      </p>
    </div>
  );
}
