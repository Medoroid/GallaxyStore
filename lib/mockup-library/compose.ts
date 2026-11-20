/**
 * Layered SVG compositor for the Mockup Library.
 *
 * Pipeline (back → front):
 *   backdrop → ground shadow → product body → material texture →
 *   ARTWORK (clip-path = printable-area mask, optional perspective matrix) →
 *   highlight → detail overlay
 *
 * Nothing is rasterised here: the returned SVG string is the single source of
 * truth for client previews and stored PNG mockups. All inputs are escaped and
 * the artwork href is restricted to an inline base64 data URL.
 */

import { computeMockupPlacement, safeImageHref } from "@/lib/design-studio/mockup";
import { sanitizeSvgFragment } from "./sanitize";
import type { ComposeMockupInput, MockupColor, MockupView } from "./types";

const FABRIC_PATTERN =
  '<pattern id="photo-fabric" width="8" height="8" patternUnits="userSpaceOnUse">' +
  '<path d="M0 0H8M0 4H8" stroke="#ffffff" stroke-width="0.5" opacity="0.5"/>' +
  '<path d="M0 2H8M0 6H8" stroke="#000000" stroke-width="0.4" opacity="0.25"/></pattern>';
const PAPER_PATTERN =
  '<pattern id="photo-paper" width="12" height="12" patternUnits="userSpaceOnUse">' +
  '<circle cx="2" cy="3" r="0.6" fill="#6b5b4b" opacity="0.4"/>' +
  '<circle cx="9" cy="8" r="0.5" fill="#6b5b4b" opacity="0.3"/></pattern>';
const CERAMIC_PATTERN =
  '<pattern id="photo-ceramic" width="16" height="16" patternUnits="userSpaceOnUse">' +
  '<path d="M0 8 Q4 4 8 8 T16 8" fill="none" stroke="#ffffff" stroke-width="0.7" opacity="0.5"/></pattern>';
const PHOTO_PATTERNS: Record<string, string> = {
  fabric: FABRIC_PATTERN, paper: PAPER_PATTERN, ceramic: CERAMIC_PATTERN,
};

const SAFE_TRANSFORM = /^(matrix|skewX|skewY|scale|rotate)\([-0-9.,\s]+\)$/;

function attr(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Resolve colour tokens in admin-editable SVG fragments (no code evaluation). */
export function resolveColorTokens(svg: string, color: MockupColor): string {
  return String(svg ?? "")
    .replace(/\{\{hex\}\}/g, color.hex)
    .replace(/\{\{shade\}\}/g, color.shadeHex)
    .replace(/\{\{highlight\}\}/g, color.highlightHex ?? color.hex);
}

/** Stable, tiny id suffix so multiple mockups on one page never collide. */
function renderId(input: ComposeMockupInput): string {
  const raw = [
    input.template.key,
    input.viewKey,
    input.colorKey,
    input.transform.cx,
    input.transform.cy,
    input.transform.width,
    input.transform.height,
    input.transform.rotation,
  ].join("|");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export type ComposedMockup = {
  svg: string;
  /** Placement used, for the stored print-configuration snapshot. */
  placement: { x: number; y: number; width: number; height: number; rotation: number };
  templateKey: string;
  viewKey: string;
  colorKey: string;
};

/**
 * Photorealistic branch: a real product photograph is the base layer. The
 * artwork is clipped to the measured print area, blended with the surface,
 * and finished with a subtle material texture. No fake vector body is drawn —
 * the photo's own light, shadows, folds and perspective remain intact.
 */
function composePhotoMockup(input: ComposeMockupInput): ComposedMockup | null {
  const photo = input.photo;
  if (!photo) return null;

  const baseHref = safeImageHref(photo.href);
  if (!baseHref) return null;
  if (!["multiply", "normal", "screen"].includes(photo.blend)) return null;
  if (!photo.maskPath || !/^[\dMmLlHhVvCcSsQqTtAaZz.\-+,\s]+$/.test(photo.maskPath)) return null;

  const view: MockupView = {
    key: input.viewKey,
    label: "",
    canvas: photo.canvas,
    printArea: photo.printArea,
    maskPath: photo.maskPath,
  };
  const placement = computeMockupPlacement({
    view,
    transform: input.transform,
    designArea: input.printableArea,
  });
  if (!placement) return null;

  const uid = renderId(input);
  const artworkHref = safeImageHref(input.artworkHref);
  const artwork = artworkHref
    ? `<g clip-path="url(#photo-print-${uid})">` +
      `<g transform="translate(${placement.x} ${placement.y}) rotate(${placement.rotation})"` +
      ` style="mix-blend-mode:${photo.blend};opacity:${photo.opacity}">` +
      `<image href="${attr(artworkHref)}" x="${-placement.width / 2}" y="${-placement.height / 2}"` +
      ` width="${placement.width}" height="${placement.height}" preserveAspectRatio="xMidYMid meet"/>` +
      `</g></g>`
    : "";

  const rawPattern = photo.texture ? PHOTO_PATTERNS[photo.texture] : "";
  const pattern = rawPattern.replace(
    `id="photo-${photo.texture}"`,
    `id="photo-tex-${uid}"`
  );
  const texture = rawPattern
    ? `<g clip-path="url(#photo-print-${uid})" opacity="0.1" style="mix-blend-mode:multiply">` +
      `<rect width="${photo.canvas.w}" height="${photo.canvas.h}" fill="url(#photo-tex-${uid})"/></g>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${photo.canvas.w} ${photo.canvas.h}"` +
    ` width="${photo.canvas.w}" height="${photo.canvas.h}" role="img"` +
    ` aria-label="${attr(input.template.name)} ${attr(input.viewKey)} photo mockup">` +
    `<defs><clipPath id="photo-print-${uid}"><path d="${attr(photo.maskPath)}"/></clipPath>${pattern}</defs>` +
    `<image href="${attr(baseHref)}" x="0" y="0" width="${photo.canvas.w}" height="${photo.canvas.h}"` +
    ` preserveAspectRatio="none"/>` +
    artwork +
    texture +
    `</svg>`;

  return {
    svg,
    placement,
    templateKey: input.template.key,
    viewKey: input.viewKey,
    colorKey: input.colorKey,
  };
}

/**
 * Compose one mockup frame. Returns null when any required input is invalid —
 * callers must surface an honest error instead of an empty "success" image.
 */
export function composeMockup(input: ComposeMockupInput): ComposedMockup | null {
  // A real photograph always wins over the legacy vector renderer.
  if (input.photo) return composePhotoMockup(input);

  const view = input.template.views.find((v) => v.key === input.viewKey);
  const color = input.template.colors.find((c) => c.key === input.colorKey);
  if (!view || !color) return null;

  const printArea = input.printAreaOverride ?? view.printArea;
  const placement = computeMockupPlacement({
    view: { ...view, printArea },
    transform: input.transform,
    designArea: input.printableArea,
  });
  if (!placement) return null;

  const uid = renderId(input);
  const maskPath = input.maskOverride ?? view.maskPath;
  if (!maskPath || !/^[\dMmLlHhVvCcSsQqTtAaZz.\-+\s]+$/.test(maskPath)) return null;

  const perspective = view.perspective?.trim();
  if (perspective && !SAFE_TRANSFORM.test(perspective)) return null;

  const href = safeImageHref(input.artworkHref);
  const artwork = href
    ? `<g clip-path="url(#print-${uid})">` +
      (perspective ? `<g transform="${attr(perspective)}">` : "") +
      `<g transform="translate(${placement.x} ${placement.y}) rotate(${placement.rotation})">` +
      `<image href="${attr(href)}" x="${-placement.width / 2}" y="${-placement.height / 2}"` +
      ` width="${placement.width}" height="${placement.height}" preserveAspectRatio="xMidYMid meet"/>` +
      `</g>` +
      (perspective ? `</g>` : "") +
      `</g>`
    : "";

  const patterns = (input.template.texturePatterns ?? [])
    .map((pattern, index) => {
      const safe = sanitizeSvgFragment(pattern);
      return /^<pattern\b[\s\S]*<\/pattern>$/i.test(safe)
        ? safe.replace(/id="[^"]+"/, `id="tex-${uid}-${index}"`)
        : "";
    })
    .join("");
  const textureIndex = input.template.textureId
    ? (input.template.texturePatterns ?? []).findIndex((pattern) =>
        pattern.includes(`id="${input.template.textureId}"`)
      )
    : -1;
  const texture = textureIndex >= 0
    ? `<rect width="${view.canvas.w}" height="${view.canvas.h}"` +
      ` fill="url(#tex-${uid}-${textureIndex})" opacity="0.08" pointer-events="none"/>`
    : "";

  const shadow = resolveColorTokens(sanitizeSvgFragment(view.shadowSvg ?? ""), color);
  const highlight = resolveColorTokens(sanitizeSvgFragment(view.highlightSvg ?? ""), color);
  const bodySource = input.template.bodyByView?.[view.key] ?? input.template.bodySvg;
  const body = resolveColorTokens(sanitizeSvgFragment(bodySource), color);
  const overlay = resolveColorTokens(sanitizeSvgFragment(input.template.overlaySvg ?? ""), color);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.canvas.w} ${view.canvas.h}"` +
    ` width="${view.canvas.w}" height="${view.canvas.h}" role="img"` +
    ` aria-label="${attr(input.template.name)} ${attr(view.label)}">` +
    `<defs><clipPath id="print-${uid}"><path d="${attr(maskPath)}"/></clipPath>${patterns}</defs>` +
    `<rect width="${view.canvas.w}" height="${view.canvas.h}" fill="#f1f1f4"/>` +
    shadow +
    body +
    texture +
    artwork +
    highlight +
    overlay +
    `</svg>`;

  return {
    svg,
    placement,
    templateKey: input.template.key,
    viewKey: view.key,
    colorKey: color.key,
  };
}
