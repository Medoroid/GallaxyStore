/**
 * Mockup Library v2 — data-only template schema.
 *
 * The entire template is JSON-serialisable so an administrator can edit it in
 * the database (see the `mockup_templates` migration) without touching code.
 * SVG bodies use {{token}} placeholders resolved per colour variant; no code
 * strings are ever evaluated. All assets are ORIGINAL vectors authored for
 * this project (see docs/MOCKUP-ASSET-LICENSES.md) — no third-party files.
 */

export type MockupColor = {
  key: string;
  name: string;
  nameAr?: string;
  hex: string;
  shadeHex: string;
  highlightHex?: string;
};

export type MockupSize = { key: string; name: string; label: string };

export type MockupView = {
  key: string;
  label: string;
  labelAr?: string;
  canvas: { w: number; h: number };
  /** Where artwork lands, in viewBox units. Placement math uses this. */
  printArea: { x: number; y: number; w: number; h: number };
  /** SVG path (viewBox units) used as clipPath — the printable-area mask. */
  maskPath: string;
  /**
   * Optional SVG transform applied OUTSIDE the placement group to fake surface
   * curvature/perspective (mugs, tote gussets, posters in perspective).
   * Only `matrix(...)`, `skewX(...)`, `skewY(...)`, `scale(...)`, `rotate(...)`
   * are accepted by compose.ts (strict allow-list — no script URLs).
   */
  perspective?: string;
  shadowSvg?: string;
  highlightSvg?: string;
};

export type MockupAssetProvenance = {
  source: "original-vector";
  author: string;
  license: string;
  url?: string;
};

export type MockupTemplate = {
  key: string;
  name: string;
  nameAr: string;
  category: string;
  description?: string;
  dimensionsMm: { w: number; h: number; depth?: number };
  colors: MockupColor[];
  sizes: MockupSize[];
  views: MockupView[];
  /** Base product silhouette/fabric — rendered BEFORE the artwork. */
  bodySvg: string;
  /** Per-view body variants (front/back necklines etc.); falls back to bodySvg. */
  bodyByView?: Record<string, string>;
  /** Details that must cover the print (pocket, camera bump, stitching). */
  overlaySvg?: string;
  /** Pattern id declared in texturePatterns, drawn over the body under print. */
  textureId?: string;
  texturePatterns?: string[];
  provenance: MockupAssetProvenance;
  /** Admin-managed photorealistic layers (stored as JSONB on the template row). */
  photoAssets?: Array<{
    colorKey: string;
    viewKey: string;
    src: string;
    width: number;
    height: number;
    printArea: { x: number; y: number; w: number; h: number };
    blend: "multiply" | "normal" | "screen";
    opacity: number;
    texture: "fabric" | "paper" | "ceramic" | null;
    author: string;
    sourcePage: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  }>;
  /** Admin can disable a template without deleting customer references. */
  isActive: boolean;
};

/** A real, locally stored product photograph used as the mockup base layer. */
export type PhotoComposeInput = {
  /** base64 data URL of the local photograph (loaded by the caller). */
  href: string;
  canvas: { w: number; h: number };
  /** Printable area in viewBox units, measured from the photograph. */
  printArea: { x: number; y: number; w: number; h: number };
  maskPath: string;
  blend: "multiply" | "normal" | "screen";
  opacity: number;
  texture: "fabric" | "paper" | "ceramic" | null;
};

export type ComposeMockupInput = {
  template: MockupTemplate;
  viewKey: string;
  colorKey: string;
  /** When present, a photorealistic base replaces the vector body entirely. */
  photo?: PhotoComposeInput;
  /** base64 data URL of the artwork, or null for a blank product. */
  artworkHref?: string | null;
  /** Placement in inches, artboard-centred (the editor's Transform). */
  transform: { cx: number; cy: number; width: number; height: number; rotation: number };
  printableArea?: { widthIn: number; heightIn: number };
  /** Admin overrides from the template row (e.g. widened print area). */
  printAreaOverride?: { x: number; y: number; w: number; h: number };
  maskOverride?: string;
};
