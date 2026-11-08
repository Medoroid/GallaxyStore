"use client";

/* eslint-disable @next/next/no-img-element -- admin-supplied URLs may come from
 * hosts that are not configured in next/images; a plain <img> plus a local
 * fallback keeps a pasted URL from throwing during render. */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  selectForZone,
  type BannerPlacement,
  type SectionPlacement,
  type SiteBanner,
  type SiteSection,
  type SectionCard,
} from "@/lib/site-content";

/**
 * Storefront renderer for admin-managed content (banners + sections).
 *
 * One react-query fetch per page feeds every zone; each <ContentZone> filters
 * the shared cache by zone and renders nothing when the zone is empty, so a
 * page with no configured content looks exactly like before. If the tables do
 * not exist yet (migration not applied) the fetch degrades to "no content"
 * instead of surfacing an error on the storefront.
 */

type PageContent = {
  banners: SiteBanner[];
  sections: SiteSection[];
};

async function fetchPageContent(page: string): Promise<PageContent> {
  try {
    const [bannersResult, sectionsResult] = await Promise.all([
      supabase.from("site_banners").select("*").eq("page", page),
      supabase.from("site_sections").select("*").eq("page", page),
    ]);
    if (bannersResult.error || sectionsResult.error) {
      return { banners: [], sections: [] };
    }
    return {
      banners: (bannersResult.data ?? []) as SiteBanner[],
      sections: (sectionsResult.data ?? []) as SiteSection[],
    };
  } catch {
    return { banners: [], sections: [] };
  }
}

type ContentZoneProps = {
  page: string;
  zone: BannerPlacement | SectionPlacement;
  className?: string;
};

export function ContentZone({ page, zone, className = "" }: ContentZoneProps) {
  const { data } = useQuery({
    queryKey: ["siteContent", page],
    queryFn: () => fetchPageContent(page),
    staleTime: 60_000,
    retry: 1,
  });

  const banners = selectForZone<SiteBanner>(data?.banners, page, zone);
  const sections = selectForZone<SiteSection>(data?.sections, page, zone);

  if (banners.length === 0 && sections.length === 0) return null;

  return (
    <div className={`space-y-6 ${className}`}>
      {zone === "top_strip"
        ? banners.slice(0, 1).map((banner) => <TopStripBanner key={banner.id} banner={banner} />)
        : banners.map((banner) => <BannerCard key={banner.id} banner={banner} />)}
      {sections.map((section) => (
        <ContentSection key={section.id} section={section} />
      ))}
    </div>
  );
}

function TopStripBanner({ banner }: { banner: SiteBanner }) {
  const content = (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      {banner.title && (
        <span className="text-sm font-bold text-gradient-neon">{banner.title}</span>
      )}
      {banner.subtitle && (
        <span className="text-xs text-muted-foreground">{banner.subtitle}</span>
      )}
      {banner.link_url && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary">
          {banner.button_label ?? "Learn more"} <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </div>
  );

  const className =
    "glass rounded-2xl px-4 py-3 border border-secondary/30 hover:pink-glow transition-all block w-full";

  if (!banner.link_url) {
    return <div className={className}>{content}</div>;
  }
  return isExternal(banner.link_url) ? (
    <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <Link href={banner.link_url} className={className}>
      {content}
    </Link>
  );
}

function BannerCard({ banner }: { banner: SiteBanner }) {
  return (
    <div className="relative overflow-hidden glass-strong rounded-3xl">
      {banner.image_url && (
        <div className="absolute inset-0">
          <ContentImage
            src={banner.image_url}
            alt={banner.title ?? ""}
            className="w-full h-full object-cover opacity-60"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(18,0,24,.92) 0%, rgba(18,0,24,.60) 55%, rgba(18,0,24,.25) 100%)",
            }}
          />
        </div>
      )}
      <div className="relative p-6 md:p-9 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          {banner.title && (
            <h3 className="text-xl md:text-2xl font-extrabold leading-tight">{banner.title}</h3>
          )}
          {banner.subtitle && (
            <p className="text-sm text-muted-foreground max-w-xl">{banner.subtitle}</p>
          )}
        </div>
        <ContentLink url={banner.link_url} label={banner.button_label ?? "Learn more"} />
      </div>
    </div>
  );
}

function ContentSection({ section }: { section: SiteSection }) {
  switch (section.section_type) {
    case "image_text":
      return <ImageTextSection section={section} />;
    case "cards":
      return <CardsSection section={section} />;
    case "cta":
      return <CtaSection section={section} />;
    case "rich_text":
    default:
      return <RichTextSection section={section} />;
  }
}

function SectionHeader({ eyebrow, title }: { eyebrow: string | null; title: string | null }) {
  return (
    <div className="space-y-2">
      {eyebrow && (
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">{eyebrow}</p>
      )}
      {title && <h2 className="text-3xl md:text-4xl font-extrabold">{title}</h2>}
    </div>
  );
}

function RichTextSection({ section }: { section: SiteSection }) {
  return (
    <div className="glass rounded-3xl p-6 md:p-10 space-y-3">
      <SectionHeader eyebrow={section.eyebrow} title={section.title} />
      {section.body && (
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
          {section.body}
        </p>
      )}
      <ContentLink url={section.link_url} label={section.button_label ?? "Learn more"} />
    </div>
  );
}

function ImageTextSection({ section }: { section: SiteSection }) {
  return (
    <div className="glass rounded-3xl overflow-hidden grid md:grid-cols-2 items-stretch">
      <div className="relative min-h-[220px] md:min-h-[300px] bg-background/40">
        {section.image_url && (
          <ContentImage
            src={section.image_url}
            alt={section.title ?? ""}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>
      <div className="p-6 md:p-10 space-y-3 flex flex-col justify-center">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} />
        {section.body && (
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
            {section.body}
          </p>
        )}
        <ContentLink url={section.link_url} label={section.button_label ?? "Learn more"} />
      </div>
    </div>
  );
}

function CardsSection({ section }: { section: SiteSection }) {
  const cards = (section.config?.cards ?? []) as SectionCard[];
  if (cards.length === 0) return null;

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow={section.eyebrow} title={section.title} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="glass rounded-2xl p-5 space-y-2 hover:pink-glow transition-all"
          >
            {card.image_url && (
              <div className="relative rounded-xl overflow-hidden mb-3 aspect-[16/9] bg-background/40">
                <ContentImage
                  src={card.image_url}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            )}
            <h3 className="font-bold text-base">{card.title}</h3>
            {card.body && (
              <p className="text-xs text-muted-foreground leading-relaxed">{card.body}</p>
            )}
            <ContentLink url={card.link_url} label="Learn more" small />
          </div>
        ))}
      </div>
      <ContentLink url={section.link_url} label={section.button_label ?? "Learn more"} />
    </div>
  );
}

function CtaSection({ section }: { section: SiteSection }) {
  return (
    <div className="relative overflow-hidden glass-strong rounded-3xl p-8 md:p-12 text-center">
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-60 w-60 bg-gradient-neon blur-3xl opacity-40 rounded-full" />
      <div className="relative space-y-4 max-w-2xl mx-auto">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} />
        {section.body && (
          <p className="text-sm md:text-base text-muted-foreground whitespace-pre-line">
            {section.body}
          </p>
        )}
        <div className="flex justify-center pt-1">
          <ContentLink url={section.link_url} label={section.button_label ?? "Get started"} />
        </div>
      </div>
    </div>
  );
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function ContentLink({
  url,
  label,
  small = false,
}: {
  url: string | null;
  label: string;
  small?: boolean;
}) {
  if (!url) return null;
  const className = `inline-flex items-center gap-2 ${
    small ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
  } rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform`;

  if (isExternal(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        {label} <ArrowRight className="h-4 w-4" />
      </a>
    );
  }
  return (
    <Link href={url} className={className}>
      {label} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function ContentImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <img src="/product-giftbox.jpg" alt={alt} className={className} aria-hidden="true" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
