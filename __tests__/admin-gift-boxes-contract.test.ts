/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/gift-boxes:
 *   - admin auth FIRST (401/403 before any DB work)
 *   - GET: schema-pending (42P01) → 503 GIFT_BOX_SCHEMA_PENDING, otherwise a
 *     full preview (contents, real unit prices, computed value/savings)
 *   - create_box: real product validation, duplicate slug → 409, marker
 *     failure rolls the product back (never an unregistered box)
 *   - add_item: self-reference / nesting / duplicate / quantity guards
 *   - remove_item touches ONLY the relationship (catalog never deleted)
 *   - update/reorder/quantity bounds validated before any write
 */

const mockAuth: { current: { user?: { id: string; email?: string }; error?: string; status?: number } } = {
  current: { user: { id: "admin-uid-1", email: "admin@galaxy.test" } },
};

jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: jest.fn(async () => mockAuth.current),
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

// Variant option labels are a display nicety — keep them out of these tests.
jest.mock("@/lib/gift-box-variant-options", () => ({
  loadVariantOptionLabels: jest.fn(async () => new Map()),
}));

// Real parseProductPayload / uuidOrNull (pure), mocked side-effecting helpers.
jest.mock("@/lib/product-admin", () => {
  const actual = jest.requireActual("@/lib/product-admin");
  return {
    ...actual,
    syncDefaultVariant: jest.fn(async () => undefined),
    reapplyProductAttributes: jest.fn(async () => undefined),
  };
});

type Result = { data: unknown; error: { code?: string; message?: string } | null };

type Queues = { list: Result[]; single: Result[]; insert: Result[]; update: Result[]; delete: Result[] };

type ChainCall = {
  table: string;
  ops: string[];
  selectCols?: string;
  payload?: Record<string, unknown>;
  eqs: Array<{ col: string; val: unknown }>;
};

const queues = new Map<string, Queues>();
const chains: ChainCall[] = [];

function queueFor(table: string): Queues {
  let entry = queues.get(table);
  if (!entry) {
    entry = { list: [], single: [], insert: [], update: [], delete: [] };
    queues.set(table, entry);
  }
  return entry;
}

/** Queue results for a table; they are consumed in call order per kind. */
function push(table: string, kind: keyof Queues, ...results: Result[]) {
  queueFor(table)[kind].push(...results);
}

function resolveFor(table: string, ops: string[]): Result {
  const entry = queueFor(table);
  if (ops.includes("insert")) return entry.insert.shift() ?? { data: null, error: null };
  if (ops.includes("update")) return entry.update.shift() ?? { data: null, error: null };
  if (ops.includes("delete")) return entry.delete.shift() ?? { data: null, error: null };
  if (ops.includes("maybeSingle") || ops.includes("single")) {
    return entry.single.shift() ?? { data: null, error: null };
  }
  return entry.list.shift() ?? { data: [], error: null };
}

function makeChain(table: string) {
  const ops: string[] = [];
  const eqs: Array<{ col: string; val: unknown }> = [];
  let selectCols: string | undefined;
  let payload: Record<string, unknown> | undefined;
  const record = () => chains.push({ table, ops: [...ops], selectCols, payload, eqs: [...eqs] });
  const finish = (): Result => {
    record();
    return resolveFor(table, ops);
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "is",
    "in",
    "order",
    "limit",
    "or",
    "maybeSingle",
    "single",
  ]) {
    chain[method] = (...args: unknown[]) => {
      ops.push(method);
      if (method === "select") selectCols = String(args[0] ?? "");
      if (method === "insert" || method === "update") {
        payload = (args[0] ?? {}) as Record<string, unknown>;
      }
      if (method === "eq") eqs.push({ col: String(args[0]), val: args[1] });
      if (method === "maybeSingle" || method === "single") {
        return Promise.resolve(finish());
      }
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

import { GET, POST } from "@/app/api/admin/gift-boxes/route";

const BOX = "aaaaaaaa-0000-4000-8000-000000000001";
const COMPONENT = "bbbbbbbb-0000-4000-8000-000000000002";
const COMPONENT_VARIANT = "cccccccc-0000-4000-8000-000000000003";
const ITEM_A = "11111111-aaaa-4000-8000-000000000011";
const ITEM_B = "11111111-aaaa-4000-8000-000000000012";

function getRequest(query = "") {
  return new Request(`http://localhost/api/admin/gift-boxes${query}`, {
    headers: { Authorization: "Bearer test-token" },
  });
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/gift-boxes", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainsFor(table: string) {
  return chains.filter((call) => call.table === table);
}

beforeEach(() => {
  queues.clear();
  chains.length = 0;
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
});

describe("auth", () => {
  it("GET returns 401 before touching the database", async () => {
    mockAuth.current = { error: "Unauthorized", status: 401 };
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(chains).toHaveLength(0);
  });

  it("POST returns 403 before parsing the body", async () => {
    mockAuth.current = { error: "Forbidden", status: 403 };
    const res = await POST(postRequest({ action: "create_box" }));
    expect(res.status).toBe(403);
    expect(chains).toHaveLength(0);
  });
});

describe("GET /api/admin/gift-boxes", () => {
  it("answers 503 GIFT_BOX_SCHEMA_PENDING while the migration is not applied", async () => {
    push("gift_boxes", "list", { data: null, error: { code: "42P01" } });

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("GIFT_BOX_SCHEMA_PENDING");
    expect(body.success).toBe(false);
  });

  it("returns boxes with real prices, computed value/savings and availability", async () => {
    push("gift_boxes", "list", { data: [{ product_id: BOX, created_at: "2026-11-17T00:00:00Z" }], error: null });
    push(
      "products",
      "list",
      {
        data: [
          {
            id: BOX,
            name: "Deluxe Box",
            slug: "deluxe-box",
            status: "published",
            visibility: "visible",
            deleted_at: null,
            base_price: 20,
            compare_at_price: null,
            currency: "USD",
            category_id: null,
            brand_id: null,
            store_id: null,
            short_description: null,
            description: null,
            is_featured: false,
            avg_rating: 0,
            rating_count: 0,
            published_at: "2026-11-17T00:00:00Z",
            created_at: "2026-11-17T00:00:00Z",
            updated_at: "2026-11-17T00:00:00Z",
            color: null,
            available_colors: null,
            available_sizes: null,
            categories: null,
            brands: null,
            stores: null,
            product_variants: [
              {
                id: "bv-1",
                sku: "BOX-1",
                price: 20,
                stock_quantity: 7,
                reserved_quantity: 2,
                is_default: true,
                is_active: true,
                deleted_at: null,
              },
            ],
          },
        ],
        error: null,
      }
    );
    push(
      "gift_box_items",
      "list",
      {
        data: [
          {
            id: "11111111-aaaa-4000-8000-000000000011",
            gift_box_product_id: BOX,
            product_id: COMPONENT,
            variant_id: COMPONENT_VARIANT,
            quantity: 2,
            display_order: 0,
            note: "Handle with care",
            is_active: true,
            created_at: "2026-11-17T00:00:00Z",
            updated_at: "2026-11-17T00:00:00Z",
            products: {
              id: COMPONENT,
              name: "Hidden Mug",
              slug: "hidden-mug",
              status: "draft",
              visibility: "hidden",
              deleted_at: null,
              base_price: 10,
              compare_at_price: null,
              currency: "USD",
            },
            product_variants: {
              id: COMPONENT_VARIANT,
              sku: "MUG-S",
              price: 12,
              stock_quantity: 5,
              reserved_quantity: 1,
              is_active: true,
              deleted_at: null,
            },
          },
        ],
        error: null,
      }
    );
    push(
      "product_images",
      "list",
      {
        data: [
          { id: "img-1", product_id: BOX, storage_path: "box/1.jpg", alt_text: null, is_primary: true, sort_order: 0 },
        ],
        error: null,
      }
    );

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.boxes).toHaveLength(1);

    const box = body.boxes[0];
    expect(box.is_gift_box).toBe(true);
    expect(box.registered_at).toBe("2026-11-17T00:00:00Z");
    expect(box.image).toBe("box/1.jpg");
    expect(box.images).toHaveLength(1);
    expect(box.default_variant.id).toBe("bv-1");
    // Real math: 12 × 2 = 24 vs box price 20 → savings 4.
    expect(box.contents_value).toBe(24);
    expect(box.savings).toBe(4);

    const item = box.contents[0];
    expect(item.unit_price).toBe(12);
    expect(item.stock).toBe(4); // stock 5 − reserved 1
    expect(item.product.publicly_accessible).toBe(false); // draft+hidden
    expect(item.note).toBe("Handle with care");
  });

  it("filters archived boxes out unless include_archived=1", async () => {
    push("gift_boxes", "list", { data: [{ product_id: BOX, created_at: "x" }], error: null });
    push("products", "list", {
      data: [
        {
          id: BOX,
          name: "Old Box",
          slug: "old-box",
          status: "archived",
          visibility: "visible",
          deleted_at: "2026-11-01T00:00:00Z",
          base_price: 10,
          currency: "USD",
          product_variants: [],
        },
      ],
      error: null,
    });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.boxes).toHaveLength(0);

    // Second run with the flag → visible again.
    push("gift_boxes", "list", { data: [{ product_id: BOX, created_at: "x" }], error: null });
    push("products", "list", {
      data: [
        {
          id: BOX,
          name: "Old Box",
          slug: "old-box",
          status: "archived",
          visibility: "visible",
          deleted_at: "2026-11-01T00:00:00Z",
          base_price: 10,
          currency: "USD",
          product_variants: [],
        },
      ],
      error: null,
    });
    const res2 = await GET(getRequest("?include_archived=1"));
    const body2 = await res2.json();
    expect(body2.boxes).toHaveLength(1);
  });
});

describe("POST — create_box", () => {
  const validProduct = {
    name: "Galaxy Deluxe Box",
    base_price: 49.99,
    status: "draft",
    visibility: "visible",
    currency: "USD",
  };

  it("rejects a missing product name with 400 (real product validation)", async () => {
    const res = await POST(postRequest({ action: "create_box", product: { base_price: 10 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("name");
    expect(chainsFor("products")).toHaveLength(0);
  });

  it("rejects an invalid base price with 400", async () => {
    const res = await POST(
      postRequest({ action: "create_box", product: { name: "Box", base_price: -5 } })
    );
    expect(res.status).toBe(400);
    expect(chainsFor("products")).toHaveLength(0);
  });

  it("maps a duplicate slug to 409", async () => {
    push("products", "insert", { data: null, error: { code: "23505", message: "duplicate key" } });

    const res = await POST(postRequest({ action: "create_box", product: validProduct }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toContain("slug");
  });

  it("rolls the product back when the gift_boxes marker fails (P0001) → 400", async () => {
    push("products", "insert", { data: { id: BOX }, error: null });
    push("gift_boxes", "insert", {
      data: null,
      error: { code: "P0001", message: "This product is already a component of another gift box" },
    });
    push("products", "delete", { data: null, error: null });

    const res = await POST(postRequest({ action: "create_box", product: validProduct }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("already a component");
    // The unregistered product must be deleted again.
    const deletes = chainsFor("products").filter((call) => call.ops.includes("delete"));
    expect(deletes).toHaveLength(1);
  });

  it("creates the box and returns 201 with the product id", async () => {
    push("products", "insert", { data: { id: BOX }, error: null });
    push("gift_boxes", "insert", { data: null, error: null });

    const res = await POST(
      postRequest({ action: "create_box", product: validProduct, stock_quantity: 12 })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.product_id).toBe(BOX);

    const insert = chainsFor("products").find((call) => call.ops.includes("insert"));
    expect(insert?.payload?.name).toBe("Galaxy Deluxe Box");
    const marker = chainsFor("gift_boxes")[0];
    expect(marker.payload).toEqual({ product_id: BOX });
  });
});

describe("POST — update_box", () => {
  const updateBody = {
    action: "update_box",
    product_id: BOX,
    product: { name: "Renamed Box", base_price: 25, status: "published", currency: "USD" },
    stock_quantity: 3,
  };

  it("rejects a non-uuid product id with 400", async () => {
    const res = await POST(postRequest({ ...updateBody, product_id: "nope" }));
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });

  it("returns 404 when the product or the marker is missing", async () => {
    push("products", "single", { data: { id: BOX, published_at: null, deleted_at: null }, error: null });
    push("gift_boxes", "single", { data: null, error: null });

    const res = await POST(postRequest(updateBody));
    expect(res.status).toBe(404);
  });

  it("answers 503 while the gift box tables are missing", async () => {
    push("products", "single", { data: { id: BOX, published_at: null, deleted_at: null }, error: null });
    push("gift_boxes", "single", { data: null, error: { code: "42P01" } });

    const res = await POST(postRequest(updateBody));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("GIFT_BOX_SCHEMA_PENDING");
  });

  it("keeps the original published_at when re-publishing", async () => {
    push("products", "single", {
      data: { id: BOX, published_at: "2026-05-05T10:00:00Z", deleted_at: null },
      error: null,
    });
    push("gift_boxes", "single", { data: { product_id: BOX }, error: null });
    push("products", "update", { data: { id: BOX }, error: null });

    const res = await POST(postRequest(updateBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const update = chainsFor("products").find((call) => call.ops.includes("update"));
    expect(update?.payload?.published_at).toBe("2026-05-05T10:00:00Z");
  });
});

describe("POST — add_item", () => {
  function seedForAdd(overrides: { existingItems?: unknown[]; boxIds?: string[] } = {}) {
    push("gift_boxes", "single", { data: { product_id: BOX }, error: null });
    push("products", "single", { data: { id: COMPONENT, deleted_at: null }, error: null });
    push("gift_box_items", "list", { data: overrides.existingItems ?? [], error: null });
    push("gift_boxes", "list", { data: (overrides.boxIds ?? []).map((id) => ({ product_id: id })), error: null });
    push("product_variants", "single", {
      data: { id: COMPONENT_VARIANT, product_id: COMPONENT, is_active: true, deleted_at: null },
      error: null,
    });
  }

  it("rejects a non-uuid box id with 400", async () => {
    const res = await POST(
      postRequest({ action: "add_item", gift_box_product_id: "nope", product_id: COMPONENT })
    );
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });

  it("returns 404 when the box marker does not exist", async () => {
    push("gift_boxes", "single", { data: null, error: null });
    const res = await POST(
      postRequest({ action: "add_item", gift_box_product_id: BOX, product_id: COMPONENT })
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing or soft-deleted target product", async () => {
    push("gift_boxes", "single", { data: { product_id: BOX }, error: null });
    push("products", "single", { data: { id: COMPONENT, deleted_at: "2026-11-01T00:00:00Z" }, error: null });

    const res = await POST(
      postRequest({ action: "add_item", gift_box_product_id: BOX, product_id: COMPONENT })
    );
    expect(res.status).toBe(404);
  });

  it("blocks a box from containing itself", async () => {
    push("gift_boxes", "single", { data: { product_id: BOX }, error: null });
    push("products", "single", { data: { id: BOX, deleted_at: null }, error: null });
    push("gift_box_items", "list", { data: [], error: null });
    push("gift_boxes", "list", { data: [], error: null });

    const res = await POST(
      postRequest({ action: "add_item", gift_box_product_id: BOX, product_id: BOX })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("cannot contain itself");
    expect(chainsFor("gift_box_items").some((call) => call.ops.includes("insert"))).toBe(false);
  });

  it("blocks nesting (target product is itself a gift box)", async () => {
    seedForAdd({ boxIds: [COMPONENT] });

    const res = await POST(
      postRequest({ action: "add_item", gift_box_product_id: BOX, product_id: COMPONENT })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("nested");
  });

  it("blocks a duplicate product/variant pair", async () => {
    seedForAdd({
      existingItems: [{ product_id: COMPONENT, variant_id: COMPONENT_VARIANT }],
    });

    const res = await POST(
      postRequest({
        action: "add_item",
        gift_box_product_id: BOX,
        product_id: COMPONENT,
        variant_id: COMPONENT_VARIANT,
        quantity: 1,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("already in the gift box");
  });

  it("rejects an out-of-bounds quantity before resolving the variant", async () => {
    seedForAdd();

    const res = await POST(
      postRequest({
        action: "add_item",
        gift_box_product_id: BOX,
        product_id: COMPONENT,
        quantity: 0,
      })
    );
    expect(res.status).toBe(400);
    // Validation runs before the variant lookup / insert.
    expect(chainsFor("product_variants")).toHaveLength(0);
    expect(chainsFor("gift_box_items").some((call) => call.ops.includes("insert"))).toBe(false);
  });

  it("adds a component with the resolved variant and returns 201", async () => {
    seedForAdd();
    push("gift_box_items", "insert", {
      data: {
        id: "item-new",
        gift_box_product_id: BOX,
        product_id: COMPONENT,
        variant_id: COMPONENT_VARIANT,
        quantity: 3,
        display_order: 0,
        note: null,
        is_active: true,
        created_at: "2026-11-17T00:00:00Z",
        updated_at: "2026-11-17T00:00:00Z",
        products: {
          id: COMPONENT,
          name: "Mug",
          slug: "mug",
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
          stock_quantity: 8,
          reserved_quantity: 3,
          is_active: true,
          deleted_at: null,
        },
      },
      error: null,
    });

    const res = await POST(
      postRequest({
        action: "add_item",
        gift_box_product_id: BOX,
        product_id: COMPONENT,
        variant_id: COMPONENT_VARIANT,
        quantity: 3,
        note: "Gift note",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.item.quantity).toBe(3);
    expect(body.item.unit_price).toBe(12);
    expect(body.item.stock).toBe(5); // 8 − 3
    expect(body.item.product.publicly_accessible).toBe(true);

    const insert = chainsFor("gift_box_items").find((call) => call.ops.includes("insert"));
    expect(insert?.payload).toMatchObject({
      gift_box_product_id: BOX,
      product_id: COMPONENT,
      variant_id: COMPONENT_VARIANT,
      quantity: 3,
      note: "Gift note",
      is_active: true,
    });
  });
});

describe("POST — update_item", () => {
  const itemRow = {
    id: "11111111-aaaa-4000-8000-000000000011",
    gift_box_product_id: BOX,
    product_id: COMPONENT,
    variant_id: COMPONENT_VARIANT,
    quantity: 1,
    display_order: 0,
    note: null,
    is_active: true,
    created_at: "x",
    updated_at: "x",
    products: null,
    product_variants: null,
  };

  it("rejects a quantity above the cap", async () => {
    push("gift_box_items", "single", { data: itemRow, error: null });
    const res = await POST(
      postRequest({ action: "update_item", item_id: ITEM_A, quantity: 100_000 })
    );
    expect(res.status).toBe(400);
    expect(chainsFor("gift_box_items").some((call) => call.ops.includes("update"))).toBe(false);
  });

  it("returns 404 for an unknown item", async () => {
    push("gift_box_items", "single", { data: null, error: null });
    const res = await POST(postRequest({ action: "update_item", item_id: "11111111-aaaa-4000-8000-000000000011", quantity: 2 }));
    expect(res.status).toBe(404);
  });

  it("updates quantity and returns the enriched item", async () => {
    push("gift_box_items", "single", { data: itemRow, error: null });
    push("gift_box_items", "update", { data: { ...itemRow, quantity: 4 }, error: null });

    const res = await POST(postRequest({ action: "update_item", item_id: "11111111-aaaa-4000-8000-000000000011", quantity: 4 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.item.quantity).toBe(4);
    const update = chainsFor("gift_box_items").find((call) => call.ops.includes("update"));
    expect(update?.payload).toEqual({ quantity: 4 });
  });

  it("rejects a note longer than 500 characters", async () => {
    push("gift_box_items", "single", { data: itemRow, error: null });
    const res = await POST(
      postRequest({ action: "update_item", item_id: "11111111-aaaa-4000-8000-000000000011", note: "x".repeat(501) })
    );
    expect(res.status).toBe(400);
    expect(chainsFor("gift_box_items").some((call) => call.ops.includes("update"))).toBe(false);
  });
});

describe("POST — remove_item", () => {
  it("rejects a non-uuid item id with 400", async () => {
    const res = await POST(postRequest({ action: "remove_item", item_id: "nope" }));
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });

  it("returns 404 when nothing was deleted", async () => {
    push("gift_box_items", "delete", { data: [], error: null });
    const res = await POST(postRequest({ action: "remove_item", item_id: "11111111-aaaa-4000-8000-000000000011" }));
    expect(res.status).toBe(404);
  });

  it("deletes ONLY the relationship — the catalog product is never touched", async () => {
    push("gift_box_items", "delete", { data: [{ id: "11111111-aaaa-4000-8000-000000000011" }], error: null });

    const res = await POST(postRequest({ action: "remove_item", item_id: "11111111-aaaa-4000-8000-000000000011" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, removed_id: "11111111-aaaa-4000-8000-000000000011" });
    expect(chainsFor("products")).toHaveLength(0);
    const deleteCall = chainsFor("gift_box_items")[0];
    expect(deleteCall.ops).toContain("delete");
    expect(deleteCall.eqs).toEqual([{ col: "id", val: "11111111-aaaa-4000-8000-000000000011" }]);
  });
});

describe("POST — reorder_items", () => {
  const row = (id: string, order: number) => ({
    id,
    gift_box_product_id: BOX,
    product_id: COMPONENT,
    variant_id: null,
    quantity: 1,
    display_order: order,
    note: null,
    is_active: true,
    created_at: "x",
    updated_at: "x",
    products: null,
    product_variants: null,
  });

  it("rejects an incomplete or foreign item id list", async () => {
    push("gift_box_items", "list", { data: [row(ITEM_A, 0), row(ITEM_B, 1)], error: null });
    const res = await POST(
      postRequest({ action: "reorder_items", gift_box_product_id: BOX, item_ids: [ITEM_A] })
    );
    expect(res.status).toBe(400);
    expect(chainsFor("gift_box_items").some((call) => call.ops.includes("update"))).toBe(false);
  });

  it("writes sequential display_order values and returns the refreshed items", async () => {
    push("gift_box_items", "list", { data: [row(ITEM_A, 0), row(ITEM_B, 1)], error: null });
    push("gift_box_items", "update", { data: null, error: null });
    push("gift_box_items", "update", { data: null, error: null });
    push("gift_box_items", "list", { data: [row(ITEM_B, 0), row(ITEM_A, 1)], error: null });

    const res = await POST(
      postRequest({ action: "reorder_items", gift_box_product_id: BOX, item_ids: [ITEM_B, ITEM_A] })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([ITEM_B, ITEM_A]);

    const updates = chainsFor("gift_box_items").filter((call) => call.ops.includes("update"));
    expect(updates[0].payload).toEqual({ display_order: 0 });
    expect(updates[1].payload).toEqual({ display_order: 1 });
  });
});

describe("POST — action handling", () => {
  it("rejects a missing action with 400", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });

  it("rejects an unknown action with 400", async () => {
    const res = await POST(postRequest({ action: "explode" }));
    expect(res.status).toBe(400);
    expect(chains).toHaveLength(0);
  });
});
