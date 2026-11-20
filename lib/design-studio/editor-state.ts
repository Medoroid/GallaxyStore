/**
 * `design_versions.editor_state` handling — the persisted shape of the editor.
 *
 * `normalizeEditorState` is the server's authority for PATCH payloads: it
 * accepts only a known version, finite numbers and legal ranges, strips every
 * unknown key, and returns `null` (→ 400) instead of ever storing garbage.
 */

import {
  DEFAULT_PRINTABLE_AREA,
  type EditorState,
  type PrintableArea,
} from "./types";
import {
  clampTransform,
  clampZoom,
  fitIntoBox,
  fitTransform,
  normalizeRotation,
} from "./placement";

/** Serialized editor_state larger than this is rejected outright. */
export const EDITOR_STATE_MAX_CHARS = 16 * 1024;

export function createInitialEditorState(
  area: PrintableArea = DEFAULT_PRINTABLE_AREA,
  ratio = 1
): EditorState {
  return {
    version: 1,
    transform: fitTransform(area, ratio),
    zoom: 1,
    aspectLocked: true,
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate + repair a client-supplied editor state.
 * Returns null when the payload is structurally unusable (wrong version,
 * missing/invalid transform, non-positive size).
 */
export function normalizeEditorState(
  input: unknown,
  area: PrintableArea = DEFAULT_PRINTABLE_AREA
): EditorState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const outer = input as Record<string, unknown>;
  if (outer.version !== 1) return null; // unknown/future shape — never half-understood

  const raw = outer.transform;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  if (!finite(t.cx) || !finite(t.cy) || !finite(t.width) || !finite(t.height) || !finite(t.rotation)) {
    return null;
  }
  if (t.width <= 0 || t.height <= 0) return null;

  const zoom = finite(outer.zoom) ? clampZoom(outer.zoom) : 1;

  const clamped = clampTransform(
    {
      cx: t.cx,
      cy: t.cy,
      width: t.width,
      height: t.height,
      rotation: normalizeRotation(t.rotation),
    },
    area
  );

  return {
    version: 1,
    transform: clamped,
    zoom,
    aspectLocked: outer.aspectLocked !== false,
  };
}

/** Serialized size guard (cheap defense against absurd payloads). */
export function editorStateTooLarge(state: string): boolean {
  return state.length > EDITOR_STATE_MAX_CHARS;
}

/**
 * Carry the previous placement over to a replacement artwork: the print
 * footprint (box + center + rotation) is kept, and the new artwork is
 * inscribed into the previous box so a different aspect ratio can never
 * distort. Zoom and the aspect-lock choice persist as the creator left them.
 *
 * `ratio` null = artwork with unknown aspect (SVG without dims) → box kept.
 */
export function editorStateForReplacement(
  previous: unknown,
  ratio: number | null,
  area: PrintableArea = DEFAULT_PRINTABLE_AREA
): EditorState {
  const base = normalizeEditorState(previous, area) ?? createInitialEditorState(area, ratio ?? 1);
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return base;
  }
  const box = fitIntoBox(
    { width: base.transform.width, height: base.transform.height },
    ratio
  );
  return {
    ...base,
    transform: { ...base.transform, ...box },
  };
}
