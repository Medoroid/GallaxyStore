"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type SafeImageProps = Omit<ImageProps, "src"> & {
  src: ImageProps["src"];
  /** Local fallback used when the remote/storage image fails to load. */
  fallback?: string;
};

const DEFAULT_FALLBACK = "/product-tshirt.jpg";

function srcKeyOf(src: ImageProps["src"]): string {
  if (typeof src === "object" && src !== null && "src" in src) {
    return (src as { src: string }).src; // static image import
  }
  return String(src);
}

/**
 * next/image wrapper that never leaves a broken image on screen (A3).
 *
 * Storage objects that were deleted, external hotlinks that expired, or any
 * other load failure swap to a local placeholder shipped in /public.
 *
 * Implementation notes:
 *  - remembers WHICH source failed instead of toggling a boolean, so a later
 *    src change renders the new image automatically (no state-sync effect);
 *  - the swap happens inside the onError event handler only;
 *  - a failing fallback records the same key again and bails out — no loop.
 */
export function SafeImage({ src, fallback = DEFAULT_FALLBACK, alt, ...rest }: SafeImageProps) {
  const srcKey = srcKeyOf(src);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const showFallback = failedKey !== null && failedKey === srcKey;

  return (
    <Image
      {...rest}
      alt={alt}
      src={showFallback ? fallback : src}
      onError={() => setFailedKey(srcKey)}
    />
  );
}
