/**
 * Pure input validation for Phase 6 product configuration — shared by the
 * products API routes and unit tests.
 *
 * The allow-list is the security boundary: a creator can only ever submit
 * PRESENTATION data (view_states / selected_colors / selected_sizes) for a
 * design they own. Approval state (status, reviewed_*, submitted_at), the
 * commerce link (product_id), fulfillment (fulfillment_mode, stock_buffer),
 * ownership (creator_profile_id, design_id, template_id) and the generated
 * `mockups` records themselves are structurally rejected — those columns are
 * only ever written by admin RPCs or the server-side mockup pipeline (which
 * recomputes every record it stores).
 *
 * Value validation runs against the TypeScript template registry — the
 * rendering authority — so a selection can never reference a color, size or
 * view the mockup engine cannot actually render.
 */

import {
  PRODUCT_SELECTION_MAX,
  type MockupRecord,
  type ProductTemplate,
  type ViewState,
  type ViewStateMap,
} from "./types";
import { getTemplate } from "./templates";

export const PRODUCT_CREATE_FIELDS = [
  "template_key",
  "selected_colors",
  "selected_sizes",
] as const;

export const PRODUCT_PATCH_FIELDS = [
  "view_states",
  "selected_colors",
  "selected_sizes",
] as const;

/** Bounds for one product's placement override (generous but finite). */
export const PRODUCT_INPUT_LIMITS = {
  /** Mirrors the DDL `cardinality … between 0 and 64`. */
  maxSelections: PRODUCT_SELECTION_MAX,
  /** `view_states` keys per row — templates ship ≤2 views; 16 is headroom. */
  maxViewStates: 16,
  /** |x| / |y| offset in inches. */
  maxOffsetIn: 50,
  minScale: 0.05,
  maxScale: 20,
  /** ±10 full turns — plenty for a product tweak, never unbounded. */
  maxRotationDeg: 3600,
} as const;

export type ProductCreateValue = {
  template_key: string;
  selected_colors: string[];
  selected_sizes: string[];
};

export type ProductPatchValue = {
  view_states?: ViewStateMap;
  selected_colors?: string[];
  selected_sizes?: string[];
};

export type ProductInputCode =
  | "not_an_object"
  | "empty_patch"
  | "field_not_allowed"
  | "invalid_template"
  | "invalid_colors"
  | "invalid_sizes"
  | "invalid_view_states";

export type ProductCreateResult =
  | { ok: false; code: ProductInputCode; field?: string }
  | { ok: true; value: ProductCreateValue };

export type ProductPatchResult =
  | { ok: false; code: ProductInputCode; field?: string }
  | { ok: true; value: ProductPatchValue };

/** The API shape of one `creator_design_products` row (normalized, camel-free). */
export type ProductRowView = {
  id: string;
  design_id: string;
  template_key: string;
  view_states: ViewStateMap;
  selected_colors: string[];
  selected_sizes: string[];
  mockups: MockupRecord[];
  /** `design_status` enum — reviewed by admin, never by the creator. */
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  product_id: string | null;
  /** POD boundary: never claims manufacturable until `configured`. */
  fulfillment_mode: string;
  stock_buffer: number;
  created_at: string;
  updated_at: string;
};

/**
 * Shared SELECT for both products routes (list + single row): all mutable /
 * readable columns plus the catalog embed needed to resolve `template_key`.
 */
export const PRODUCT_ROW_SELECT = `
  id, design_id, template_id, view_states, selected_colors, selected_sizes, mockups,
  status, rejection_reason, submitted_at, product_id, fulfillment_mode, stock_buffer,
  created_at, updated_at,
  creator_product_templates(id, template_key, name, name_ar, category, is_active)
`;

const CREATE_FIELDS = new Set<string>(PRODUCT_CREATE_FIELDS);
const PATCH_FIELDS = new Set<string>(PRODUCT_PATCH_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deduped string-array selection against a template's known keys.
 * Unknown keys are rejected (they would render nothing); duplicates are
 * normalized away (harmless, and the DDL only bounds cardinality).
 */
function validateSelection(
  raw: unknown,
  options: ReadonlyArray<{ key: string }>,
  field: "selected_colors" | "selected_sizes"
): { ok: true; value: string[] } | { ok: false; code: ProductInputCode; field: string } {
  const code = field === "selected_colors" ? "invalid_colors" : "invalid_sizes";
  if (!Array.isArray(raw)) return { ok: false, code, field };
  if (raw.length > PRODUCT_INPUT_LIMITS.maxSelections) {
    return { ok: false, code, field };
  }
  const known = new Set(options.map((option) => option.key));
  const seen = new Set<string>();
  const value: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !known.has(item)) {
      return { ok: false, code, field };
    }
    if (seen.has(item)) continue;
    seen.add(item);
    value.push(item);
  }
  return { ok: true, value };
}

function numericMember(
  raw: Record<string, unknown>,
  key: "x" | "y" | "scale" | "rotation",
  fallback: number,
  min: number,
  max: number
): number | null {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Strictly normalize one view-state object; anything off-shape → null. */
export function normalizeViewState(raw: unknown): ViewState | null {
  if (!isPlainObject(raw)) return null;
  const x = numericMember(raw, "x", 0, -PRODUCT_INPUT_LIMITS.maxOffsetIn, PRODUCT_INPUT_LIMITS.maxOffsetIn);
  const y = numericMember(raw, "y", 0, -PRODUCT_INPUT_LIMITS.maxOffsetIn, PRODUCT_INPUT_LIMITS.maxOffsetIn);
  const scale = numericMember(raw, "scale", 1, PRODUCT_INPUT_LIMITS.minScale, PRODUCT_INPUT_LIMITS.maxScale);
  const rotation = numericMember(raw, "rotation", 0, -PRODUCT_INPUT_LIMITS.maxRotationDeg, PRODUCT_INPUT_LIMITS.maxRotationDeg);
  if (x === null || y === null || scale === null || rotation === null) return null;

  const lockRaw = raw.lockAspect;
  if (lockRaw !== undefined && lockRaw !== null && typeof lockRaw !== "boolean") {
    return null;
  }
  return { x, y, scale, rotation, lockAspect: lockRaw === true };
}

/**
 * POST /api/designs/[id]/products — create one design×template row.
 * Fully template-dependent, fully pure: the registry lives in TypeScript, so
 * every rejection happens BEFORE any database read.
 */
export function validateProductCreate(
  input: unknown,
  resolvedTemplate?: ProductTemplate | null
): ProductCreateResult {
  if (!isPlainObject(input)) return { ok: false, code: "not_an_object" };

  for (const key of Object.keys(input)) {
    if (!CREATE_FIELDS.has(key)) {
      return { ok: false, code: "field_not_allowed", field: key };
    }
  }

  const templateKey = input.template_key;
  if (typeof templateKey !== "string") {
    return { ok: false, code: "invalid_template", field: "template_key" };
  }
  // DB-published geometry is passed in by the route; registry lookup remains
  // only as a compatibility default for direct/pure callers.
  const template = resolvedTemplate ?? getTemplate(templateKey);
  if (!template) {
    return { ok: false, code: "invalid_template", field: "template_key" };
  }

  const value: ProductCreateValue = {
    template_key: templateKey,
    selected_colors: [],
    selected_sizes: [],
  };

  if (Object.prototype.hasOwnProperty.call(input, "selected_colors")) {
    const result = validateSelection(input.selected_colors, template.colors, "selected_colors");
    if (!result.ok) return result;
    value.selected_colors = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(input, "selected_sizes")) {
    const result = validateSelection(input.selected_sizes, template.sizes, "selected_sizes");
    if (!result.ok) return result;
    value.selected_sizes = result.value;
  }

  return { ok: true, value };
}

function validateViewStates(
  raw: unknown,
  template: ProductTemplate
): { ok: true; value: ViewStateMap } | { ok: false; code: ProductInputCode; field: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, code: "invalid_view_states", field: "view_states" };
  }
  const viewKeys = new Set(template.views.map((view) => view.key));
  const entries = Object.entries(raw);
  if (entries.length > PRODUCT_INPUT_LIMITS.maxViewStates) {
    return { ok: false, code: "invalid_view_states", field: "view_states" };
  }

  const value: ViewStateMap = {};
  for (const [viewKey, state] of entries) {
    if (!viewKeys.has(viewKey)) {
      return { ok: false, code: "invalid_view_states", field: "view_states" };
    }
    if (state === null || state === undefined) continue; // null clears the override
    const normalized = normalizeViewState(state);
    if (!normalized) {
      return { ok: false, code: "invalid_view_states", field: "view_states" };
    }
    value[viewKey] = normalized;
  }
  return { ok: true, value };
}

/**
 * PATCH /api/designs/[id]/products/[rowId] — allow-list + value validation
 * against the row's template registry entry.
 */
export function validateProductPatch(
  input: unknown,
  template: ProductTemplate
): ProductPatchResult {
  if (!isPlainObject(input)) return { ok: false, code: "not_an_object" };
  const keys = Object.keys(input);
  if (keys.length === 0) return { ok: false, code: "empty_patch" };

  for (const key of keys) {
    if (!PATCH_FIELDS.has(key)) {
      // status / reviewed_* / product_id / fulfillment_mode / mockups / ids
      // all land here — structurally impossible to self-approve or to fake
      // a fulfillment state or a generated mockup.
      return { ok: false, code: "field_not_allowed", field: key };
    }
  }

  const value: ProductPatchValue = {};

  if (keys.includes("selected_colors")) {
    const result = validateSelection(input.selected_colors, template.colors, "selected_colors");
    if (!result.ok) return result;
    value.selected_colors = result.value;
  }
  if (keys.includes("selected_sizes")) {
    const result = validateSelection(input.selected_sizes, template.sizes, "selected_sizes");
    if (!result.ok) return result;
    value.selected_sizes = result.value;
  }
  if (keys.includes("view_states")) {
    const result = validateViewStates(input.view_states, template);
    if (!result.ok) return result;
    value.view_states = result.value;
  }

  return { ok: true, value };
}

/**
 * Normalize a raw `creator_design_products` row (PostgREST shape, with the
 * catalog embed) into the stable API response shape. Defensive on purpose:
 * malformed jsonb never reaches the UI as `undefined` — it degrades to the
 * column default instead of crashing a render.
 */
export function normalizeProductRow(raw: Record<string, unknown>): ProductRowView {
  const embed = isPlainObject(raw.creator_product_templates)
    ? raw.creator_product_templates
    : null;
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    design_id: typeof raw.design_id === "string" ? raw.design_id : "",
    template_key: typeof embed?.template_key === "string" ? embed.template_key : "",
    view_states: isPlainObject(raw.view_states) ? (raw.view_states as ViewStateMap) : {},
    selected_colors: strings(raw.selected_colors),
    selected_sizes: strings(raw.selected_sizes),
    mockups: Array.isArray(raw.mockups) ? (raw.mockups as MockupRecord[]) : [],
    status: typeof raw.status === "string" ? raw.status : "draft",
    rejection_reason:
      typeof raw.rejection_reason === "string" ? raw.rejection_reason : null,
    submitted_at: typeof raw.submitted_at === "string" ? raw.submitted_at : null,
    product_id: typeof raw.product_id === "string" ? raw.product_id : null,
    fulfillment_mode:
      typeof raw.fulfillment_mode === "string" ? raw.fulfillment_mode : "unconfigured",
    stock_buffer: typeof raw.stock_buffer === "number" ? raw.stock_buffer : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
  };
}
