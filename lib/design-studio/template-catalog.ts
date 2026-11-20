/**
 * PHASE 1.1 / CD-3 — server-side template catalog.
 *
 * The DATABASE is the single source of truth for geometry. The TypeScript
 * registry is used only as a last-resort read-only fallback for legacy rows
 * that have no valid published snapshot (e.g. a removed template still
 * referenced by an existing product).
 */
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { getTemplate } from "./templates";
import { normalizeDbTemplate } from "./template-schema";
import type { ProductTemplate } from "./types";

export type CatalogEntry = {
  key: string;
  template: ProductTemplate;
  source: "db" | "registry-fallback";
  geometryVersion: number;
};

type Cache = { stamp: string; catalog: Map<string, CatalogEntry> };
let cached: Cache | null = null;

const SELECT_WITH_PUBLISHED =
  "id, template_key, name, name_ar, category, is_active, is_published, geometry_version, updated_at, dimensions_mm, views, colors, sizes, published_dimensions_mm, published_views, published_colors, published_sizes";
const SELECT_LEGACY =
  "id, template_key, name, name_ar, category, is_active, updated_at, dimensions_mm, views, colors, sizes";

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return data && typeof data === "object" ? [data as Record<string, unknown>] : [];
}

async function loadRows(): Promise<{ rows: Record<string, unknown>[]; legacy: boolean }> {
  const db = getServiceRoleClient();
  let result = await db
    .from("creator_product_templates")
    .select(SELECT_WITH_PUBLISHED)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (result.error && /does not exist|42703|PGRST204/i.test(result.error.message ?? "")) {
    // Migration not applied in this environment: keep the app working with the
    // legacy (draft) geometry instead of crashing.
    result = await db
      .from("creator_product_templates")
      .select(SELECT_LEGACY)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { rows: asRows(result.data), legacy: true };
  }
  if (result.error) throw result.error;
  return { rows: asRows(result.data), legacy: false };
}

/** All published templates, keyed by template_key. */
export async function getPublishedCatalog(): Promise<Map<string, CatalogEntry>> {
  let rows: Record<string, unknown>[];
  let legacy: boolean;
  try {
    ({ rows, legacy } = await loadRows());
  } catch {
    // A missing/unmigrated catalog must never break rendering. Callers fall
    // back to the read-only registry in this case.
    return new Map();
  }
  const stamp = rows.map((row) => String(row.updated_at ?? "")).join("|");
  if (cached && cached.stamp === stamp) return cached.catalog;

  const catalog = new Map<string, CatalogEntry>();
  for (const row of rows) {
    const key = String(row.template_key ?? "");
    if (!key) continue;
    const template = normalizeDbTemplate(row, legacy ? "legacy" : "published");
    if (!template) continue; // invalid geometry is skipped, never crashes the catalog
    catalog.set(key, {
      key,
      template,
      source: legacy ? "registry-fallback" : "db",
      geometryVersion: Number(row.geometry_version ?? 1),
    });
  }
  // Never cache an empty catalog: a transient/startup DB failure must not
  // poison every later request in a long-lived server process.
  if (catalog.size > 0) cached = { stamp, catalog };
  return catalog;
}

/**
 * Resolve one template for rendering/validation. DB published geometry first;
 * read-only TS registry fallback only when the DB has no valid published row.
 */
export async function resolveTemplateForProduct(
  key: string
): Promise<CatalogEntry | null> {
  const catalog = await getPublishedCatalog();
  const fromDb = catalog.get(key);
  if (fromDb) return fromDb;
  const fallback = getTemplate(key);
  if (!fallback) return null;
  return { key, template: fallback, source: "registry-fallback", geometryVersion: 0 };
}

/** Clear the in-memory catalog (used by tests and after publish). */
export function clearTemplateCatalogCache(): void {
  cached = null;
}
