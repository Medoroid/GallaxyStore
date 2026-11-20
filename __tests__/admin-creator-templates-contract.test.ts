/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/creator-templates (Phase 9: template/area
 * management):
 *   - auth FIRST (401/403 before any DB work) on every verb
 *   - POST: geometry validation (views/colors/sizes/print areas) before any
 *     insert, DB defaults derived server-side, audit on success, honest 409
 *     on a duplicate template_key
 *   - PATCH: id required, template_key frozen (it namespaces mockup paths),
 *     partial validation, honest 404, audit with the changed fields
 *   - DELETE: in-use (FK RESTRICT) → 409 "deactivate instead", audit on
 *     success
 *   - missing tables (migration not applied) → 503 MIGRATION_REQUIRED
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

const mockAudit = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/admin-audit", () => ({
  recordAdminAudit: (db: unknown, entry: unknown) => mockAudit(db, entry),
}));

type Result = { data: unknown; error: unknown };
type ChainCall = {
  table: string;
  ops: string[];
  selectCols?: string;
  payload?: Record<string, unknown>;
};

const mockChains: ChainCall[] = [];

const mockHarness: {
  list: unknown[];
  single: Result;
  insertResult: Result;
  deleteResult: Result;
  listError: { code: string; message: string } | null;
  insertError: { code: string; message: string } | null;
  updateError: { code: string; message: string } | null;
  deleteError: { code: string; message: string } | null;
} = {
  list: [],
  single: { data: null, error: null },
  insertResult: { data: null, error: null },
  deleteResult: { data: null, error: null },
  listError: null,
  insertError: null,
  updateError: null,
  deleteError: null,
};

function mockMakeChain(table: string) {
  const ops: string[] = [];
  let selectCols: string | undefined;
  let payload: Record<string, unknown> | undefined;
  const record = () => {
    mockChains.push({ table, ops: [...ops], selectCols, payload });
  };
  const resolve = (): Result => {
    const terminal = ops.includes("maybeSingle") || ops.includes("single");
    if (ops[0] === "insert") {
      return mockHarness.insertError
        ? { data: null, error: mockHarness.insertError }
        : mockHarness.insertResult;
    }
    if (ops[0] === "delete") {
      return mockHarness.deleteError
        ? { data: null, error: mockHarness.deleteError }
        : mockHarness.deleteResult;
    }
    if (ops[0] === "update") return { data: null, error: mockHarness.updateError };
    if (terminal) return mockHarness.single;
    return mockHarness.listError
      ? { data: null, error: mockHarness.listError }
      : { data: mockHarness.list, error: null };
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "order", "maybeSingle", "single"];
  for (const method of methods) {
    chain[method] = (...args: unknown[]) => {
      ops.push(method);
      if (method === "select") selectCols = String(args[0] ?? "");
      if (method === "insert" || method === "update") {
        payload = (args[0] ?? {}) as Record<string, unknown>;
      }
      if (method === "maybeSingle" || method === "single") {
        record();
        return Promise.resolve(resolve());
      }
      return chain;
    };
  }
  chain.then = (onFulfilled: unknown, onRejected: unknown) => {
    record();
    return Promise.resolve(resolve()).then(
      onFulfilled as (value: Result) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  };
  return chain;
}

const mockDb = {
  from: (table: string) => mockMakeChain(table),
};
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockDb),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/creator-templates/route";

const ID = "11111111-2222-3333-4444-555555555555";

const VALID_VIEWS = [
  {
    key: "front",
    label: "Front",
    canvas: { w: 1000, h: 1000 },
    print_area: { x: 350, y: 290, w: 300, h: 400 },
  },
];
const VALID_COLORS = [
  { key: "black", name: "Black", name_ar: "أسود", hex: "#1f1f1f", shade_hex: "#000000" },
];
const VALID_SIZES = [{ key: "m", name: "Medium", label: "M" }];

const VALID_TEMPLATE = {
  template_key: "hoodie",
  name: "Hoodie",
  views: VALID_VIEWS,
  colors: VALID_COLORS,
  sizes: VALID_SIZES,
};

function makeRequest(
  method: string,
  { body, query = "", authed = true }: { body?: unknown; query?: string; authed?: boolean } = {}
): Request {
  return new Request(`http://localhost:3000/api/admin/creator-templates${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authed ? { Authorization: "Bearer token" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function chainsWith(op: string): ChainCall[] {
  return mockChains.filter((call) => call.ops[0] === op);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChains.length = 0;
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
  mockHarness.list = [];
  mockHarness.single = { data: null, error: null };
  mockHarness.insertResult = { data: null, error: null };
  mockHarness.deleteResult = { data: null, error: null };
  mockHarness.listError = null;
  mockHarness.insertError = null;
  mockHarness.updateError = null;
  mockHarness.deleteError = null;
});

describe("authentication (every verb)", () => {
  test.each([
    ["GET", () => GET(makeRequest("GET"))],
    ["POST", () => POST(makeRequest("POST", { body: VALID_TEMPLATE }))],
    ["PATCH", () => PATCH(makeRequest("PATCH", { body: { id: ID, name: "New" } }))],
    ["DELETE", () => DELETE(makeRequest("DELETE", { query: `?id=${ID}` }))],
  ])("%s returns 401/403 before touching the database", async (_label, run) => {
    mockAuth.current = { error: "Authorization required", status: 401 };
    const res = await run();
    expect(res.status).toBe(401);
    expect(mockChains).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("GET (catalog)", () => {
  test("returns the full template list to an admin", async () => {
    mockHarness.list = [{ id: ID, template_key: "tshirt", name: "T-Shirt" }];
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.templates).toHaveLength(1);
    expect(chainsWith("select")).toHaveLength(1);
  });

  test("missing table → 503 MIGRATION_REQUIRED", async () => {
    mockHarness.listError = {
      code: "PGRST205",
      message: "Could not find the table 'public.creator_product_templates' in the schema cache",
    };
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });

  test("a database failure is reported as a failure", async () => {
    mockHarness.listError = { code: "XX000", message: "boom" };
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});

describe("POST (create)", () => {
  test("400 without a name — no insert", async () => {
    const res = await POST(
      makeRequest("POST", { body: { ...VALID_TEMPLATE, name: undefined } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("name");
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on an invalid template_key — no insert", async () => {
    const res = await POST(
      makeRequest("POST", { body: { ...VALID_TEMPLATE, template_key: "Bad Key!" } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("template_key");
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 when views is empty — a template with no print area is unusable", async () => {
    const res = await POST(makeRequest("POST", { body: { ...VALID_TEMPLATE, views: [] } }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.field).toBe("views");
    expect(json.message).toMatch(/at least one view/i);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on a zero-width print area — geometry is validated, not trusted", async () => {
    const res = await POST(
      makeRequest("POST", {
        body: {
          ...VALID_TEMPLATE,
          views: [{ ...VALID_VIEWS[0], print_area: { x: 0, y: 0, w: 0, h: 100 } }],
        },
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/print_area/);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on a malformed color hex", async () => {
    const res = await POST(
      makeRequest("POST", {
        body: { ...VALID_TEMPLATE, colors: [{ key: "black", name: "Black", hex: "black" }] },
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("colors");
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("201 with server-derived defaults and an audit entry", async () => {
    mockHarness.insertResult = { data: { id: ID, template_key: "hoodie" }, error: null };
    const res = await POST(makeRequest("POST", { body: VALID_TEMPLATE }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    const insert = chainsWith("insert")[0];
    expect(insert.table).toBe("creator_product_templates");
    expect(insert.payload).toMatchObject({
      template_key: "hoodie",
      name: "Hoodie",
      category: "custom",
      mockup_format: "png",
      is_active: true,
      sort_order: 0,
    });

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityType: string };
    expect(entry.action).toBe("creator_template.create");
    expect(entry.entityType).toBe("creator_product_template");
  });

  test("duplicate template_key → 409, no audit", async () => {
    mockHarness.insertError = { code: "23505", message: "duplicate key" };
    const res = await POST(makeRequest("POST", { body: VALID_TEMPLATE }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("template_key_taken");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("missing table → 503 before any insert or audit", async () => {
    mockHarness.insertError = {
      code: "42P01",
      message: 'relation "public.creator_product_templates" does not exist',
    };
    const res = await POST(makeRequest("POST", { body: VALID_TEMPLATE }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH (update)", () => {
  test("400 on a non-UUID id — no queries", async () => {
    const res = await PATCH(makeRequest("PATCH", { body: { id: "nope", name: "New" } }));
    expect(res.status).toBe(400);
    expect(mockChains).toHaveLength(0);
  });

  test("template_key is frozen — 400 without touching the database", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { body: { id: ID, template_key: "renamed" } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("template_key");
    expect(mockChains).toHaveLength(0);
  });

  test("400 when nothing updatable is provided", async () => {
    const res = await PATCH(makeRequest("PATCH", { body: { id: ID } }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("no_changes");
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("404 when the template does not exist", async () => {
    mockHarness.single = { data: null, error: null };
    const res = await PATCH(makeRequest("PATCH", { body: { id: ID, name: "New" } }));
    expect(res.status).toBe(404);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("partial update writes only provided fields and audits them", async () => {
    mockHarness.single = { data: { id: ID, template_key: "tshirt" }, error: null };
    mockHarness.insertResult = { data: { id: ID, name: "New Name" }, error: null };

    const res = await PATCH(
      makeRequest("PATCH", { body: { id: ID, name: "New Name", is_active: false } })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const update = chainsWith("update")[0];
    expect(update.table).toBe("creator_product_templates");
    expect(update.payload).toMatchObject({ name: "New Name", is_active: false });
    expect(update.payload).not.toHaveProperty("template_key");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; details: { fields: string[] } };
    expect(entry.action).toBe("creator_template.update");
    expect(entry.details.fields.sort()).toEqual(["is_active", "name"]);
  });

  test("missing table on the read → 503 before any update", async () => {
    mockHarness.single = {
      data: null,
      error: { code: "42P01", message: 'relation "public.creator_product_templates" does not exist' },
    };
    const res = await PATCH(makeRequest("PATCH", { body: { id: ID, name: "New" } }));
    expect(res.status).toBe(503);
    expect(chainsWith("update")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("DELETE", () => {
  test("400 on a non-UUID id — no delete", async () => {
    const res = await DELETE(makeRequest("DELETE", { query: "?id=nope" }));
    expect(res.status).toBe(400);
    expect(chainsWith("delete")).toHaveLength(0);
  });

  test("404 when the template does not exist", async () => {
    mockHarness.deleteResult = { data: null, error: null };
    const res = await DELETE(makeRequest("DELETE", { query: `?id=${ID}` }));
    expect(res.status).toBe(404);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("in-use (FK RESTRICT) → 409 deactivate-instead, no audit", async () => {
    mockHarness.deleteError = {
      code: "23503",
      message: "violates foreign key constraint",
    };
    const res = await DELETE(makeRequest("DELETE", { query: `?id=${ID}` }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("template_in_use");
    expect(json.message).toMatch(/deactivate/i);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("successful delete audits the removal", async () => {
    mockHarness.deleteResult = { data: { id: ID, template_key: "tshirt" }, error: null };
    const res = await DELETE(makeRequest("DELETE", { query: `?id=${ID}` }));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityId: string };
    expect(entry.action).toBe("creator_template.delete");
    expect(entry.entityId).toBe(ID);
  });

  test("missing table → 503 before any delete or audit", async () => {
    mockHarness.deleteError = {
      code: "42P01",
      message: 'relation "public.creator_product_templates" does not exist',
    };
    const res = await DELETE(makeRequest("DELETE", { query: `?id=${ID}` }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
