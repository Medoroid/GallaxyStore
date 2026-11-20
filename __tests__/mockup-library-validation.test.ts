/**
 * @jest-environment node
 *
 * Admin template validation contracts: the database row is untrusted input
 * even when only admins write it, because its SVG fragments are rendered into
 * public mockups. These tests prove scripts/event handlers/external refs and
 * malformed geometry are rejected before composition.
 */

import {
  sanitizeSvgFragment,
  isDangerousFragment,
} from "@/lib/mockup-library/sanitize";
import {
  validateTemplatePayload,
  templateToRow,
  rowToTemplate,
} from "@/lib/mockup-library/validate";
import { composeMockup } from "@/lib/mockup-library/compose";

const VALID = {
  template_key: "custom_tee",
  name: "Custom Tee",
  category: "apparel",
  dimensionsMm: { w: 560, h: 700 },
  colors: [{ key: "black", name: "Black", hex: "#1f1f26", shadeHex: "#000000" }],
  sizes: [{ key: "m", name: "Medium", label: "M" }],
  views: [{
    key: "front",
    label: "Front",
    canvas: { w: 1000, h: 1000 },
    printArea: { x: 350, y: 290, w: 300, h: 400 },
    maskPath: "M 350 290 H 650 V 690 H 350 Z",
  }],
  bodySvg: '<path d="M 0 0 H 100 V 100 Z" fill="{{hex}}"/>',
  provenance: { source: "original-vector", author: "Galaxy Store", license: "CC0-1.0" },
  is_active: true,
};

describe("sanitizeSvgFragment", () => {
  it("keeps safe geometry and colour tokens", () => {
    const safe = '<path d="M0 0H10V10Z" fill="{{hex}}" stroke="{{shade}}" stroke-width="3"/>';
    expect(sanitizeSvgFragment(safe)).toBe(safe);
    expect(isDangerousFragment(safe)).toBe(false);
  });

  it("removes scripts, event handlers and foreign objects", () => {
    const unsafe =
      '<g onload="alert(1)"><script>alert(2)</script>' +
      '<foreignObject><div>x</div></foreignObject>' +
      '<path d="M0 0H10" fill="#000"/></g>';
    const clean = sanitizeSvgFragment(unsafe);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("foreignObject");
    expect(clean).not.toContain("<div");
    expect(clean).toContain('<path d="M0 0H10" fill="#000"/>');
    expect(isDangerousFragment(unsafe)).toBe(true);
  });

  it("rejects external references and javascript URLs", () => {
    const clean = sanitizeSvgFragment(
      '<image href="https://evil.example/x.png"/>' +
      '<rect fill="url(https://evil.example/x)" width="10"/>' +
      '<circle r="5" onclick="x()"/>'
    );
    expect(clean).not.toContain("href");
    expect(clean).not.toContain("url(https");
    expect(clean).not.toContain("onclick");
  });
});

describe("validateTemplatePayload", () => {
  it("accepts a complete valid payload and normalises row fields", () => {
    const result = validateTemplatePayload(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.key).toBe("custom_tee");
    expect(result.value.isActive).toBe(true);
    const row = templateToRow(result.value);
    expect(row.template_key).toBe("custom_tee");
    expect(row.dimensions_mm).toEqual({ w: 560, h: 700 });
    expect(row.provenance.source).toBe("original-vector");
    expect(rowToTemplate(row).views).toHaveLength(1);
  });

  it("drops unknown fields (protection of ownership/approval fields)", () => {
    const result = validateTemplatePayload({ ...VALID, owner_id: "someone", status: "approved" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = templateToRow(result.value) as Record<string, unknown>;
    expect(row.owner_id).toBeUndefined();
    expect(row.status).toBeUndefined();
  });

  it("rejects invalid template keys and names", () => {
    expect(validateTemplatePayload({ ...VALID, template_key: "BAD KEY" }).ok).toBe(false);
    expect(validateTemplatePayload({ ...VALID, name: "" }).ok).toBe(false);
  });

  it("rejects malformed geometry, masks and perspective", () => {
    expect(validateTemplatePayload({
      ...VALID,
      views: [{ ...VALID.views[0], printArea: { x: 0, y: 0, w: -3, h: 10 } }],
    }).ok).toBe(false);
    expect(validateTemplatePayload({
      ...VALID,
      views: [{ ...VALID.views[0], maskPath: 'M0 0 " onload="x' }],
    }).ok).toBe(false);
    expect(validateTemplatePayload({
      ...VALID,
      views: [{ ...VALID.views[0], perspective: "matrix(1 0 0 1 0 0);alert(1)" }],
    }).ok).toBe(false);
  });

  it("rejects bad colours and duplicate keys", () => {
    expect(validateTemplatePayload({
      ...VALID,
      colors: [{ key: "x", name: "X", hex: "red", shadeHex: "#000" }],
    }).ok).toBe(false);
    expect(validateTemplatePayload({
      ...VALID,
      views: [VALID.views[0], { ...VALID.views[0] }],
    }).ok).toBe(false);
  });

  it("sanitises SVG layers so a saved template cannot inject scripts", () => {
    const result = validateTemplatePayload({
      ...VALID,
      bodySvg: '<script>alert(1)</script><path d="M0 0H10" fill="{{hex}}"/>',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bodySvg).not.toContain("script");
    const composed = composeMockup({
      template: result.value,
      viewKey: "front",
      colorKey: "black",
      transform: { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 },
    });
    expect(composed?.svg).not.toContain("script");
    expect(composed?.svg).not.toContain("onload");
  });

  it("rejects invalid store product/variant links", () => {
    expect(validateTemplatePayload({ ...VALID, store_product_id: "not-a-uuid" }).ok).toBe(false);
    const good = validateTemplatePayload({
      ...VALID,
      store_product_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(good.ok).toBe(true);
  });
});
