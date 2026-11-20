/**
 * Phase 6 — pure product-configuration tests:
 *
 * validateProductCreate
 *   - allow-list (only template_key / selected_colors / selected_sizes),
 *     registry-validated template, selection bounds + dedupe, defaults
 * validateProductPatch
 *   - structural rejections: approval state, commerce link, fulfillment,
 *     ownership and `mockups` can never be submitted (self-approval and fake
 *     fulfillment are structurally impossible)
 *   - value validation against the row's template: colors/sizes must exist,
 *     view_states keys must be real views, numeric members bounded
 * normalizeViewState / normalizeProductRow
 *   - strict normalization, defensive defaults for malformed jsonb
 * applyViewState
 *   - effective placement math (offsets, scale, rotation, invalid → base)
 */

import { applyViewState } from "@/lib/design-studio/placement";
import {
  PRODUCT_INPUT_LIMITS,
  normalizeProductRow,
  normalizeViewState,
  validateProductCreate,
  validateProductPatch,
} from "@/lib/design-studio/product-input";
import type { Transform } from "@/lib/design-studio/types";
import { getTemplate } from "@/lib/design-studio/templates";

const shirt = getTemplate("tshirt")!;
const mug = getTemplate("mug")!;

const TRANSFORM: Transform = { cx: 1, cy: -2, width: 6, height: 7.5, rotation: 15 };

// --- create -----------------------------------------------------------------

describe("validateProductCreate", () => {
  it("rejects non-objects and unknown fields", () => {
    expect(validateProductCreate(null)).toEqual({ ok: false, code: "not_an_object" });
    expect(validateProductCreate("tshirt")).toEqual({ ok: false, code: "not_an_object" });
    expect(validateProductCreate([])).toEqual({ ok: false, code: "not_an_object" });

    const status = validateProductCreate({ template_key: "tshirt", status: "approved" });
    expect(status).toEqual({
      ok: false,
      code: "field_not_allowed",
      field: "status",
    });

    const ownership = validateProductCreate({
      template_key: "tshirt",
      creator_profile_id: "someone",
    });
    expect(ownership).toMatchObject({ ok: false, code: "field_not_allowed" });

    const fulfillment = validateProductCreate({
      template_key: "tshirt",
      fulfillment_mode: "configured",
    });
    expect(fulfillment).toMatchObject({ ok: false, code: "field_not_allowed" });
  });

  it("requires a registry-known template key", () => {
    expect(validateProductCreate({})).toEqual({
      ok: false,
      code: "invalid_template",
      field: "template_key",
    });
    expect(validateProductCreate({ template_key: 42 })).toEqual({
      ok: false,
      code: "invalid_template",
      field: "template_key",
    });
    expect(validateProductCreate({ template_key: "toaster" })).toEqual({
      ok: false,
      code: "invalid_template",
      field: "template_key",
    });
  });

  it("accepts a bare create with empty selection defaults", () => {
    const result = validateProductCreate({ template_key: "phone_case" });
    expect(result).toEqual({
      ok: true,
      value: { template_key: "phone_case", selected_colors: [], selected_sizes: [] },
    });
  });

  it("validates selections against the template and dedupes them", () => {
    const result = validateProductCreate({
      template_key: "tshirt",
      selected_colors: ["black", "navy", "black"],
      selected_sizes: ["s", "l"],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        template_key: "tshirt",
        selected_colors: ["black", "navy"],
        selected_sizes: ["s", "l"],
      },
    });

    // Unknown color / size for THIS template → rejected (mug has no "s").
    expect(
      validateProductCreate({ template_key: "tshirt", selected_colors: ["chartreuse"] })
    ).toEqual({ ok: false, code: "invalid_colors", field: "selected_colors" });
    expect(
      validateProductCreate({ template_key: "mug", selected_sizes: ["s"] })
    ).toEqual({ ok: false, code: "invalid_sizes", field: "selected_sizes" });
    expect(
      validateProductCreate({ template_key: "tshirt", selected_colors: "black" })
    ).toEqual({ ok: false, code: "invalid_colors", field: "selected_colors" });
  });

  it("enforces the DDL cardinality bound of 64 selections", () => {
    const colors = Array.from(
      { length: PRODUCT_INPUT_LIMITS.maxSelections + 1 },
      () => "black"
    );
    expect(
      validateProductCreate({ template_key: "tshirt", selected_colors: colors })
    ).toEqual({ ok: false, code: "invalid_colors", field: "selected_colors" });
  });
});

// --- patch ------------------------------------------------------------------

describe("validateProductPatch", () => {
  it("rejects non-objects and empty patches", () => {
    expect(validateProductPatch(null, shirt)).toEqual({
      ok: false,
      code: "not_an_object",
    });
    expect(validateProductPatch({}, shirt)).toEqual({
      ok: false,
      code: "empty_patch",
    });
    // A present-but-empty view_states map is a real operation — it clears
    // every placement override — so it is accepted, not rejected.
    expect(validateProductPatch({ view_states: {} }, shirt)).toEqual({
      ok: true,
      value: { view_states: {} },
    });
  });

  it("structurally rejects every protected field", () => {
    const protectedFields: Array<[string, unknown]> = [
      ["status", "approved"],
      ["rejection_reason", null],
      ["reviewed_by", "admin"],
      ["reviewed_at", "2026-01-01"],
      ["submitted_at", "2026-01-01"],
      ["product_id", "product-1"],
      ["fulfillment_mode", "configured"],
      ["stock_buffer", 99],
      ["mockups", []],
      ["design_id", "other"],
      ["template_id", "other"],
      ["creator_profile_id", "other"],
      ["deleted_at", null],
      ["id", "other"],
      ["created_at", "now"],
      ["updated_at", "now"],
    ];
    for (const [field, value] of protectedFields) {
      expect(validateProductPatch({ [field]: value }, shirt)).toEqual({
        ok: false,
        code: "field_not_allowed",
        field,
      });
    }
  });

  it("allows exactly the presentation trio", () => {
    const result = validateProductPatch(
      {
        selected_colors: ["black"],
        selected_sizes: ["m"],
        view_states: { front: { x: 1, y: -1, scale: 1.5, rotation: 90, lockAspect: true } },
      },
      shirt
    );
    expect(result).toEqual({
      ok: true,
      value: {
        selected_colors: ["black"],
        selected_sizes: ["m"],
        view_states: {
          front: { x: 1, y: -1, scale: 1.5, rotation: 90, lockAspect: true },
        },
      },
    });
  });

  it("validates selections against the row's own template", () => {
    expect(
      validateProductPatch({ selected_colors: ["mint"] }, shirt)
    ).toEqual({ ok: false, code: "invalid_colors", field: "selected_colors" });
    // …and the same color is legal on the mug:
    expect(validateProductPatch({ selected_colors: ["mint"] }, mug)).toEqual({
      ok: true,
      value: { selected_colors: ["mint"] },
    });
    expect(
      validateProductPatch({ selected_sizes: ["xxl"] }, mug)
    ).toEqual({ ok: false, code: "invalid_sizes", field: "selected_sizes" });
  });

  it("restricts view_states keys to the template's real views", () => {
    expect(
      validateProductPatch({ view_states: { side: { x: 0, y: 0 } } }, shirt)
    ).toEqual({ ok: false, code: "invalid_view_states", field: "view_states" });
    // mug has only `front` — `back` is unknown there:
    expect(
      validateProductPatch({ view_states: { back: { x: 0, y: 0 } } }, mug)
    ).toEqual({ ok: false, code: "invalid_view_states", field: "view_states" });
  });

  it("normalizes partial view states with honest defaults", () => {
    expect(validateProductPatch({ view_states: { back: { x: 2 } } }, shirt)).toEqual({
      ok: true,
      value: {
        view_states: { back: { x: 2, y: 0, scale: 1, rotation: 0, lockAspect: false } },
      },
    });
    // null clears an override instead of storing junk:
    expect(
      validateProductPatch({ view_states: { back: null, front: null } }, shirt)
    ).toEqual({ ok: true, value: { view_states: {} } });
  });

  it("rejects out-of-bounds or mistyped view-state members", () => {
    const badStates: unknown[] = [
      { x: Number.NaN },
      { x: "1" },
      { scale: 0 },
      { scale: PRODUCT_INPUT_LIMITS.maxScale + 1 },
      { rotation: -PRODUCT_INPUT_LIMITS.maxRotationDeg - 1 },
      { y: PRODUCT_INPUT_LIMITS.maxOffsetIn + 1 },
      { lockAspect: "yes" },
      "front",
      [1, 2],
      7,
    ];
    for (const state of badStates) {
      expect(
        validateProductPatch({ view_states: { front: state } }, shirt)
      ).toEqual({ ok: false, code: "invalid_view_states", field: "view_states" });
    }
  });

  it("bounds the number of view-state keys", () => {
    const many = Object.fromEntries(
      Array.from({ length: PRODUCT_INPUT_LIMITS.maxViewStates + 1 }, (_, i) => [
        `view_${i}`,
        { x: 0 },
      ])
    );
    expect(validateProductPatch({ view_states: many }, shirt)).toEqual({
      ok: false,
      code: "invalid_view_states",
      field: "view_states",
    });
  });
});

// --- normalizeViewState -----------------------------------------------------

describe("normalizeViewState", () => {
  it("fills missing members with neutral defaults", () => {
    expect(normalizeViewState({})).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      lockAspect: false,
    });
    expect(normalizeViewState(undefined)).toBeNull();
    expect(normalizeViewState(null)).toBeNull();
  });

  it("accepts values exactly at the bounds", () => {
    expect(
      normalizeViewState({
        x: -PRODUCT_INPUT_LIMITS.maxOffsetIn,
        y: PRODUCT_INPUT_LIMITS.maxOffsetIn,
        scale: PRODUCT_INPUT_LIMITS.maxScale,
        rotation: -PRODUCT_INPUT_LIMITS.maxRotationDeg,
        lockAspect: true,
      })
    ).toEqual({
      x: -PRODUCT_INPUT_LIMITS.maxOffsetIn,
      y: PRODUCT_INPUT_LIMITS.maxOffsetIn,
      scale: PRODUCT_INPUT_LIMITS.maxScale,
      rotation: -PRODUCT_INPUT_LIMITS.maxRotationDeg,
      lockAspect: true,
    });
  });

  it("rejects non-finite numbers, zero/negative scale and non-boolean flags", () => {
    expect(normalizeViewState({ x: Number.POSITIVE_INFINITY })).toBeNull();
    expect(normalizeViewState({ scale: 0 })).toBeNull();
    expect(normalizeViewState({ scale: -1 })).toBeNull();
    expect(normalizeViewState({ rotation: "90" })).toBeNull();
    expect(normalizeViewState({ lockAspect: 1 })).toBeNull();
    expect(normalizeViewState({ x: PRODUCT_INPUT_LIMITS.maxOffsetIn + 0.01 })).toBeNull();
  });
});

// --- normalizeProductRow ----------------------------------------------------

describe("normalizeProductRow", () => {
  const fullRow = {
    id: "row-1",
    design_id: "design-1",
    template_id: "tpl-1",
    view_states: { front: { x: 1, y: 0, scale: 1, rotation: 0, lockAspect: false } },
    selected_colors: ["black"],
    selected_sizes: ["m"],
    mockups: [
      {
        view: "front",
        color: "black",
        path: "mockups/x/front-black-0.png",
        width: 1000,
        height: 1000,
        config_hash: "a".repeat(64),
        generated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    status: "pending_review",
    rejection_reason: null,
    submitted_at: "2026-01-02T00:00:00.000Z",
    product_id: null,
    fulfillment_mode: "unconfigured",
    stock_buffer: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    creator_product_templates: {
      id: "tpl-1",
      template_key: "tshirt",
      name: "T-Shirt",
      name_ar: "تيشيرت",
      category: "apparel",
      is_active: true,
    },
  };

  it("maps a full row with its catalog embed", () => {
    const view = normalizeProductRow(fullRow);
    expect(view.id).toBe("row-1");
    expect(view.design_id).toBe("design-1");
    expect(view.template_key).toBe("tshirt");
    expect(view.status).toBe("pending_review");
    expect(view.selected_colors).toEqual(["black"]);
    expect(view.mockups).toHaveLength(1);
    expect(view.fulfillment_mode).toBe("unconfigured");
    expect(view.product_id).toBeNull();
  });

  it("degrades malformed jsonb to column defaults instead of undefined", () => {
    const view = normalizeProductRow({
      id: "row-2",
      view_states: "oops",
      selected_colors: "black",
      selected_sizes: [1, "m", null],
      mockups: { not: "an array" },
      status: 42,
      fulfillment_mode: null,
      stock_buffer: "ten",
      creator_product_templates: null,
    });
    expect(view.view_states).toEqual({});
    expect(view.selected_colors).toEqual([]);
    expect(view.selected_sizes).toEqual(["m"]);
    expect(view.mockups).toEqual([]);
    expect(view.status).toBe("draft");
    expect(view.fulfillment_mode).toBe("unconfigured");
    expect(view.stock_buffer).toBe(0);
    expect(view.template_key).toBe("");
    expect(view.rejection_reason).toBeNull();
  });
});

// --- applyViewState ---------------------------------------------------------

describe("applyViewState", () => {
  const base: Transform = TRANSFORM;

  it("returns the design transform when there is no state", () => {
    expect(applyViewState(base, null)).toBe(base);
    expect(applyViewState(base, undefined)).toBe(base);
  });

  it("applies offsets additively, scale multiplicatively and rotation as a delta", () => {
    expect(
      applyViewState(base, { x: 1, y: 2, scale: 2, rotation: 45, lockAspect: false })
    ).toEqual({
      cx: 2,
      cy: 0,
      width: 12,
      height: 15,
      rotation: 60,
    });
  });

  it("identity state leaves the transform numerically unchanged", () => {
    expect(
      applyViewState(base, { x: 0, y: 0, scale: 1, rotation: 0, lockAspect: true })
    ).toEqual(base);
  });

  it("falls back to the base transform for invalid states", () => {
    expect(
      applyViewState(base, { x: Number.NaN, y: 0, scale: 1, rotation: 0, lockAspect: false })
    ).toBe(base);
    expect(
      applyViewState(base, { x: 0, y: 0, scale: 0, rotation: 0, lockAspect: false })
    ).toBe(base);
    expect(
      applyViewState(base, { x: 0, y: 0, scale: -2, rotation: 0, lockAspect: false })
    ).toBe(base);
  });
});
