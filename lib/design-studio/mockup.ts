/**
 * Mockup placement engine + SVG compositor (pure — browser and tests).
 *
 * Renders the D6/D7 pipeline: template body → artwork → overlay, all inside
 * the template's viewBox. Placement is a uniform fit-inside map from the
 * design's printable area (inches, artboard-centered) into the view's print
 * area (viewBox units): the design area inscribes the largest box that fits
 * the print rectangle and is centered on it, so artwork position/rotation/
 * scale carry over proportionally and nothing is ever stretched.
 *
 * The produced `<svg>` string is consumed by the client (encoded as a data
 * URL → `<img>` → canvas → PNG → POST /api/designs/[id]/mockups). No DOM,
 * no canvas here: this module only composes markup.
 */

import {
  DEFAULT_PRINTABLE_AREA,
  type PrintableArea,
  type ProductTemplate,
  type TemplateView,
  type Transform,
} from "./types";
import { MOCKUP_BACKDROP, getColor, getTemplate, getView } from "./templates";

/** Only these hrefs may enter an `<image>` — blocks markup injection. */
const SAFE_IMAGE_HREF =
  /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i;

export type MockupPlacement = {
  /** Center x in viewBox units. */
  x: number;
  /** Center y in viewBox units. */
  y: number;
  width: number;
  height: number;
  /** Degrees, passed through unchanged. */
  rotation: number;
};

/**
 * Map a design-area transform onto a template view's print area.
 *
 * fit-inside: scale = min(print.w / area.w, print.h / area.h), then the
 * design-area center is placed at the print-area center. Returns null when
 * the view or any number is unusable (never throws — callers surface 400s).
 */
export function computeMockupPlacement(input: {
  view: TemplateView;
  transform: Transform;
  designArea?: PrintableArea;
}): MockupPlacement | null {
  const { view, transform } = input;
  const area = input.designArea ?? DEFAULT_PRINTABLE_AREA;

  const numbers = [
    view.printArea.x,
    view.printArea.y,
    view.printArea.w,
    view.printArea.h,
    area.widthIn,
    area.heightIn,
    transform.cx,
    transform.cy,
    transform.width,
    transform.height,
    transform.rotation,
  ];
  if (!numbers.every((value) => Number.isFinite(value))) return null;
  if (view.printArea.w <= 0 || view.printArea.h <= 0) return null;
  if (area.widthIn <= 0 || area.heightIn <= 0) return null;
  if (transform.width <= 0 || transform.height <= 0) return null;

  const scale = Math.min(
    view.printArea.w / area.widthIn,
    view.printArea.h / area.heightIn
  );

  return {
    x: view.printArea.x + view.printArea.w / 2 + transform.cx * scale,
    y: view.printArea.y + view.printArea.h / 2 + transform.cy * scale,
    width: transform.width * scale,
    height: transform.height * scale,
    rotation: transform.rotation,
  };
}

/** Escape a value for an XML double-quoted attribute. */
function attr(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns the href only when it is a well-formed base64 data image URL. */
export function safeImageHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  return SAFE_IMAGE_HREF.test(trimmed) ? trimmed : null;
}

export type BuildMockupSvgInput = {
  template: ProductTemplate;
  viewKey: string;
  colorKey: string;
  /** base64 data URL of the artwork PNG (null renders the blank product). */
  artworkHref?: string | null;
  transform: Transform;
  designArea?: PrintableArea;
};

/**
 * Compose the full `<svg>` for one mockup frame:
 * backdrop → body layers → artwork image → overlay layers.
 *
 * Returns null when the view/color is unknown or placement can't be computed
 * (callers translate that into an honest error, never a blank "success").
 */
export function buildMockupSvg(input: BuildMockupSvgInput): string | null {
  const view = getView(input.template, input.viewKey);
  const color = getColor(input.template, input.colorKey);
  if (!view || !color) return null;

  const placement = computeMockupPlacement({
    view,
    transform: input.transform,
    designArea: input.designArea,
  });
  if (!placement) return null;

  const href = safeImageHref(input.artworkHref);

  const body = input.template.body(view.key, color);
  const overlay = input.template.overlay?.(view.key, color) ?? "";

  const artwork = href
    ? `<g transform="translate(${placement.x} ${placement.y}) rotate(${placement.rotation})">` +
      `<image href="${attr(href)}" x="${-placement.width / 2}" y="${-placement.height / 2}"` +
      ` width="${placement.width}" height="${placement.height}" preserveAspectRatio="none"/></g>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.canvas.w} ${view.canvas.h}"` +
    ` width="${view.canvas.w}" height="${view.canvas.h}">` +
    `<rect width="${view.canvas.w}" height="${view.canvas.h}" fill="${MOCKUP_BACKDROP}"/>` +
    body +
    artwork +
    overlay +
    `</svg>`
  );
}

/**
 * Deterministic object path inside the public `design-previews` bucket.
 * The hash is part of the name, so re-posting the identical config overwrites
 * in place (upsert) instead of piling up near-duplicates.
 */
export function mockupStoragePath(
  designId: string,
  templateKey: string,
  view: string,
  color: string,
  configHash: string
): string {
  return `mockups/${designId}/${templateKey}/${view}-${color}-${configHash}.png`;
}

/** Public URL for a stored mockup path (bucket is public-read by design). */
export function mockupPublicPath(path: string): string {
  return path;
}

/** Lookup helper shared by client + route: template by key or null. */
export { getTemplate };
