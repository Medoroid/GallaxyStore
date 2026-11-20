/**
 * Pure cover presentation for gallery cards (Phase 8).
 *
 * A gallery submission never requires a generated mockup (the publish route
 * accepts gallery items without previews — the profile grid must therefore
 * render them honestly, not as a broken image or a generic icon). The title
 * card derives a deterministic gradient + initial from the title itself:
 * same title -> same card on every render, no randomness, no assets.
 */

/** Galaxy-flavoured gradient stops. Literal strings so Tailwind JIT sees them. */
const COVER_GRADIENTS = [
  "from-pink-500/70 via-fuchsia-500/60 to-indigo-500/70",
  "from-amber-400/70 via-orange-500/60 to-pink-500/70",
  "from-cyan-400/70 via-sky-500/60 to-violet-500/70",
  "from-emerald-400/70 via-teal-500/60 to-cyan-500/70",
  "from-violet-500/70 via-purple-500/60 to-fuchsia-500/70",
] as const;

export const COVER_GRADIENT_COUNT = COVER_GRADIENTS.length;

export type GalleryCoverStyle = {
  /** First character of the title, upper-cased ("?" when empty). */
  initial: string;
  /** Tailwind gradient utility pair (bg-gradient-to-br + color stops). */
  gradient: string;
};

/** True when the entry has a preview worth rendering as an image. */
export function hasGalleryPreview(
  previewPath: string | null | undefined
): boolean {
  return typeof previewPath === "string" && previewPath.trim().length > 0;
}

/**
 * Deterministic title-card style for a gallery entry.
 *
 * The hash rolls over code points (stable across runs and platforms) and
 * indexes a fixed palette — identical titles always produce identical cards.
 */
export function galleryCover(
  title: string | null | undefined
): GalleryCoverStyle {
  const trimmed = typeof title === "string" ? title.trim() : "";
  const first = Array.from(trimmed)[0] ?? "?";

  let hash = 0;
  for (const ch of trimmed) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 1000003;
  }

  const index = Math.abs(hash) % COVER_GRADIENTS.length;
  return { initial: first.toUpperCase(), gradient: COVER_GRADIENTS[index] };
}
