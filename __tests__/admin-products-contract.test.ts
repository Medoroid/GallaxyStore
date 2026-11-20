/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/products (archive / restore / published_at):
 *   - auth FIRST (401 before any DB work)
 *   - GET hides archived rows by default and returns them with
 *     ?include_archived=1 (archive is a soft delete, so it must be reversible)
 *   - POST restore clears deleted_at and puts the product back as a draft, so a
 *     restored product is never silently re-published
 *   - POST update keeps the original published_at instead of re-stamping it
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

const mockParseProductPayload = jest.fn();
const mockIsMissingSizesColumn = jest.fn((_error: unknown) => false);
const mockSyncDefaultVariant = jest.fn(async (...args: unknown[]) => {
  void args;
  return undefined;
});
const mockReapplyProductAttributes = jest.fn(async (...args: unknown[]) => {
  void args;
  return undefined;
});

jest.mock("@/lib/product-admin", () => ({
  parseProductPayload: (input: unknown) => mockParseProductPayload(input),
  syncDefaultVariant: (...args: unknown[]) => mockSyncDefaultVariant(...args),
  reapplyProductAttributes: (...args: unknown[]) => mockReapplyProductAttributes(...args),
  isMissingSizesColumn: (error: unknown) => mockIsMissingSizesColumn(error),
  omitAvailableSizes: (payload: unknown) => payload,
  uuidOrNull: (value: unknown) =>
    typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null,
}));

type Result = { data: unknown; error: unknown };
type ChainCall = {
  table: string;
  ops: string[];
  selectCols?: string;
  payload?: Record<string, unknown>;
  eqs: Array<{ col: string; val: unknown }>;
};

const mockChains: ChainCall[] = [];
const mockHarness: {
  products: unknown[];
  productSingle: Result;
  updateResult: Result;
  listError: { code: string; message: string } | null;
  listErrorQueue: Array<{ code: string; message: string }>;
} = {
  products: [],
  productSingle: { data: null, error: null },
  updateResult: { data: { id: "p-1" }, error: null },
  listError: null,
  listErrorQueue: [],
};

function resolveFor(table: string, ops: string[]): Result {
  if (ops[0] === "update") return mockHarness.updateResult;
  if (ops.includes("maybeSingle") || ops.includes("single")) return mockHarness.productSingle;
  if (table === "products") {
    // Per-attempt overrides let a test fail the FIRST read and let the retry
    // (without `available_sizes`) succeed.
    const queued = mockHarness.listErrorQueue.shift();
    if (queued) return { data: null, error: queued };
    if (mockHarness.listError) return { data: null, error: mockHarness.listError };
    return { data: mockHarness.products, error: null };
  }
  return { data: [], error: null };
}

function mockMakeChain(table: string) {
  const ops: string[] = [];
  const eqs: Array<{ col: string; val: unknown }> = [];
  let selectCols: string | undefined;
  let payload: Record<string, unknown> | undefined;
  const record = () => {
    mockChains.push({ table, ops: [...ops], selectCols, payload, eqs: [...eqs] });
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "is", "order", "limit", "maybeSingle", "single"]) {
    chain[method] = (...args: unknown[]) => {
      ops.push(method);
      if (method === "select") selectCols = String(args[0] ?? "");
      if (method === "insert" || method === "update") {
        payload = (args[0] ?? {}) as Record<string, unknown>;
      }
      if (method === "eq") eqs.push({ col: String(args[0]), val: args[1] });
      if (method === "maybeSingle" || method === "single") {
        record();
        return Promise.resolve(resolveFor(table, ops));
      }
      return chain;
    };
  }
  chain.then = (onFulfilled: unknown, onRejected: unknown) => {
    record();
    return Promise.resolve(resolveFor(table, ops)).then(
      onFulfilled as (value: Result) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  };
  return chain;
}

const mockDb = { from: (table: string) => mockMakeChain(table) };
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockDb),
}));

import { GET, POST } from "@/app/api/admin/products/route";

const PRODUCT_ID = "11111111-2222-3333-4444-555555555555";

function getRequest(query = "") {
  return new Request(`http://localhost/api/admin/products${query}`, {
    headers: { Authorization: "Bearer test-token" },
  });
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/products", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function productsChains() {
  return mockChains.filter((call) => call.table === "products");
}

beforeEach(() => {
  mockChains.length = 0;
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
  mockHarness.products = [];
  mockHarness.productSingle = { data: null, error: null };
  mockHarness.updateResult = { data: { id: PRODUCT_ID }, error: null };
  mockHarness.listError = null;
  mockHarness.listErrorQueue = [];
  mockIsMissingSizesColumn.mockReset();
  mockIsMissingSizesColumn.mockImplementation(() => false);
  mockParseProductPayload.mockReset();
  mockSyncDefaultVariant.mockClear();
  mockReapplyProductAttributes.mockClear();
});

describe("GET /api/admin/products", () => {
  it("returns 401 before touching the database", async () => {
    mockAuth.current = { error: "Unauthorized", status: 401 };
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(mockChains).toHaveLength(0);
  });

  it("hides archived products by default", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const chain = productsChains()[0];
    expect(chain.ops).toContain("is");
  });

  it("returns archived products with ?include_archived=1", async () => {
    const res = await GET(getRequest("?include_archived=1"));
    expect(res.status).toBe(200);
    const chain = productsChains()[0];
    expect(chain.ops).not.toContain("is");
    expect(chain.ops).toContain("order");
  });

  it("selects available_sizes so the editor can round-trip sizes", async () => {
    await GET(getRequest());
    expect(productsChains()[0].selectCols).toContain("available_sizes");
  });

  it("retries the list once without available_sizes while the column is un-migrated", async () => {
    mockHarness.products = [{ id: PRODUCT_ID, name: "Galaxy Tee" }];
    mockHarness.listErrorQueue.push({
      code: "42703",
      message: "column products.available_sizes does not exist",
    });
    mockIsMissingSizesColumn.mockReturnValueOnce(true);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.products).toHaveLength(1);

    const attempts = productsChains();
    expect(attempts).toHaveLength(2);
    expect(attempts[0].selectCols).toContain("available_sizes");
    expect(attempts[1].selectCols).not.toContain("available_sizes");
  });

  it("never retries a list failure that is not the missing sizes column", async () => {
    mockHarness.listError = { code: "42501", message: "permission denied for table products" };

    const res = await GET(getRequest());

    expect(res.status).toBe(500);
    expect(productsChains()).toHaveLength(1);
    expect(mockIsMissingSizesColumn).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/products — archive / restore", () => {
  it("archives by stamping deleted_at and the archived status", async () => {
    const res = await POST(postRequest({ action: "archive", product_id: PRODUCT_ID }));
    expect(res.status).toBe(200);
    const update = productsChains().find((call) => call.ops[0] === "update");
    expect(update?.payload?.status).toBe("archived");
    expect(typeof update?.payload?.deleted_at).toBe("string");
  });

  it("restores by clearing deleted_at and falling back to draft", async () => {
    const res = await POST(postRequest({ action: "restore", product_id: PRODUCT_ID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const update = productsChains().find((call) => call.ops[0] === "update");
    expect(update?.payload?.deleted_at).toBeNull();
    expect(update?.payload?.status).toBe("draft");
    expect(update?.eqs).toEqual([{ col: "id", val: PRODUCT_ID }]);
  });

  it("rejects restore with an invalid product id before writing", async () => {
    const res = await POST(postRequest({ action: "restore", product_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(productsChains().some((call) => call.ops[0] === "update")).toBe(false);
  });
});

describe("POST /api/admin/products — update keeps published_at", () => {
  it("keeps the original published_at when re-saving a published product", async () => {
    const original = "2026-01-02T03:04:05.000Z";
    mockHarness.productSingle = { data: { id: PRODUCT_ID, published_at: original }, error: null };
    mockParseProductPayload.mockReturnValue({
      name: "Product",
      status: "published",
      published_at: "2026-11-16T10:00:00.000Z",
    });

    const res = await POST(
      postRequest({ action: "update", product_id: PRODUCT_ID, product: { name: "Product" } })
    );
    expect(res.status).toBe(200);
    const update = productsChains().find((call) => call.ops[0] === "update");
    expect(update?.payload?.published_at).toBe(original);
  });

  it("does not invent a published_at for drafts", async () => {
    mockHarness.productSingle = { data: { id: PRODUCT_ID, published_at: null }, error: null };
    mockParseProductPayload.mockReturnValue({ name: "Product", status: "draft" });

    await POST(postRequest({ action: "update", product_id: PRODUCT_ID, product: { name: "Product" } }));
    const update = productsChains().find((call) => call.ops[0] === "update");
    expect(update?.payload?.published_at).toBeUndefined();
  });
});
