"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { themeToCss } from "@/lib/themes/css";
import { useTheme } from "@/app/lib/theme-context";
import ThemeDecorations from "./ThemeDecorations";

/**
 * Live preview bridge — renders ONLY when the page is opened with
 * `?preview=1` (the Theme Studio iframe). It never activates for normal
 * visitors, so the storefront's own rendering path is untouched.
 *
 * Data flow (see app/lib/theme-context.tsx): the theme context owns the
 * preview pipeline (localStorage seed + postMessage + cross-tab storage) and
 * exposes the draft as the effective `config`. This bridge then:
 *
 *   1. injects a `:root { … }` style tag with the draft's tokens (appended
 *      after the server's `#theme-tokens`, so it wins for equal specificity);
 *   2. swaps the decoration overlay to the draft's;
 *   3. marks <html> with `theme-preview-mode` (hides the storefront's own
 *      decoration layer — see globals.css) and shows a permanent PREVIEW
 *      badge so nobody mistakes the draft for the live site.
 *
 * The seasonal banner is NOT rendered here: the homepage reads the same
 * draft-aware config through useTheme(), so the banner appears in its real
 * position instead of being duplicated.
 */

export default function ThemePreviewBridge() {
  const { preview, config } = useTheme();
  // Gated on mount (not just the flag) so the server's null render and the
  // client's first render match — no hydration mismatch.
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!preview) return;
    document.documentElement.classList.add("theme-preview-mode");
    setActive(true);
    return () => {
      document.documentElement.classList.remove("theme-preview-mode");
      document.getElementById("theme-preview-style")?.remove();
    };
  }, [preview]);

  // Draft (or live, until the draft arrives) token overrides.
  const css = config ? themeToCss(config) : null;

  useEffect(() => {
    if (!preview || !active) return;
    let tag = document.getElementById("theme-preview-style") as HTMLStyleElement | null;
    if (!css) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "theme-preview-style";
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [css, preview, active]);

  if (!preview || !active) return null;

  return (
    <>
      {/* Draft decorations — marked so the storefront's own layer hides. */}
      {config?.decorations?.enabled ? (
        <ThemeDecorations decorations={config.decorations} preview />
      ) : null}

      {/* Always-visible mode indicator so nobody mistakes it for live. */}
      <div
        className="fixed top-2 left-2 z-[100] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/90 text-black text-[11px] font-extrabold uppercase tracking-wider shadow-lg pointer-events-none"
        aria-hidden="true"
      >
        <Eye className="w-3.5 h-3.5" /> Preview
      </div>
    </>
  );
}
