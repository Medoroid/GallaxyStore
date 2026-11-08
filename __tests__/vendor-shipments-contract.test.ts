/** @jest-environment node */

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

import { POST } from "@/app/api/vendor/shipments/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SHIPMENT_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_1 = "33333333-3333-4333-8333-333333333333";
const ITEM_2 = "44444444-4444-4444-8444-444444444444";
const METHOD_ID = "55555555-5555-4555-8555-555555555555";

type Operation = "select" | "insert" | "update" | "delete";

type Context = {
  table: string;
  operation: Operation;
  payload: unknown;
  filters: Array<[string, unknown]>;
  terminal: "then" | "single" | "maybeSingle";
};

function makeBuilder(table: string, handler: (context: Context) => unknown) {
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
  for (const method of ["eq", "is", "in", "neq"]) {
    builder[method] = (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    };
  }
  builder.order = chain;
  builder.limit = chain;

  const resolve = (terminal: "then" | "single" | "maybeSingle") =>
    handler({ table, ...state, terminal });

  builder.single = () => Promise.resolve(resolve("single"));
  builder.maybeSingle = () => Promise.resolve(resolve("maybeSingle"));
  builder.then = (
    onResolve: (value: unknown) => unknown,
    onReject?: (reason: unknown) => unknown
  ) => Promise.resolve(resolve("then")).then(onResolve, onReject);

  return builder;
}

function fromWith(handler: (context: Context) => unknown) {
  return (table: string) => makeBuilder(table, handler);
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vendor/shipments", {
    method: "POST",
    headers: {
      authorization: "Bearer vendor-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "vendor-user" } }, error: null });

  mockUserFrom.mockImplementation(
    fromWith(({ table }) => {
      if (table === "stores") {
        return { data: { id: "store-1", name: "Store", status: "active" }, error: null };
      }
      if (table === "vendor_order_items") {
        return {
          data: [{ order_item_id: ITEM_1, order_id: ORDER_ID, quantity: 1 }],
          error: null,
        };
      }
      return { data: null, error: null };
    })
  );
});

describe("POST /api/vendor/shipments", () => {
  test("refuses to ship items that do not belong to the vendor's store", async () => {
    const res = await POST(
      request({
        action: "create",
        order_id: ORDER_ID,
        order_item_ids: [ITEM_1, ITEM_2],
        shipping_method_id: METHOD_ID,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    // Ownership is checked before any service-role write.
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  test("rejects an invalid shipment status transition", async () => {
    const shipmentUpdates: unknown[] = [];

    mockDbFrom.mockImplementation(
      fromWith(({ table, operation, payload }) => {
        if (table === "shipments" && operation === "select") {
          return {
            data: {
              id: SHIPMENT_ID,
              order_id: ORDER_ID,
              status: "delivered",
              shipping_method_id: METHOD_ID,
            },
            error: null,
          };
        }
        if (table === "shipments" && operation === "update") {
          shipmentUpdates.push(payload);
          return { data: null, error: null };
        }
        if (table === "shipment_items") {
          return { data: [{ order_item_id: ITEM_1 }], error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      request({
        action: "update_status",
        shipment_id: SHIPMENT_ID,
        status: "in_transit",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toMatch(/invalid shipment status transition/i);
    expect(shipmentUpdates).toHaveLength(0);
  });

  test("refuses to update a shipment that contains another store's items", async () => {
    mockDbFrom.mockImplementation(
      fromWith(({ table }) => {
        if (table === "shipments") {
          return {
            data: { id: SHIPMENT_ID, order_id: ORDER_ID, status: "in_transit" },
            error: null,
          };
        }
        if (table === "shipment_items") {
          return {
            data: [{ order_item_id: ITEM_1 }, { order_item_id: ITEM_2 }],
            error: null,
          };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(
      request({
        action: "update_status",
        shipment_id: SHIPMENT_ID,
        status: "out_for_delivery",
      })
    );

    expect(res.status).toBe(403);
  });

  test("creates a shipment for owned items without writing status history manually", async () => {
    const touchedTables = new Set<string>();

    mockDbFrom.mockImplementation(
      fromWith(({ table, operation }) => {
        touchedTables.add(table);
        if (table === "orders" && operation === "select") {
          return {
            data: {
              id: ORDER_ID,
              status: "paid",
              shipping_method_id: METHOD_ID,
              deleted_at: null,
            },
            error: null,
          };
        }
        if (table === "shipment_items" && operation === "select") {
          return { data: [], error: null };
        }
        if (table === "shipping_methods") {
          return {
            data: {
              id: METHOD_ID,
              name: "Standard",
              carrier: "DHL",
              min_delivery_days: 2,
              max_delivery_days: 5,
              type: "flat",
            },
            error: null,
          };
        }
        if (table === "shipments" && operation === "insert") {
          return {
            data: {
              id: SHIPMENT_ID,
              order_id: ORDER_ID,
              shipping_method_id: METHOD_ID,
              status: "pending",
              carrier: "DHL",
              tracking_number: null,
            },
            error: null,
          };
        }
        return { error: null, data: null };
      })
    );

    const res = await POST(
      request({
        action: "create",
        order_id: ORDER_ID,
        order_item_ids: [ITEM_1],
        shipping_method_id: METHOD_ID,
        carrier: "DHL",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      shipment: { id: SHIPMENT_ID, order_id: ORDER_ID },
    });
    expect(touchedTables.has("shipment_status_history")).toBe(false);
  });

  test("moves a pending COD order to processing once a shipment is created", async () => {
    const orderUpdates: Array<{
      payload: unknown;
      filters: Array<[string, unknown]>;
    }> = [];

    mockDbFrom.mockImplementation(
      fromWith(({ table, operation, payload, filters }) => {
        if (table === "orders" && operation === "select") {
          return {
            data: {
              id: ORDER_ID,
              status: "pending",
              shipping_method_id: METHOD_ID,
              deleted_at: null,
            },
            error: null,
          };
        }
        if (table === "payments") {
          return { data: [{ provider: "cod", status: "pending" }], error: null };
        }
        if (table === "shipment_items" && operation === "select") {
          return { data: [], error: null };
        }
        if (table === "shipping_methods") {
          return {
            data: {
              id: METHOD_ID,
              name: "Standard",
              carrier: "DHL",
              min_delivery_days: 2,
              max_delivery_days: 5,
              type: "flat",
            },
            error: null,
          };
        }
        if (table === "shipments" && operation === "insert") {
          return {
            data: { id: SHIPMENT_ID, order_id: ORDER_ID, status: "pending" },
            error: null,
          };
        }
        if (table === "orders" && operation === "update") {
          orderUpdates.push({ payload, filters });
          return { error: null, data: null };
        }
        return { error: null, data: null };
      })
    );

    const res = await POST(
      request({
        action: "create",
        order_id: ORDER_ID,
        order_item_ids: [ITEM_1],
        shipping_method_id: METHOD_ID,
      })
    );

    expect(res.status).toBe(200);
    expect(orderUpdates[0]?.payload).toEqual({ status: "processing" });
    expect(orderUpdates[0]?.filters).toContainEqual(["status", "pending"]);
  });

  test("refuses to ship a pending non-COD order", async () => {
    let shipmentInserted = false;

    mockDbFrom.mockImplementation(
      fromWith(({ table, operation }) => {
        if (table === "orders" && operation === "select") {
          return {
            data: { id: ORDER_ID, status: "pending", shipping_method_id: METHOD_ID },
            error: null,
          };
        }
        if (table === "payments") {
          return { data: [{ provider: "stripe", status: "pending" }], error: null };
        }
        if (table === "shipments" && operation === "insert") {
          shipmentInserted = true;
        }
        return { error: null, data: null };
      })
    );

    const res = await POST(
      request({
        action: "create",
        order_id: ORDER_ID,
        order_item_ids: [ITEM_1],
        shipping_method_id: METHOD_ID,
      })
    );

    expect(res.status).toBe(409);
    expect(shipmentInserted).toBe(false);
  });

  test("fails closed when payment status cannot be verified", async () => {
    mockDbFrom.mockImplementation(
      fromWith(({ table, operation }) => {
        if (table === "orders" && operation === "select") {
          return {
            data: { id: ORDER_ID, status: "pending", shipping_method_id: METHOD_ID },
            error: null,
          };
        }
        if (table === "payments") {
          return { data: null, error: { message: "payments unavailable" } };
        }
        return { error: null, data: null };
      })
    );

    const res = await POST(
      request({
        action: "create",
        order_id: ORDER_ID,
        order_item_ids: [ITEM_1],
        shipping_method_id: METHOD_ID,
      })
    );

    expect(res.status).toBe(503);
  });
});
