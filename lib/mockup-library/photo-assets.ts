/**
 * Photorealistic mockup asset registry.
 *
 * Every entry is a REAL photograph stored locally under /public/mockup-assets.
 * Source, author and licence were verified from the Pexels license page
 * (https://www.pexels.com/license/: free commercial use + modification, no
 * attribution required). Full inventory: docs/MOCKUP-ASSET-LICENSES.md.
 *
 * `printArea` is normalised (0..1) to the photo dimensions and was measured by
 * visual inspection of each file — not guessed. Artwork is clipped to that
 * area, composited with a blend mode and a subtle material texture so it reads
 * as printed on the product rather than pasted on top.
 */

export type PhotoBlend = "multiply" | "normal" | "screen";

export type PhotoMockupAsset = {
  templateKey: string;
  colorKey: string;
  viewKey: string;
  /** Local project path — never a hotlinked external URL. */
  src: string;
  width: number;
  height: number;
  printArea: { x: number; y: number; w: number; h: number };
  blend: PhotoBlend;
  opacity: number;
  /** SVG pattern id from the vector library, or null for no extra texture. */
  texture: "fabric" | "paper" | "ceramic" | null;
  author: string;
  sourcePage: string;
  description: string;
};

export const PHOTO_ASSETS: PhotoMockupAsset[] = [
  {
    templateKey: "tshirt", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/tshirt/white/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.34, y: 0.25, w: 0.32, h: 0.58 },
    blend: "multiply", opacity: 0.94, texture: "fabric",
    author: "Mr. Mockup (Pexels)", sourcePage: "https://www.pexels.com/photo/a-blank-white-shirt-12025472/",
    description: "Flat-lay classic white crew-neck tee on a neutral studio surface, natural fabric folds.",
  },
  {
    templateKey: "tshirt", colorKey: "black", viewKey: "front",
    src: "/mockup-assets/tshirt/black/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.36, y: 0.24, w: 0.29, h: 0.62 },
    blend: "normal", opacity: 0.9, texture: "fabric",
    author: "Anna Nekrashevich (Pexels)", sourcePage: "https://www.pexels.com/photo/a-black-shirt-hanging-on-the-wall-8532616/",
    description: "Black tee on a hanger with real window shadows and visible knit texture.",
  },
  {
    templateKey: "oversized_tshirt", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/oversized_tshirt/white/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.36, y: 0.25, w: 0.29, h: 0.6 },
    blend: "multiply", opacity: 0.94, texture: "fabric",
    author: "MockupBee (Pexels)", sourcePage: "https://www.pexels.com/photo/white-t-shirt-on-white-surface-12039633/",
    description: "Boxy oversized white tee, flat-lay with authentic drape and stitching.",
  },
  {
    templateKey: "hoodie", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/hoodie/white/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.54, y: 0.6, w: 0.26, h: 0.3 },
    blend: "multiply", opacity: 0.92, texture: "fabric",
    author: "Mart Production (Pexels)", sourcePage: "https://www.pexels.com/photo/a-man-in-white-hoodie-standing-8217518/",
    description: "Model-worn white hoodie, neutral studio background; print area limited to the clear chest panel.",
  },
  {
    templateKey: "sweatshirt", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/sweatshirt/white/front.jpg", width: 1600, height: 2400,
    printArea: { x: 0.33, y: 0.55, w: 0.43, h: 0.35 },
    blend: "multiply", opacity: 0.92, texture: "fabric",
    author: "Mart Production (Pexels)", sourcePage: "https://www.pexels.com/photo/a-man-in-a-white-sweater-posing-8217516/",
    description: "Model-worn light sweatshirt in studio; print area kept clear of hands and pocket.",
  },
  {
    templateKey: "mug", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/mug/white/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.34, y: 0.2, w: 0.34, h: 0.62 },
    blend: "multiply", opacity: 0.9, texture: "ceramic",
    author: "Blush Pink Studio (Pexels)", sourcePage: "https://www.pexels.com/photo/close-up-photo-of-white-ceramic-mug-13360742/",
    description: "Single blank ceramic mug on warm fabric, soft studio light and natural glaze highlights.",
  },
  {
    templateKey: "phone_case", colorKey: "white", viewKey: "back",
    src: "/mockup-assets/phone_case/white/back.jpg", width: 1600, height: 1067,
    printArea: { x: 0.43, y: 0.21, w: 0.17, h: 0.55 },
    blend: "multiply", opacity: 0.92, texture: null,
    author: "Mart Production (Pexels)", sourcePage: "https://www.pexels.com/photo/person-holding-white-iphone-5-c-9558938/",
    description: "Hand-held white phone case, back facing camera; camera module sits above the print area.",
  },
  {
    templateKey: "tote_bag", colorKey: "natural", viewKey: "front",
    src: "/mockup-assets/tote_bag/natural/front.jpg", width: 1600, height: 1067,
    printArea: { x: 0.34, y: 0.33, w: 0.35, h: 0.58 },
    blend: "multiply", opacity: 0.88, texture: "fabric",
    author: "Brando Ltd (Pexels)", sourcePage: "https://www.pexels.com/photo/plain-tote-bag-9869067/",
    description: "Blank natural cotton tote on a grey studio backdrop with real canvas weave and wrinkles.",
  },
  {
    templateKey: "poster", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/poster/white/front.jpg", width: 1600, height: 2400,
    printArea: { x: 0.35, y: 0.3, w: 0.48, h: 0.42 },
    blend: "normal", opacity: 0.96, texture: "paper",
    author: "Gabby K (Pexels)", sourcePage: "https://www.pexels.com/photo/mock-up-poster-on-wooden-wall-6373756/",
    description: "Blank white poster on a wooden slat wall, natural perspective and paper grain.",
  },
  {
    templateKey: "mouse_pad", colorKey: "black", viewKey: "front",
    src: "/mockup-assets/mouse_pad/black/front.jpg", width: 1600, height: 2400,
    printArea: { x: 0.27, y: 0.36, w: 0.52, h: 0.31 },
    blend: "normal", opacity: 0.92, texture: null,
    author: "Mintworkspace (Pexels)", sourcePage: "https://www.pexels.com/photo/a-mouse-and-keyboard-on-a-desk-27559521/",
    description: "Dark fabric mouse pad on a desk; print area avoids the mouse and pad edge.",
  },
  {
    templateKey: "sticker", colorKey: "white", viewKey: "front",
    src: "/mockup-assets/sticker/white/front.jpg", width: 1600, height: 2399,
    printArea: { x: 0.36, y: 0.34, w: 0.33, h: 0.12 },
    blend: "multiply", opacity: 0.94, texture: null,
    author: "Cup of Couple (Pexels)", sourcePage: "https://www.pexels.com/photo/a-person-holding-a-white-sticky-note-8015726/",
    description: "Hand-held blank speech-bubble sticker on a clean white background.",
  },
];

export function getPhotoAsset(templateKey: string, colorKey: string, viewKey: string): PhotoMockupAsset | null {
  return PHOTO_ASSETS.find(
    (a) => a.templateKey === templateKey && a.colorKey === colorKey && a.viewKey === viewKey
  ) ?? null;
}

export function getPhotoAssetsForTemplate(templateKey: string): PhotoMockupAsset[] {
  return PHOTO_ASSETS.filter((a) => a.templateKey === templateKey);
}

/** Convert a normalised print area to viewBox pixel coordinates. */
export function photoPrintArea(asset: PhotoMockupAsset) {
  return {
    x: asset.printArea.x * asset.width,
    y: asset.printArea.y * asset.height,
    w: asset.printArea.w * asset.width,
    h: asset.printArea.h * asset.height,
  };
}

/** Clip path for the printable area of a photo (kept inside the product). */
export function photoMaskPath(asset: PhotoMockupAsset): string {
  const a = photoPrintArea(asset);
  return `M ${a.x} ${a.y} H ${a.x + a.w} V ${a.y + a.h} H ${a.x} Z`;
}
