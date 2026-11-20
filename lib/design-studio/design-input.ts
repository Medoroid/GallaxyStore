/**
 * Pure input validation for design mutations — shared by the API routes and
 * unit tests. The allow-list is the security boundary: creators can never
 * submit status, approval, ownership or slug fields (self-approval is
 * structurally impossible; those columns are only ever written by admin RPCs).
 */

import { ARTWORK_LIMITS, type EditorState } from "./types";
import { normalizeEditorState } from "./editor-state";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DESIGN_PATCH_FIELDS = ["title", "description", "category_id", "editor_state"] as const;

export type DesignPatchValue = {
  title?: string;
  description?: string | null;
  category_id?: string | null;
  editor_state?: EditorState;
};

export type DesignPatchCode =
  | "not_an_object"
  | "empty_patch"
  | "field_not_allowed"
  | "invalid_title"
  | "invalid_description"
  | "invalid_category"
  | "invalid_editor_state";

export type DesignPatchResult =
  | { ok: false; code: DesignPatchCode; field?: string }
  | { ok: true; value: DesignPatchValue };

const ALLOWED = new Set<string>(DESIGN_PATCH_FIELDS);

export function validateDesignPatch(input: unknown): DesignPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "not_an_object" };
  }
  const body = input as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { ok: false, code: "empty_patch" };
  }

  for (const key of keys) {
    if (!ALLOWED.has(key)) {
      // status / is_public / reviewed_* / slug / owner_id all land here.
      return { ok: false, code: "field_not_allowed", field: key };
    }
  }

  const value: DesignPatchValue = {};

  if (keys.includes("title")) {
    const raw = body.title;
    if (typeof raw !== "string") return { ok: false, code: "invalid_title", field: "title" };
    const title = raw.trim();
    if (title.length < 1 || title.length > ARTWORK_LIMITS.maxTitleLength) {
      return { ok: false, code: "invalid_title", field: "title" };
    }
    value.title = title;
  }

  if (keys.includes("description")) {
    const raw = body.description;
    if (raw !== null && typeof raw !== "string") {
      return { ok: false, code: "invalid_description", field: "description" };
    }
    if (typeof raw === "string" && raw.length > ARTWORK_LIMITS.maxDescriptionLength) {
      return { ok: false, code: "invalid_description", field: "description" };
    }
    value.description = raw === null ? null : (raw as string);
  }

  if (keys.includes("category_id")) {
    const raw = body.category_id;
    if (raw !== null && (typeof raw !== "string" || !UUID_RE.test(raw))) {
      return { ok: false, code: "invalid_category", field: "category_id" };
    }
    value.category_id = raw as string | null;
  }

  if (keys.includes("editor_state")) {
    const normalized = normalizeEditorState(body.editor_state);
    if (!normalized) {
      return { ok: false, code: "invalid_editor_state", field: "editor_state" };
    }
    value.editor_state = normalized;
  }

  return { ok: true, value };
}

/**
 * Design titles: an explicit title wins when it is usable; otherwise the file
 * name (without extension, cleaned) becomes the title, with a neutral final
 * fallback so a hostile/empty name can never produce an empty NOT NULL column.
 */
export function resolveDesignTitle(rawTitle: unknown, filename: unknown): string {
  if (typeof rawTitle === "string") {
    const trimmed = rawTitle.trim();
    if (trimmed.length >= 1 && trimmed.length <= ARTWORK_LIMITS.maxTitleLength) {
      return trimmed;
    }
    if (trimmed.length > ARTWORK_LIMITS.maxTitleLength) {
      return trimmed.slice(0, ARTWORK_LIMITS.maxTitleLength);
    }
  }
  if (typeof filename === "string" && filename.trim()) {
    const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const cleaned = base.replace(/\s+/g, " ").slice(0, ARTWORK_LIMITS.maxTitleLength).trim();
    if (cleaned.length >= 1) return cleaned;
  }
  return "Untitled design";
}
