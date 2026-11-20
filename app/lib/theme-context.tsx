"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { validateThemeConfig } from "@/lib/themes/validate";
import type { ResolvedTheme, ThemeConfig } from "@/lib/themes/types";

/**
 * Client-side access to the resolved theme.
 *
 * The storefront applies tokens server-side (the root layout injects the
 * `:root` block), so most components need nothing here. This provider exists
 * for the client components that must READ the theme:
 *
 *  - the homepage mounts <ThemeBanner> from `config.assets`;
 *  - the Theme Studio preview (`?preview=1`) swaps in the DRAFT config —
 *    same localStorage/postMessage pipeline the preview tab writes to, so
 *    the banner inside the iframe shows the unsaved draft, not the live one.
 *
 * Fetching `/api/theme` once per session (react-query, 60 s stale) keeps the
 * cost to a single cached request; failures simply leave `theme` null and
 * consumers render nothing instead of guessing.
 */

const PREVIEW_SOURCE = "galaxy-theme-preview";
const STORAGE_KEY = "galaxy-store:theme-preview";

type ThemeContextValue = {
  /** The resolved (live) theme — null until the fetch settles. */
  theme: ResolvedTheme | null;
  /** Effective config: the studio's draft while previewing, else the live one. */
  config: ThemeConfig | null;
  /** True when the page was opened with `?preview=1` (studio iframe). */
  preview: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  config: null,
  preview: false,
});

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

/** Same validator the server uses — a malformed draft never reaches render. */
function parseDraft(raw: unknown): ThemeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const result = validateThemeConfig(raw);
  return result.ok ? result.config : null;
}

async function fetchTheme(): Promise<ResolvedTheme | null> {
  try {
    const res = await fetch("/api/theme");
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.success || !data.theme) return null;
    return data.theme as ResolvedTheme;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["theme"],
    queryFn: fetchTheme,
    staleTime: 60_000,
    retry: 1,
  });

  const [preview] = useState(() => isPreviewMode());
  const [draft, setDraft] = useState<ThemeConfig | null>(null);

  // Preview pipeline: read the persisted draft once, then follow live
  // changes from the studio (postMessage) and from other tabs (storage).
  useEffect(() => {
    if (!preview) return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const initial = parseDraft(JSON.parse(stored));
        if (initial) setDraft(initial);
      }
    } catch {
      /* corrupt payload — wait for the postMessage instead */
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; config?: unknown } | null;
      if (!data || data.source !== PREVIEW_SOURCE) return;
      const next = parseDraft(data.config);
      if (next) setDraft(next); // invalid drafts keep the last good one
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const next = parseDraft(JSON.parse(event.newValue));
        if (next) setDraft(next);
      } catch {
        /* ignore corrupt payloads */
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [preview]);

  const theme = data ?? null;
  const config = preview && draft ? draft : (theme?.config ?? null);

  const value = useMemo(
    () => ({ theme, config, preview }),
    [theme, config, preview]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
