/**
 * PHASE 1.1 / CD-3 — shared template geometry contract.
 *
 * Pure module (no Supabase/Next imports) used by the admin editor, the publish
 * endpoint, the server catalog loader and client hydration. The DB is the
 * source of truth for geometry; this module validates and normalizes it into
 * the camelCase ProductTemplate shape the renderer consumes.
 */
import type {
  ProductTemplate,
  TemplateColor,
  TemplateSize,
  TemplateView,
} from "./types";
import { getRenderer } from "./templates";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[a-z0-9_]{1,40}$/;
const MAX_VIEWS = 12;
const MAX_COLORS = 64;
const MAX_SIZES = 40;

export type Geometry = {
  dimensions_mm: { w: number; h: number; depth?: number };
  views: unknown[];
  colors: unknown[];
  sizes: unknown[];
};

export type ValidationResult =
  | { ok: true; value: Geometry }
  | { ok: false; field: string; message: string };

const fail = (field: string, message: string): ValidationResult => ({
  ok: false,
  field,
  message,
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Deep validation of a publishable geometry snapshot. This is the single
 * authority — the admin route and the publish endpoint both call it.
 */
export function validateTemplateGeometry(input: unknown): ValidationResult {
  if (!isObject(input)) return fail("geometry", "Template geometry must be an object.");

  const dimensions = input.dimensions_mm;
  if (
    !isObject(dimensions) ||
    !(finite(dimensions.w) && dimensions.w > 0) ||
    !(finite(dimensions.h) && dimensions.h > 0) ||
    (dimensions.depth != null && !(finite(dimensions.depth) && dimensions.depth > 0))
  ) {
    return fail("dimensions_mm", "dimensions_mm needs positive w/h (and optional depth).");
  }

  const views = input.views;
  if (!Array.isArray(views) || views.length < 1 || views.length > MAX_VIEWS) {
    return fail("views", `views must be an array with 1-${MAX_VIEWS} entries.`);
  }
  const viewKeys = new Set<string>();
  const cleanViews: TemplateView[] = [];
  for (const raw of views) {
    if (!isObject(raw)) return fail("views", "Each view must be an object.");
    const key = raw.key;
    if (typeof key !== "string" || !KEY_RE.test(key) || viewKeys.has(key)) {
      return fail("views", "Every view needs a unique key (a-z, 0-9, _).");
    }
    viewKeys.add(key);
    const canvas = raw.canvas;
    if (!isObject(canvas) || !(finite(canvas.w) && canvas.w > 0) || !(finite(canvas.h) && canvas.h > 0)) {
      return fail("views", `View "${key}" needs a canvas with positive w/h.`);
    }
    const area = raw.print_area;
    if (
      !isObject(area) ||
      ![area.x, area.y, area.w, area.h].every(finite) ||
      !(Number(area.w) > 0) ||
      !(Number(area.h) > 0)
    ) {
      return fail("views", `View "${key}" needs print_area x/y/w/h (w/h > 0).`);
    }
    if (
      Number(area.x) < 0 ||
      Number(area.y) < 0 ||
      Number(area.x) + Number(area.w) > Number(canvas.w) ||
      Number(area.y) + Number(area.h) > Number(canvas.h)
    ) {
      return fail("views", `View "${key}" print_area must fit inside its canvas.`);
    }
    cleanViews.push({
      key,
      label: typeof raw.label === "string" ? raw.label : key,
      canvas: { w: Number(canvas.w), h: Number(canvas.h) },
      printArea: {
        x: Number(area.x),
        y: Number(area.y),
        w: Number(area.w),
        h: Number(area.h),
      },
    });
  }

  const colors = input.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS) {
    return fail("colors", `colors must be an array with 1-${MAX_COLORS} entries.`);
  }
  const colorKeys = new Set<string>();
  const cleanColors: TemplateColor[] = [];
  for (const raw of colors) {
    if (!isObject(raw)) return fail("colors", "Each color must be an object.");
    const key = raw.key;
    if (typeof key !== "string" || !KEY_RE.test(key) || colorKeys.has(key)) {
      return fail("colors", "Every color needs a unique key (a-z, 0-9, _).");
    }
    colorKeys.add(key);
    if (typeof raw.name !== "string" || raw.name.length < 1 || raw.name.length > 60) {
      return fail("colors", `Color "${key}" needs a name of 1-60 characters.`);
    }
    if (typeof raw.hex !== "string" || !HEX_RE.test(raw.hex)) {
      return fail("colors", `Color "${key}" needs a #rrggbb hex value.`);
    }
    if (raw.shade_hex != null && (typeof raw.shade_hex !== "string" || !HEX_RE.test(raw.shade_hex))) {
      return fail("colors", `Color "${key}" has an invalid shade_hex.`);
    }
    cleanColors.push({
      key,
      name: raw.name,
      nameAr: typeof raw.name_ar === "string" ? raw.name_ar : undefined,
      hex: raw.hex,
      shadeHex: typeof raw.shade_hex === "string" ? raw.shade_hex : raw.hex,
    });
  }

  const sizes = input.sizes;
  if (!Array.isArray(sizes) || sizes.length < 1 || sizes.length > MAX_SIZES) {
    return fail("sizes", `sizes must be an array with 1-${MAX_SIZES} entries.`);
  }
  const sizeKeys = new Set<string>();
  const cleanSizes: TemplateSize[] = [];
  for (const raw of sizes) {
    if (!isObject(raw)) return fail("sizes", "Each size must be an object.");
    const key = raw.key;
    if (typeof key !== "string" || !KEY_RE.test(key) || sizeKeys.has(key)) {
      return fail("sizes", "Every size needs a unique key (a-z, 0-9, _).");
    }
    sizeKeys.add(key);
    if (typeof raw.name !== "string" || raw.name.length < 1 || raw.name.length > 60) {
      return fail("sizes", `Size "${key}" needs a name of 1-60 characters.`);
    }
    cleanSizes.push({
      key,
      name: raw.name,
      label: typeof raw.label === "string" && raw.label ? raw.label : raw.name,
    });
  }

  return {
    ok: true,
    value: {
      dimensions_mm: {
        w: Number(dimensions.w),
        h: Number(dimensions.h),
        ...(dimensions.depth != null ? { depth: Number(dimensions.depth) } : {}),
      },
      views: cleanViews,
      colors: cleanColors,
      sizes: cleanSizes,
    },
  };
}

/** Published geometry snapshot from a DB row, or null when not published. */
export function publishedGeometryFromRow(row: Record<string, unknown>): Geometry | null {
  if (row.is_published !== true) return null;
  const geometry = {
    dimensions_mm: row.published_dimensions_mm,
    views: row.published_views,
    colors: row.published_colors,
    sizes: row.published_sizes,
  };
  if (
    geometry.dimensions_mm == null ||
    geometry.views == null ||
    geometry.colors == null ||
    geometry.sizes == null
  ) {
    return null;
  }
  const result = validateTemplateGeometry(geometry);
  return result.ok ? result.value : null;
}

/** Hydrate validated geometry into a renderable ProductTemplate. */
export function hydrateTemplate(
  key: string,
  meta: { name: string; nameAr?: string | null; category?: string | null },
  geometry: Geometry
): ProductTemplate {
  const renderer = getRenderer(key);
  const clean = validateTemplateGeometry(geometry);
  const value = clean.ok ? clean.value : geometry;
  return {
    key: key as ProductTemplate["key"],
    name: meta.name,
    nameAr: meta.nameAr ?? meta.name,
    category: meta.category ?? "custom",
    dimensionsMm: value.dimensions_mm as ProductTemplate["dimensionsMm"],
    views: value.views as TemplateView[],
    colors: value.colors as TemplateColor[],
    sizes: value.sizes as TemplateSize[],
    body: renderer.body,
    overlay: renderer.overlay,
  };
}

/** Normalize a DB row (published or legacy draft) into a renderable template. */
export function normalizeDbTemplate(
  row: Record<string, unknown>,
  source: "published" | "legacy"
): ProductTemplate | null {
  const key = typeof row.template_key === "string" ? row.template_key : "";
  if (!key) return null;
  const published = source === "published" ? publishedGeometryFromRow(row) : null;
  const geometry: Geometry | null = published ?? {
    dimensions_mm: row.dimensions_mm as Geometry["dimensions_mm"],
    views: (row.views ?? []) as unknown[],
    colors: (row.colors ?? []) as unknown[],
    sizes: (row.sizes ?? []) as unknown[],
  };
  const validation = validateTemplateGeometry(geometry);
  // Be permissive at read time: a legacy/partially-valid row still renders
  // through the fallback rather than making the whole studio unavailable.
  return hydrateTemplate(
    key,
    {
      name: typeof row.name === "string" ? row.name : key,
      nameAr: typeof row.name_ar === "string" ? row.name_ar : null,
      category: typeof row.category === "string" ? row.category : null,
    },
    validation.ok ? validation.value : geometry
  );
}

/** Convert a hydrated template back to the wire/DB geometry shape. */
export function toGeometry(template: ProductTemplate): Geometry {
  return {
    dimensions_mm: template.dimensionsMm,
    views: template.views.map((view) => ({
      key: view.key,
      label: view.label,
      canvas: view.canvas,
      print_area: view.printArea,
    })),
    colors: template.colors.map((color) => ({
      key: color.key,
      name: color.name,
      name_ar: color.nameAr ?? null,
      hex: color.hex,
      shade_hex: color.shadeHex,
    })),
    sizes: template.sizes.map((size) => ({
      key: size.key,
      name: size.name,
      label: size.label,
    })),
  };
}

/** True when a draft differs from its published snapshot. */
export function hasUnpublishedChanges(row: Record<string, unknown>): boolean {
  if (row.is_published !== true) return true;
  const fields: Array<[string, string]> = [
    ["views", "published_views"],
    ["colors", "published_colors"],
    ["sizes", "published_sizes"],
    ["dimensions_mm", "published_dimensions_mm"],
  ];
  return fields.some(
    ([draft, published]) => JSON.stringify(row[draft]) !== JSON.stringify(row[published])
  );
}
