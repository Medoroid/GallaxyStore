/**
 * Pure input validation for Phase 7 publishing — shared by the publish API
 * route and unit tests. Fully pure so every rejection happens BEFORE any
 * database read (same boundary as product-input.ts).
 *
 * The allow-list is the security boundary: a creator submits only PRESENTATION
 * data for a design they own. Approval state (status, reviewed_*, submitted_at,
 * published_at), ownership (owner_id, creator_profile_id, design_id), the
 * commerce link (product_id), fulfillment and every admin-managed column are
 * structurally rejected — `target` decides the allow-list, and status/visibility
 * on a PRODUCT payload is always `field_not_allowed` (a store product can only
 * ever be created as a hidden draft; the admin approval RPC is the sole thing
 * that can flip it public).
 */

import { UUID_RE } from "./design-input";

export const PUBLISH_PRODUCT_FIELDS = [
  "design_product_id",
  "name",
  "base_price",
  "compare_at_price",
  "description",
  "short_description",
  "category_id",
] as const;

export const PUBLISH_GALLERY_FIELDS = [
  "title",
  "description",
  "tags",
  "visibility",
  "preview_path",
] as const;

/** Bounds that mirror the DDL checks / house conventions. */
export const PUBLISH_INPUT_LIMITS = {
  name: 200,
  description: 5000,
  shortDescription: 1000,
  galleryTitleMin: 2,
  galleryTitleMax: 120,
  galleryDescription: 2000,
  maxTags: 30,
  maxTagLength: 40,
  maxPrice: 99999999,
  maxPreviewPath: 500,
} as const;

export type PublishTarget = "product" | "gallery";

export type PublishProductValue = {
  target: "product";
  designProductId: string;
  /** null → the route falls back to the design's title. */
  name: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  description: string | null;
  shortDescription: string | null;
  categoryId: string | null;
};

export type PublishGalleryValue = {
  target: "gallery";
  /** null → the route falls back to the design's title. */
  title: string | null;
  description: string | null;
  tags: string[];
  visibility: "public" | "unlisted";
  /** null → the route derives a cover from the row's generated mockups. */
  previewPath: string | null;
};

export type PublishInputValue = PublishProductValue | PublishGalleryValue;

export type PublishInputCode =
  | "not_an_object"
  | "invalid_target"
  | "field_not_allowed"
  | "invalid_product_id"
  | "invalid_name"
  | "invalid_price"
  | "invalid_description"
  | "invalid_category"
  | "invalid_title"
  | "invalid_tags"
  | "invalid_visibility"
  | "invalid_preview_path";

export type PublishInputResult =
  | { ok: false; code: PublishInputCode; field?: string }
  | { ok: true; value: PublishInputValue };

const PRODUCT_FIELDS = new Set<string>(PUBLISH_PRODUCT_FIELDS);
const GALLERY_FIELDS = new Set<string>(PUBLISH_GALLERY_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Optional nullable string: `null`/absent → null, otherwise trimmed text. */
function optionalText(
  raw: unknown,
  maxLength: number,
  field: string,
  code: PublishInputCode
): { ok: true; value: string | null } | { ok: false; code: PublishInputCode; field: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, code, field };
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.length > maxLength) return { ok: false, code, field };
  return { ok: true, value };
}

/** Price: number or numeric string within [0, 99999999]. */
function price(
  raw: unknown,
  field: string
): { ok: true; value: number | null } | { ok: false; code: PublishInputCode; field: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(num) || num < 0 || num > PUBLISH_INPUT_LIMITS.maxPrice) {
    return { ok: false, code: "invalid_price", field };
  }
  return { ok: true, value: num };
}

function uuidOrNull(
  raw: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; code: PublishInputCode; field: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    return { ok: false, code: "invalid_category", field };
  }
  return { ok: true, value: raw.toLowerCase() };
}

/**
 * POST /api/designs/[id]/publish — validate the request body for ONE target.
 * `designId` anchors gallery `preview_path` to this design's mockup namespace
 * so a creator can never point a cover at another design's files.
 */
export function validatePublishInput(input: unknown, opts: { designId: string }): PublishInputResult {
  if (!isPlainObject(input)) return { ok: false, code: "not_an_object" };

  const target = input.target;
  if (target !== "product" && target !== "gallery") {
    return { ok: false, code: "invalid_target", field: "target" };
  }

  const allowed = target === "product" ? PRODUCT_FIELDS : GALLERY_FIELDS;
  for (const key of Object.keys(input)) {
    if (key !== "target" && !allowed.has(key)) {
      return { ok: false, code: "field_not_allowed", field: key };
    }
  }

  if (target === "product") {
    const designProductId = input.design_product_id;
    if (typeof designProductId !== "string" || !UUID_RE.test(designProductId)) {
      return { ok: false, code: "invalid_product_id", field: "design_product_id" };
    }

    const name = optionalText(input.name, PUBLISH_INPUT_LIMITS.name, "name", "invalid_name");
    if (!name.ok) return name;

    const basePrice = price(input.base_price, "base_price");
    if (!basePrice.ok) return basePrice;
    if (basePrice.value === null) {
      return { ok: false, code: "invalid_price", field: "base_price" };
    }

    const compareAt = price(input.compare_at_price, "compare_at_price");
    if (!compareAt.ok) return compareAt;

    const description = optionalText(
      input.description,
      PUBLISH_INPUT_LIMITS.description,
      "description",
      "invalid_description"
    );
    if (!description.ok) return description;

    const shortDescription = optionalText(
      input.short_description,
      PUBLISH_INPUT_LIMITS.shortDescription,
      "short_description",
      "invalid_description"
    );
    if (!shortDescription.ok) return shortDescription;

    const categoryId = uuidOrNull(input.category_id, "category_id");
    if (!categoryId.ok) return categoryId;

    const value: PublishProductValue = {
      target: "product",
      designProductId: designProductId.toLowerCase(),
      name: name.value,
      basePrice: basePrice.value,
      compareAtPrice: compareAt.value,
      description: description.value,
      shortDescription: shortDescription.value,
      categoryId: categoryId.value,
    };
    return { ok: true, value };
  }

  // --- gallery ---
  const title = optionalText(input.title, PUBLISH_INPUT_LIMITS.galleryTitleMax, "title", "invalid_title");
  if (!title.ok) return title;
  if (title.value !== null && title.value.length < PUBLISH_INPUT_LIMITS.galleryTitleMin) {
    return { ok: false, code: "invalid_title", field: "title" };
  }

  const description = optionalText(
    input.description,
    PUBLISH_INPUT_LIMITS.galleryDescription,
    "description",
    "invalid_description"
  );
  if (!description.ok) return description;

  const tags: string[] = [];
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      return { ok: false, code: "invalid_tags", field: "tags" };
    }
    if (input.tags.length > PUBLISH_INPUT_LIMITS.maxTags) {
      return { ok: false, code: "invalid_tags", field: "tags" };
    }
    const seen = new Set<string>();
    for (const item of input.tags) {
      if (typeof item !== "string") {
        return { ok: false, code: "invalid_tags", field: "tags" };
      }
      const tag = item.trim();
      if (!tag) continue;
      if (tag.length > PUBLISH_INPUT_LIMITS.maxTagLength) {
        return { ok: false, code: "invalid_tags", field: "tags" };
      }
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
    if (tags.length > PUBLISH_INPUT_LIMITS.maxTags) {
      return { ok: false, code: "invalid_tags", field: "tags" };
    }
  }

  let visibility: "public" | "unlisted" = "public";
  if (input.visibility !== undefined && input.visibility !== null) {
    if (input.visibility !== "public" && input.visibility !== "unlisted") {
      return { ok: false, code: "invalid_visibility", field: "visibility" };
    }
    visibility = input.visibility;
  }

  const previewPath = optionalText(
    input.preview_path,
    PUBLISH_INPUT_LIMITS.maxPreviewPath,
    "preview_path",
    "invalid_preview_path"
  );
  if (!previewPath.ok) return previewPath;
  if (previewPath.value !== null && !previewPath.value.startsWith(`mockups/${opts.designId}/`)) {
    return { ok: false, code: "invalid_preview_path", field: "preview_path" };
  }

  const value: PublishGalleryValue = {
    target: "gallery",
    title: title.value,
    description: description.value,
    tags,
    visibility,
    previewPath: previewPath.value,
  };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Gallery row normalization — the API shape of one `creator_gallery_items`
// row (status fields included; the CLIENT can never write them, but it does
// read them for idempotent responses).
// ---------------------------------------------------------------------------

export const GALLERY_ROW_SELECT = `
  id, design_id, owner_id, creator_profile_id, title, description, preview_path,
  tags, visibility, status, rejection_reason, reviewed_by, reviewed_at,
  submitted_at, published_at, product_id, created_at, updated_at
`;

export type GalleryRowView = {
  id: string;
  design_id: string;
  title: string;
  description: string | null;
  preview_path: string | null;
  tags: string[];
  visibility: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  published_at: string | null;
  product_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeGalleryRow(raw: Record<string, unknown>): GalleryRowView {
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  return {
    id: String(raw.id ?? ""),
    design_id: String(raw.design_id ?? ""),
    title: String(raw.title ?? ""),
    description: typeof raw.description === "string" ? raw.description : null,
    preview_path: typeof raw.preview_path === "string" ? raw.preview_path : null,
    tags,
    visibility: String(raw.visibility ?? "public"),
    status: String(raw.status ?? "draft"),
    rejection_reason: typeof raw.rejection_reason === "string" ? raw.rejection_reason : null,
    submitted_at: typeof raw.submitted_at === "string" ? raw.submitted_at : null,
    published_at: typeof raw.published_at === "string" ? raw.published_at : null,
    product_id: typeof raw.product_id === "string" ? raw.product_id : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}
