"use client";

/* eslint-disable @next/next/no-img-element -- theme asset URLs come from the
 * admin-managed theme-assets bucket / any https host; a plain <img> plus a
 * local fallback keeps a bad URL from throwing during render (same policy as
 * SiteContent.tsx). */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ThemeAssets } from "@/lib/themes/types";

/**
 * Seasonal hero banner driven by the active theme's `assets` block.
 *
 * - Renders nothing unless `bannerEnabled` (or there is no content at all),
 *   so a theme without a banner never reserves empty space;
 * - desktop/mobile images swap at the md breakpoint; when only one of the
 *   two is configured it is used for both sizes;
 * - link handling mirrors ContentLink: internal paths use next/link, https
 *   URLs open in a new tab with noopener (the server-side validator only
 *   ever allows `#…`, `/…` or `https://…` into this field);
 * - styling reuses the storefront banner conventions (glass-strong card,
 *   background-tinted gradient scrim, gradient CTA), so a themed banner
 *   picks up the theme's tokens automatically.
 */

type ThemeBannerProps = {
  assets: ThemeAssets;
  /** Extra classes for the root element (e.g. page-level spacing) — applied
   *  only when the banner actually renders, so an empty slot adds no gap. */
  className?: string;
};

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function BannerLink({ url, label }: { url: string; label: string }) {
  const className =
    "inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-neon text-white text-sm font-semibold hover:scale-105 transition-transform shrink-0";

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

function BannerImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
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

export default function ThemeBanner({ assets, className = "" }: ThemeBannerProps) {
  if (!assets.bannerEnabled) return null;

  const title = assets.bannerTitle?.trim() || null;
  const subtitle = assets.bannerSubtitle?.trim() || null;
  const link = assets.bannerLink?.trim() || null;
  const desktop = assets.bannerDesktop?.trim() || null;
  const mobile = assets.bannerMobile?.trim() || null;

  if (!title && !subtitle && !desktop && !mobile) return null;

  const desktopSrc = desktop ?? mobile;
  const mobileSrc = mobile ?? desktop;
  const singleImage = desktopSrc !== null && desktopSrc === mobileSrc;
  const alt = title ?? "";

  return (
    <div className={`relative overflow-hidden glass-strong rounded-3xl ${className}`.trim()}>
      {desktopSrc && (
        <div className="absolute inset-0">
          {singleImage ? (
            <BannerImage
              src={desktopSrc}
              alt={alt}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <>
              {desktop && (
                <BannerImage
                  src={desktop}
                  alt={alt}
                  className="hidden md:block w-full h-full object-cover opacity-60"
                />
              )}
              {mobile && (
                <BannerImage
                  src={mobile}
                  alt={alt}
                  className="md:hidden w-full h-full object-cover opacity-60"
                />
              )}
            </>
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--background) 92%, transparent) 0%, color-mix(in srgb, var(--background) 60%, transparent) 55%, color-mix(in srgb, var(--background) 25%, transparent) 100%)",
            }}
          />
        </div>
      )}
      <div className="relative p-6 md:p-9 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          {title && (
            <h3 className="text-xl md:text-2xl font-extrabold leading-tight">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-muted-foreground max-w-xl">{subtitle}</p>
          )}
        </div>
        {link && <BannerLink url={link} label="Learn more" />}
      </div>
    </div>
  );
}
