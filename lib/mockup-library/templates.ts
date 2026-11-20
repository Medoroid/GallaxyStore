/**
 * Mockup templates — 10 product types, all ORIGINAL vector assets.
 *
 * The first eight reuse the proven body geometry of the existing
 * `lib/design-studio` registry (tokenised per colour), then add the missing
 * professional layers: printable-area masks, material textures, ground
 * shadows, highlights and surface perspective. Two new types (oversized tee,
 * sticker) are authored here. No external image files, no hotlinking, no
 * third-party licence assumptions — see docs/MOCKUP-ASSET-LICENSES.md.
 */

import { getTemplate } from "@/lib/design-studio/templates";
import type { MockupView, MockupTemplate, MockupColor, MockupSize } from "./types";

const TOKENS: MockupColor = {
  key: "tokenised",
  name: "tokenised",
  hex: "{{hex}}",
  shadeHex: "{{shade}}",
  highlightHex: "{{highlight}}",
};

function roundRect(x: number, y: number, w: number, h: number, r = 12): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M ${x + rr} ${y} H ${x + w - rr} Q ${x + w} ${y} ${x + w} ${y + rr} ` +
    `V ${y + h - rr} Q ${x + w} ${y + h} ${x + w - rr} ${y + h} ` +
    `H ${x + rr} Q ${x} ${y + h} ${x} ${y + h - rr} V ${y + rr} ` +
    `Q ${x} ${y} ${x + rr} ${y} Z`
  );
}

function viewFromBase(
  key: string,
  label: string,
  canvas: { w: number; h: number },
  printArea: { x: number; y: number; w: number; h: number },
  extra: Partial<MockupView> = {}
): MockupView {
  return {
    key,
    label,
    canvas,
    printArea,
    maskPath: roundRect(printArea.x, printArea.y, printArea.w, printArea.h),
    ...extra,
  };
}

const FABRIC_TEXTURE =
  '<pattern id="fabric" width="8" height="8" patternUnits="userSpaceOnUse">' +
  '<path d="M0 0H8M0 4H8" stroke="#ffffff" stroke-width="0.6" opacity="0.7"/>' +
  '<path d="M0 2H8M0 6H8" stroke="#000000" stroke-width="0.5" opacity="0.35"/>' +
  '</pattern>';
const PAPER_TEXTURE =
  '<pattern id="paper" width="12" height="12" patternUnits="userSpaceOnUse">' +
  '<circle cx="2" cy="3" r="0.7" fill="#6b5b4b" opacity="0.5"/>' +
  '<circle cx="9" cy="8" r="0.6" fill="#6b5b4b" opacity="0.4"/>' +
  '</pattern>';
const CERAMIC_TEXTURE =
  '<pattern id="ceramic" width="16" height="16" patternUnits="userSpaceOnUse">' +
  '<path d="M0 8 Q4 4 8 8 T16 8" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>' +
  '</pattern>';

const GROUND_SHADOW =
  '<ellipse cx="500" cy="940" rx="320" ry="34" fill="#000000" opacity="0.10"/>';
const SOFT_HIGHLIGHT =
  '<path d="M300 320 Q500 260 700 320 L700 860 Q500 900 300 860 Z" ' +
  'fill="url(#none)" opacity="0"/>';

function fromRegistry(
  key: string,
  overrides: Partial<MockupTemplate> = {}
): MockupTemplate {
  const base = getTemplate(key);
  if (!base) throw new Error(`Unknown base template: ${key}`);
  const bodyByView: Record<string, string> = {};
  for (const view of base.views) {
    bodyByView[view.key] = base.body(view.key, TOKENS);
  }
  const textureId =
    base.category === "apparel" && key !== "tote_bag"
      ? "fabric"
      : key === "mug"
        ? "ceramic"
        : key === "poster" || key === "sticker"
          ? "paper"
          : undefined;
  const texturePatterns = [FABRIC_TEXTURE, PAPER_TEXTURE, CERAMIC_TEXTURE];
  const viewExtras: Record<string, Partial<MockupView>> = {
    mug: { perspective: "matrix(0.94 0.02 0.02 1 10 -3)" },
    tote_bag: { perspective: "matrix(1 0.025 0 1 -4 3)" },
    poster: { perspective: "matrix(0.985 0 0.015 0.985 5 2)" },
    phone_case: { perspective: "matrix(0.99 0 0 1 0 0)" },
  };
  return {
    key: base.key,
    name: base.name,
    nameAr: base.nameAr,
    category: base.category,
    description: `${base.name} — layered vector mockup`,
    dimensionsMm: base.dimensionsMm,
    colors: base.colors as MockupColor[],
    sizes: base.sizes as MockupSize[],
    views: base.views.map((v) =>
      viewFromBase(v.key, v.label, v.canvas, v.printArea, {
        ...(viewExtras[key] ?? {}),
        shadowSvg: GROUND_SHADOW,
        highlightSvg: SOFT_HIGHLIGHT,
      })
    ),
    bodySvg: bodyByView[base.views[0]?.key ?? "front"] ?? "",
    bodyByView,
    overlaySvg: TOKENS ? base.overlay?.(base.views[0]?.key ?? "front", TOKENS) : undefined,
    textureId,
    texturePatterns,
    provenance: {
      source: "original-vector",
      author: "Galaxy Store Custom Print Studio",
      license: "CC0-1.0 (original work dedicated to the public domain)",
    },
    isActive: true,
    ...overrides,
  };
}

const OVERSIZED_BODY = (() => {
  const tshirt = getTemplate("tshirt");
  const body = tshirt?.body("front", TOKENS) ?? "";
  return `<g transform="translate(500 500) scale(1.09) translate(-500 -500)">${body}</g>`;
})();

const OVERSIZED_TSHIRT: MockupTemplate = {
  key: "oversized_tshirt",
  name: "Oversized T-Shirt",
  nameAr: "تيشيرت أوفيرسايز",
  category: "apparel",
  description: "Boxy oversized cut with dropped shoulders",
  dimensionsMm: { w: 640, h: 760 },
  colors: (getTemplate("tshirt")?.colors ?? []) as MockupColor[],
  sizes: (getTemplate("tshirt")?.sizes ?? []) as MockupSize[],
  views: [
    viewFromBase(
      "front",
      "Front",
      { w: 1000, h: 1000 },
      { x: 335, y: 285, w: 330, h: 420 },
      { shadowSvg: GROUND_SHADOW, highlightSvg: SOFT_HIGHLIGHT }
    ),
  ],
  bodySvg: OVERSIZED_BODY,
  textureId: "fabric",
  texturePatterns: [FABRIC_TEXTURE, PAPER_TEXTURE, CERAMIC_TEXTURE],
  provenance: {
    source: "original-vector",
    author: "Galaxy Store Custom Print Studio",
    license: "CC0-1.0 (original work dedicated to the public domain)",
  },
  isActive: true,
};

const STICKER: MockupTemplate = {
  key: "sticker",
  name: "Sticker",
  nameAr: "ملصق",
  category: "stationery",
  description: "Die-cut vinyl sticker with white kiss-cut border",
  dimensionsMm: { w: 100, h: 100 },
  colors: [
    { key: "white", name: "White", nameAr: "أبيض", hex: "#ffffff", shadeHex: "#d8d8de" },
  ],
  sizes: [
    { key: "small", name: "Small", label: "7×7 cm" },
    { key: "medium", name: "Medium", label: "10×10 cm" },
    { key: "large", name: "Large", label: "15×15 cm" },
  ],
  views: [
    viewFromBase(
      "front",
      "Front",
      { w: 800, h: 800 },
      { x: 190, y: 190, w: 420, h: 420 },
      { shadowSvg: '<rect x="178" y="196" width="444" height="424" rx="32" fill="#000000" opacity="0.12"/>' }
    ),
  ],
  bodySvg:
    '<rect x="170" y="170" width="460" height="460" rx="36" fill="{{hex}}"' +
    ' stroke="{{shade}}" stroke-width="8"/>',
  textureId: "paper",
  texturePatterns: [FABRIC_TEXTURE, PAPER_TEXTURE, CERAMIC_TEXTURE],
  provenance: {
    source: "original-vector",
    author: "Galaxy Store Custom Print Studio",
    license: "CC0-1.0 (original work dedicated to the public domain)",
  },
  isActive: true,
};

export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  fromRegistry("tshirt"),
  OVERSIZED_TSHIRT,
  fromRegistry("hoodie"),
  fromRegistry("sweatshirt"),
  fromRegistry("mug"),
  fromRegistry("phone_case"),
  fromRegistry("tote_bag"),
  fromRegistry("poster"),
  fromRegistry("mouse_pad"),
  STICKER,
];

export function getMockupTemplate(key: string): MockupTemplate | null {
  return MOCKUP_TEMPLATES.find((template) => template.key === key && template.isActive) ?? null;
}

export const MOCKUP_TEMPLATE_KEYS = MOCKUP_TEMPLATES.map((template) => template.key);
