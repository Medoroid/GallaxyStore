/**
 * @jest-environment node
 *
 * Contract for /api/vendor/products.
 *
 *   - the store is derived from the authenticated owner, never from the body
 *   - another store's product cannot be edited or archived (404)
 *   - a partial update keeps the fields that were not sent
 */

const mockGetUser = jest.fn();
const mockUserFrom = jest.fn();
const mockDbFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockUserFrom,
  })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockDbFrom }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET, POST } from "@/app/api/vendor/products/route";

type Terminal = "then" | "single" | "maybeSingle";
type Operation = "select" | "insert" | "update" | "delete";

type Handler = (context: {
  table: string;
  operation: Operation;
  terminal: Terminal;
  payload: unknown;
  filters: Array<[string, unknown]>;
}) => unknown;

function makeDb(handler: Handler) {
  return {
    from(table: string) {
      const state = {
        operation: "select" as Operation,
        payload: undefined as unknown,
        filters: [] as Array<[string, unknown]>,
      };

      const builder: Record<string, unknown> = {};
      const chain = () => builder;

      builder.select = () => {
        if (state.operation !== "select") return builder;
        return builder;
      };
      builder.insert = (payload: unknown) => {
        state.operation = "insert";
        state.payload = payload;
        return builder;
      };
      builder.update = (payload: unknown) => {
        state.operation = "update";
        state.payload = payload;
        return builder;
      };
      builder.delete = () => {
        state.operation = "delete";
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return builder;
      };
      builder.is = (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return builder;
      };
      builder.in = chain;
      builder.order = chain;
      builder.limit = chain;

      const resolve = (terminal: Terminal) =>
        handler({
          table,
          operation: state.operation,
          terminal,
          payload: state.payload,
          filters: state.filters,
        });

      builder.single = () => Promise.resolve(resolve("single"));
      builder.maybeSingle = () => Promise.resolve(resolve("maybeSingle"));
      builder.then = (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve("then")).then(onResolve, onReject);

      return builder;
    },
  };
}

// `db.from(table)` is the shape Supabase exposes; tests need a builder here, not
// the whole `{ from }` wrapper.
function dbWith(handler: Handler) {
  return (table: string) => makeDb(handler).from(table);
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/vendor/products", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new Request("http://localhost/api/vendor/products", {
    method: "GET",
    headers: { Authorization: "Bearer token" },
  });
}

const EXISTING_PRODUCT = {
  id: "11111111-1111-4111-8111-111111111111",
  store_id: "store-1",
  brand_id: null,
  category_id: "22222222-2222-4222-8222-222222222222",
  name: "Old name",
  slug: "old-name",
  short_description: "Old short",
  description: "Old description",
  status: "published",
  visibility: "visible",
  is_featured: false,
  base_price: 50,
  compare_at_price: null,
  currency: "EGP",
  color: "Black",
  available_colors: ["Black"],
  published_at: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "vendor-user" } }, error: null });
  mockUserFrom.mockImplementation(
    dbWith(({ table }) => {
      if (table === "stores") return { data: { id: "store-1", name: "My Store" }, error: null };
      return { data: null, error: null };
    })
  );
});

describe("GET /api/vendor/products", () => {
  test("requires authentication", async () => {
    const res = await GET(
      new Request("http://localhost/api/vendor/products", { method: "GET" })
    );
    expect(res.status).toBe(401);
  });

  test("scopes the product query to the authenticated owner's store", async () => {
    const filtersSeen: Array<[string, unknown]> = [];

    mockDbFrom.mockImplementation(
      dbWith(({ table: current, filters }) => {
        if (current === "products") {
          filtersSeen.push(...filters);
          return { data: [], error: null };
        }
        if (current === "categories" || current === "brands") {
          return { data: [], error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.store.id).toBe("store-1");
    expect(filtersSeen).toContainEqual(["store_id", "store-1"]);
  });

  test("rejects a user without a store", async () => {
    mockUserFrom.mockImplementation(dbWith(() => ({ data: null, error: null })));

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/vendor/products", () => {
  test("forces the authenticated store even when the body asks for another store", async () => {
    let inserted: Record<string, unknown> | null = null;

    mockDbFrom.mockImplementation(
      dbWith(({ table, operation, payload }) => {
        if (table === "products" && operation === "insert") {
          inserted = payload as Record<string, unknown>;
          return { data: { id: "new-product" }, error: null };
        }
        if (table === "product_variants" && operation === "select") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      postRequest({
        action: "create",
        stock_quantity: 5,
        product: {
          name: "Vendor item",
          base_price: 20,
          currency: "EGP",
          store_id: "attacker-store",
          status: "draft",
        },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(inserted).toMatchObject({ store_id: "store-1", name: "Vendor item", base_price: 20 });
  });

  test("cannot update a product that belongs to another store", async () => {
    let updateCalled = false;

    mockDbFrom.mockImplementation(
      dbWith(({ table, operation }) => {
        if (table === "products" && operation === "update") {
          updateCalled = true;
          return { data: { id: EXISTING_PRODUCT.id }, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      postRequest({
        action: "update",
        product_id: EXISTING_PRODUCT.id,
        product: { name: "Hijacked", base_price: 1 },
      })
    );

    expect(res.status).toBe(404);
    expect(updateCalled).toBe(false);
  });

  test("a partial update keeps fields that were not sent", async () => {
    let updated: Record<string, unknown> | null = null;

    mockDbFrom.mockImplementation(
      dbWith(({ table, operation, terminal, payload, filters }) => {
        if (table === "products" && operation === "select" && terminal === "maybeSingle") {
          // Only answer when the ownership filter targets the vendor's store.
          const owned = filters.some(
            ([column, value]) => column === "store_id" && value === "store-1"
          );
          return { data: owned ? EXISTING_PRODUCT : null, error: null };
        }
        if (table === "products" && operation === "update") {
          updated = payload as Record<string, unknown>;
          return { data: { id: EXISTING_PRODUCT.id }, error: null };
        }
        if (table === "product_variants" && operation === "select") {
          return { data: { id: "variant-1" }, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      postRequest({
        action: "update",
        product_id: EXISTING_PRODUCT.id,
        product: { name: "New name" },
      })
    );

    expect(res.status).toBe(200);
    expect(updated).toMatchObject({
      name: "New name",
      description: "Old description",
      short_description: "Old short",
      category_id: EXISTING_PRODUCT.category_id,
      base_price: 50,
      currency: "EGP",
      store_id: "store-1",
    });
  });

  test("cannot archive another store's product", async () => {
    let updateCalled = false;

    mockDbFrom.mockImplementation(
      dbWith(({ table, operation }) => {
        if (table === "products" && operation === "update") {
          updateCalled = true;
          return { data: null, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      postRequest({ action: "archive", product_id: EXISTING_PRODUCT.id })
    );

    expect(res.status).toBe(404);
    expect(updateCalled).toBe(false);
  });
});
