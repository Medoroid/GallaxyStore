/**
 * Product template registry — the8 shippable types as purpose-built vector
 * mockups (D6: NOT naive photo overlays). Each template emits SVG layers:
 *
 *   backdrop → body(view, color) → ARTWORK (placed by mockup.ts) → overlay?
 *
 * `body` draws the silhouette with seams/shading in the chosen color;
 * `overlay` draws details that must sit ON TOP of the print (phone camera
 * module, hoodie pocket + drawstrings, mouse-pad stitching).
 *
 * Pure data + string functions: no DOM, no canvas — the same markup renders
 * in an `<img>`-loaded SVG (client → canvas → PNG) and in tests.
 * Geometry mirrors the `creator_product_templates` seed migration.
 */

import type { ProductTemplate, TemplateColor } from "../types";

/** Neutral studio backdrop behind every mockup. */
export const MOCKUP_BACKDROP = "#f1f1f4";

const SHIRTS: TemplateColor[] = [
  { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
  { key: "white", name: "White", nameAr: "أبيض", hex: "#f6f6f8", shadeHex: "#d7d7de" },
  { key: "heather", name: "Heather Gray", nameAr: "رمادي", hex: "#a7adb8", shadeHex: "#828996" },
  { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
  { key: "red", name: "Red", nameAr: "أحمر", hex: "#c62f38", shadeHex: "#8f1f26" },
];

const APPAREL_SIZES = [
  { key: "s", name: "Small", label: "S" },
  { key: "m", name: "Medium", label: "M" },
  { key: "l", name: "Large", label: "L" },
  { key: "xl", name: "Extra Large", label: "XL" },
  { key: "xxl", name: "Double XL", label: "XXL" },
];

// ---------------------------------------------------------------------------
// t-shirt
// ---------------------------------------------------------------------------

const TSHIRT_BODY =
  "M 350 145 L 430 118 Q 500 165 570 118 L 650 145 " +
  "L 858 252 Q 876 262 868 284 L 792 356 Q 780 368 764 358 L 700 318 " +
  "L 700 862 Q 500 908 300 862 L 300 318 " +
  "L 236 358 Q 220 368 208 356 L 132 284 Q 124 262 142 252 Z";

const TSHIRT: ProductTemplate = {
  key: "tshirt",
  name: "T-Shirt",
  nameAr: "تيشيرت",
  category: "apparel",
  dimensionsMm: { w: 560, h: 700 },
  views: [
    { key: "front", label: "Front", canvas: { w: 1000, h: 1000 }, printArea: { x: 350, y: 290, w: 300, h: 400 } },
    { key: "back", label: "Back", canvas: { w: 1000, h: 1000 }, printArea: { x: 350, y: 270, w: 300, h: 380 } },
  ],
  colors: SHIRTS,
  sizes: APPAREL_SIZES,
  body: (viewKey, color) => {
    const neckline =
      viewKey === "back"
        ? "M 430 118 Q 500 150 570 118 Q 546 168 500 172 Q 454 168 430 118 Z"
        : "M 430 118 Q 500 165 570 118 Q 548 196 500 202 Q 452 196 430 118 Z";
    return (
      `<path d="${TSHIRT_BODY}" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="7" stroke-linejoin="round"/>` +
      `<path d="${neckline}" fill="${color.shadeHex}"/>` +
      `<path d="M 300 318 L 300 862 M 700 318 L 700 862" fill="none" stroke="${color.shadeHex}" stroke-width="5" opacity="0.35"/>` +
      `<path d="M 142 252 L 208 356 M 858 252 L 792 356" fill="none" stroke="${color.shadeHex}" stroke-width="5" opacity="0.3"/>`
    );
  },
};

// ---------------------------------------------------------------------------
// hoodie
// ---------------------------------------------------------------------------

const HOODIE_TORSO =
  "M 360 260 L 445 232 Q 500 272 555 232 L 640 260 " +
  "L 872 372 Q 890 382 882 404 L 806 476 Q 794 488 778 478 L 706 432 " +
  "L 706 998 Q 500 1044 294 998 L 294 432 " +
  "L 222 478 Q 206 488 194 476 L 118 404 Q 110 382 128 372 Z";

const HOODIE: ProductTemplate = {
  key: "hoodie",
  name: "Hoodie",
  nameAr: "هودي",
  category: "apparel",
  dimensionsMm: { w: 600, h: 760 },
  views: [
    { key: "front", label: "Front", canvas: { w: 1000, h: 1100 }, printArea: { x: 350, y: 400, w: 300, h: 360 } },
    { key: "back", label: "Back", canvas: { w: 1000, h: 1100 }, printArea: { x: 350, y: 340, w: 300, h: 420 } },
  ],
  colors: [
    { key: "white", name: "White", nameAr: "أبيض", hex: "#f6f6f8", shadeHex: "#d7d7de" },
    { key: "charcoal", name: "Charcoal", nameAr: "فحمي", hex: "#33343d", shadeHex: "#1a1b22" },
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "gray", name: "Gray", nameAr: "رمادي", hex: "#8f95a3", shadeHex: "#6a7080" },
    { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
    { key: "maroon", name: "Maroon", nameAr: "عنابي", hex: "#7a2e39", shadeHex: "#541d25" },
  ],
  sizes: APPAREL_SIZES,
  body: (viewKey, color) => {
    const back = viewKey === "back";
    const hood =
      `<path d="M 355 245 Q 500 70 645 245 Q 620 312 500 328 Q 380 312 355 245 Z" fill="${color.shadeHex}"/>` +
      `<path d="M 385 250 Q 500 110 615 250 Q 592 300 500 312 Q 408 300 385 250 Z" fill="${color.hex}" opacity="0.35"/>`;
    const neckline = back
      ? `<path d="M 445 232 Q 500 262 555 232 Q 540 288 500 292 Q 460 288 445 232 Z" fill="${color.shadeHex}"/>`
      : `<path d="M 445 232 Q 500 272 555 232 Q 538 300 500 306 Q 462 300 445 232 Z" fill="${color.shadeHex}"/>`;
    return (
      hood +
      `<path d="${HOODIE_TORSO}" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="7" stroke-linejoin="round"/>` +
      neckline +
      `<path d="M 294 432 L 294 998 M 706 432 L 706 998" fill="none" stroke="${color.shadeHex}" stroke-width="5" opacity="0.35"/>`
    );
  },
  overlay: (viewKey, color) => {
    if (viewKey === "back") return "";
    return (
      // kangaroo pocket + drawstrings sit ON TOP of the print
      `<path d="M 366 782 L 634 782 L 668 942 L 332 942 Z" fill="${color.shadeHex}" opacity="0.55"/>` +
      `<path d="M 366 782 L 634 782" fill="none" stroke="${color.shadeHex}" stroke-width="8" opacity="0.9"/>` +
      `<path d="M 472 306 L 464 430 M 528 306 L 536 430" fill="none" stroke="${color.shadeHex}" stroke-width="9" stroke-linecap="round"/>` +
      `<rect x="456" y="424" width="16" height="26" rx="5" fill="${color.shadeHex}"/>` +
      `<rect x="528" y="424" width="16" height="26" rx="5" fill="${color.shadeHex}"/>`
    );
  },
};

// ---------------------------------------------------------------------------
// sweatshirt (crewneck)
// ---------------------------------------------------------------------------

const SWEATSHIRT_BODY =
  "M 348 150 L 428 122 Q 500 168 572 122 L 652 150 " +
  "L 856 258 Q 874 268 866 290 L 790 362 Q 778 374 762 364 L 698 322 " +
  "L 698 845 L 698 890 Q 500 932 302 890 L 302 845 L 302 322 " +
  "L 238 364 Q 222 374 210 362 L 134 290 Q 126 268 144 258 Z";

const SWEATSHIRT: ProductTemplate = {
  key: "sweatshirt",
  name: "Sweatshirt",
  nameAr: "سويت شيرت",
  category: "apparel",
  dimensionsMm: { w: 580, h: 720 },
  views: [
    { key: "front", label: "Front", canvas: { w: 1000, h: 1000 }, printArea: { x: 350, y: 330, w: 300, h: 360 } },
    { key: "back", label: "Back", canvas: { w: 1000, h: 1000 }, printArea: { x: 350, y: 300, w: 300, h: 380 } },
  ],
  colors: [
    { key: "white", name: "White", nameAr: "أبيض", hex: "#f6f6f8", shadeHex: "#d7d7de" },
    { key: "ash", name: "Ash", nameAr: "رمادي فاتح", hex: "#c9ccd3", shadeHex: "#a4a8b2" },
    { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
    { key: "forest", name: "Forest Green", nameAr: "أخضر", hex: "#2f5541", shadeHex: "#1d382a" },
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "burgundy", name: "Burgundy", nameAr: "خمري", hex: "#6d2b36", shadeHex: "#4a1c24" },
  ],
  sizes: APPAREL_SIZES,
  body: (viewKey, color) => {
    const neckline =
      viewKey === "back"
        ? "M 428 122 Q 500 152 572 122 Q 556 176 500 180 Q 444 176 428 122 Z"
        : "M 428 122 Q 500 168 572 122 Q 556 194 500 200 Q 444 194 428 122 Z";
    const hem = "M 302 845 Q 500 887 698 845 L 698 890 Q 500 932 302 890 Z";
    return (
      `<path d="${SWEATSHIRT_BODY}" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="7" stroke-linejoin="round"/>` +
      `<path d="${neckline}" fill="${color.shadeHex}"/>` +
      `<path d="${hem}" fill="${color.shadeHex}" opacity="0.75"/>` +
      `<path d="M 302 322 L 302 845 M 698 322 L 698 845" fill="none" stroke="${color.shadeHex}" stroke-width="5" opacity="0.35"/>`
    );
  },
};

// ---------------------------------------------------------------------------
// mug
// ---------------------------------------------------------------------------

const MUG: ProductTemplate = {
  key: "mug",
  name: "Coffee Mug",
  nameAr: "كوب قهوة",
  category: "drinkware",
  dimensionsMm: { w: 120, h: 95, depth: 80 },
  views: [
    { key: "front", label: "Front", canvas: { w: 900, h: 700 }, printArea: { x: 215, y: 200, w: 430, h: 300 } },
  ],
  colors: [
    { key: "white", name: "White", nameAr: "أبيض", hex: "#ffffff", shadeHex: "#dcdce4" },
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
    { key: "red", name: "Red", nameAr: "أحمر", hex: "#c62f38", shadeHex: "#8f1f26" },
    { key: "mint", name: "Mint", nameAr: "نعناعي", hex: "#7fd1b9", shadeHex: "#5aa992" },
  ],
  sizes: [
    { key: "11oz", name: "11 oz", label: "11 oz" },
    { key: "15oz", name: "15 oz", label: "15 oz" },
  ],
  body: (_viewKey, color) =>
    `<path d="M 175 135 L 175 545 Q 415 615 655 545 L 655 135 Q 415 205 175 135 Z" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="6" stroke-linejoin="round"/>` +
    `<ellipse cx="415" cy="135" rx="240" ry="70" fill="${color.shadeHex}"/>` +
    `<ellipse cx="415" cy="142" rx="212" ry="54" fill="#000000" opacity="0.35"/>` +
    `<path d="M 655 235 Q 800 245 800 350 Q 800 455 655 465 L 655 415 Q 730 405 730 350 Q 730 295 655 285 Z" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="7"/>` +
    `<path d="M 235 195 L 235 505" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" opacity="0.22"/>`,
};

// ---------------------------------------------------------------------------
// phone case (printable face = back of the phone)
// ---------------------------------------------------------------------------

const PHONE_CASE: ProductTemplate = {
  key: "phone_case",
  name: "Phone Case",
  nameAr: "غطاء هاتف",
  category: "tech",
  dimensionsMm: { w: 75, h: 152 },
  views: [
    { key: "back", label: "Back", canvas: { w: 600, h: 1200 }, printArea: { x: 64, y: 130, w: 472, h: 970 } },
  ],
  colors: [
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "white", name: "White", nameAr: "أبيض", hex: "#f6f6f8", shadeHex: "#d7d7de" },
    { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
    { key: "pink", name: "Pink", nameAr: "وردي", hex: "#f2a8c4", shadeHex: "#d17fa3" },
    { key: "clear", name: "Clear", nameAr: "شفاف", hex: "#e9f3f7", shadeHex: "#c3d8e0" },
  ],
  sizes: [
    { key: "iphone-15", name: "iPhone 15", label: "iPhone 15" },
    { key: "iphone-15-pro", name: "iPhone 15 Pro", label: "15 Pro" },
    { key: "galaxy-s24", name: "Galaxy S24", label: "S24" },
  ],
  body: (_viewKey, color) =>
    `<rect x="48" y="58" width="504" height="1084" rx="72" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="9"/>` +
    `<rect x="66" y="76" width="468" height="1048" rx="58" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.18"/>`,
  overlay: (_viewKey, color) =>
    // camera module renders ON TOP of the print — the realistic look
    `<rect x="92" y="112" width="200" height="200" rx="48" fill="${color.shadeHex}"/>` +
    `<circle cx="152" cy="172" r="42" fill="#1b1b22"/><circle cx="152" cy="172" r="30" fill="#2f3140"/><circle cx="152" cy="172" r="14" fill="#0b0b12"/>` +
    `<circle cx="232" cy="252" r="34" fill="#1b1b22"/><circle cx="232" cy="252" r="20" fill="#2f3140"/>` +
    `<circle cx="232" cy="164" r="16" fill="#f5e9c9"/>`,
};

// ---------------------------------------------------------------------------
// tote bag
// ---------------------------------------------------------------------------

const TOTE: ProductTemplate = {
  key: "tote_bag",
  name: "Tote Bag",
  nameAr: "حقيبة قماش",
  category: "accessories",
  dimensionsMm: { w: 380, h: 420 },
  views: [
    { key: "front", label: "Front", canvas: { w: 900, h: 1000 }, printArea: { x: 250, y: 390, w: 400, h: 440 } },
    { key: "back", label: "Back", canvas: { w: 900, h: 1000 }, printArea: { x: 250, y: 390, w: 400, h: 440 } },
  ],
  colors: [
    { key: "natural", name: "Natural", nameAr: "طبيعي", hex: "#e8dcc6", shadeHex: "#cbb998" },
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "navy", name: "Navy", nameAr: "كحلي", hex: "#26324f", shadeHex: "#141c31" },
    { key: "olive", name: "Olive", nameAr: "زيتي", hex: "#5d6b3f", shadeHex: "#414c2a" },
  ],
  sizes: [
    { key: "standard", name: "Standard", label: "15×16 in" },
    { key: "large", name: "Large", label: "18×20 in" },
  ],
  body: (_viewKey, color) =>
    // handles first — the bag body covers their lower ends
    `<path d="M 330 330 Q 335 130 450 130 Q 565 130 570 330" fill="none" stroke="${color.shadeHex}" stroke-width="30" stroke-linecap="round"/>` +
    `<rect x="165" y="300" width="570" height="630" rx="20" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="7"/>` +
    `<path d="M 165 348 L 735 348" fill="none" stroke="${color.shadeHex}" stroke-width="5" opacity="0.5"/>`,
};

// ---------------------------------------------------------------------------
// poster
// ---------------------------------------------------------------------------

const POSTER: ProductTemplate = {
  key: "poster",
  name: "Art Poster",
  nameAr: "ملصق فني",
  category: "wall_art",
  dimensionsMm: { w: 305, h: 381 },
  views: [
    { key: "front", label: "Front", canvas: { w: 800, h: 1000 }, printArea: { x: 45, y: 45, w: 710, h: 910 } },
  ],
  colors: [
    { key: "white", name: "White Paper", nameAr: "ورق أبيض", hex: "#ffffff", shadeHex: "#dcdce4" },
    { key: "ivory", name: "Ivory Paper", nameAr: "ورق عاجي", hex: "#f6f1e7", shadeHex: "#ddd5c4" },
    { key: "black", name: "Black Paper", nameAr: "ورق أسود", hex: "#16161c", shadeHex: "#000000" },
  ],
  sizes: [
    { key: "12x16", name: "12 × 16 in", label: "12×16" },
    { key: "18x24", name: "18 × 24 in", label: "18×24" },
    { key: "24x36", name: "24 × 36 in", label: "24×36" },
  ],
  body: (_viewKey, color) =>
    // drop shadow behind the sheet, then the paper itself
    `<rect x="53" y="53" width="710" height="910" rx="4" fill="#000000" opacity="0.12"/>` +
    `<rect x="45" y="45" width="710" height="910" rx="3" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="2"/>`,
};

// ---------------------------------------------------------------------------
// mouse pad
// ---------------------------------------------------------------------------

const MOUSE_PAD: ProductTemplate = {
  key: "mouse_pad",
  name: "Mouse Pad",
  nameAr: "ماوس باد",
  category: "accessories",
  dimensionsMm: { w: 220, h: 220 },
  views: [
    { key: "front", label: "Top", canvas: { w: 900, h: 900 }, printArea: { x: 72, y: 72, w: 756, h: 756 } },
  ],
  colors: [
    { key: "black", name: "Black", nameAr: "أسود", hex: "#1f1f26", shadeHex: "#000000" },
    { key: "white", name: "White", nameAr: "أبيض", hex: "#f6f6f8", shadeHex: "#d7d7de" },
    { key: "red", name: "Red", nameAr: "أحمر", hex: "#c62f38", shadeHex: "#8f1f26" },
    { key: "blue", name: "Blue", nameAr: "أزرق", hex: "#2f5f9e", shadeHex: "#1f4272" },
  ],
  sizes: [
    { key: "standard", name: "Standard", label: "9×9 in" },
    { key: "xl", name: "Extended", label: "12×10 in" },
  ],
  body: (_viewKey, color) =>
    `<rect x="50" y="50" width="800" height="800" rx="46" fill="${color.hex}" stroke="${color.shadeHex}" stroke-width="9"/>`,
  overlay: (_viewKey, color) =>
    // stitched edge draws over the print border — the real construction
    `<rect x="72" y="72" width="756" height="756" rx="30" fill="none" stroke="${color.shadeHex}" stroke-width="5" stroke-dasharray="16 12" opacity="0.85"/>`,
};

// ---------------------------------------------------------------------------

/** Ordered catalog — order defines studio display order. */
export const TEMPLATES: ProductTemplate[] = [
  TSHIRT,
  HOODIE,
  SWEATSHIRT,
  MUG,
  PHONE_CASE,
  TOTE,
  POSTER,
  MOUSE_PAD,
];

/**
 * SVG art providers are CODE, not data: JSONB can hold geometry but not the
 * body()/overlay() functions. The DB is the catalog/source of truth for all
 * geometry; this registry only supplies renderers and a last-resort fallback
 * for legacy products whose template is missing or invalid.
 */
export type TemplateRenderer = Pick<ProductTemplate, "body" | "overlay">;

export function getRenderer(key: string): TemplateRenderer {
  const template = TEMPLATES.find((candidate) => candidate.key === key);
  if (template) return { body: template.body, overlay: template.overlay };
  return {
    body: () => "",
    overlay: () => "",
  };
}

export function isTemplateKey(key: string): key is ProductTemplate["key"] {
  return TEMPLATES.some((template) => template.key === key);
}

/** Registry lookup by key — null for unknown keys (never a thrown error). */
export function getTemplate(key: string): ProductTemplate | null {
  return TEMPLATES.find((template) => template.key === key) ?? null;
}

export function getView(
  template: ProductTemplate,
  viewKey: string
): TemplateViewLike | null {
  return template.views.find((view) => view.key === viewKey) ?? null;
}

export function getColor(
  template: ProductTemplate,
  colorKey: string
): TemplateColor | null {
  return template.colors.find((color) => color.key === colorKey) ?? null;
}

type TemplateViewLike = ProductTemplate["views"][number];
