/**
 * Server-side validation + normalisation for admin-edited mockup templates.
 *
 * The database row is the source of truth for public mockups, so every field
 * that reaches the compositor is checked here: geometry bounds, colour syntax,
 * mask-path characters, perspective allow-list and SVG fragment sanitisation.
 * Unknown fields are dropped — a client can never write approval/ownership or
 * inject markup through template JSON.
 */

import { sanitizeSvgFragment } from "./sanitize";
import type { MockupTemplate, MockupView, MockupColor, MockupSize } from "./types";

const KEY_RE = /^[a-z0-9_]{2,40}$/;
const ITEM_KEY_RE = /^[a-z0-9_]{1,40}$/;
const CATEGORY_RE = /^[a-z0-9_-]{1,40}$/;
const HEX_RE = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i;
const MASK_RE = /^[\dMmLlHhVvCcSsQqTtAaZz.\-+,\s]+$/;
const PERSPECTIVE_RE = /^(matrix|skewX|skewY|scale|rotate)\([-0-9.,\s]+\)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Result =
  | { ok: true; value: MockupTemplate }
  | { ok: false; error: string; field?: string };

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseView(raw: unknown, index: number): { view?: MockupView; error?: string } {
  if (!raw || typeof raw !== "object") return { error: `views[${index}] must be an object` };
  const v = raw as Record<string, unknown>;
  const key = String(v.key ?? "");
  if (!ITEM_KEY_RE.test(key)) return { error: `views[${index}].key is invalid` };

  const canvas = v.canvas as Record<string, unknown> | undefined;
  const area = v.printArea as Record<string, unknown> | undefined;
  const cw = finite(canvas?.w);
  const ch = finite(canvas?.h);
  const ax = finite(area?.x);
  const ay = finite(area?.y);
  const aw = finite(area?.w);
  const ah = finite(area?.h);
  if (cw === null || ch === null || cw < 100 || ch < 100 || cw > 8000 || ch > 8000) {
    return { error: `views[${index}].canvas is out of bounds` };
  }
  if ([ax, ay, aw, ah].some((n) => n === null) || aw === undefined || ah === undefined || aw! <= 0 || ah! <= 0) {
    return { error: `views[${index}].printArea is invalid` };
  }
  const mask = String(v.maskPath ?? "");
  if (!mask || !MASK_RE.test(mask)) return { error: `views[${index}].maskPath is invalid` };

  const perspective = v.perspective === undefined || v.perspective === null
    ? undefined
    : String(v.perspective);
  if (perspective && !PERSPECTIVE_RE.test(perspective)) {
    return { error: `views[${index}].perspective is not allowed` };
  }

  return {
    view: {
      key,
      label: String(v.label ?? key).slice(0, 40),
      labelAr: typeof v.labelAr === "string" ? v.labelAr.slice(0, 40) : undefined,
      canvas: { w: cw!, h: ch! },
      printArea: { x: ax!, y: ay!, w: aw!, h: ah! },
      maskPath: mask,
      ...(perspective ? { perspective } : {}),
      shadowSvg: sanitizeSvgFragment(v.shadowSvg ?? ""),
      highlightSvg: sanitizeSvgFragment(v.highlightSvg ?? ""),
    },
  };
}

function parseColor(raw: unknown, index: number): { color?: MockupColor; error?: string } {
  if (!raw || typeof raw !== "object") return { error: `colors[${index}] must be an object` };
  const c = raw as Record<string, unknown>;
  const key = String(c.key ?? "");
  const hex = String(c.hex ?? "");
  const shadeHex = String(c.shadeHex ?? "");
  if (!ITEM_KEY_RE.test(key)) return { error: `colors[${index}].key is invalid` };
  if (!HEX_RE.test(hex) || !HEX_RE.test(shadeHex)) return { error: `colors[${index}] has an invalid colour` };
  const highlightHex = c.highlightHex === undefined ? undefined : String(c.highlightHex);
  if (highlightHex !== undefined && !HEX_RE.test(highlightHex)) {
    return { error: `colors[${index}].highlightHex is invalid` };
  }
  return {
    color: {
      key,
      name: String(c.name ?? key).slice(0, 60),
      nameAr: typeof c.nameAr === "string" ? c.nameAr.slice(0, 60) : undefined,
      hex,
      shadeHex,
      ...(highlightHex ? { highlightHex } : {}),
    },
  };
}

function parseSize(raw: unknown, index: number): { size?: MockupSize; error?: string } {
  if (!raw || typeof raw !== "object") return { error: `sizes[${index}] must be an object` };
  const s = raw as Record<string, unknown>;
  const key = String(s.key ?? "");
  if (!ITEM_KEY_RE.test(key)) return { error: `sizes[${index}].key is invalid` };
  return { size: { key, name: String(s.name ?? key).slice(0, 40), label: String(s.label ?? key).slice(0, 20) } };
}

/** Validate a full admin template payload; returns a normalised value. */
export function validateTemplatePayload(raw: unknown): Result {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid template payload." };
  const p = raw as Record<string, unknown>;

  const key = String(p.template_key ?? p.key ?? "");
  if (!KEY_RE.test(key)) return { ok: false, error: "template_key must be 2–40 lowercase letters, digits or underscores.", field: "template_key" };
  const name = String(p.name ?? "").trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "name must be 1–80 characters.", field: "name" };
  const category = String(p.category ?? "custom");
  if (!CATEGORY_RE.test(category)) return { ok: false, error: "category is invalid.", field: "category" };

  const dims = p.dimensionsMm as Record<string, unknown> | undefined;
  const dw = finite(dims?.w); const dh = finite(dims?.h); const dd = dims?.depth === undefined ? undefined : finite(dims.depth);
  if (dw === null || dh === null || dw <= 0 || dh <= 0 || dw > 5000 || dh > 5000) {
    return { ok: false, error: "dimensionsMm must be positive numbers.", field: "dimensionsMm" };
  }
  if (dd !== undefined && (dd === null || dd <= 0)) {
    return { ok: false, error: "dimensionsMm.depth is invalid.", field: "dimensionsMm" };
  }

  const rawViews = Array.isArray(p.views) ? p.views : [];
  if (rawViews.length < 1 || rawViews.length > 12) {
    return { ok: false, error: "Provide between 1 and 12 views.", field: "views" };
  }
  const views: MockupView[] = [];
  for (let i = 0; i < rawViews.length; i += 1) {
    const parsed = parseView(rawViews[i], i);
    if (parsed.error) return { ok: false, error: parsed.error, field: "views" };
    views.push(parsed.view!);
  }
  if (new Set(views.map((v) => v.key)).size !== views.length) {
    return { ok: false, error: "View keys must be unique.", field: "views" };
  }

  const rawColors = Array.isArray(p.colors) ? p.colors : [];
  if (rawColors.length < 1 || rawColors.length > 32) {
    return { ok: false, error: "Provide between 1 and 32 colours.", field: "colors" };
  }
  const colors: MockupColor[] = [];
  for (let i = 0; i < rawColors.length; i += 1) {
    const parsed = parseColor(rawColors[i], i);
    if (parsed.error) return { ok: false, error: parsed.error, field: "colors" };
    colors.push(parsed.color!);
  }
  if (new Set(colors.map((c) => c.key)).size !== colors.length) {
    return { ok: false, error: "Colour keys must be unique.", field: "colors" };
  }

  const rawSizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (rawSizes.length > 32) return { ok: false, error: "Too many sizes.", field: "sizes" };
  const sizes: MockupSize[] = [];
  for (let i = 0; i < rawSizes.length; i += 1) {
    const parsed = parseSize(rawSizes[i], i);
    if (parsed.error) return { ok: false, error: parsed.error, field: "sizes" };
    sizes.push(parsed.size!);
  }

  const bodySvg = sanitizeSvgFragment(p.bodySvg ?? "");
  if (!bodySvg) return { ok: false, error: "bodySvg is required.", field: "bodySvg" };
  const overlaySvg = sanitizeSvgFragment(p.overlaySvg ?? "");
  const patterns = Array.isArray(p.texturePatterns)
    ? p.texturePatterns.slice(0, 8).map((pattern) => sanitizeSvgFragment(pattern)).filter(Boolean)
    : [];
  const textureId = typeof p.textureId === "string" ? p.textureId.slice(0, 40) : undefined;

  const provenance = p.provenance && typeof p.provenance === "object"
    ? p.provenance as Record<string, unknown>
    : {};
  const source = provenance.source === "admin-upload" ? "admin-upload" : "original-vector";
  const storeProductId = p.store_product_id === undefined || p.store_product_id === null || p.store_product_id === ""
    ? null
    : String(p.store_product_id);
  const storeVariantId = p.store_variant_id === undefined || p.store_variant_id === null || p.store_variant_id === ""
    ? null
    : String(p.store_variant_id);
  if (storeProductId && !UUID_RE.test(storeProductId)) return { ok: false, error: "store_product_id is invalid.", field: "store_product_id" };
  if (storeVariantId && !UUID_RE.test(storeVariantId)) return { ok: false, error: "store_variant_id is invalid.", field: "store_variant_id" };

  const rawPhotoAssets = Array.isArray(p.photoAssets ?? p.photo_assets)
    ? (p.photoAssets ?? p.photo_assets) as unknown[]
    : [];
  const photoAssets = rawPhotoAssets.slice(0, 40).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const a = raw as Record<string, unknown>;
    const src = String(a.src ?? "");
    const isData = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src);
    const isLocal = /^\/mockup-assets\/[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp|svg)$/.test(src);
    if (!isData && !isLocal) return [];
    const area = a.printArea as Record<string, unknown> | undefined;
    const n = ["x", "y", "w", "h"].map((k) => Number(area?.[k]));
    if (!n.every((v) => Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return [];
    if (n[0] < 0 || n[1] < 0 || n[0] + n[2] > 1 || n[1] + n[3] > 1) return [];
    const blend = ["multiply", "normal", "screen"].includes(String(a.blend)) ? a.blend as "multiply" | "normal" | "screen" : "normal";
    const texture = ["fabric", "paper", "ceramic"].includes(String(a.texture)) ? a.texture as "fabric" | "paper" | "ceramic" : null;
    return [{
      colorKey: String(a.colorKey ?? "").slice(0, 40),
      viewKey: String(a.viewKey ?? "front").slice(0, 40),
      src,
      width: Number(a.width) > 0 ? Number(a.width) : 1600,
      height: Number(a.height) > 0 ? Number(a.height) : 1067,
      printArea: { x: n[0], y: n[1], w: n[2], h: n[3] },
      blend,
      opacity: Number.isFinite(Number(a.opacity)) ? Math.min(1, Math.max(0, Number(a.opacity))) : 0.92,
      texture,
      author: String(a.author ?? "Galaxy Store admin").slice(0, 120),
      sourcePage: String(a.sourcePage ?? "https://www.pexels.com/license/").slice(0, 500),
      description: typeof a.description === "string" ? a.description.slice(0, 300) : undefined,
      isActive: a.isActive !== false,
      sortOrder: Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : index,
    }];
  });

  return {
    ok: true,
    value: {
      key,
      name: name.slice(0, 80),
      nameAr: String(p.nameAr ?? name).slice(0, 80),
      category,
      description: typeof p.description === "string" ? p.description.slice(0, 300) : undefined,
      dimensionsMm: { w: dw!, h: dh!, ...(dd !== undefined ? { depth: dd } : {}) },
      colors,
      sizes,
      views,
      bodySvg,
      overlaySvg: overlaySvg || undefined,
      textureId,
      texturePatterns: patterns,
      provenance: {
        source,
        author: String(provenance.author ?? "Galaxy Store Custom Print Studio").slice(0, 120),
        license: String(provenance.license ?? "CC0-1.0").slice(0, 120),
        ...(typeof provenance.url === "string" ? { url: provenance.url.slice(0, 500) } : {}),
      },
      photoAssets,
      isActive: p.is_active === undefined ? true : p.is_active === true,
    } as MockupTemplate & { store_product_id?: string | null; store_variant_id?: string | null },
  };
}

export function templateToRow(value: MockupTemplate & { store_product_id?: string | null; store_variant_id?: string | null }) {
  return {
    template_key: value.key,
    name: value.name,
    name_ar: value.nameAr ?? null,
    category: value.category,
    description: value.description ?? null,
    dimensions_mm: value.dimensionsMm,
    views: value.views,
    colors: value.colors,
    sizes: value.sizes,
    body_svg: value.bodySvg,
    overlay_svg: value.overlaySvg ?? null,
    texture_patterns: value.texturePatterns ?? [],
    texture_id: value.textureId ?? null,
    provenance: value.provenance,
    photo_assets: value.photoAssets ?? [],
    store_product_id: value.store_product_id ?? null,
    store_variant_id: value.store_variant_id ?? null,
    is_active: value.isActive,
  };
}

export function rowToTemplate(row: Record<string, unknown>): MockupTemplate & { template_key: string } {
  return {
    key: String(row.template_key ?? ""),
    template_key: String(row.template_key ?? ""),
    name: String(row.name ?? ""),
    nameAr: String(row.name_ar ?? row.name ?? ""),
    category: String(row.category ?? "custom"),
    description: typeof row.description === "string" ? row.description : undefined,
    dimensionsMm: (row.dimensions_mm ?? {}) as MockupTemplate["dimensionsMm"],
    colors: (row.colors ?? []) as MockupColor[],
    sizes: (row.sizes ?? []) as MockupSize[],
    views: (row.views ?? []) as MockupView[],
    bodySvg: String(row.body_svg ?? ""),
    overlaySvg: typeof row.overlay_svg === "string" ? row.overlay_svg : undefined,
    texturePatterns: Array.isArray(row.texture_patterns) ? row.texture_patterns as string[] : [],
    textureId: typeof row.texture_id === "string" ? row.texture_id : undefined,
    provenance: (row.provenance ?? { source: "original-vector", author: "unknown", license: "unknown" }) as MockupTemplate["provenance"],
    photoAssets: Array.isArray(row.photo_assets) ? row.photo_assets as MockupTemplate["photoAssets"] : [],
    isActive: row.is_active === true,
  };
}
