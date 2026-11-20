"use client";

import { useMemo } from "react";
import type { ThemeDecorations as DecorationsConfig } from "@/lib/themes/types";

/**
 * Seasonal decoration overlay — the purely-visual layer a theme can opt into.
 *
 * Contract:
 *  - fixed full-viewport layer, pointer-events: none, aria-hidden: it can
 *    never intercept clicks or reach screen readers;
 *  - element counts are capped by density (1/2/3 → 6/12/18 of each kind) so
 *    a theme cannot turn the store into a slideshow — total DOM stays tiny;
 *  - positions/delays are deterministic (index-derived), so SSR and client
 *    render identical trees (no hydration mismatch from Math.random());
 *  - all motion lives in globals.css keyframes and freezes entirely under
 *    prefers-reduced-motion (see the .theme-decor block);
 *  - renders nothing when disabled or when no effect is selected.
 *
 * Colors come from the theme tokens (var(--gold), var(--brand)) — there is
 * no path for admin-authored CSS here, only booleans and a density number.
 */

type ThemeDecorationsProps = {
  decorations: DecorationsConfig;
  /**
   * True only inside the Theme Studio preview iframe: adds a marker class so
   * the bridge's CSS can hide the storefront's own overlay instead of
   * doubling it while an admin previews a draft.
   */
  preview?: boolean;
};

/** Density → per-effect element count (hard cap at 18). */
const DENSITY_COUNT: Record<number, number> = { 1: 6, 2: 12, 3: 18 };

/** Deterministic 0..n-1 spread (no RNG: SSR/client parity). */
function spread(index: number, total: number, span: number): number {
  return ((index * 7919 + 104729) % total) * (span / Math.max(total, 1));
}

export default function ThemeDecorations({ decorations, preview = false }: ThemeDecorationsProps) {
  const count = DENSITY_COUNT[decorations.density] ?? 6;

  const snowflakes = useMemo(
    () =>
      decorations.enabled && decorations.snowflakes
        ? Array.from({ length: count }, (_, i) => ({
            key: i,
            left: `${spread(i, count, 96).toFixed(2)}%`,
            size: 3 + ((i * 13) % 4),
            duration: `${9 + ((i * 7) % 8)}s`,
            delay: `-${(i * 1.7) % 10}s`,
          }))
        : [],
    [decorations.enabled, decorations.snowflakes, count]
  );

  const particles = useMemo(
    () =>
      decorations.enabled && decorations.particles
        ? Array.from({ length: count }, (_, i) => ({
            key: i,
            left: `${spread(i, count, 94).toFixed(2)}%`,
            char: i % 3 === 0 ? "✦" : i % 3 === 1 ? "✧" : "·",
            duration: `${4 + ((i * 5) % 5)}s`,
            delay: `-${(i * 1.3) % 8}s`,
          }))
        : [],
    [decorations.enabled, decorations.particles, count]
  );

  const lanterns = useMemo(
    () =>
      decorations.enabled && decorations.lanterns
        ? Array.from({ length: Math.min(count, 8) }, (_, i) => ({
            key: i,
            left: `${spread(i, Math.min(count, 8), 92).toFixed(2)}%`,
            duration: `${16 + ((i * 9) % 10)}s`,
            delay: `-${(i * 3.1) % 20}s`,
          }))
        : [],
    [decorations.enabled, decorations.lanterns, count]
  );

  const ribbons = useMemo(
    () =>
      decorations.enabled && decorations.ribbons
        ? Array.from({ length: Math.min(count, 10) }, (_, i) => ({
            key: i,
            left: `${spread(i, Math.min(count, 10), 95).toFixed(2)}%`,
            hue: `linear-gradient(180deg, var(--brand), var(--gold))`,
            duration: `${11 + ((i * 6) % 7)}s`,
            delay: `-${(i * 2.3) % 12}s`,
          }))
        : [],
    [decorations.enabled, decorations.ribbons, count]
  );

  if (!decorations.enabled) return null;
  const nothing =
    !decorations.snowflakes &&
    !decorations.particles &&
    !decorations.lanterns &&
    !decorations.crescent &&
    !decorations.ribbons &&
    !decorations.animatedGradient &&
    !decorations.cornerOrnaments;
  if (nothing) return null;

  return (
    <div
      className={`theme-decor${preview ? " theme-decor--preview" : ""}`}
      aria-hidden="true"
    >
      {decorations.animatedGradient ? <div className="theme-decor__gradient" /> : null}

      {decorations.crescent ? <div className="theme-decor__moon" /> : null}

      {decorations.cornerOrnaments ? (
        <>
          <div className="theme-decor__corner theme-decor__corner--tl" />
          <div className="theme-decor__corner theme-decor__corner--tr" />
          <div className="theme-decor__corner theme-decor__corner--bl" />
          <div className="theme-decor__corner theme-decor__corner--br" />
        </>
      ) : null}

      {snowflakes.map((flake) => (
        <span
          key={`snow-${flake.key}`}
          className="theme-decor__flake"
          style={{
            left: flake.left,
            width: flake.size,
            height: flake.size,
            animationDuration: flake.duration,
            animationDelay: flake.delay,
          }}
        />
      ))}

      {particles.map((spark) => (
        <span
          key={`spark-${spark.key}`}
          className="theme-decor__spark"
          style={{
            left: spark.left,
            animationDuration: spark.duration,
            animationDelay: spark.delay,
          }}
        >
          {spark.char}
        </span>
      ))}

      {lanterns.map((lantern) => (
        <span
          key={`lantern-${lantern.key}`}
          className="theme-decor__lantern"
          style={{
            left: lantern.left,
            animationDuration: lantern.duration,
            animationDelay: lantern.delay,
          }}
        />
      ))}

      {ribbons.map((ribbon) => (
        <span
          key={`ribbon-${ribbon.key}`}
          className="theme-decor__ribbon"
          style={{
            left: ribbon.left,
            background: ribbon.hue,
            animationDuration: ribbon.duration,
            animationDelay: ribbon.delay,
          }}
        />
      ))}
    </div>
  );
}
