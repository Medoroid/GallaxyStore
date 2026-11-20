/**
 * @jest-environment node
 *
 * Mockup Library v2 — layered compositor and template registry contracts.
 * No external assets: every template must be an original vector with a clear
 * provenance record, a printable-area mask and at least one view/colour.
 */

import { composeMockup, resolveColorTokens } from "@/lib/mockup-library/compose";
import {
  MOCKUP_TEMPLATES,
  getMockupTemplate,
  MOCKUP_TEMPLATE_KEYS,
} from "@/lib/mockup-library/templates";

const TRANSFORM = { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 };
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

describe("template registry", () => {
  it("ships ten product types including oversized tee and sticker", () => {
    expect(MOCKUP_TEMPLATE_KEYS).toHaveLength(10);
    expect(MOCKUP_TEMPLATE_KEYS).toContain("oversized_tshirt");
    expect(MOCKUP_TEMPLATE_KEYS).toContain("sticker");
    for (const key of [
      "tshirt", "hoodie", "sweatshirt", "mug", "phone_case",
      "tote_bag", "poster", "mouse_pad",
    ]) {
      expect(MOCKUP_TEMPLATE_KEYS).toContain(key);
    }
  });

  it("every template is original, active and fully configured", () => {
    for (const template of MOCKUP_TEMPLATES) {
      expect(template.isActive).toBe(true);
      expect(template.provenance.source).toBe("original-vector");
      expect(template.provenance.license).toContain("CC0");
      expect(template.colors.length).toBeGreaterThan(0);
      expect(template.sizes.length).toBeGreaterThan(0);
      expect(template.views.length).toBeGreaterThan(0);
      expect(template.bodySvg).toMatch(/<path|<rect|<g/);
      for (const view of template.views) {
        expect(view.maskPath).toMatch(/^M/);
        expect(view.canvas.w).toBeGreaterThan(0);
        expect(view.printArea.w).toBeGreaterThan(0);
      }
    }
  });

  it("getMockupTemplate resolves active templates only", () => {
    expect(getMockupTemplate("mug")?.name).toBe("Coffee Mug");
    expect(getMockupTemplate("not-a-product")).toBeNull();
  });
});

describe("composeMockup — layered output", () => {
  it("renders mask, texture, body and artwork in order with resolved colours", () => {
    const template = getMockupTemplate("tshirt");
    expect(template).not.toBeNull();
    const result = composeMockup({
      template: template!,
      viewKey: "front",
      colorKey: "black",
      artworkHref: PNG,
      transform: TRANSFORM,
    });

    expect(result).not.toBeNull();
    const svg = result!.svg;
    expect(svg).toContain("<clipPath");
    expect(svg).toContain("<image");
    expect(svg).not.toContain("{{shade}}");
    expect(svg).not.toContain("{{hex}}");
    expect(svg).toContain("#1f1f26");
    expect(svg.indexOf("clipPath")).toBeLessThan(svg.indexOf("<image"));
    expect(result!.placement.width).toBeGreaterThan(0);
  });

  it("renders a blank product when no artwork is supplied", () => {
    const template = getMockupTemplate("mug")!;
    const result = composeMockup({
      template,
      viewKey: "front",
      colorKey: "white",
      transform: TRANSFORM,
    });
    expect(result?.svg).toContain("<path");
    expect(result?.svg).not.toContain("<image");
  });

  it("applies a per-view perspective transform when the template defines one", () => {
    const template = getMockupTemplate("mug")!;
    const result = composeMockup({
      template,
      viewKey: "front",
      colorKey: "navy",
      artworkHref: PNG,
      transform: TRANSFORM,
    });
    expect(result?.svg).toContain("matrix(");
  });

  it("uses the template's declared material texture", () => {
    const paper = getMockupTemplate("poster")!;
    const fabric = getMockupTemplate("hoodie")!;
    expect(paper.textureId).toBe("paper");
    expect(fabric.textureId).toBe("fabric");
    const paperSvg = composeMockup({
      template: paper,
      viewKey: "front",
      colorKey: paper.colors[0].key,
      transform: TRANSFORM,
    })!.svg;
    expect(paperSvg).toContain('id="tex-');
    expect(paperSvg).toContain("<circle");
  });

  it("honours admin print-area and mask overrides", () => {
    const template = getMockupTemplate("sticker")!;
    const result = composeMockup({
      template,
      viewKey: "front",
      colorKey: "white",
      transform: TRANSFORM,
      printAreaOverride: { x: 200, y: 200, w: 400, h: 400 },
      maskOverride: "M 200 200 H 600 V 600 H 200 Z",
    });
    expect(result?.svg).toContain("M 200 200 H 600 V 600 H 200 Z");
  });
});

describe("composeMockup — input validation", () => {
  it("returns null for an unknown view or colour", () => {
    const template = getMockupTemplate("tshirt")!;
    expect(
      composeMockup({ template, viewKey: "side", colorKey: "black", transform: TRANSFORM })
    ).toBeNull();
    expect(
      composeMockup({ template, viewKey: "front", colorKey: "neon", transform: TRANSFORM })
    ).toBeNull();
  });

  it("never emits a non-data artwork href", () => {
    const template = getMockupTemplate("tshirt")!;
    const result = composeMockup({
      template,
      viewKey: "front",
      colorKey: "black",
      artworkHref: "https://evil.example/steal.svg",
      transform: TRANSFORM,
    });
    expect(result?.svg).not.toContain("<image");
  });

  it("rejects unsafe perspective strings (no injection through template JSON)", () => {
    const template = getMockupTemplate("tshirt")!;
    const unsafe = {
      ...template,
      views: [{ ...template.views[0], perspective: "matrix(1 0 0 1 0 0);alert(1)" }],
    };
    expect(
      composeMockup({ template: unsafe, viewKey: "front", colorKey: "black", transform: TRANSFORM })
    ).toBeNull();
  });

  it("rejects a mask path containing non-path characters", () => {
    const template = getMockupTemplate("sticker")!;
    expect(
      composeMockup({
        template,
        viewKey: "front",
        colorKey: "white",
        transform: TRANSFORM,
        maskOverride: 'M 0 0 " onload="alert(1)',
      })
    ).toBeNull();
  });

  it("resolveColorTokens replaces all colour placeholders", () => {
    expect(
      resolveColorTokens("{{hex}}/{{shade}}/{{highlight}}", {
        key: "x", name: "X", hex: "#abc", shadeHex: "#def", highlightHex: "#123",
      })
    ).toBe("#abc/#def/#123");
  });
});
