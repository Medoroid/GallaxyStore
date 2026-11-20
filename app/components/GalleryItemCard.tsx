"use client";

import Link from "next/link";
import { useLanguage } from "@/app/lib/language-context";
import { formatDate } from "@/lib/creator/media";
import { hasGalleryPreview } from "@/lib/creator/gallery-cover";
import { GalleryCover } from "./GalleryCover";

/**
 * Shared gallery card for every public surface (creator profile grid and
 * the /creators discovery directory). Links to the linked product when one
 * exists; otherwise renders as a plain card (gallery entries are browse
 * content, not purchasable items). The creator line is plain text on
 * purpose — a nested <Link> inside the product link would be invalid HTML.
 */
export type GalleryCardItem = {
  id: string;
  title: string;
  description: string | null;
  preview_path: string | null;
  tags: string[];
  product_id: string | null;
  published_at: string | null;
};

export type GalleryCardCreator = {
  username: string;
  display_name: string;
} | null;

export function GalleryItemCard({
  item,
  creator = null,
}: {
  item: GalleryCardItem;
  creator?: GalleryCardCreator;
}) {
  const { locale } = useLanguage();
  const hasPreview = hasGalleryPreview(item.preview_path);

  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white/10">
        <GalleryCover
          title={item.title}
          previewPath={item.preview_path}
          className="group-hover:scale-105"
        />
      </div>
      <div className="pt-2.5">
        {hasPreview && (
          <h3 className="text-xs sm:text-sm font-semibold line-clamp-2 group-hover:text-pink-300 transition-colors">
            {item.title}
          </h3>
        )}
        {item.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
            {item.description}
          </p>
        )}
        {creator && (
          <p className="mt-1.5 text-[11px] text-secondary/90 line-clamp-1">
            @{creator.username}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
          <span className="ms-auto text-[10px] text-muted-foreground">
            {formatDate(item.published_at, locale)}
          </span>
        </div>
      </div>
    </>
  );

  if (item.product_id) {
    return (
      <Link
        href={`/product-details/${item.product_id}`}
        className="group glass rounded-2xl p-2.5 hover:-translate-y-1 hover:pink-glow transition-all block"
      >
        {body}
      </Link>
    );
  }

  return <div className="group glass rounded-2xl p-2.5">{body}</div>;
}
