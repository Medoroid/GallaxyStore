/**
 * @jest-environment node
 *
 * Public Gift Box APIs:
 *   GET /api/gift-boxes       — published+visible boxes with real value math
 *   GET /api/gift-boxes/[id]  — box contents with public-link gating
 *
 * Invariants:
 *   - pending migration → storefront degrades silently (empty list /
 *     is_gift_box:false), never a 500
 *   - only published + visible + not deleted products are exposed
 *   - hidden/draft components are shown WITHOUT a link (publicly_accessible
 *     false, href null) so the UI never renders a dead URL
 *   - savings come from real prices (mixed currency → null, never fabricated)
 */

jest.mock("@/lib/gift-box-variant-options", () => ({
  loadVariantOptionLabels: jest.fn(async () => new Map()),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock("@/lib/api-errors", () => ({
  handleApiError: (_error: unknown, _context: string, fallback: string) =>
    Response.json({ success: false, message: fallback }, { status: 500 }),
}));

type Result = { data: unknown; error: { code?: string; message?: string } | null };

type ChainCall = { table: string; ops: string[]; eqs: Array<{ col: string; val: unknown }> };

const queues = new Map<string, Result[]>();
const chains: ChainCall[] = [];

function push(table: string, ...results: Result[]) {
  const entry = queues.get(table) ?? [];
  entry.push(...results);
  queues.set(table, entry);
}

function makeChain(table: string) {
  const ops: string[] = [];
  const eqs: Array<{ col: string; val: unknown }> = [];
  const record = () => chains.push({ table, ops: [...ops], eqs: [...eqs] });
  const finish = (): Result => {
    record();
    const entry = queues.get(table) ?? [];
    return entry.shift() ?? { data: [], error: null };
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit", "maybeSingle", "single"]) {
    chain[method] = (...args: unknown[]) => {
      ops.push(method);
      if (method === "eq") eqs.push({ col: String(args[0]), val: args[1] });
      if (method === "maybeSingle" || method === "single") return Promise.resolve(finish());
      return chain;
    };
  }
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(finish()).then(
      onFulfilled as (value: Result) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  return chain;
}

const mockDb = { from: (table: string) => makeChain(table) };
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockDb),
}));

import { loadVariantOptionLabels } from "@/lib/gift-box-variant-options";
import { GET as listBoxes } from "@/app/api/gift-boxes/route";
import { GET as getBox } from "@/app/api/gift-boxes/[id]/route";

const mockGetVariantLabels = loadVariantOptionLabels as jest.Mock;

const BOX = "aaaaaaaa-0000-4000-8000-000000000001";
const COMPONENT = "bbbbbbbb-0000-4000-8000-000000000002";
const COMPONENT_VARIANT = "cccccccc-0000-4000-8000-000000000003";

function detailRequest(id: string) {
  return new Request(`http://localhost/api/gift-boxes/${id}`);
}

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chainsFor(table: string) {
  return chains.filter((call) => call.table === table);
}

beforeEach(() => {
  queues.clear();
  chains.length = 0;
  mockGetVariantLabels.mockClear();
  mockGetVariantLabels.mockImplementation(async () => new Map());
});

describe("GET /api/gift-boxes (list)", () => {
  it("answers an empty list + schema_pending while the migration is missing", async () => {
    push("gift_boxes", { data: null, error: { code: "42P01" } });

    const res = await listBoxes();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, boxes: [], schema_pending: true });
    expect(chainsFor("products")).toHaveLength(0);
  });

  it("returns an empty list when no box markers exist (and queries nothing else)", async () => {
    push("gift_boxes", { data: [], error: null });

    const res = await listBoxes();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.boxes).toEqual([]);
    expect(chainsFor("products")).toHaveLength(0);
  });

  it("gates the product query to published + visible + not deleted", async () => {
    push("gift_boxes", { data: [{ product_id: BOX, created_at: "x" }], error: null });
    push("products", {
      data: [
        {
          id: BOX,
          name: "Deluxe Box",
          slug: "deluxe-box",
          short_description: "Nice box",
          base_price: 20,
          compare_at_price: null,
          currency: "USD",
          status: "published",
          visibility: "visible",
          published_at: "2026-11-17T00:00:00Z",
          created_at: "2026-11-17T00:00:00Z",
        },
      ],
      error: null,
    });
    push("gift_box_items", { data: [], error: null });
    push("product_images", { data: [], error: null });

    const res = await listBoxes();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.boxes).toHaveLength(1);
    expect(body.boxes[0]).toMatchObject({
      id: BOX,
      name: "Deluxe Box",
      base_price: 20,
      item_count: 0,
      contents_value: null, // empty box → no fabricated value
    });

    const productEqs = chainsFor("products")[0].eqs;
    expect(productEqs).toContainEqual({ col: "status", val: "published" });
    expect(productEqs).toContainEqual({ col: "visibility", val: "visible" });
    expect(chainsFor("products")[0].ops).toContain("is");
  });

  it("computes value and savings from real component prices and picks the primary image", async () => {
    push("gift_boxes", { data: [{ product_id: BOX, created_at: "x" }], error: null });
    push("products", {
      data: [
        {
          id: BOX,
          name: "Box",
          slug: "box",
          short_description: null,
          base_price: 20,
          compare_at_price: null,
          currency: "USD",
          status: "published",
          visibility: "visible",
          published_at: "2026-11-17T00:00:00Z",
          created_at: "2026-11-17T00:00:00Z",
        },
      ],
      error: null,
    });
    push("gift_box_items", {
      data: [
        {
          id: "item-1",
          gift_box_product_id: BOX,
          product_id: COMPONENT,
          variant_id: COMPONENT_VARIANT,
          quantity: 2,
          display_order: 0,
          is_active: true,
          products: { id: COMPONENT, name: "Mug", currency: "USD", base_price: 10 },
          product_variants: { id: COMPONENT_VARIANT, price: 12, stock_quantity: 4, reserved_quantity: 0, is_active: true, deleted_at: null },
        },
      ],
      error: null,
    });
    push("product_images", {
      data: [
        { id: "img-1", product_id: BOX, storage_path: "box/first.jpg", is_primary: false, sort_order: 0 },
        { id: "img-2", product_id: BOX, storage_path: "box/primary.jpg", is_primary: true, sort_order: 1 },
      ],
      error: null,
    });

    const res = await listBoxes();
    const body = await res.json();

    const box = body.boxes[0];
    expect(box.contents_value).toBe(24); // 12 × 2
    expect(box.savings).toBe(4); // 24 − 20
    expect(box.item_count).toBe(1);
    expect(box.image).toBe("box/primary.jpg");

    // Only active items are part of the public listing.
    expect(chainsFor("gift_box_items")[0].eqs).toContainEqual({ col: "is_active", val: true });
  });
});

describe("GET /api/gift-boxes/[id] (detail)", () => {
  it("rejects a non-uuid id with 400", async () => {
    const res = await getBox(detailRequest("nope"), withParams("nope"));
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });

  it("returns 404 for a missing, unpublished, hidden or deleted product", async () => {
    push("products", { data: null, error: null });

    const res = await getBox(detailRequest(BOX), withParams(BOX));
    expect(res.status).toBe(404);

    const eqs = chainsFor("products")[0].eqs;
    expect(eqs).toContainEqual({ col: "status", val: "published" });
    expect(eqs).toContainEqual({ col: "visibility", val: "visible" });
    expect(chainsFor("products")[0].ops).toContain("is");
  });

  it("flags a published product without a box marker as is_gift_box:false", async () => {
    push("products", {
      data: {
        id: BOX,
        name: "Regular Product",
        slug: "regular",
        base_price: 10,
        compare_at_price: null,
        currency: "USD",
        status: "published",
        visibility: "visible",
      },
      error: null,
    });
    push("gift_boxes", { data: null, error: null });

    const res = await getBox(detailRequest(BOX), withParams(BOX));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, is_gift_box: false, contents: [] });
  });

  it("degrades to is_gift_box:false while the tables are missing (schema pending)", async () => {
    push("products", {
      data: { id: BOX, name: "Box", slug: "box", base_price: 10, currency: "USD", status: "published", visibility: "visible" },
      error: null,
    });
    push("gift_boxes", { data: null, error: { code: "42P01" } });

    const res = await getBox(detailRequest(BOX), withParams(BOX));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, is_gift_box: false, schema_pending: true });
  });

  it("returns contents with link gating, variant labels, stock and real savings", async () => {
    mockGetVariantLabels.mockImplementation(
      async () => new Map([[COMPONENT_VARIANT, { options: { Size: "M" }, label: "M" }]])
    );

    push("products", {
      data: {
        id: BOX,
        name: "Deluxe Box",
        slug: "deluxe-box",
        short_description: "Box desc",
        description: "Long box desc",
        base_price: 20,
        compare_at_price: null,
        currency: "USD",
        status: "published",
        visibility: "visible",
        published_at: "2026-11-17T00:00:00Z",
      },
      error: null,
    });
    push("gift_boxes", { data: { product_id: BOX, created_at: "x" }, error: null });
    push(
      "gift_box_items",
      {
        data: [
          {
            id: "item-visible",
            gift_box_product_id: BOX,
            product_id: COMPONENT,
            variant_id: COMPONENT_VARIANT,
            quantity: 2,
            display_order: 0,
            note: "Keep dry",
            products: {
              id: COMPONENT,
              name: "Visible Mug",
              slug: "visible-mug",
              short_description: null,
              status: "published",
              visibility: "visible",
              deleted_at: null,
              base_price: 10,
              compare_at_price: null,
              currency: "USD",
            },
            product_variants: {
              id: COMPONENT_VARIANT,
              sku: "MUG-S",
              price: 12,
              stock_quantity: 6,
              reserved_quantity: 2,
              is_active: true,
              deleted_at: null,
            },
          },
          {
            id: "item-hidden",
            gift_box_product_id: BOX,
            product_id: "dddddddd-0000-4000-8000-000000000004",
            variant_id: null,
            quantity: 1,
            display_order: 1,
            note: null,
            products: {
              id: "dddddddd-0000-4000-8000-000000000004",
              name: "Hidden Print",
              slug: "hidden-print",
              short_description: null,
              status: "draft",
              visibility: "hidden",
              deleted_at: null,
              base_price: 5,
              compare_at_price: null,
              currency: "USD",
            },
            product_variants: null,
          },
        ],
        error: null,
      }
    );
    push("product_images", { data: [{ id: "img-1", product_id: BOX, storage_path: "box/1.jpg", is_primary: true, sort_order: 0 }], error: null });
    push("product_images", {
      data: [
        { id: "img-c", product_id: COMPONENT, storage_path: "comp/1.jpg", is_primary: true, sort_order: 0 },
      ],
      error: null,
    });

    const res = await getBox(detailRequest(BOX), withParams(BOX));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.is_gift_box).toBe(true);
    expect(body.box.image).toBe("box/1.jpg");

    const [visible, hidden] = body.contents;
    // Visible component → linkable, label from options, real stock (6 − 2).
    expect(visible.product.publicly_accessible).toBe(true);
    expect(visible.product.href).toBe(
      "/product-details/bbbbbbbb-0000-4000-8000-000000000002"
    );
    expect(visible.variant.label).toBe("M");
    expect(visible.unit_price).toBe(12);
    expect(visible.stock).toBe(4);
    expect(visible.in_stock).toBe(true);
    expect(visible.note).toBe("Keep dry");
    expect(visible.image).toBe("comp/1.jpg");
    // Hidden component → shown, but NEVER linked.
    expect(hidden.product.publicly_accessible).toBe(false);
    expect(hidden.product.href).toBe(null);
    expect(hidden.variant).toBe(null);
    expect(hidden.unit_price).toBe(5);

    // Value math: 12 × 2 + 5 × 1 = 29 vs box 20 → savings 9.
    expect(body.contents_value).toBe(29);
    expect(body.savings).toBe(9);
  });

  it("marks a component out of stock when the variant is depleted", async () => {
    push("products", {
      data: { id: BOX, name: "Box", slug: "box", base_price: 10, currency: "USD", status: "published", visibility: "visible" },
      error: null,
    });
    push("gift_boxes", { data: { product_id: BOX, created_at: "x" }, error: null });
    push("gift_box_items", {
      data: [
        {
          id: "item-1",
          gift_box_product_id: BOX,
          product_id: COMPONENT,
          variant_id: COMPONENT_VARIANT,
          quantity: 1,
          display_order: 0,
          note: null,
          products: { id: COMPONENT, name: "Mug", slug: "mug", status: "published", visibility: "visible", deleted_at: null, base_price: 10, currency: "USD" },
          product_variants: { id: COMPONENT_VARIANT, sku: "S", price: 10, stock_quantity: 1, reserved_quantity: 5, is_active: true, deleted_at: null },
        },
      ],
      error: null,
    });
    push("product_images", { data: [], error: null });

    const res = await getBox(detailRequest(BOX), withParams(BOX));
    const body = await res.json();

    expect(body.contents[0].stock).toBe(0); // clamped, never negative
    expect(body.contents[0].in_stock).toBe(false);
  });
});
