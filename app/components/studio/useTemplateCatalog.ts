"use client";

import { useEffect, useState } from "react";
import { hydrateTemplate } from "@/lib/design-studio/template-schema";
import type { ProductTemplate } from "@/lib/design-studio/types";

/**
 * Client-side catalog of PUBLISHED template geometry fetched from /api/templates.
 * The TS registry is only used by hydrateTemplate() for SVG renderer functions;
 * all geometry comes from the DB-backed API. No silent fallback to registry data.
 */
type WireEntry = {
  key: string;
  name: string;
  nameAr?: string | null;
  category?: string | null;
  geometry: Parameters<typeof hydrateTemplate>[2];
  geometryVersion?: number;
  source?: string;
};

let cache: Map<string, ProductTemplate> | null = null;
let versions: Map<string, number> | null = null;

export function useTemplateCatalog() {
  const [templates, setTemplates] = useState<Map<string, ProductTemplate>>(
    cache ?? new Map()
  );
  const [geometryVersions, setVersions] = useState<Map<string, number>>(
    versions ?? new Map()
  );
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/templates", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message ?? "Unable to load templates.");
        }
        const map = new Map<string, ProductTemplate>();
        const vers = new Map<string, number>();
        for (const entry of payload.templates as WireEntry[]) {
          const template = hydrateTemplate(
            entry.key,
            { name: entry.name, nameAr: entry.nameAr, category: entry.category },
            entry.geometry
          );
          map.set(entry.key, template);
          vers.set(entry.key, Number(entry.geometryVersion ?? 1));
        }
        cache = map;
        versions = vers;
        if (!cancelled) {
          setTemplates(map);
          setVersions(vers);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load templates.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    templates,
    byKey: (key: string) => templates.get(key) ?? null,
    geometryVersions,
    loading,
    error,
  };
}

/** Reload after a template publish (invalidates the module cache). */
export function clearTemplateCatalogClientCache(): void {
  cache = null;
  versions = null;
}
