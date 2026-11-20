/**
 * Shared, framework-free types for the Creator Design Studio.
 *
 * Everything in `lib/design-studio/*` except `server.ts` must stay pure
 * (no Next.js, no Supabase, no Node-only APIs) so the exact same code runs
 * in the browser editor for instant feedback and in the API routes as the
 * authoritative validation.
 */

/** Formats accepted by the studio upload pipeline (magic-byte sniffed, never client-declared). */
export type ArtworkFormat = "png" | "jpg" | "webp" | "svg";

/** Machine-readable validation failures — the client maps these to translated messages. */
export type ArtworkErrorCode =
  | "missing_file"
  | "too_large"
  | "svg_too_large"
  | "unsupported_type"
  | "invalid_file"
  | "too_small_dimensions"
  | "too_large_dimensions"
  | "not_svg";

/** Non-blocking advisories surfaced next to the artwork. */
export type ArtworkWarningCode = "low_source_resolution" | "mime_mismatch";

/**
 * Placement of one artwork inside the printable area.
 *
 * Coordinate model: inches, origin at the artboard center, +x right, +y down,
 * `rotation` in degrees clockwise (matches CSS `rotate()`), `cx/cy` locate the
 * CENTER of the artwork box. The box aspect normally equals the artwork aspect
 * (aspect lock); stretching only happens when the creator unlocks it.
 */
export type Transform = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
};

/** Printable surface in inches (Phase 5 replaces the default with per-template geometry). */
export type PrintableArea = {
  widthIn: number;
  heightIn: number;
};

/**
 * Phase 4 editing surface. The template registry (Phase 5) supplies real
 * product-specific areas; this is the honest default until then — the design
 * surface itself, never a claim about a product.
 */
export const DEFAULT_PRINTABLE_AREA: PrintableArea = { widthIn: 12, heightIn: 12 };

/** Axis-aligned bounding box of a (possibly rotated) transform, artboard-centered. */
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export type OverflowSides = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

export type OverflowReport = { overflows: boolean; sides: OverflowSides };

export type AlignDirection = "left" | "centerX" | "right" | "top" | "middleY" | "bottom";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Facts about the uploaded file used by the editor and the DPI warnings. */
export type ArtworkInfo = {
  format: ArtworkFormat;
  widthPx: number | null;
  heightPx: number | null;
  /** null for SVG — vectors are resolution independent, so no DPI claim is made. */
  dpi: number | null;
  colorMode: string | null;
  /** null for SVG — transparency requires rendering we do not perform. */
  hasTransparency: boolean | null;
};

/**
 * Persisted on `design_versions.editor_state` (jsonb).
 * `version` guards the shape: an unknown future version is rejected, never
 * half-understood.
 */
export type EditorState = {
  version: 1;
  transform: Transform;
  zoom: number;
  aspectLocked: boolean;
};

// ---------------------------------------------------------------------------
// Template registry (Phase 5) — purpose-built vector product mockups
// ----------------------------------------------------------------`

/** The eight shippable product types. Rendering authority lives in `templates/`. */
export const TEMPLATE_KEYS = [
  "tshirt",
  "hoodie",
  "sweatshirt",
  "mug",
  "phone_case",
  "tote_bag",
  "poster",
  "mouse_pad",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** A color variant. `shadeHex` is the darker tone used for seams/shadows. */
export type TemplateColor = {
  key: string;
  name: string;
  nameAr?: string;
  hex: string;
  shadeHex: string;
};

export type TemplateSize = {
  key: string;
  name: string;
  /** Short display label (e.g. "S", "11oz", "18×24 in"). */
  label: string;
};

/**
 * One renderable angle of a product. All geometry is in viewBox units;
 * `printArea` is where the artwork lands (see `mockup.ts` placement).
 * Mirrors `creator_product_templates.views` (`print_area` snake_case in SQL).
 */
export type TemplateView = {
  key: string;
  label: string;
  canvas: { w: number; h: number };
  printArea: { x: number; y: number; w: number; h: number };
};

/**
 * A product template: static geometry + code that emits the SVG body/overlay
 * layers. `body` renders BEFORE the artwork, `overlay` (camera module, pocket,
 * stitching…) AFTER it, so details that must sit on top of the print do.
 */
export type ProductTemplate = {
  key: TemplateKey;
  name: string;
  nameAr: string;
  /** Commerce category this template publishes into. */
  category: string;
  dimensionsMm: { w: number; h: number; depth?: number };
  views: TemplateView[];
  colors: TemplateColor[];
  sizes: TemplateSize[];
  body: (viewKey: string, color: TemplateColor) => string;
  overlay?: (viewKey: string, color: TemplateColor) => string;
};

/** One generated mockup as stored in `creator_design_products.mockups`. */
export type MockupRecord = {
  view: string;
  color: string;
  path: string;
  width: number | null;
  height: number | null;
  config_hash: string;
  generated_at: string;
};

// ---------------------------------------------------------------------------
// Phase 6 — per-product configuration
// ---------------------------------------------------------------------------

/**
 * Per-product placement override for ONE view of one design×product row.
 * Stored in `creator_design_products.view_states` as `{[viewKey]: ViewState}`.
 *
 * The EFFECTIVE placement rendered into that product's mockups is the design's
 * transform adjusted by this state (see `applyViewState`):
 *   cx' = cx + x,  cy' = cy + y,
 *   width' = width × scale,  height' = height × scale,
 *   rotation' = rotation + state.rotation.
 * An absent view key means "inherit the design placement exactly" — one design,
 * many products, independent per-product tweaks without touching the artwork.
 */
export type ViewState = {
  /** Inches added to the design's `cx`. */
  x: number;
  /** Inches added to the design's `cy`. */
  y: number;
  /** Multiplier on width/height (1 = same size as the design). */
  scale: number;
  /** Degrees added to the design's rotation. */
  rotation: number;
  /** UI preference for this product: keep the artwork aspect while adjusting. */
  lockAspect: boolean;
};

/** `view_states` column shape: view key → ViewState (DDL CHECK: jsonb object). */
export type ViewStateMap = Record<string, ViewState>;

/** Selection arrays are bounded by the DDL `cardinality … between 0 and 64`. */
export const PRODUCT_SELECTION_MAX = 64;

/** Upload / dimension limits shared by client pre-check and server authority. */
export const ARTWORK_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  svgMaxBytes: 2 * 1024 * 1024,
  minDimensionPx: 200,
  maxDimensionPx: 10000,
  /** Raster art below this on its longest side gets an upload warning. */
  lowResolutionPx: 1000,
  maxTitleLength: 80,
  maxDescriptionLength: 2000,
} as const;

/** Effective print resolution below this many DPI triggers the editor warning. */
export const PRINT_DPI_MIN = 150;

/** Smallest artwork box edge (inches) — below this editing becomes impossible. */
export const MIN_ARTWORK_IN = 0.2;

/** Largest artwork box edge as a multiple of the larger printable-area edge. */
export const SIZE_MAX_FACTOR = 2;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
