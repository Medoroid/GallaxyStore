/**
 * Placement math for the artwork editor — pure functions over inches-based,
 * artboard-centered coordinates (see `types.ts` for the coordinate model).
 *
 * Everything the editor does — moving, resizing (with rotation), rotating,
 * aligning, fitting, boundary/DPI warnings, clamping — flows through these
 * functions so the same rules are unit-testable without a browser and shared
 * between pointer interactions and the numeric controls.
 */

import {
  MAX_ZOOM,
  MIN_ARTWORK_IN,
  MIN_ZOOM,
  PRINT_DPI_MIN,
  SIZE_MAX_FACTOR,
  type AlignDirection,
  type BBox,
  type OverflowReport,
  type PrintableArea,
  type ResizeHandle,
  type Transform,
  type ViewState,
} from "./types";

/** Fraction of the printable area the fitted artwork occupies (rest is margin). */
export const FIT_FILL_RATIO = 0.92;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** → [0, 360) */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Rotation values the editor snaps to while Shift is held. */
export function snapRotation(deg: number, step = 15): number {
  return normalizeRotation(Math.round(deg / step) * step);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

/** Width / height of the artwork pixels (or viewBox), guarding SVG without dims. */
export function artworkRatio(
  widthPx: number | null | undefined,
  heightPx: number | null | undefined,
  fallback = 1
): number {
  if (
    typeof widthPx === "number" &&
    typeof heightPx === "number" &&
    Number.isFinite(widthPx) &&
    Number.isFinite(heightPx) &&
    widthPx > 0 &&
    heightPx > 0
  ) {
    return widthPx / heightPx;
  }
  return fallback > 0 ? fallback : 1;
}

/** Largest rect of `ratio` that fits into `area` (× fill), centered. */
export function fitTransform(area: PrintableArea, ratio: number): Transform {
  const safeRatio = artworkRatio(null, null, ratio);
  const maxW = area.widthIn * FIT_FILL_RATIO;
  const maxH = area.heightIn * FIT_FILL_RATIO;
  let width: number;
  let height: number;
  if (safeRatio >= maxW / maxH) {
    width = maxW;
    height = width / safeRatio;
  } else {
    height = maxH;
    width = height * safeRatio;
  }
  return { cx: 0, cy: 0, width, height, rotation: 0 };
}

/** Largest rect of `ratio` inscribed in `box` — used when artwork is replaced
 * so the previous print footprint keeps its center and size intent. */
export function fitIntoBox(
  box: { width: number; height: number },
  ratio: number
): { width: number; height: number } {
  const safeRatio = artworkRatio(null, null, ratio);
  const boxRatio = artworkRatio(box.width, box.height, 1);
  if (safeRatio >= boxRatio) {
    const width = box.width;
    return { width, height: width / safeRatio };
  }
  const height = box.height;
  return { width: height * safeRatio, height };
}

function rotatePoint(
  x: number,
  y: number,
  rotationDeg: number
): { x: number; y: number } {
  const rad = toRadians(rotationDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function moveBy(t: Transform, dx: number, dy: number): Transform {
  return { ...t, cx: t.cx + dx, cy: t.cy + dy };
}

export function rotateBy(t: Transform, deltaDeg: number): Transform {
  return { ...t, rotation: normalizeRotation(t.rotation + deltaDeg) };
}

/**
 * Phase 6 — combine the design transform with a product's per-view state to
 * get the EFFECTIVE placement for that product (what the mockup generator
 * receives as `config.transform`). No/invalid state → the design placement
 * itself, so a product without overrides always mirrors the design.
 */
export function applyViewState(
  t: Transform,
  state: ViewState | null | undefined
): Transform {
  if (!state) return t;
  const { x, y, scale, rotation } = state;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale) ||
    !Number.isFinite(rotation) ||
    scale <= 0
  ) {
    return t;
  }
  return {
    cx: t.cx + x,
    cy: t.cy + y,
    width: t.width * scale,
    height: t.height * scale,
    rotation: t.rotation + rotation,
  };
}

export function bounds(t: Transform): BBox {
  const rad = toRadians(t.rotation);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfX = (t.width / 2) * cos + (t.height / 2) * sin;
  const halfY = (t.width / 2) * sin + (t.height / 2) * cos;
  return {
    minX: t.cx - halfX,
    minY: t.cy - halfY,
    maxX: t.cx + halfX,
    maxY: t.cy + halfY,
  };
}

/** Which sides of the printable area the artwork's bounding box crosses. */
export function detectOverflow(t: Transform, area: PrintableArea): OverflowReport {
  const box = bounds(t);
  const halfW = area.widthIn / 2;
  const halfH = area.heightIn / 2;
  const sides = {
    left: box.minX < -halfW,
    right: box.maxX > halfW,
    top: box.minY < -halfH,
    bottom: box.maxY > halfH,
  };
  return {
    overflows: sides.left || sides.right || sides.top || sides.bottom,
    sides,
  };
}

/** Effective print resolution of the artwork at its current print size.
 * SVG (null pixel dims) → null: vectors are resolution independent, so no
 * claim — warning or compliment — is made. */
export function effectiveDpi(
  t: Transform,
  art: { widthPx: number | null; heightPx: number | null }
): { dpi: number | null; low: boolean } {
  if (
    typeof art.widthPx !== "number" ||
    typeof art.heightPx !== "number" ||
    art.widthPx <= 0 ||
    art.heightPx <= 0 ||
    t.width <= 0 ||
    t.height <= 0
  ) {
    return { dpi: null, low: false };
  }
  const dpi = Math.round(Math.min(art.widthPx / t.width, art.heightPx / t.height));
  return { dpi, low: dpi < PRINT_DPI_MIN };
}

/** Edge-aligned placement inside the printable area (rotation-aware via bounds). */
export function alignTransform(t: Transform, area: PrintableArea, dir: AlignDirection): Transform {
  const box = bounds(t);
  const halfW = area.widthIn / 2;
  const halfH = area.heightIn / 2;
  let { cx, cy } = t;
  switch (dir) {
    case "left":
      cx += -halfW - box.minX;
      break;
    case "right":
      cx += halfW - box.maxX;
      break;
    case "centerX":
      cx = 0;
      break;
    case "top":
      cy += -halfH - box.minY;
      break;
    case "bottom":
      cy += halfH - box.maxY;
      break;
    case "middleY":
      cy = 0;
      break;
  }
  return { ...t, cx, cy };
}

export function sizeLimits(area: PrintableArea): { min: number; max: number } {
  return {
    min: MIN_ARTWORK_IN,
    max: Math.max(area.widthIn, area.heightIn) * SIZE_MAX_FACTOR,
  };
}

/** Clamp a (possibly aspect-locked) size into [min, max]. */
export function clampSize(
  width: number,
  height: number,
  area: PrintableArea,
  keepAspect = false
): { width: number; height: number } {
  const { min, max } = sizeLimits(area);
  if (!keepAspect) {
    return {
      width: Math.min(Math.max(width, min), max),
      height: Math.min(Math.max(height, min), max),
    };
  }
  const ratio = height / Math.max(width, 1e-9);
  let w = Math.min(Math.max(width, min), max);
  let h = w * ratio;
  if (h > max) {
    const scale = max / h;
    w *= scale;
    h *= scale;
  } else if (h < min) {
    const scale = min / h;
    w *= scale;
    h *= scale;
  }
  return { width: w, height: h };
}

/** Clamp a transform's size into legal bounds; position/rotation untouched. */
export function clampTransform(t: Transform, area: PrintableArea): Transform {
  const { width, height } = clampSize(t.width, t.height, area, false);
  return { ...t, width, height };
}

const HANDLE_SIGNS: Record<ResizeHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export type ResizeOptions = {
  aspectLocked: boolean;
  area: PrintableArea;
};

/**
 * Resize from a handle while pinning the OPPOSITE anchor — including under
 * rotation (the pointer is projected into the artwork's local frame).
 *
 * With the aspect locked, a corner drag scales proportionally along the
 * dominant axis and edge drags derive the other dimension; the aspect is
 * always preserved exactly.
 */
export function resizeFromHandle(
  t: Transform,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
  opts: ResizeOptions
): Transform {
  const sign = HANDLE_SIGNS[handle];
  const { min, max } = sizeLimits(opts.area);
  const w0 = Math.max(t.width, 1e-9);
  const h0 = Math.max(t.height, 1e-9);

  // Anchor = opposite side of the handle, fixed in artboard coordinates.
  const anchorLocal = { x: (-sign.x * w0) / 2, y: (-sign.y * h0) / 2 };
  const anchorAbs = rotatePoint(anchorLocal.x, anchorLocal.y, t.rotation);
  anchorAbs.x += t.cx;
  anchorAbs.y += t.cy;

  // Project the pointer into the artwork's unrotated frame.
  const v = rotatePoint(pointer.x - anchorAbs.x, pointer.y - anchorAbs.y, -t.rotation);

  const changesWidth = sign.x !== 0;
  const changesHeight = sign.y !== 0;
  const rawW = changesWidth ? Math.abs(v.x) : w0;
  const rawH = changesHeight ? Math.abs(v.y) : h0;

  let width = rawW;
  let height = rawH;

  if (opts.aspectLocked) {
    const ratio = h0 / w0; // height per width
    if (changesWidth && changesHeight) {
      // Corner: follow the dominant axis of the drag, then bound-check the
      // proportional scale so both edges stay inside [min, max].
      const scale = Math.max(rawW / w0, rawH / h0);
      const maxScale = max / Math.max(w0, h0);
      const minScale = min / Math.min(w0, h0);
      const bounded = Math.min(Math.max(scale, minScale), maxScale);
      width = w0 * bounded;
      height = h0 * bounded;
    } else if (changesWidth) {
      width = Math.min(Math.max(rawW, min), max);
      height = width * ratio;
      if (height > max) {
        const s = max / height;
        width *= s;
        height *= s;
      } else if (height < min) {
        const s = min / height;
        width *= s;
        height *= s;
      }
    } else {
      height = Math.min(Math.max(rawH, min), max);
      width = height / ratio;
      if (width > max) {
        const s = max / width;
        width *= s;
        height *= s;
      } else if (width < min) {
        const s = min / width;
        width *= s;
        height *= s;
      }
    }
  } else {
    width = changesWidth ? Math.min(Math.max(rawW, min), max) : w0;
    height = changesHeight ? Math.min(Math.max(rawH, min), max) : h0;
  }

  // Keep the anchor pinned: shift the center by how much the driven edges grew.
  const shiftLocal = {
    x: changesWidth ? (-sign.x * (w0 - width)) / 2 : 0,
    y: changesHeight ? (-sign.y * (h0 - height)) / 2 : 0,
  };
  const shift = rotatePoint(shiftLocal.x, shiftLocal.y, t.rotation);

  return {
    cx: t.cx + shift.x,
    cy: t.cy + shift.y,
    width,
    height,
    rotation: t.rotation,
  };
}

/** Center-point of a pointer position around `center` in degrees (clockwise, screen coords). */
export function angleAt(
  center: { x: number; y: number },
  pointer: { x: number; y: number }
): number {
  return toDegrees(Math.atan2(pointer.y - center.y, pointer.x - center.x));
}
