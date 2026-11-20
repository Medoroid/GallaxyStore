/**
 * Unit tests for the Phase 7 pure publish validation module.
 *
 * `validatePublishInput` is the security boundary of the publish route: it
 * runs BEFORE any database read and decides exactly which fields a creator
 * may submit per target. Approval state, ownership, fulfillment and store
 * columns are structurally rejected (field_not_allowed), and gallery covers
 * are anchored to the design's own mockup namespace.
 */

import {
  GALLERY_ROW_SELECT,
  PUBLISH_GALLERY_FIELDS,
  PUBLISH_INPUT_LIMITS,
  PUBLISH_PRODUCT_FIELDS,
  normalizeGalleryRow,
  validatePublishInput,
} from "@/lib/design-studio/publish-input";

const DESIGN_ID = "11111111-1111-4111-8111-111111111111";
const ROW_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "ffffffff-0000-4000-8000-000000000002";

const product = (overrides: Record<string, unknown> = {}) => ({
  target: "product",
  design_product_id: ROW_ID,
  name: "Galaxy Tee",
  base_price: 450,
  ...overrides,
});

const gallery = (overrides: Record<string, unknown> = {}) => ({
  target: "gallery",
  title: "Nebula Poster",
  ...overrides,
});

describe("validatePublishInput — shape & allow-list", () => {
  it("rejects non-objects before anything else", () => {
    for (const bad of [null, undefined, "x", 42, [], true]) {
      expect(validatePublishInput(bad, { designId: DESIGN_ID })).toEqual({
        ok: false,
        code: "not_an_object",
      });
    }
  });

  it("requires an explicit target", () => {
    expect(validatePublishInput({}, { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_target",
      field: "target",
    });
    expect(
      validatePublishInput({ target: "design" }, { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_target", field: "target" });
  });

  it("structurally rejects protected PRODUCT fields (never self-approval)", () => {
    for (const field of [
      "status",
      "visibility",
      "product_id",
      "owner_id",
      "creator_profile_id",
      "design_id",
      "template_id",
      "mockups",
      "fulfillment_mode",
      "stock_buffer",
      "submitted_at",
      "rejection_reason",
      "slug",
      "store_id",
      "currency",
      "images",
      "category", // unknown key (correct key is category_id)
    ]) {
      expect(validatePublishInput(product({ [field]: "x" }), { designId: DESIGN_ID })).toEqual({
        ok: false,
        code: "field_not_allowed",
        field,
      });
    }
  });

  it("structurally rejects protected GALLERY fields", () => {
    for (const field of [
      "status",
      "visibility_public_only",
      "published_at",
      "reviewed_by",
      "owner_id",
      "product_id",
      "design_id",
      "preview_url",
    ]) {
      expect(validatePublishInput(gallery({ [field]: "x" }), { designId: DESIGN_ID })).toEqual({
        ok: false,
        code: "field_not_allowed",
        field,
      });
    }
    // `visibility` IS allowed for gallery — prove the allow-list is per-target.
    const allowed = validatePublishInput(
      gallery({ visibility: "unlisted" }),
      { designId: DESIGN_ID }
    );
    expect(allowed.ok).toBe(true);
  });

  it("keeps the declared field lists disjoint from protected columns", () => {
    expect([...PUBLISH_PRODUCT_FIELDS]).toEqual([
      "design_product_id",
      "name",
      "base_price",
      "compare_at_price",
      "description",
      "short_description",
      "category_id",
    ]);
    expect([...PUBLISH_GALLERY_FIELDS]).toEqual([
      "title",
      "description",
      "tags",
      "visibility",
      "preview_path",
    ]);
  });
});

describe("validatePublishInput — product values", () => {
  it("requires a uuid design_product_id", () => {
    expect(validatePublishInput(product({ design_product_id: undefined }), { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_product_id",
      field: "design_product_id",
    });
    expect(validatePublishInput(product({ design_product_id: "not-a-uuid" }), { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_product_id",
      field: "design_product_id",
    });
  });

  it("accepts the full product payload with normalization", () => {
    const result = validatePublishInput(
      product({
        name: "  Galaxy Tee  ",
        base_price: "450.5",
        compare_at_price: 600,
        description: "A tee.",
        short_description: "Tee",
        category_id: CATEGORY_ID.toUpperCase(),
      }),
      { designId: DESIGN_ID }
    );
    expect(result).toEqual({
      ok: true,
      value: {
        target: "product",
        designProductId: ROW_ID,
        name: "Galaxy Tee",
        basePrice: 450.5,
        compareAtPrice: 600,
        description: "A tee.",
        shortDescription: "Tee",
        categoryId: CATEGORY_ID,
      },
    });
  });

  it("treats absent / empty optional text as null (design-title fallback)", () => {
    const result = validatePublishInput(
      product({ name: "   ", description: null, short_description: undefined }),
      { designId: DESIGN_ID }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.target).toBe("product");
      if (result.value.target === "product") {
        expect(result.value.name).toBeNull();
        expect(result.value.description).toBeNull();
        expect(result.value.shortDescription).toBeNull();
        expect(result.value.categoryId).toBeNull();
        expect(result.value.compareAtPrice).toBeNull();
      }
    }
  });

  it("rejects a missing or out-of-range base price", () => {
    for (const bad of [undefined, null, "", "abc", -1, Number.NaN, 100000000]) {
      const result = validatePublishInput(product({ base_price: bad }), { designId: DESIGN_ID });
      expect(result).toEqual({ ok: false, code: "invalid_price", field: "base_price" });
    }
    // Boundary: max price is accepted.
    const max = validatePublishInput(product({ base_price: 99999999 }), { designId: DESIGN_ID });
    expect(max.ok).toBe(true);
  });

  it("rejects a bad compare-at price but allows zero", () => {
    expect(
      validatePublishInput(product({ compare_at_price: -5 }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_price", field: "compare_at_price" });
    expect(
      validatePublishInput(product({ compare_at_price: "nope" }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_price", field: "compare_at_price" });
    const zero = validatePublishInput(product({ compare_at_price: 0 }), { designId: DESIGN_ID });
    expect(zero.ok).toBe(true);
  });

  it("enforces name / description / short_description bounds", () => {
    expect(
      validatePublishInput(product({ name: "x".repeat(201) }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_name", field: "name" });
    expect(
      validatePublishInput(product({ name: 42 }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_name", field: "name" });
    expect(
      validatePublishInput(product({ description: "x".repeat(5001) }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_description", field: "description" });
    expect(
      validatePublishInput(product({ short_description: "x".repeat(1001) }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_description", field: "short_description" });
  });

  it("validates category_id as a uuid or null", () => {
    expect(
      validatePublishInput(product({ category_id: "nope" }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_category", field: "category_id" });
    const ok = validatePublishInput(product({ category_id: null }), { designId: DESIGN_ID });
    expect(ok.ok).toBe(true);
  });
});

describe("validatePublishInput — gallery values", () => {
  it("title: optional but 2..120 when present", () => {
    const absent = validatePublishInput(gallery({ title: undefined }), { designId: DESIGN_ID });
    expect(absent.ok).toBe(true);

    expect(validatePublishInput(gallery({ title: "A" }), { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_title",
      field: "title",
    });
    expect(validatePublishInput(gallery({ title: "x".repeat(121) }), { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_title",
      field: "title",
    });
    expect(validatePublishInput(gallery({ title: "  ok  " }), { designId: DESIGN_ID })).toEqual({
      ok: true,
      value: {
        target: "gallery",
        title: "ok",
        description: null,
        tags: [],
        visibility: "public",
        previewPath: null,
      },
    });
  });

  it("description is bounded at the DDL limit (2000)", () => {
    expect(
      validatePublishInput(gallery({ description: "x".repeat(2001) }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_description", field: "description" });
    const ok = validatePublishInput(gallery({ description: "x".repeat(2000) }), { designId: DESIGN_ID });
    expect(ok.ok).toBe(true);
  });

  it("tags: array-only, bounded, trimmed, deduped, empty dropped", () => {
    expect(validatePublishInput(gallery({ tags: "poster,art" }), { designId: DESIGN_ID })).toEqual({
      ok: false,
      code: "invalid_tags",
      field: "tags",
    });
    expect(
      validatePublishInput(gallery({ tags: new Array(31).fill("t") }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_tags", field: "tags" });
    expect(
      validatePublishInput(gallery({ tags: ["x".repeat(41)] }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_tags", field: "tags" });

    const result = validatePublishInput(
      gallery({ tags: [" space ", "space", "", "art", "art"] }),
      { designId: DESIGN_ID }
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value.target === "gallery") {
      expect(result.value.tags).toEqual(["space", "art"]);
    }
  });

  it("visibility defaults to public and only accepts the two known values", () => {
    const dflt = validatePublishInput(gallery({}), { designId: DESIGN_ID });
    expect(dflt.ok).toBe(true);
    if (dflt.ok && dflt.value.target === "gallery") {
      expect(dflt.value.visibility).toBe("public");
    }
    expect(
      validatePublishInput(gallery({ visibility: "secret" }), { designId: DESIGN_ID })
    ).toEqual({ ok: false, code: "invalid_visibility", field: "visibility" });
    const unlisted = validatePublishInput(gallery({ visibility: "unlisted" }), { designId: DESIGN_ID });
    expect(unlisted.ok).toBe(true);
  });

  it("anchors preview_path to this design's mockup namespace", () => {
    expect(
      validatePublishInput(gallery({ preview_path: `mockups/${DESIGN_ID}/front-black-abc.png` }), {
        designId: DESIGN_ID,
      }).ok
    ).toBe(true);
    expect(
      validatePublishInput(
        gallery({ preview_path: "mockups/99999999-9999-4999-8999-999999999999/steal.png" }),
        { designId: DESIGN_ID }
      )
    ).toEqual({ ok: false, code: "invalid_preview_path", field: "preview_path" });
    expect(
      validatePublishInput(gallery({ preview_path: "https://evil.example/x.png" }), {
        designId: DESIGN_ID,
      })
    ).toEqual({ ok: false, code: "invalid_preview_path", field: "preview_path" });
    // Over-long paths are rejected by the shared bound.
    expect(
      validatePublishInput(gallery({ preview_path: `mockups/${DESIGN_ID}/${"x".repeat(500)}` }), {
        designId: DESIGN_ID,
      })
    ).toEqual({ ok: false, code: "invalid_preview_path", field: "preview_path" });
  });
});

describe("gallery row normalization", () => {
  it("selects the readable columns and nothing writable-by-client", () => {
    expect(GALLERY_ROW_SELECT).toContain("id, design_id, owner_id, creator_profile_id");
    expect(GALLERY_ROW_SELECT).toContain("status, rejection_reason, reviewed_by, reviewed_at");
    expect(GALLERY_ROW_SELECT).toContain("submitted_at, published_at, product_id");
  });

  it("normalizes a raw row defensively (tags array, nulls, strings)", () => {
    const view = normalizeGalleryRow({
      id: "a",
      design_id: "b",
      title: "T",
      description: null,
      preview_path: null,
      tags: ["art", 7, null, "poster"],
      visibility: "unlisted",
      status: "pending_review",
      rejection_reason: null,
      submitted_at: "2026-11-10T00:00:00.000Z",
      published_at: null,
      product_id: null,
      created_at: "c",
      updated_at: "u",
    });
    expect(view.tags).toEqual(["art", "poster"]);
    expect(view.visibility).toBe("unlisted");
    expect(view.status).toBe("pending_review");
    expect(view.published_at).toBeNull();
  });

  it("degrades missing fields to safe defaults", () => {
    const view = normalizeGalleryRow({});
    expect(view).toEqual({
      id: "",
      design_id: "",
      title: "",
      description: null,
      preview_path: null,
      tags: [],
      visibility: "public",
      status: "draft",
      rejection_reason: null,
      submitted_at: null,
      published_at: null,
      product_id: null,
      created_at: "",
      updated_at: "",
    });
  });

  it("publish limits mirror the DDL checks", () => {
    expect(PUBLISH_INPUT_LIMITS.maxTags).toBe(30);
    expect(PUBLISH_INPUT_LIMITS.maxTagLength).toBe(40);
    expect(PUBLISH_INPUT_LIMITS.galleryTitleMin).toBe(2);
    expect(PUBLISH_INPUT_LIMITS.galleryTitleMax).toBe(120);
    expect(PUBLISH_INPUT_LIMITS.galleryDescription).toBe(2000);
    expect(PUBLISH_INPUT_LIMITS.maxPrice).toBe(99999999);
  });
});
