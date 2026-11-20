/**
 * @jest-environment node
 *
 * Contract — GET /api/orders/[id] gift box snapshot attachment:
 *   - every order line carries `gift_box_contents` (possibly empty) so the
 *     receipt UI has a stable shape
 *   - rows come from the frozen `order_item_gift_box_contents` snapshot via
 *     the owner's own RLS client
 *   - a pending migration (42P01) degrades to empty contents, never a 500
 *   - no items → no snapshot query at all
 */

const mockGetUser = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => mockMakeChain(table),
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

type Result = { data: unknown; error: { code?: string; message?: string } | null };

type ChainCall = { table: string; ops: string[]; eqs: Array<{ col: string; val: unknown }>; ins?: unknown[] };

const queues = new Map<string, Result[]>();
const chains: ChainCall[] = [];

function push(table: string, ...results: Result[]) {
  const entry = queues.get(table) ?? [];
  entry.push(...results);
  queues.set(table, entry);
}

function mockMakeChain(table: string) {
  const ops: string[] = [];
  const eqs: Array<{ col: string; val: unknown }> = [];
  let inFilter: unknown[] | undefined;
  const record = () => chains.push({ table, ops: [...ops], eqs: [...eqs], ins: inFilter });
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
      if (method === "in") inFilter = args[1] as unknown[];
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

import { GET } from "@/app/api/orders/[id]/route";

const ORDER = "aaaaaaaa-0000-4000-8000-0000000000a1";
const ITEM_BOX = "bbbbbbbb-0000-4000-8000-0000000000b1";
const ITEM_PLAIN = "cccccccc-0000-4000-8000-0000000000c1";

function request() {
  return new Request("http://localhost/api/orders/" + ORDER, {
    headers: { Authorization: "Bearer valid-token" },
  });
}

function params() {
  return { params: Promise.resolve({ id: ORDER }) };
}

function chainsFor(table: string) {
  return chains.filter((call) => call.table === table);
}

beforeEach(() => {
  queues.clear();
  chains.length = 0;
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "buyer@galaxy.test" } },
    error: null,
  });
});

describe("GET /api/orders/[id] — gift box contents", () => {
  it("requires an authorization header (401 before any query)", async () => {
    const res = await GET(new Request("http://localhost/api/orders/" + ORDER), params());
    expect(res.status).toBe(401);
    expect(chains).toHaveLength(0);
  });

  it("returns 404 when the order does not belong to the caller", async () => {
    push("orders", { data: null, error: null });

    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  it("attaches gift_box_contents to every item (rows for the box line, [] otherwise)", async () => {
    push("orders", {
      data: { id: ORDER, user_id: "user-1", order_number: "GS-1", status: "paid" },
      error: null,
    });
    push("order_items", {
      data: [
        { id: ITEM_BOX, product_name_snapshot: "Deluxe Box", quantity: 1, unit_price_snapshot: 30, line_total: 30 },
        { id: ITEM_PLAIN, product_name_snapshot: "Plain Tee", quantity: 2, unit_price_snapshot: 15, line_total: 30 },
      ],
      error: null,
    });
    push("order_item_gift_box_contents", {
      data: [
        {
          id: "snap-1",
          order_item_id: ITEM_BOX,
          product_id: "dddddddd-0000-4000-8000-0000000000d1",
          variant_id: null,
          product_name: "Blue Mug",
          variant_options: { Size: "M" },
          unit_price: 12,
          quantity: 2,
          display_order: 0,
        },
      ],
      error: null,
    });
    // payments + shipping lookups resolve to the defaults (null / [])

    const res = await GET(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const [boxItem, plainItem] = body.order.items;
    expect(boxItem.gift_box_contents).toHaveLength(1);
    expect(boxItem.gift_box_contents[0]).toMatchObject({
      product_name: "Blue Mug",
      quantity: 2,
      unit_price: 12,
      variant_options: { Size: "M" },
    });
    expect(plainItem.gift_box_contents).toEqual([]);

    // The snapshot query is scoped to exactly these line ids.
    const snapshotQuery = chainsFor("order_item_gift_box_contents")[0];
    expect(snapshotQuery.ops).toContain("in");
    expect(snapshotQuery.ins).toEqual([ITEM_BOX, ITEM_PLAIN]);
  });

  it("degrades to empty contents while the snapshot table is missing (42P01)", async () => {
    push("orders", {
      data: { id: ORDER, user_id: "user-1", order_number: "GS-1", status: "paid" },
      error: null,
    });
    push("order_items", {
      data: [{ id: ITEM_BOX, product_name_snapshot: "Deluxe Box", quantity: 1, unit_price_snapshot: 30, line_total: 30 }],
      error: null,
    });
    push("order_item_gift_box_contents", { data: null, error: { code: "42P01" } });

    const res = await GET(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.order.items[0].gift_box_contents).toEqual([]);
  });

  it("skips the snapshot query entirely when the order has no items", async () => {
    push("orders", {
      data: { id: ORDER, user_id: "user-1", order_number: "GS-1", status: "paid" },
      error: null,
    });
    push("order_items", { data: [], error: null });

    const res = await GET(request(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.order.items).toEqual([]);
    expect(chainsFor("order_item_gift_box_contents")).toHaveLength(0);
  });

  it("treats a non-uuid snapshot lookup error other than 42P01 as non-fatal (logged)", async () => {
    push("orders", {
      data: { id: ORDER, user_id: "user-1", order_number: "GS-1", status: "paid" },
      error: null,
    });
    push("order_items", {
      data: [{ id: ITEM_BOX, product_name_snapshot: "Deluxe Box", quantity: 1, unit_price_snapshot: 30, line_total: 30 }],
      error: null,
    });
    push("order_item_gift_box_contents", { data: null, error: { code: "42501", message: "permission denied" } });

    const res = await GET(request(), params());
    const body = await res.json();

    // The order still renders; contents simply stay empty (warned, not thrown).
    expect(res.status).toBe(200);
    expect(body.order.items[0].gift_box_contents).toEqual([]);
  });
});
