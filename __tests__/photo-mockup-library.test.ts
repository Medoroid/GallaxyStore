/**
 * @jest-environment node
 *
 * Photorealistic mockup contracts:
 *   - every supported product has a locally stored, licensed photograph
 *   - the photo (not a vector body) is the base layer
 *   - artwork is clipped to the measured printable area and blended/textured
 *   - unsafe inputs are rejected instead of producing a fake "success" preview
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PHOTO_ASSETS,
  getPhotoAsset,
  getPhotoAssetsForTemplate,
  photoPrintArea,
  photoMaskPath,
  type PhotoMockupAsset,
} from "@/lib/mockup-library/photo-assets";
import { composeMockup } from "@/lib/mockup-library/compose";
import { MOCKUP_TEMPLATES } from "@/lib/mockup-library/templates";
import type { MockupTemplate } from "@/lib/mockup-library/types";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const PHOTO_DATA =
  "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

const PHOTO_INPUT = (asset: PhotoMockupAsset) => ({
  href: PHOTO_DATA,
  canvas: { w: asset.width, h: asset.height },
  printArea: photoPrintArea(asset),
  maskPath: photoMaskPath(asset),
  blend: asset.blend,
  opacity: asset.opacity,
  texture: asset.texture,
});

function inputFor(asset: PhotoMockupAsset): Parameters<typeof composeMockup>[0] {
  const template: MockupTemplate = {
    key: asset.templateKey,
    name: asset.templateKey,
    nameAr: asset.templateKey,
    category: "custom",
    dimensionsMm: { w: 100, h: 100 },
    colors: [{ key: asset.colorKey, name: "Default", hex: "#ffffff", shadeHex: "#dddddd" }],
    sizes: [],
    views: [{
      key: asset.viewKey,
      label: "Front",
      canvas: { w: asset.width, h: asset.height },
      printArea: photoPrintArea(asset),
      maskPath: photoMaskPath(asset),
    }],
    bodySvg: '<path d="M0 0H10V10Z" fill="{{hex}}"/>',
    provenance: { source: "original-vector", author: "test", license: "CC0-1.0" },
    isActive: true,
  };
  return {
    template,
    viewKey: asset.viewKey,
    colorKey: asset.colorKey,
    artworkHref: PNG,
    transform: { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 },
    photo: PHOTO_INPUT(asset),
  };
}

describe("photo asset registry", () => {
  it("covers all ten supported products with a local photograph", () => {
    const keys = new Set(PHOTO_ASSETS.map((a) => a.templateKey));
    expect(keys.size).toBe(10);
    for (const template of MOCKUP_TEMPLATES) {
      expect(keys.has(template.key)).toBe(true);
    }
  });

  it("every asset exists locally, has licence metadata and a sane print area", () => {
    for (const asset of PHOTO_ASSETS) {
      expect(existsSync(join(process.cwd(), "public", asset.src.slice(1)))).toBe(true);
      expect(asset.src.startsWith("/mockup-assets/")).toBe(true);
      expect(asset.author).toBeTruthy();
      expect(asset.sourcePage).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);
      const a = asset.printArea;
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.w).toBeGreaterThan(0);
      expect(a.h).toBeGreaterThan(0);
      expect(a.x + a.w).toBeLessThanOrEqual(1);
      expect(a.y + a.h).toBeLessThanOrEqual(1);
    }
  });

  it("exposes only colours/views that have real photographs", () => {
    for (const template of MOCKUP_TEMPLATES) {
      const assets = getPhotoAssetsForTemplate(template.key);
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        expect(template.colors.some((c) => c.key === asset.colorKey)).toBe(true);
        expect(template.views.some((v) => v.key === asset.viewKey)).toBe(true);
        expect(getPhotoAsset(template.key, asset.colorKey, asset.viewKey)).toBe(asset);
      }
      expect(getPhotoAsset(template.key, "not-a-colour", "front")).toBeNull();
    }
  });
});

describe("photo compositor", () => {
  it("uses the photograph as the base layer and clips artwork to the print area", () => {
    const asset = PHOTO_ASSETS[0];
    const result = composeMockup(inputFor(asset));
    expect(result).not.toBeNull();
    const svg = result!.svg;

    expect(svg).toContain(`viewBox="0 0 ${asset.width} ${asset.height}"`);
    expect(svg).toContain('<image href="data:image/jpeg;base64,');
    expect(svg).toContain('<clipPath id="photo-print-');
    expect(svg).toContain("mix-blend-mode:multiply");
    expect(svg).toContain("photo-tex-"); // fabric texture overlay
    // The legacy vector body must NOT be drawn on top of a real photo.
    expect(svg).not.toContain('fill="{{hex}}"');
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it("works for every asset without producing an empty preview", () => {
    for (const asset of PHOTO_ASSETS) {
      const result = composeMockup(inputFor(asset));
      expect(result).not.toBeNull();
      expect(result!.svg).toContain("<image");
      expect(result!.placement.width).toBeGreaterThan(0);
    }
  });

  it("rejects a non-data photo href", () => {
    const input = inputFor(PHOTO_ASSETS[0]);
    input.photo!.href = "https://example.com/photo.jpg";
    expect(composeMockup(input)).toBeNull();
  });

  it("rejects an unsafe mask path and an unsupported blend mode", () => {
    const base = inputFor(PHOTO_ASSETS[0]);
    expect(composeMockup({ ...base, photo: { ...base.photo!, maskPath: 'M0 0 " onload="x' } })).toBeNull();
    expect(composeMockup({ ...base, photo: { ...base.photo!, blend: "dodge" as never } })).toBeNull();
  });

  it("falls back to null when no photo is supplied and the vector view is unknown", () => {
    const base = inputFor(PHOTO_ASSETS[0]);
    expect(composeMockup({ ...base, photo: undefined, viewKey: "side" })).toBeNull();
  });
});
