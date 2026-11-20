/**
 * @jest-environment node
 *
 * Gift box product-picker contract — GET /api/admin/products extensions:
 *   - backward compatible: without picker params the query is untouched
 *     (no `.or`, no gift_boxes lookup, identical response shape)
 *   - q → name/slug ilike with quote/metacharacter sanitisation
 *   - category_id / status → exact-match filters (status allow-listed)
 *   - availability → in_stock / out_of_stock by default-variant stock
 *   - exclude_boxes → hides registered gift boxes (nesting is forbidden);
 *     a pending migration (42P01) degrades to "no boxes to exclude"
 *   - limit caps after ordering
 *   - response gains `variants[]` (with sku) + keeps `default_variant`
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

jest.mock("@/lib/product-admin", () => ({
  parseProductPayload: jest.fn(),
  syncDefaultVariant: jest.fn(async () => undefined),
  reapplyProductAttributes: jest.fn(async () => undefined),
  isMissingSizesColumn: jest.fn(() => false),
  omitAvailableSizes: (payload: unknown) => payload,
  uuidOrNull: jest.fn(),
}));

type Result = { data: unknown; error: { code?: string; message?: string } | null };

type ChainCall = {
  table: string;
  ops: string[];
  selectCols?: string;
  eqs: Array<{ col: string; val: unknown }>;
  orFilter?: string;
};

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
  let selectCols: string | undefined;
  let orFilter: string | undefined;
  const record = () => chains.push({ table, ops: [...ops], selectCols, eqs: [...eqs], orFilter });
  const finish = (): Result => {
    record();
    const entry = queues.get(table) ?? [];
    return entry.shift() ?? { data: [], error: null };
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit", "or", "maybeSingle", "single"]) {
    chain[method] = (...args: unknown[]) => {
      ops.push(method);
      if (method === "select") selectCols = String(args[0] ?? "");
      if (method === "eq") eqs.push({ col: String(args[0]), val: args[1] });
      if (method === "or") orFilter = String(args[0] ?? "");
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

import { GET } from "@/app/api/admin/products/route";

const MUG = "aaaaaaaa-0000-4000-8000-000000000001";
const BOX = "bbbbbbbb-0000-4000-8000-000000000002";
const STICKER = "cccccccc-0000-4000-8000-000000000003";

function product(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "Product",
    slug: "product",
    status: "published",
    visibility: "visible",
    deleted_at: null,
    base_price: 10,
    currency: "USD",
    category_id: null,
    product_images: [],
    product_variants: [
      {
        id: `var-${id}`,
        sku: `SKU-${id.slice(0, 4)}`,
        price: 10,
        stock_quantity: 5,
        is_default: true,
        is_active: true,
        deleted_at: null,
      },
    ],
    ...overrides,
  };
}

function seedDefaultCatalog() {
  push(
    "products",
    { data: [product(MUG, { name: "Galaxy Mug" }), product(BOX, { name: "Deluxe Box" }), product(STICKER, { name: "Sticker", product_variants: [{ id: "var-s", sku: "STK-1", price: 2, stock_quantity: 0, is_default: true, is_active: true, deleted_at: null }] })], error: null }
  );
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/admin/products${query}`, {
    headers: { Authorization: "Bearer test-token" },
  });
}

function productsChain() {
  return chains.find((call) => call.table === "products");
}

beforeEach(() => {
  queues.clear();
  chains.length = 0;
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
});

describe("backward compatibility (no picker params)", () => {
  it("issues no search filter and no gift_boxes lookup", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toHaveLength(3);
    expect(productsChain()?.orFilter).toBeUndefined();
    expect(chains.some((call) => call.table === "gift_boxes")).toBe(false);
    expect(productsChain()?.ops).toContain("is"); // default soft-delete filter
  });

  it("keeps default_variant and adds the additive variants[] array with sku", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest());
    const body = await res.json();

    const mug = body.products[0];
    expect(mug.default_variant.id).toBe(`var-${MUG}`);
    expect(mug.variants).toHaveLength(1);
    expect(mug.variants[0]).toMatchObject({
      id: `var-${MUG}`,
      sku: `SKU-${"aaaa".slice(0, 4)}`,
      stock_quantity: 5,
      is_default: true,
    });
    expect(mug.product_variants).toBeUndefined(); // raw embed not leaked
  });
});

describe("q — name/slug search", () => {
  it("adds an ilike OR filter over name and slug", async () => {
    seedDefaultCatalog();
    await GET(getRequest("?q=galaxy%20mug"));

    const filter = productsChain()?.orFilter ?? "";
    expect(filter).toContain("name.ilike.%galaxy mug%");
    expect(filter).toContain("slug.ilike.%galaxy mug%");
  });

  it("strips quotes and SQL metacharacters from the search term", async () => {
    seedDefaultCatalog();
    await GET(getRequest("?q=" + encodeURIComponent("o'brien, 100% (x)")));

    const filter = productsChain()?.orFilter ?? "";
    // The raw term is sanitised: quotes/parens/percent become spaces…
    expect(filter).toContain("o brien  100   x");
    expect(filter).not.toContain("'");
    expect(filter).not.toContain("(");
    expect(filter).not.toContain(")");
    // …while the structural ilike markers remain intact.
    expect(filter).toContain("name.ilike.%");
    expect(filter).toContain("slug.ilike.%");
  });
});

describe("category_id / status filters", () => {
  it("applies an exact category filter", async () => {
    seedDefaultCatalog();
    await GET(getRequest(`?category_id=11111111-2222-3333-4444-555555555555`));

    expect(productsChain()?.eqs).toContainEqual({
      col: "category_id",
      val: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("applies an allow-listed status filter", async () => {
    seedDefaultCatalog();
    await GET(getRequest("?status=draft"));
    expect(productsChain()?.eqs).toContainEqual({ col: "status", val: "draft" });
  });

  it("ignores an unknown status value (no filter, no crash)", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest("?status=banana"));
    expect(res.status).toBe(200);
    expect(productsChain()?.eqs.some((eq) => eq.col === "status")).toBe(false);
  });
});

describe("availability filter", () => {
  it("in_stock keeps only products whose default variant has stock", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest("?availability=in_stock"));
    const body = await res.json();

    expect(body.products.map((p: { id: string }) => p.id)).toEqual([MUG, BOX]);
  });

  it("out_of_stock keeps products without available stock", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest("?availability=out_of_stock"));
    const body = await res.json();

    expect(body.products.map((p: { id: string }) => p.id)).toEqual([STICKER]);
  });
});

describe("exclude_boxes", () => {
  it("hides registered gift boxes from the picker", async () => {
    seedDefaultCatalog();
    push("gift_boxes", { data: [{ product_id: BOX }], error: null });

    const res = await GET(getRequest("?exclude_boxes=1"));
    const body = await res.json();

    expect(body.products.map((p: { id: string }) => p.id)).toEqual([MUG, STICKER]);
    expect(chains.some((call) => call.table === "gift_boxes")).toBe(true);
  });

  it("degrades gracefully while the gift box tables are missing (42P01)", async () => {
    seedDefaultCatalog();
    push("gift_boxes", { data: null, error: { code: "42P01" } });

    const res = await GET(getRequest("?exclude_boxes=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toHaveLength(3); // nothing to exclude
  });

  it("propagates unexpected gift_boxes failures", async () => {
    seedDefaultCatalog();
    push("gift_boxes", { data: null, error: { code: "42501", message: "permission denied" } });

    const res = await GET(getRequest("?exclude_boxes=1"));
    expect(res.status).toBe(500);
  });
});

describe("limit", () => {
  it("caps the result set after ordering", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest("?limit=2"));
    const body = await res.json();

    expect(body.products).toHaveLength(2);
    expect(productsChain()?.ops).toContain("order");
  });

  it("ignores a non-positive or non-numeric limit", async () => {
    seedDefaultCatalog();
    const res = await GET(getRequest("?limit=-5"));
    const body = await res.json();
    expect(body.products).toHaveLength(3);
  });
});
