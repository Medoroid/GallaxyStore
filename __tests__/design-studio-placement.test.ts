import {
  alignTransform,
  angleAt,
  artworkRatio,
  bounds,
  clampSize,
  clampTransform,
  clampZoom,
  detectOverflow,
  effectiveDpi,
  fitIntoBox,
  fitTransform,
  moveBy,
  normalizeRotation,
  resizeFromHandle,
  rotateBy,
  snapRotation,
} from "@/lib/design-studio/placement";
import {
  DEFAULT_PRINTABLE_AREA,
  MAX_ZOOM,
  MIN_ARTWORK_IN,
  MIN_ZOOM,
  PRINT_DPI_MIN,
  SIZE_MAX_FACTOR,
  type PrintableArea,
  type Transform,
} from "@/lib/design-studio/types";

const area: PrintableArea = { widthIn: 12, heightIn: 12 };

function t(partial: Partial<Transform> = {}): Transform {
  return { cx: 0, cy: 0, width: 4, height: 2, rotation: 0, ...partial };
}

describe("fitTransform / fitIntoBox", () => {
  it("fits a wide artwork to the area width, centered", () => {
    const fit = fitTransform(area, 2);
    expect(fit.width).toBeCloseTo(12 * 0.92, 5);
    expect(fit.height).toBeCloseTo((12 * 0.92) / 2, 5);
    expect(fit.cx).toBe(0);
    expect(fit.cy).toBe(0);
    expect(fit.rotation).toBe(0);
    // aspect preserved
    expect(fit.width / fit.height).toBeCloseTo(2, 5);
  });

  it("fits a tall artwork to the area height", () => {
    const fit = fitTransform(area, 0.5);
    expect(fit.height).toBeCloseTo(12 * 0.92, 5);
    expect(fit.width).toBeCloseTo(12 * 0.92 * 0.5, 5);
  });

  it("inscribes the new artwork's ratio into the previous box without distortion", () => {
    // previous box4×2, new artwork is square →2×2 (height-bound)
    expect(fitIntoBox({ width: 4, height: 2 }, 1)).toEqual({ width: 2, height: 2 });
    // new artwork wider than the box → width-bound
    const wide = fitIntoBox({ width: 4, height: 2 }, 4);
    expect(wide.width).toBe(4);
    expect(wide.height).toBe(1);
    // same aspect → unchanged
    expect(fitIntoBox({ width: 4, height: 2 }, 2)).toEqual({ width: 4, height: 2 });
  });
});

describe("move / rotate / zoom", () => {
  it("moves by delta", () => {
    const moved = moveBy(t({ cx: 1, cy: 1 }), 2, -0.5);
    expect(moved.cx).toBe(3);
    expect(moved.cy).toBe(0.5);
  });

  it("normalizes rotation into [0, 360)", () => {
    expect(normalizeRotation(-10)).toBe(350);
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it("rotates cumulatively and stays normalized", () => {
    const rotated = rotateBy(t({ rotation: 350 }), 30);
    expect(rotated.rotation).toBe(20);
  });

  it("snaps rotation to 15° steps", () => {
    expect(snapRotation(7)).toBe(0);
    expect(snapRotation(8)).toBe(15);
    expect(snapRotation(-10)).toBe(345);
    expect(snapRotation(100, 45)).toBe(90);
  });

  it("clamps zoom into the legal range", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("artworkRatio", () => {
  it("computes width/height when pixel dims exist", () => {
    expect(artworkRatio(100, 50)).toBe(2);
  });

  it("falls back safely for unknown dims (SVG without viewBox)", () => {
    expect(artworkRatio(null, null)).toBe(1);
    expect(artworkRatio(0, 10)).toBe(1);
    expect(artworkRatio(null, null, 1.5)).toBe(1.5);
  });
});

describe("bounds / detectOverflow (boundaries)", () => {
  it("computes axis-aligned bounds for an unrotated box", () => {
    expect(bounds(t({ cx: 1, width: 4, height: 2 }))).toEqual({
      minX: -1,
      minY: -1,
      maxX: 3,
      maxY: 1,
    });
  });

  it("inflates bounds under rotation (2×1 at 90° becomes 1×2)", () => {
    const box = bounds(t({ width: 4, height: 2, rotation: 90 }));
    expect(box.maxX).toBeCloseTo(1, 5);
    expect(box.maxY).toBeCloseTo(2, 5);
    expect(box.minX).toBeCloseTo(-1, 5);
  });

  it("reports no overflow when fully inside", () => {
    const report = detectOverflow(t({ width: 4, height: 2 }), area);
    expect(report.overflows).toBe(false);
    expect(report.sides).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it("flags exactly the sides that cross the printable edge", () => {
    const report = detectOverflow(t({ cx: 6.5, width: 4, height: 2 }), area);
    expect(report.overflows).toBe(true);
    expect(report.sides.right).toBe(true);
    expect(report.sides.left).toBe(false);
    expect(report.sides.top).toBe(false);
    expect(report.sides.bottom).toBe(false);
  });

  it("detects overflow caused purely by rotation", () => {
    // Fits unrotated (11×8 inside 12×12), pokes out when spun to 45°:
    // half-extent becomes (5.5+4)/√2 ≈ 6.72 > 6
    const straight = detectOverflow(t({ width: 11, height: 8 }), area);
    expect(straight.overflows).toBe(false);
    const spun = detectOverflow(t({ width: 11, height: 8, rotation: 45 }), area);
    expect(spun.overflows).toBe(true);
    expect(spun.sides.left && spun.sides.right && spun.sides.top && spun.sides.bottom).toBe(
      true
    );
  });
});

describe("effectiveDpi (resolution warnings)", () => {
  it("computes print DPI from pixels ÷ inches on both axes", () => {
    const result = effectiveDpi(t({ width: 4, height: 4 }), { widthPx: 2000, heightPx: 2000 });
    expect(result.dpi).toBe(500);
    expect(result.low).toBe(false);
  });

  it("uses the weaker axis (contain behaviour)", () => {
    const result = effectiveDpi(t({ width: 10, height: 4 }), { widthPx: 2000, heightPx: 5000 });
    expect(result.dpi).toBe(200); // 2000/10 vs 1250 → min
    expect(result.low).toBe(result.dpi! < PRINT_DPI_MIN);
  });

  it("flags low effective resolution", () => {
    const result = effectiveDpi(t({ width: 20, height: 20 }), { widthPx: 2000, heightPx: 2000 });
    expect(result.dpi).toBe(100);
    expect(result.low).toBe(true);
  });

  it("makes no claim for vectors (SVG) or degenerate boxes", () => {
    expect(effectiveDpi(t(), { widthPx: null, heightPx: null })).toEqual({
      dpi: null,
      low: false,
    });
    expect(effectiveDpi(t({ width: 0 }), { widthPx: 100, heightPx: 100 })).toEqual({
      dpi: null,
      low: false,
    });
  });
});

describe("alignTransform", () => {
  it("centers on the requested axis", () => {
    const centered = alignTransform(t({ cx: 3, cy: -2 }), area, "centerX");
    expect(centered.cx).toBe(0);
    expect(centered.cy).toBe(-2); // untouched
    const middle = alignTransform(t({ cx: 3, cy: -2 }), area, "middleY");
    expect(middle.cy).toBe(0);
    expect(middle.cx).toBe(3);
  });

  it("flushes edges to the printable boundary", () => {
    const right = alignTransform(t({ cx: -4 }), area, "right");
    expect(bounds(right).maxX).toBeCloseTo(6, 5);
    const left = alignTransform(t({ cx: 4 }), area, "left");
    expect(bounds(left).minX).toBeCloseTo(-6, 5);
    const bottom = alignTransform(t({ cy: -4 }), area, "bottom");
    expect(bounds(bottom).maxY).toBeCloseTo(6, 5);
    const top = alignTransform(t({ cy: 4 }), area, "top");
    expect(bounds(top).minY).toBeCloseTo(-6, 5);
  });

  it("aligns by rotated bounds, not the raw box", () => {
    const rotated = alignTransform(t({ rotation: 45, width: 4, height: 4 }), area, "right");
    expect(bounds(rotated).maxX).toBeCloseTo(6, 5);
  });
});

describe("clampSize / clampTransform", () => {
  it("clamps both edges independently when aspect is free", () => {
    const clamped = clampSize(999, 0.01, area);
    expect(clamped.width).toBe(12 * SIZE_MAX_FACTOR);
    expect(clamped.height).toBe(MIN_ARTWORK_IN);
  });

  it("keeps the aspect while clamping", () => {
    const clamped = clampSize(999, 499.5, area, true); // input aspect w/h = 2
    expect(clamped.width / clamped.height).toBeCloseTo(2, 5);
    expect(clamped.width).toBeLessThanOrEqual(12 * SIZE_MAX_FACTOR);
    expect(clamped.height).toBeGreaterThanOrEqual(MIN_ARTWORK_IN);
  });

  it("clamps a transform's size without touching position", () => {
    const result = clampTransform(t({ cx: 2, cy: 1, width: 500, height: 500 }), area);
    expect(result.cx).toBe(2);
    expect(result.cy).toBe(1);
    expect(result.width).toBe(24);
    expect(result.height).toBe(24);
  });
});

describe("resizeFromHandle — scale, aspect, rotation, boundaries", () => {
  it("resizes from a corner with the opposite anchor pinned", () => {
    // drag 'se' outward: top-left anchor must not move
    const resized = resizeFromHandle(t({ width: 4, height: 2 }), "se", { x: 6, y: 3 }, {
      aspectLocked: false,
      area,
    });
    // anchor was (-2,-1); box grew to 8×4 → center = (-2+8/2, -1+4/2) = (2,1)
    expect(resized.width).toBe(8);
    expect(resized.height).toBe(4);
    expect(resized.cx).toBe(2);
    expect(resized.cy).toBe(1);
    const box = bounds(resized);
    expect(box.minX).toBeCloseTo(-2, 5); // anchor x
    expect(box.minY).toBeCloseTo(-1, 5); // anchor y
  });

  it("preserves aspect exactly on a corner drag when locked", () => {
    const resized = resizeFromHandle(t({ width: 4, height: 2 }), "se", { x: 7, y: 4 }, {
      aspectLocked: true,
      area,
    });
    expect(resized.width / resized.height).toBeCloseTo(2, 10);
    // raw sizes (9,5) → proportional scale = max(9/4, 5/2) = 2.5 → (10,5)
    expect(resized.width).toBeCloseTo(10, 5);
    expect(resized.height).toBeCloseTo(5, 5);
  });

  it("frees the ratio on a corner drag when unlocked", () => {
    const resized = resizeFromHandle(t({ width: 4, height: 2 }), "se", { x: 7, y: 4 }, {
      aspectLocked: false,
      area,
    });
    expect(resized.width).toBe(9);
    expect(resized.height).toBe(5);
  });

  it("changes only the dragged edge on edge handles", () => {
    const north = resizeFromHandle(t({ width: 4, height: 2 }), "n", { x: 0, y: -3 }, {
      aspectLocked: false,
      area,
    });
    expect(north.width).toBe(4); // untouched
    expect(north.height).toBe(4); // anchor at y=1, pointer y=-3 → 4
    expect(north.cy).toBe(-1); // center follows so the bottom edge stays at 1
    expect(bounds(north).maxY).toBeCloseTo(1, 5);
  });

  it("derives the cross dimension on edge drags when aspect is locked", () => {
    const north = resizeFromHandle(t({ width: 4, height: 2 }), "n", { x: 0, y: -3 }, {
      aspectLocked: true,
      area,
    });
    expect(north.height).toBe(4);
    expect(north.width).toBe(8); // 4:2 ratio kept
    expect(north.width / north.height).toBeCloseTo(2, 10);
  });

  it("projects the pointer correctly under rotation", () => {
    const rotated = t({ cx: 1, cy: 2, width: 4, height: 2, rotation: 90 });
    const resized = resizeFromHandle(rotated, "ne", { x: 3, y: 4 }, {
      aspectLocked: true,
      area,
    });
    // vLocal after -90° projection = (4,-3); scale = max(4/4, 3/2) = 1.5
    expect(resized.width).toBeCloseTo(6, 5);
    expect(resized.height).toBeCloseTo(3, 5);
    expect(resized.rotation).toBe(90); // rotation untouched
    expect(resized.width / resized.height).toBeCloseTo(2, 10);
    expect(resized.cx).toBeCloseTo(1.5, 5);
    expect(resized.cy).toBeCloseTo(3, 5);
  });

  it("clamps oversized drags to the legal maximum", () => {
    const resized = resizeFromHandle(t({ width: 4, height: 2 }), "e", { x: 500, y: 0 }, {
      aspectLocked: false,
      area,
    });
    expect(resized.width).toBe(12 * SIZE_MAX_FACTOR);
  });

  it("clamps near-zero drags to the legal minimum", () => {
    const resized = resizeFromHandle(t({ width: 4, height: 2 }), "se", { x: -2, y: -1 }, {
      aspectLocked: false,
      area,
    });
    expect(resized.width).toBe(MIN_ARTWORK_IN);
    expect(resized.height).toBe(MIN_ARTWORK_IN);
  });
});

describe("angleAt (rotate handle)", () => {
  it("measures clockwise screen-space angles", () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 5);
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 5); // y grows downward
    expect(angleAt({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 5);
  });
});

describe("default area", () => {
  it("is a real square artboard, documented as the Phase 4 surface", () => {
    expect(DEFAULT_PRINTABLE_AREA.widthIn).toBeGreaterThan(0);
    expect(DEFAULT_PRINTABLE_AREA.widthIn).toBe(DEFAULT_PRINTABLE_AREA.heightIn);
  });
});
