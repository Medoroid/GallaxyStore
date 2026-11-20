"use client";

import Link from "next/link";
import { ArrowRight, Images, Sparkles, UserRound } from "lucide-react";
import { useLanguage } from "@/app/lib/language-context";
import { GalleryItemCard } from "./GalleryItemCard";
import { publicStorageUrl } from "@/lib/creator/media";
import type {
  DirectoryCreator,
  DirectoryGalleryItem,
} from "@/lib/creator/directory";

/**
 * Public creator discovery (/creators): creator cards link to the public
 * profile; the latest-designs grid reuses the shared gallery card so the
 * profile page and this directory render identically.
 */
export function CreatorsDirectoryView({
  creators,
  gallery,
}: {
  creators: DirectoryCreator[];
  gallery: DirectoryGalleryItem[];
}) {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="glass-strong rounded-3xl p-8 md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">
          {t("creators_eyebrow")}
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          {t("creators_heading")}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          {t("creators_intro")}
        </p>
      </header>

      {creators.length === 0 ? (
        <div className="glass rounded-3xl p-12 mt-8 text-center">
          <UserRound className="h-12 w-12 mx-auto text-gray-500" />
          <h2 className="mt-4 text-xl font-bold">{t("creators_empty_title")}</h2>
          <p className="text-muted-foreground mt-2">{t("creators_empty")}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((creator) => {
            const avatar = publicStorageUrl(creator.avatar_url, "avatars");
            return (
              <Link
                key={creator.username}
                href={`/creators/${creator.username}`}
                className="group glass rounded-3xl p-6 hover:pink-glow transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/[0.05]">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt={creator.display_name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xl font-extrabold text-gradient-neon">
                        {creator.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-bold truncate group-hover:text-secondary transition-colors">
                        {creator.display_name}
                      </h2>
                      {creator.is_featured && (
                        <>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                          <span className="sr-only">
                            {t("creator_featured")}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      @{creator.username}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {creator.products} {t("creator_products_count")} ·{" "}
                      {creator.gallery} {t("creator_gallery_count")}
                    </p>
                  </div>
                </div>
                {creator.bio && (
                  <p className="mt-4 text-sm text-muted-foreground line-clamp-3">
                    {creator.bio}
                  </p>
                )}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-secondary">
                  {t("creator_visit_profile")}{" "}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Latest approved designs across every creator */}
      <section className="mt-14">
        <div className="flex items-end justify-between mb-5">
          <h2 className="text-2xl md:text-3xl font-extrabold">
            {t("creators_latest_title")}
          </h2>
        </div>
        {gallery.length === 0 ? (
          <div className="glass rounded-3xl p-10 text-center">
            <Images className="h-10 w-10 mx-auto text-gray-500" />
            <p className="text-muted-foreground mt-3">
              {t("creators_latest_empty")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {gallery.map((item) => (
              <GalleryItemCard key={item.id} item={item} creator={item.creator} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
