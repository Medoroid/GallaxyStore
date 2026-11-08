/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/content (admin-managed banners + sections):
 *   - auth FIRST (401/403 before any body validation) on every verb
 *   - create: validation (400) before any insert, sort_order derived from the
 *     stored max (never from the client), audit entry on success
 *   - update: partial validation, schedule-window merge against the stored
 *     row (mirrors the DB CHECK), honest 404
 *   - reorder: only UUID-shaped ids are applied
 *   - delete: storage object removed by parsed path; a storage failure never
 *     fails the delete; audit entry on success
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

type ChainResult = { data: unknown; error: unknown };
type ChainCall = {
  table: string;
  ops: string[];
  selectCols?: string;
  payload?: Record<string, unknown>;
};

const mockChains: ChainCall[] = [];
const mockLists: Record<string, unknown[]> = {
  site_banners: [],
  site_sections: [],
};
const mockHarness: {
  maxRow: ChainResult;
  existingRow: ChainResult;
  insertRow: ChainResult;
  updateRow: ChainResult;
  listError: { code: string; message: string } | null;
  removeError: { message: string } | null;
} = {
  maxRow: { data: { sort_order: 3 }, error: null },
  existingRow: { data: null, error: null },
  insertRow: { data: null, error: null },
  updateRow: { data: null, error: null },
  listError: null,
  removeError: null,
};

const mockRemove = jest.fn(async () => ({ error: mockHarness.removeError }));

function mockMakeChain(table: string) {
  const ops: string[] = [];
  let selectCols: string | undefined;
  let payload: Record<string, unknown> | undefined;
  const record = () => {
    mockChains.push({ table, ops: [...ops], selectCols, payload });
  };
  const resolve = (): ChainResult => {
    const terminal =
      ops.includes("maybeSingle") || ops.includes("single");
    if (terminal) {
      if (ops[0] === "select" && selectCols === "sort_order") return mockHarness.maxRow;
      if (ops[0] === "select") return mockHarness.existingRow;
      if (ops[0] === "insert") return mockHarness.insertRow;
      if (ops[0] === "update") return mockHarness.updateRow;
      return { data: null, error: null };
    }
    if (ops[0] === "select") {
      return mockHarness.listError
        ? { data: null, error: mockHarness.listError }
        : { data: mockLists[table] ?? [], error: null };
    }
    return { data: null, error: null };
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "limit",
    "maybeSingle",
    "single",
  ];
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
  // Terminal await (e.g. GET's .order() chain or update/delete without .single()).
  chain.then = (onFulfilled: unknown, onRejected: unknown) => {
    record();
    return Promise.resolve(resolve()).then(
      onFulfilled as (value: ChainResult) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  };
  return chain;
}

const mockDb = {
  from: (table: string) => mockMakeChain(table),
  storage: { from: jest.fn(() => ({ remove: mockRemove })) },
};
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockDb),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/content/route";

const ID = "11111111-2222-3333-4444-555555555555";

const FULL_BANNER_ROW = {
  id: ID,
  page: "home",
  placement: "after_hero",
  title: "Old title",
  subtitle: null,
  image_url: null,
  link_url: null,
  button_label: null,
  sort_order: 2,
  is_active: true,
  starts_at: null,
  ends_at: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

const FULL_SECTION_ROW = {
  id: ID,
  page: "home",
  placement: "mid_page",
  section_type: "rich_text",
  eyebrow: null,
  title: "Old section",
  body: "Stored body text",
  image_url: null,
  link_url: null,
  button_label: null,
  config: { cards: [] },
  sort_order: 1,
  is_active: true,
  starts_at: null,
  ends_at: null,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

const VALID_BANNER = {
  type: "banner",
  page: "home",
  placement: "after_hero",
  title: "Mid-season sale",
  subtitle: "20% off",
  image_url: "https://cdn.example.com/banner.jpg",
  link_url: "/products",
  button_label: "Shop now",
  is_active: true,
  starts_at: null,
  ends_at: null,
};

function makeRequest(
  method: string,
  { body, query = "", authed = true }: { body?: unknown; query?: string; authed?: boolean } = {}
): Request {
  return new Request(`http://localhost:3000/api/admin/content${query}`, {
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
  mockHarness.maxRow = { data: { sort_order: 3 }, error: null };
  mockHarness.existingRow = { data: null, error: null };
  mockHarness.insertRow = { data: null, error: null };
  mockHarness.updateRow = { data: null, error: null };
  mockHarness.listError = null;
  mockHarness.removeError = null;
  mockLists.site_banners = [];
  mockLists.site_sections = [];
});

describe("authentication (every verb)", () => {
  test.each([
    ["GET", () => GET(makeRequest("GET"))],
    ["POST", () => POST(makeRequest("POST", { body: VALID_BANNER }))],
    ["PATCH", () => PATCH(makeRequest("PATCH", { body: { type: "banner", id: "x" } }))],
    ["DELETE", () => DELETE(makeRequest("DELETE", { query: "?type=banner&id=x" }))],
  ])("%s returns 401 before touching the database", async (_label, run) => {
    mockAuth.current = { error: "Authorization required", status: 401 };
    const res = await run();
    expect(res.status).toBe(401);
    expect(mockChains).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("GET (list)", () => {
  test("returns both lists to an admin", async () => {
    mockLists.site_banners = [{ id: "b1", placement: "top_strip" }];
    mockLists.site_sections = [{ id: "s1", placement: "mid_page" }];
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.banners).toHaveLength(1);
    expect(json.sections).toHaveLength(1);
  });

  test("reports a database failure as a failure, never as success", async () => {
    mockHarness.listError = { code: "XX000", message: "boom" };
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe("POST (create)", () => {
  test("400 without a type", async () => {
    const res = await POST(makeRequest("POST", { body: { placement: "mid_page" } }));
    expect(res.status).toBe(400);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on an unknown placement — no insert", async () => {
    const res = await POST(
      makeRequest("POST", { body: { ...VALID_BANNER, placement: "footer" } })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/placement/i);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 when a banner has neither title nor image", async () => {
    const res = await POST(
      makeRequest("POST", { body: { ...VALID_BANNER, title: "", image_url: "" } })
    );
    expect(res.status).toBe(400);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on invalid JSON", async () => {
    const req = new Request("http://localhost:3000/api/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("201 with derived sort_order, created_by and an audit entry", async () => {
    mockHarness.insertRow = { data: { id: "new-id", placement: "after_hero" }, error: null };
    const res = await POST(makeRequest("POST", { body: VALID_BANNER }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.type).toBe("banner");

    const insert = chainsWith("insert")[0];
    expect(insert.table).toBe("site_banners");
    expect(insert.payload?.sort_order).toBe(4); // stored max (3) + 1
    expect(insert.payload?.created_by).toBe("admin-uid-1");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityType: string };
    expect(entry.action).toBe("content.banner.create");
    expect(entry.entityType).toBe("site_banner");
  });

  test("database failure is reported as a failure, never as success", async () => {
    mockHarness.insertRow = { data: null, error: { code: "XX000", message: "boom" } };
    const res = await POST(makeRequest("POST", { body: VALID_BANNER }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH (update / reorder)", () => {
  test("reorder applies only UUID-shaped ids", async () => {
    const res = await PATCH(
      makeRequest("PATCH", {
        body: {
          type: "banner",
          order: [{ id: "not-a-uuid" }, { id: "11111111-2222-3333-4444-555555555555" }],
        },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toBe(1);

    const updates = chainsWith("update");
    expect(updates).toHaveLength(1);
    // Valid id sat at index 1 of the submitted order -> sort_order = index + 1.
    expect(updates[0].payload?.sort_order).toBe(2);
    expect(mockAudit).not.toHaveBeenCalled(); // reordering is not an audited edit
  });

  test("reorder with no valid ids is a 400", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { body: { type: "banner", order: [{ id: "nope" }] } })
    );
    expect(res.status).toBe(400);
  });

  test("400 without a type", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { body: { id: "11111111-2222-3333-4444-555555555555" } })
    );
    expect(res.status).toBe(400);
  });

  test("404 when the row does not exist", async () => {
    mockHarness.existingRow = { data: null, error: null };
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { type: "banner", id: ID, title: "New" },
      })
    );
    expect(res.status).toBe(404);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("rejects an end date before the stored start date (merged window)", async () => {
    mockHarness.existingRow = {
      data: { ...FULL_BANNER_ROW, starts_at: "2026-11-20T00:00:00.000Z" },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { type: "banner", id: ID, ends_at: "2026-11-01T00:00:00.000Z" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/end date/i);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("rejects an edit that breaks the section type rules (merged validation)", async () => {
    mockHarness.existingRow = {
      data: {
        ...FULL_SECTION_ROW,
        section_type: "image_text",
        image_url: "https://cdn.example.com/x.jpg",
      },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { type: "section", id: ID, image_url: "" } })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/image/i);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("updates and records an audit entry", async () => {
    mockHarness.existingRow = { data: FULL_SECTION_ROW, error: null };
    mockHarness.updateRow = {
      data: { ...FULL_SECTION_ROW, title: "Updated" },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { type: "section", id: ID, title: "Updated" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.type).toBe("section");

    const updates = chainsWith("update");
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("site_sections");
    expect(updates[0].payload?.title).toBe("Updated");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("content.section.update");
  });

  test("400 on an unknown section type", async () => {
    mockHarness.existingRow = { data: FULL_SECTION_ROW, error: null };
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { type: "section", id: ID, section_type: "carousel" },
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE", () => {
  test("400 on a non-UUID id", async () => {
    const res = await DELETE(
      makeRequest("DELETE", { query: "?type=banner&id=not-a-uuid" })
    );
    expect(res.status).toBe(400);
    expect(chainsWith("delete")).toHaveLength(0);
  });

  test("404 when the row does not exist", async () => {
    mockHarness.existingRow = { data: null, error: null };
    const res = await DELETE(
      makeRequest("DELETE", { query: "?type=banner&id=11111111-2222-3333-4444-555555555555" })
    );
    expect(res.status).toBe(404);
    expect(chainsWith("delete")).toHaveLength(0);
  });

  test("removes the storage object parsed from the public URL and audits", async () => {
    mockHarness.existingRow = {
      data: {
        id: "11111111-2222-3333-4444-555555555555",
        image_url:
          "https://proj.supabase.co/storage/v1/object/public/site-banners/site/abc.jpg",
      },
      error: null,
    };
    const res = await DELETE(
      makeRequest("DELETE", { query: "?type=banner&id=11111111-2222-3333-4444-555555555555" })
    );
    expect(res.status).toBe(200);
    expect(chainsWith("delete")).toHaveLength(1);
    expect(mockRemove).toHaveBeenCalledWith(["site/abc.jpg"]);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("content.banner.delete");
  });

  test("does not call storage for external image URLs", async () => {
    mockHarness.existingRow = {
      data: {
        id: "11111111-2222-3333-4444-555555555555",
        image_url: "https://cdn.example.com/x.jpg",
      },
      error: null,
    };
    const res = await DELETE(
      makeRequest("DELETE", { query: "?type=section&id=11111111-2222-3333-4444-555555555555" })
    );
    expect(res.status).toBe(200);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test("a storage failure never fails the delete (file leak is logged)", async () => {
    mockHarness.existingRow = {
      data: {
        id: "11111111-2222-3333-4444-555555555555",
        image_url:
          "https://proj.supabase.co/storage/v1/object/public/site-banners/site/abc.jpg",
      },
      error: null,
    };
    mockHarness.removeError = { message: "bucket busy" };
    const res = await DELETE(
      makeRequest("DELETE", { query: "?type=banner&id=11111111-2222-3333-4444-555555555555" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("400 when the type is missing", async () => {
    const res = await DELETE(
      makeRequest("DELETE", { query: "?id=11111111-2222-3333-4444-555555555555" })
    );
    expect(res.status).toBe(400);
  });
});
