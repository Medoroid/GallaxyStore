/**
 * Phase 5 — pure mockup pipeline tests:
 *
 * Template registry
 *   - 8 unique keys, every view's print area inside its canvas, colors/sizes
 *     non-empty, body/overlay emit SVG with no scripting
 * Placement engine
 *   - exact fit-inside math (uniform scale, centered), rotation passthrough,
 *     null (never NaN) on unusable input
 * SVG compositor
 *   - layer order backdrop → body → artwork → overlay, viewBox correctness,
 *     href allow-list (base64 data images only), null on unknown view/color
 * Hashing
 *   - sha256 known-answer vectors + node:crypto cross-check (multi-block)
 *   - canonical JSON key-order independence, hash sensitivity per config field
 */

import { createHash } from "node:crypto";
import type { ProductTemplate, Transform } from "@/lib/design-studio/types";
import { TEMPLATE_KEYS } from "@/lib/design-studio/types";
import {
  MOCKUP_BACKDROP,
  TEMPLATES,
  getColor,
  getTemplate,
  getView,
  isTemplateKey,
} from "@/lib/design-studio/templates";
import {
  buildMockupSvg,
  computeMockupPlacement,
  mockupPublicPath,
  mockupStoragePath,
  safeImageHref,
} from "@/lib/design-studio/mockup";
import {
  MOCKUP_RENDERER_VERSION,
  canonicalJson,
  mockupConfigHash,
  sha256Hex,
  type MockupConfig,
} from "@/lib/design-studio/mockup-hash";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const TRANSFORM: Transform = { cx: 0, cy: 0, width: 6, height: 6, rotation: 0 };

function config(overrides: Partial<MockupConfig> = {}): MockupConfig {
  return {
    renderer: MOCKUP_RENDERER_VERSION,
    template: "tshirt",
    view: "front",
    color: "black",
    fileId: "11111111-2222-3333-4444-555555555555",
    transform: { cx: 1, cy: -2, width: 6, height: 7.5, rotation: 15 },
    area: { widthIn: 12, heightIn: 12 },
    ...overrides,
  };
}

// --- registry ---------------------------------------------------------------

describe("template registry", () => {
  it("exposes exactly the 8 required product types", () => {
    expect(TEMPLATES.map((t) => t.key)).toEqual([...TEMPLATE_KEYS]);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(8);
  });

  it("every template has views, colors and sizes", () => {
    for (const template of TEMPLATES) {
      expect(template.views.length).toBeGreaterThan(0);
      expect(template.colors.length).toBeGreaterThan(0);
      expect(template.sizes.length).toBeGreaterThan(0);
      expect(template.name).toBeTruthy();
      expect(template.nameAr).toBeTruthy();
      expect(template.category).toMatch(/^[a-z0-9_-]{1,40}$/);
      expect(template.key).toMatch(/^[a-z0-9_]{2,40}$/);
      expect(template.dimensionsMm.w).toBeGreaterThan(0);
      expect(template.dimensionsMm.h).toBeGreaterThan(0);
    }
  });

  it("every view is unique per template and its print area lies inside the canvas", () => {
    for (const template of TEMPLATES) {
      const viewKeys = template.views.map((v) => v.key);
      expect(new Set(viewKeys).size).toBe(viewKeys.length);

      for (const view of template.views) {
        expect(view.key).toMatch(/^[a-z0-9_]{2,40}$/);
        expect(view.canvas.w).toBeGreaterThan(0);
        expect(view.canvas.h).toBeGreaterThan(0);

        const { x, y, w, h } = view.printArea;
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(view.canvas.w);
        expect(y + h).toBeLessThanOrEqual(view.canvas.h);
      }
    }
  });

  it("colors and sizes have unique machine keys and well-formed hex tones", () => {
    for (const template of TEMPLATES) {
      expect(new Set(template.colors.map((c) => c.key)).size).toBe(
        template.colors.length
      );
      expect(new Set(template.sizes.map((s) => s.key)).size).toBe(
        template.sizes.length
      );
      for (const color of template.colors) {
        expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
        expect(color.shadeHex).toMatch(/^#[0-9a-f]{6}$/i);
        expect(color.name).toBeTruthy();
        expect(color.nameAr).toBeTruthy();
      }
      for (const size of template.sizes) {
        expect(size.name).toBeTruthy();
        expect(size.label).toBeTruthy();
      }
    }
  });

  it("body and overlay emit SVG markup without scripting", () => {
    for (const template of TEMPLATES) {
      for (const view of template.views) {
        for (const color of template.colors) {
          const body = template.body(view.key, color);
          expect(typeof body).toBe("string");
          expect(body.length).toBeGreaterThan(20);
          expect(body).toContain("<");
          expect(body.toLowerCase()).not.toContain("<script");
          expect(body.toLowerCase()).not.toContain("onload");
          expect(body).toContain(color.hex);

          const overlay = template.overlay?.(view.key, color) ?? "";
          expect(typeof overlay).toBe("string");
          expect(overlay.toLowerCase()).not.toContain("<script");
        }
      }
    }
  });

  it("lookups resolve real keys and return null for unknown ones", () => {
    expect(getTemplate("mug")?.key).toBe("mug");
    expect(getTemplate("toaster")).toBeNull();
    expect(isTemplateKey("phone_case")).toBe(true);
    expect(isTemplateKey("laptop")).toBe(false);

    const shirt = getTemplate("tshirt") as ProductTemplate;
    expect(getView(shirt, "front")?.printArea.w).toBe(300);
    expect(getView(shirt, "side")).toBeNull();
    expect(getColor(shirt, "navy")?.hex).toBe("#26324f");
    expect(getColor(shirt, "chartreuse")).toBeNull();
  });
});

// --- placement --------------------------------------------------------------

describe("computeMockupPlacement", () => {
  const tshirtFront = getView(
    getTemplate("tshirt") as ProductTemplate,
    "front"
  ) as ProductTemplate["views"][number];

  it("maps the design area with a uniform fit-inside scale, centered", () => {
    // print 300×400, design area 12×12 → scale = min(25, 33.33) = 25
    const placement = computeMockupPlacement({
      view: tshirtFront,
      transform: TRANSFORM,
    });
    expect(placement).toEqual({ x: 500, y: 490, width: 150, height: 150, rotation: 0 });
  });

  it("maps edge offsets linearly (right edge of the design area = right edge of the print area)", () => {
    const placement = computeMockupPlacement({
      view: tshirtFront,
      transform: { cx: 6, cy: 0, width: 6, height: 6, rotation: 0 },
    });
    // center (500 + 6·25) = 650 = printArea.x + printArea.w
    expect(placement?.x).toBe(650);
    expect(placement?.y).toBe(490);
  });

  it("passes rotation through unchanged and scales non-square areas by the smaller ratio", () => {
    const placement = computeMockupPlacement({
      view: tshirtFront,
      transform: { cx: -1, cy: 3, width: 12, height: 4, rotation: 45 },
    });
    expect(placement).toEqual({ x: 475, y: 565, width: 300, height: 100, rotation: 45 });
  });

  it("honors an explicit design area", () => {
    const placement = computeMockupPlacement({
      view: tshirtFront,
      transform: { cx: 0, cy: 0, width: 6, height: 6, rotation: 0 },
      designArea: { widthIn: 6, heightIn: 6 },
    });
    // scale = min(300/6, 400/6) = 50 → 6in artwork fills 300 units
    expect(placement?.width).toBe(300);
    expect(placement?.height).toBe(300);
  });

  it("returns null instead of NaN for unusable input", () => {
    expect(
      computeMockupPlacement({
        view: tshirtFront,
        transform: { ...TRANSFORM, rotation: Number.NaN },
      })
    ).toBeNull();
    expect(
      computeMockupPlacement({
        view: tshirtFront,
        transform: { ...TRANSFORM, width: 0 },
      })
    ).toBeNull();
    expect(
      computeMockupPlacement({
        view: { ...tshirtFront, printArea: { x: 0, y: 0, w: 0, h: 10 } },
        transform: TRANSFORM,
      })
    ).toBeNull();
    expect(
      computeMockupPlacement({
        view: tshirtFront,
        transform: TRANSFORM,
        designArea: { widthIn: 0, heightIn: 12 },
      })
    ).toBeNull();
  });
});

// --- SVG compositor ---------------------------------------------------------

describe("buildMockupSvg", () => {
  it("composes backdrop → body → artwork → overlay and keeps the viewBox", () => {
    const svg = buildMockupSvg({
      template: getTemplate("phone_case") as ProductTemplate,
      viewKey: "back",
      colorKey: "black",
      artworkHref: PNG_DATA_URL,
      transform: TRANSFORM,
    });
    expect(svg).not.toBeNull();
    const markup = svg as string;

    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain(`viewBox="0 0 600 1200"`);
    expect(markup).toContain(MOCKUP_BACKDROP);

    const backdrop = markup.indexOf(`fill="${MOCKUP_BACKDROP}"`);
    const body = markup.indexOf("rect", backdrop + 1);
    const artwork = markup.indexOf("<image");
    const overlay = markup.indexOf(`rx="48"`, artwork); // camera module
    expect(backdrop).toBeGreaterThanOrEqual(0);
    expect(body).toBeGreaterThan(backdrop);
    expect(artwork).toBeGreaterThan(body);
    expect(overlay).toBeGreaterThan(artwork);

    expect(markup).toContain(PNG_DATA_URL);
    expect(markup).toContain("preserveAspectRatio=\"none\"");
    expect(markup.toLowerCase()).not.toContain("<script");
  });

  it("rotates the artwork around its center via the group transform", () => {
    const svg = buildMockupSvg({
      template: getTemplate("mug") as ProductTemplate,
      viewKey: "front",
      colorKey: "white",
      artworkHref: PNG_DATA_URL,
      transform: { cx: 10, cy: -10, width: 4, height: 3, rotation: 30 },
    }) as string;
    // print 430×300 → scale = min(430/12, 300/12) = 25;
    // center = (215 + 215 + 10·25, 200 + 150 − 10·25) = (680, 100)
    expect(svg).toContain('<g transform="translate(680 100) rotate(30)">');
    expect(svg).toContain(`width="${4 * 25}" height="${3 * 25}"`);
  });

  it("renders a blank product when no artwork href is supplied", () => {
    const svg = buildMockupSvg({
      template: getTemplate("tote_bag") as ProductTemplate,
      viewKey: "front",
      colorKey: "natural",
      artworkHref: null,
      transform: TRANSFORM,
    }) as string;
    expect(svg).not.toContain("<image");
    expect(svg).toContain("#e8dcc6");
  });

  it("rejects non-image hrefs (markup can never enter an <image>)", () => {
    expect(safeImageHref("javascript:alert(1)")).toBeNull();
    expect(safeImageHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeImageHref(`data:image/png;base64,abc" onload="x`)).toBeNull();
    expect(safeImageHref(PNG_DATA_URL)).toBe(PNG_DATA_URL);

    const svg = buildMockupSvg({
      template: getTemplate("poster") as ProductTemplate,
      viewKey: "front",
      colorKey: "white",
      artworkHref: "javascript:alert(1)",
      transform: TRANSFORM,
    }) as string;
    expect(svg).not.toContain("<image");
  });

  it("returns null for unknown view/color/transform", () => {
    const template = getTemplate("mug") as ProductTemplate;
    expect(
      buildMockupSvg({ template, viewKey: "side", colorKey: "white", transform: TRANSFORM })
    ).toBeNull();
    expect(
      buildMockupSvg({ template, viewKey: "front", colorKey: "gold", transform: TRANSFORM })
    ).toBeNull();
    expect(
      buildMockupSvg({
        template,
        viewKey: "front",
        colorKey: "white",
        transform: { ...TRANSFORM, cx: Number.NaN },
      })
    ).toBeNull();
  });
});

// --- storage paths ----------------------------------------------------------

describe("mockupStoragePath", () => {
  it("is deterministic, hash-suffixed and nested under the design", () => {
    const path = mockupStoragePath(
      "design-1",
      "tshirt",
      "front",
      "black",
      "a".repeat(64)
    );
    expect(path).toBe(`mockups/design-1/tshirt/front-black-${"a".repeat(64)}.png`);
    expect(mockupPublicPath(path)).toBe(path);
  });

  it("changes when any catalog coordinate changes", () => {
    const base = mockupStoragePath("d", "tshirt", "front", "black", "h");
    expect(mockupStoragePath("d", "mug", "front", "black", "h")).not.toBe(base);
    expect(mockupStoragePath("d", "tshirt", "back", "black", "h")).not.toBe(base);
    expect(mockupStoragePath("d", "tshirt", "front", "white", "h")).not.toBe(base);
  });
});

// --- sha256 -----------------------------------------------------------------

describe("sha256Hex", () => {
  it("matches the published known-answer vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
    );
  });

  it("agrees with node:crypto across single-block, multi-block and byte inputs", () => {
    const inputs: Array<string | Uint8Array> = [
      "x",
      "a".repeat(55), // one block minus padding boundary
      "b".repeat(56), // forces length field into block 2
      "c".repeat(64),
      "d".repeat(1000),
      JSON.stringify(config()),
      new Uint8Array([0, 1, 2, 253, 254, 255]),
      new Uint8Array(0),
    ];
    for (const input of inputs) {
      const expected =
        typeof input === "string"
          ? createHash("sha256").update(input, "utf8").digest("hex")
          : createHash("sha256").update(Buffer.from(input)).digest("hex");
      expect(sha256Hex(input)).toBe(expected);
    }
  });
});

// --- canonical JSON + config hash -------------------------------------------

describe("canonicalJson", () => {
  it("is independent of key insertion order, recursively", () => {
    const a = { z: 1, m: { y: [3, 2], b: null }, a: "first" };
    const b = { a: "first", m: { b: null, y: [3, 2] }, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":"first","m":{"b":null,"y":[3,2]},"z":1}');
  });

  it("preserves array order (order is data) and drops undefined members", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ keep: 1, drop: undefined })).toBe('{"keep":1}');
  });

  it("renders primitives safely", () => {
    expect(canonicalJson("a\"b")).toBe(JSON.stringify("a\"b"));
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
  });
});

describe("mockupConfigHash", () => {
  it("equals sha256 of the canonical config", () => {
    const cfg = config();
    expect(mockupConfigHash(cfg)).toBe(sha256Hex(canonicalJson(cfg)));
    expect(mockupConfigHash(cfg)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across key order and sensitive to every field", () => {
    const base = config();
    const shuffled = {
      area: base.area,
      transform: { rotation: base.transform.rotation, height: base.transform.height, width: base.transform.width, cy: base.transform.cy, cx: base.transform.cx },
      fileId: base.fileId,
      color: base.color,
      view: base.view,
      template: base.template,
      renderer: base.renderer,
    } as MockupConfig;
    expect(mockupConfigHash(shuffled)).toBe(mockupConfigHash(base));

    const variants: Array<[string, MockupConfig]> = [
      ["renderer", config({ renderer: MOCKUP_RENDERER_VERSION + 1 })],
      ["template", config({ template: "mug" })],
      ["view", config({ view: "back" })],
      ["color", config({ color: "white" })],
      ["fileId", config({ fileId: "99999999-8888-7777-6666-555555555555" })],
      ["transform.cx", config({ transform: { ...base.transform, cx: base.transform.cx + 1 } })],
      ["transform.cy", config({ transform: { ...base.transform, cy: base.transform.cy + 1 } })],
      ["transform.width", config({ transform: { ...base.transform, width: 6.1 } })],
      ["transform.height", config({ transform: { ...base.transform, height: 7.6 } })],
      ["transform.rotation", config({ transform: { ...base.transform, rotation: 16 } })],
      ["area.widthIn", config({ area: { widthIn: 11, heightIn: 12 } })],
      ["area.heightIn", config({ area: { widthIn: 12, heightIn: 11 } })],
    ];
    const baseline = mockupConfigHash(base);
    for (const [label, variant] of variants) {
      expect(`${label}:${mockupConfigHash(variant)}`).not.toBe(`${label}:${baseline}`);
    }
  });
});
