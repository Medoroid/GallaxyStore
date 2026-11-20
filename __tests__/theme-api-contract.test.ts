/**
 * @jest-environment node
 *
 * Contract tests — Theme Studio admin APIs:
 *   /api/admin/themes           (GET list, POST create)
 *   /api/admin/themes/[id]      (GET, PATCH, DELETE)
 *
 *   - auth FIRST (401 before any database access) on every verb
 *   - create: server-side validation (400) before any insert — a hostile
 *     theme_config can never reach storage; slug derived from the name;
 *     lifecycle history + audit + cache invalidation on success
 *   - update: partial validation, window check against the STORED row
 *     (mirrors the DB CHECK), honest 404, status changes recorded
 *   - delete: refuses while the theme is the manual override, the configured
 *     default, or the theme the resolver would render right now
 *   - duplicate: POST .../duplicate clones into a NEW DRAFT (201) — a copy
 *     can never change the live storefront; slug collisions retry once,
 *     then answer 409
 *   - missing theme tables (migration not applied) → 503
 *     THEME_MIGRATION_REQUIRED on every verb — never a fake success
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

jest.mock("@/lib/themes/server", () => ({
  invalidateThemeCache: jest.fn(),
  getResolvedTheme: jest.fn(),
}));

type Result = { data: unknown; error: { code?: string; message: string } | null };
type ChainCall = { table: string; ops: string[]; payload?: Record<string, unknown> };

const mockChains: ChainCall[] = [];
const mockQueues: Record<string, Result[]> = {};

function enqueue(table: string, result: Result): void {
  (mockQueues[table] ??= []).push(result);
}

function nextResult(table: string): Result {
  const queue = mockQueues[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return { data: null, error: null };
}

function mockMakeChain(table: string) {
  const ops: string[] = [];
  let payload: Record<string, unknown> | undefined;
  const record = () => mockChains.push({ table, ops: [...ops], payload });
  const resolve = (): Result => {
    record();
    return nextResult(table);
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
      if (method === "insert" || method === "update") {
        payload = (args[0] ?? {}) as Record<string, unknown>;
      }
      if (method === "maybeSingle" || method === "single") {
        return Promise.resolve(resolve());
      }
      return chain;
    };
  }
  // Terminal await (chains without .single(), e.g. history inserts).
  chain.then = (onFulfilled: unknown, onRejected: unknown) => {
    return Promise.resolve(resolve()).then(
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

import { GET as listGET, POST as listPOST } from "@/app/api/admin/themes/route";
import {
  GET as idGET,
  PATCH as idPATCH,
  DELETE as idDELETE,
} from "@/app/api/admin/themes/[id]/route";
import { POST as duplicatePOST } from "@/app/api/admin/themes/[id]/duplicate/route";
import { getResolvedTheme, invalidateThemeCache } from "@/lib/themes/server";

const ID = "11111111-2222-3333-4444-555555555555";
const MISSING_TABLES: Result = {
  data: null,
  error: { code: "42P01", message: 'relation "store_themes" does not exist' },
};

const FULL_ROW: Record<string, unknown> = {
  id: ID,
  name: "Ramadan 2027",
  slug: "ramadan-2027",
  description: null,
  category: "seasonal",
  preview_image: null,
  theme_config: {},
  status: "draft",
  priority: 0,
  activation_mode: "manual",
  starts_at: null,
  ends_at: null,
  timezone: "UTC",
  is_recurring: false,
  created_by: "admin-uid-1",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

function listRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/admin/themes", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function idRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost:3000/api/admin/themes/${ID}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function duplicateRequest(method: string): Request {
  return new Request(`http://localhost:3000/api/admin/themes/${ID}/duplicate`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
  });
}

function params(id: string = ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function chainsWith(op: string): ChainCall[] {
  return mockChains.filter((call) => call.ops[0] === op);
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations — drop any per-test resolver stub.
  (getResolvedTheme as jest.Mock).mockReset();
  mockChains.length = 0;
  for (const key of Object.keys(mockQueues)) delete mockQueues[key];
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
});

describe("authentication (every verb)", () => {
  test.each([
    ["GET list", () => listGET(listRequest("GET"))],
    ["POST create", () => listPOST(listRequest("POST", { name: "X" }))],
    ["GET one", () => idGET(idRequest("GET"), params())],
    ["PATCH", () => idPATCH(idRequest("PATCH", { name: "X" }), params())],
    ["DELETE", () => idDELETE(idRequest("DELETE"), params())],
    ["POST duplicate", () => duplicatePOST(duplicateRequest("POST"), params())],
  ])("%s returns 401 before touching the database", async (_label, run) => {
    mockAuth.current = { error: "Authorization required", status: 401 };
    const res = await run();
    expect(res.status).toBe(401);
    expect(mockChains).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/themes (list)", () => {
  test("returns themes, settings, conflicts and a resolved preview", async () => {
    enqueue("store_themes", { data: [{ ...FULL_ROW, status: "active" }], error: null });
    enqueue("theme_settings", {
      data: { default_theme_id: null, manual_override_theme_id: null },
      error: null,
    });

    const res = await listGET(listRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.themes).toHaveLength(1);
    expect(json.settings).toBeTruthy();
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.resolved).toMatchObject({ id: ID, name: "Ramadan 2027" });
    expect(typeof json.resolved.source).toBe("string");
  });

  test("missing theme tables → 503 THEME_MIGRATION_REQUIRED", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await listGET(listRequest("GET"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("THEME_MIGRATION_REQUIRED");
    expect(json.message).toContain("20261110100000_theme_management.sql");
  });
});

describe("POST /api/admin/themes (create)", () => {
  test("400 without a name — no insert", async () => {
    const res = await listPOST(listRequest("POST", { category: "seasonal" }));
    expect(res.status).toBe(400);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on an unknown status — no insert", async () => {
    const res = await listPOST(listRequest("POST", { name: "X", status: "live" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/status/);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 when ends_at is not after starts_at — no insert", async () => {
    const res = await listPOST(
      listRequest("POST", {
        name: "X",
        starts_at: "2026-12-01T00:00:00.000Z",
        ends_at: "2026-11-01T00:00:00.000Z",
      })
    );
    expect(res.status).toBe(400);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on a hostile theme_config — nothing reaches storage", async () => {
    const res = await listPOST(
      listRequest("POST", {
        name: "Evil",
        theme_config: { colors: { primary: "red; } * { display: none" } },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("theme_config");
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("400 on an off-whitelist heading font", async () => {
    const res = await listPOST(
      listRequest("POST", {
        name: "Font",
        theme_config: { typography: { headingFont: "Comic Sans MS" } },
      })
    );
    expect(res.status).toBe(400);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("201 with derived slug, lifecycle history, audit and cache invalidation", async () => {
    enqueue("store_themes", {
      data: { ...FULL_ROW, name: "Eid al-Fitr 2026", slug: "eid-al-fitr-2026" },
      error: null,
    });
    enqueue("theme_schedule_history", { data: null, error: null });

    const res = await listPOST(listRequest("POST", { name: "Eid al-Fitr 2026" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    const insert = chainsWith("insert")[0];
    expect(insert.table).toBe("store_themes");
    expect(insert.payload?.slug).toBe("eid-al-fitr-2026");
    expect(insert.payload?.created_by).toBe("admin-uid-1");
    expect(insert.payload?.status).toBe("draft");

    const history = chainsWith("insert")[1];
    expect(history.table).toBe("theme_schedule_history");
    expect(history.payload?.action).toBe("create");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityType: string };
    expect(entry.action).toBe("theme.create");
    expect(entry.entityType).toBe("store_theme");
    expect(invalidateThemeCache).toHaveBeenCalledTimes(1);
  });

  test("duplicate slug → 409", async () => {
    enqueue("store_themes", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const res = await listPOST(listRequest("POST", { name: "X", slug: "taken-slug" }));
    expect(res.status).toBe(409);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("missing theme tables → 503 THEME_MIGRATION_REQUIRED", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await listPOST(listRequest("POST", { name: "X" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("THEME_MIGRATION_REQUIRED");
  });
});

describe("GET /api/admin/themes/[id]", () => {
  test("400 on a non-UUID id", async () => {
    const res = await idGET(idRequest("GET"), params("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockChains).toHaveLength(0);
  });

  test("404 for an unknown theme", async () => {
    enqueue("store_themes", { data: null, error: null });
    const res = await idGET(idRequest("GET"), params());
    expect(res.status).toBe(404);
  });

  test("returns the theme with versions and history", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null });
    enqueue("theme_versions", { data: [{ id: "v1", version: 1, note: null }], error: null });
    enqueue("theme_schedule_history", { data: [], error: null });

    const res = await idGET(idRequest("GET"), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.theme.id).toBe(ID);
    expect(json.versions).toHaveLength(1);
    expect(Array.isArray(json.history)).toBe(true);
  });

  test("missing theme tables → 503", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await idGET(idRequest("GET"), params());
    expect(res.status).toBe(503);
  });
});

describe("PATCH /api/admin/themes/[id]", () => {
  test("400 on a non-UUID id — no database access", async () => {
    const res = await idPATCH(idRequest("PATCH", { name: "X" }), params("nope"));
    expect(res.status).toBe(400);
    expect(mockChains).toHaveLength(0);
  });

  test("400 on an empty body", async () => {
    const res = await idPATCH(idRequest("PATCH", {}), params());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/No fields/);
  });

  test("404 for an unknown theme — no update", async () => {
    enqueue("store_themes", { data: null, error: null });
    const res = await idPATCH(idRequest("PATCH", { name: "X" }), params());
    expect(res.status).toBe(404);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("400 when ends_at conflicts with the STORED starts_at", async () => {
    enqueue("store_themes", {
      data: { ...FULL_ROW, starts_at: "2026-12-01T00:00:00.000Z" },
      error: null,
    });
    const res = await idPATCH(
      idRequest("PATCH", { ends_at: "2026-11-01T00:00:00.000Z" }),
      params()
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/ends_at/);
    expect(chainsWith("update")).toHaveLength(0);
  });

  test("partial update: audit, cache invalidation, no history for plain edits", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme
    enqueue("store_themes", {
      data: { ...FULL_ROW, name: "Renamed" },
      error: null,
    }); // update

    const res = await idPATCH(idRequest("PATCH", { name: "Renamed" }), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.theme.name).toBe("Renamed");

    const update = chainsWith("update")[0];
    expect(update.table).toBe("store_themes");
    expect(update.payload?.name).toBe("Renamed");
    expect(update.payload?.updated_at).toBeTruthy();

    // No status/schedule change → no lifecycle row.
    expect(chainsWith("insert")).toHaveLength(0);

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("theme.update");
    expect(invalidateThemeCache).toHaveBeenCalledTimes(1);
  });

  test("status change records lifecycle history and audits the transition", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme (draft)
    enqueue("store_themes", {
      data: { ...FULL_ROW, status: "active" },
      error: null,
    }); // update
    enqueue("theme_schedule_history", { data: null, error: null });

    const res = await idPATCH(idRequest("PATCH", { status: "active" }), params());
    expect(res.status).toBe(200);

    const history = chainsWith("insert")[0];
    expect(history.table).toBe("theme_schedule_history");
    expect(history.payload?.action).toBe("activate");

    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("theme.active");
    expect(invalidateThemeCache).toHaveBeenCalledTimes(1);
  });

  test("missing theme tables → 503", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await idPATCH(idRequest("PATCH", { name: "X" }), params());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("THEME_MIGRATION_REQUIRED");
  });
});

describe("DELETE /api/admin/themes/[id]", () => {
  test("409 while the theme is the current manual override", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme
    enqueue("theme_settings", {
      data: { manual_override_theme_id: ID },
      error: null,
    });

    const res = await idDELETE(idRequest("DELETE"), params());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toMatch(/override/i);
    expect(chainsWith("delete")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("deletes a non-override theme with audit + cache invalidation", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme
    enqueue("theme_settings", { data: null, error: null });
    enqueue("store_themes", { data: null, error: null }); // delete

    const res = await idDELETE(idRequest("DELETE"), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deleted).toBe(ID);

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("theme.delete");
    expect(invalidateThemeCache).toHaveBeenCalledTimes(1);
  });

  test("missing theme tables → 503", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await idDELETE(idRequest("DELETE"), params());
    expect(res.status).toBe(503);
  });

  test("409 while the theme is the configured default", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme
    enqueue("theme_settings", {
      data: { manual_override_theme_id: null, default_theme_id: ID },
      error: null,
    });

    const res = await idDELETE(idRequest("DELETE"), params());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toMatch(/default/i);
    expect(chainsWith("delete")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("409 while the theme is the one the storefront renders right now", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // loadTheme
    enqueue("theme_settings", {
      data: { manual_override_theme_id: null, default_theme_id: null },
      error: null,
    });
    (getResolvedTheme as jest.Mock).mockResolvedValue({ theme: { id: ID } });

    const res = await idDELETE(idRequest("DELETE"), params());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toMatch(/live on the storefront/i);
    expect(chainsWith("delete")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/themes/[id]/duplicate", () => {
  test("400 on a non-UUID id — no database access", async () => {
    const res = await duplicatePOST(duplicateRequest("POST"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(mockChains).toHaveLength(0);
  });

  test("404 for an unknown theme — no insert", async () => {
    enqueue("store_themes", { data: null, error: null });
    const res = await duplicatePOST(duplicateRequest("POST"), params());
    expect(res.status).toBe(404);
    expect(chainsWith("insert")).toHaveLength(0);
  });

  test("201 creates a draft copy with a fresh slug, history, audit and cache invalidation", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // source
    enqueue("store_themes", {
      data: {
        ...FULL_ROW,
        id: "new-id",
        name: "Ramadan 2027 (copy)",
        slug: "ramadan-2027-copy",
        status: "draft",
      },
      error: null,
    }); // insert

    const res = await duplicatePOST(duplicateRequest("POST"), params());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.theme.status).toBe("draft");
    expect(json.theme.name).toBe("Ramadan 2027 (copy)");
    expect(json.theme.slug).toBe("ramadan-2027-copy");

    const inserts = chainsWith("insert").filter((call) => call.table === "store_themes");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("store_themes");
    expect(inserts[0].payload?.status).toBe("draft");
    expect(inserts[0].payload?.created_by).toBe("admin-uid-1");
    // The copy inherits the source's schedule/priority — an identical base.
    expect(inserts[0].payload?.priority).toBe(FULL_ROW.priority);
    expect(inserts[0].payload?.activation_mode).toBe(FULL_ROW.activation_mode);

    const history = mockChains.find((call) => call.table === "theme_schedule_history");
    expect(history?.payload?.action).toBe("create");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as {
      action: string;
      details: { source_id: string };
    };
    expect(entry.action).toBe("theme.duplicate");
    expect(entry.details.source_id).toBe(ID);
    expect(invalidateThemeCache).toHaveBeenCalledTimes(1);
  });

  test("retries a slug collision once with a random suffix", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // source
    enqueue("store_themes", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    enqueue("store_themes", {
      data: { ...FULL_ROW, id: "new-id", slug: "ramadan-2027-copy-x1y2z3", status: "draft" },
      error: null,
    });

    const res = await duplicatePOST(duplicateRequest("POST"), params());
    expect(res.status).toBe(201);
    const inserts = chainsWith("insert").filter((call) => call.table === "store_themes");
    expect(inserts).toHaveLength(2);
    expect(inserts[1].payload?.slug).not.toBe(inserts[0].payload?.slug);
  });

  test("409 when the retry slug collides too — no fake success", async () => {
    enqueue("store_themes", { data: FULL_ROW, error: null }); // source
    const conflict = {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    };
    enqueue("store_themes", conflict);
    enqueue("store_themes", conflict);

    const res = await duplicatePOST(duplicateRequest("POST"), params());
    expect(res.status).toBe(409);
    expect(mockAudit).not.toHaveBeenCalled();
    expect(invalidateThemeCache).not.toHaveBeenCalled();
  });

  test("missing theme tables → 503", async () => {
    enqueue("store_themes", MISSING_TABLES);
    const res = await duplicatePOST(duplicateRequest("POST"), params());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("THEME_MIGRATION_REQUIRED");
    expect(chainsWith("insert")).toHaveLength(0);
  });
});
