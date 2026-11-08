/**
 * @jest-environment node
 *
 * Contract for /api/vendor/orders.
 *
 *   - orders are read from vendor_order_items scoped to the owner's store
 *   - the customer display name is exposed, but email/phone/address are not
 *   - a vendor without a store gets 403
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

import { GET } from "@/app/api/vendor/orders/route";

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

      builder.select = () => builder;
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
      builder.in = (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return builder;
      };
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

// `db.from(table)` must resolve to a builder, not the `{ from }` wrapper.
function dbWith(handler: Handler) {
  return (table: string) => makeDb(handler).from(table);
}

function getRequest() {
  return new Request("http://localhost/api/vendor/orders", {
    method: "GET",
    headers: { Authorization: "Bearer token" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "vendor-user" } }, error: null });
  mockUserFrom.mockImplementation(
    dbWith(({ table, filters }) => {
      if (table === "stores") {
        const owned = filters.some(
          ([column, value]) => column === "owner_id" && value === "vendor-user"
        );
        return { data: owned ? { id: "store-1" } : null, error: null };
      }
      return { data: null, error: null };
    })
  );
});

describe("GET /api/vendor/orders", () => {
  test("groups only this store's items and exposes the customer name without contact data", async () => {
    const itemFilters: Array<[string, unknown]> = [];

    // vendor_order_items is an RLS-protected view keyed on auth.uid(), so it
    // must be queried with the user's client rather than the service role.
    mockUserFrom.mockImplementation(
      dbWith(({ table, filters }) => {
        if (table === "stores") {
          return { data: { id: "store-1" }, error: null };
        }
        if (table === "vendor_order_items") {
          itemFilters.push(...filters);
          return {
            data: [
              {
                order_item_id: "item-1",
                order_id: "order-1",
                order_number: "GS-1",
                order_status: "paid",
                customer_id: "cust-1",
                placed_at: "2026-10-20T10:00:00.000Z",
                product_id: "prod-1",
                product_name_snapshot: "Mug",
                quantity: 2,
                line_total: 100,
                unit_price_snapshot: 50,
                item_status: "processing",
              },
              {
                order_item_id: "item-2",
                order_id: "order-1",
                order_number: "GS-1",
                order_status: "paid",
                customer_id: "cust-1",
                placed_at: "2026-10-20T10:00:00.000Z",
                product_id: "prod-1",
                product_name_snapshot: "Poster",
                quantity: 1,
                line_total: 50,
                unit_price_snapshot: 50,
                item_status: "processing",
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      })
    );

    mockDbFrom.mockImplementation(
      dbWith(({ table }) => {
        if (table === "profiles") {
          return {
            data: [
              {
                id: "cust-1",
                full_name: "Alice Customer",
                // The route must not select or return these.
                phone: "01000000000",
                email: "alice@example.com",
                address: "1 Secret Street",
              },
            ],
            error: null,
          };
        }
        if (table === "products") {
          return { data: [{ id: "prod-1", currency: "EGP" }], error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.store_id).toBe("store-1");
    expect(itemFilters).toContainEqual(["store_id", "store-1"]);
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      id: "order-1",
      status: "paid",
      total: 150,
      currency: "EGP",
      customer_name: "Alice Customer",
    });
    expect(body.orders[0].items).toHaveLength(2);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("Alice@example.com");
    expect(serialized).not.toContain("01000000000");
    expect(serialized).not.toContain("1 Secret Street");
    expect(body.orders[0]).not.toHaveProperty("email");
    expect(body.orders[0]).not.toHaveProperty("phone");
    expect(body.orders[0]).not.toHaveProperty("shipping_address_snapshot");
  });

  test("rejects a user without a store", async () => {
    mockUserFrom.mockImplementation(dbWith(() => ({ data: null, error: null })));

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });
});
