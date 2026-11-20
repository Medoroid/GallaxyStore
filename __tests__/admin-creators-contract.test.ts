/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/creators (Phase 9: creator management):
 *   - auth FIRST (401/403 before any DB/RPC work) on every verb
 *   - GET: UNION queue (both submission tables merged by submitted_at),
 *     per-creator stats from the status scans, honest 503 on missing tables
 *   - PATCH review: allow-listed shapes only, reject requires a reason, the
 *     RPC receives the ACTOR parameters, and approval columns are NEVER
 *     written directly (creators cannot self-approve — verifyAdmin + RPC)
 *   - PATCH feature/permissions/archive: boolean columns only + audit
 *   - PATCH archive_submission: product hidden BEFORE the row flips
 *   - review RPC failures map review:* → house codes; a missing phase-7
 *     function → 503 MIGRATION_REQUIRED naming the file
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
  eqs: Array<{ col: string; val: unknown }>;
};

const mockChains: ChainCall[] = [];

const mockHarness: {
  profiles: unknown[];
  profileSingle: Result;
  productStats: unknown[];
  galleryStats: unknown[];
  productQueue: unknown[];
  galleryQueue: unknown[];
  rowSingle: Result;
  insertResult: Result;
  deleteResult: Result;
  listError: { code: string; message: string } | null;
  updateError: { code: string; message: string } | null;
} = {
  profiles: [],
  profileSingle: { data: null, error: null },
  productStats: [],
  galleryStats: [],
  productQueue: [],
  galleryQueue: [],
  rowSingle: { data: null, error: null },
  insertResult: { data: null, error: null },
  deleteResult: { data: null, error: null },
  listError: null,
  updateError: null,
};

const mockRpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let mockRpcResult: Result = { data: null, error: null };
const mockRpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
  mockRpcCalls.push({ fn, args });
  return mockRpcResult;
});

function listResult(data: unknown): Result {
  return mockHarness.listError ? { data: null, error: mockHarness.listError } : { data, error: null };
}

function resolveFor(table: string, selectCols: string, ops: string[]): Result {
  const terminal = ops.includes("maybeSingle") || ops.includes("single");
  if (ops[0] === "insert") return mockHarness.insertResult;
  if (ops[0] === "delete") return mockHarness.deleteResult;
  if (ops[0] === "update") return { data: null, error: mockHarness.updateError };

  if (terminal) {
    if (table === "creator_profiles") return mockHarness.profileSingle;
    return mockHarness.rowSingle;
  }
  if (table === "creator_profiles") return listResult(mockHarness.profiles);
  if (table === "creator_design_products") {
    const isStats = selectCols.startsWith("creator_profile_id, status");
    return listResult(isStats ? mockHarness.productStats : mockHarness.productQueue);
  }
  if (table === "creator_gallery_items") {
    const isStats = selectCols.startsWith("creator_profile_id, status");
    return listResult(isStats ? mockHarness.galleryStats : mockHarness.galleryQueue);
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
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "is",
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
      if (method === "eq") eqs.push({ col: String(args[0]), val: args[1] });
      if (method === "maybeSingle" || method === "single") {
        record();
        return Promise.resolve(resolveFor(table, selectCols ?? "", ops));
      }
      return chain;
    };
  }
  chain.then = (onFulfilled: unknown, onRejected: unknown) => {
    record();
    return Promise.resolve(resolveFor(table, selectCols ?? "", ops)).then(
      onFulfilled as (value: Result) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  };
  return chain;
}

const mockDb = {
  from: (table: string) => mockMakeChain(table),
  rpc: mockRpc,
};
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockDb),
}));

import { GET, PATCH } from "@/app/api/admin/creators/route";

const ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-8888-7777-6666-555555555555";

function makeRequest(
  method: string,
  { body, query = "", authed = true }: { body?: unknown; query?: string; authed?: boolean } = {}
): Request {
  return new Request(`http://localhost:3000/api/admin/creators${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authed ? { Authorization: "Bearer token" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function chainsWith(op: string, table?: string): ChainCall[] {
  return mockChains.filter(
    (call) => call.ops[0] === op && (!table || call.table === table)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChains.length = 0;
  mockRpcCalls.length = 0;
  mockRpcResult = { data: null, error: null };
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
  mockHarness.profiles = [];
  mockHarness.profileSingle = { data: null, error: null };
  mockHarness.productStats = [];
  mockHarness.galleryStats = [];
  mockHarness.productQueue = [];
  mockHarness.galleryQueue = [];
  mockHarness.rowSingle = { data: null, error: null };
  mockHarness.insertResult = { data: null, error: null };
  mockHarness.deleteResult = { data: null, error: null };
  mockHarness.listError = null;
  mockHarness.updateError = null;
});

describe("authentication (every verb)", () => {
  test.each([
    ["GET", () => GET(makeRequest("GET"))],
    [
      "PATCH",
      () =>
        PATCH(
          makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: true } })
        ),
    ],
  ])("%s returns 401/403 before touching the database", async (_label, run) => {
    mockAuth.current = { error: "Not authorized", status: 403 };
    const res = await run();
    expect(res.status).toBe(403);
    expect(mockChains).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("GET (queue + creators)", () => {
  test("merges both submission tables and aggregates per-creator stats", async () => {
    mockHarness.profiles = [
      {
        id: ID,
        user_id: OTHER_ID,
        username: "alice",
        display_name: "Alice",
        avatar_url: null,
        bio: null,
        is_featured: false,
        is_active: true,
        can_publish: true,
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      },
    ];
    mockHarness.productStats = [
      { creator_profile_id: ID, status: "pending_review" },
      { creator_profile_id: ID, status: "draft" },
      { creator_profile_id: ID, status: "pending_review" },
    ];
    mockHarness.galleryStats = [{ creator_profile_id: ID, status: "pending_review" }];
    mockHarness.productQueue = [
      { id: "p1", status: "pending_review", submitted_at: "2026-11-05T00:00:00.000Z" },
    ];
    mockHarness.galleryQueue = [
      { id: "g1", status: "pending_review", submitted_at: "2026-11-10T00:00:00.000Z" },
    ];

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Stats: 2 of 3 product rows pending, 1 gallery row pending.
    expect(json.creators).toHaveLength(1);
    expect(json.creators[0].stats).toEqual({
      products: 3,
      products_pending: 2,
      gallery: 1,
      gallery_pending: 1,
    });
    expect(json.counts).toEqual({
      products_pending: 2,
      gallery_pending: 1,
      creators: 1,
      queue: 2,
    });

    // UNION merged by submitted_at (newest first), kind tagging intact.
    expect(json.queue.map((row: { kind: string }) => row.kind)).toEqual([
      "gallery",
      "product",
    ]);
    expect(json.status).toBe("pending_review");
  });

  test("filters the queue by the requested status", async () => {
    const res = await GET(makeRequest("GET", { query: "?status=rejected" }));
    expect(res.status).toBe(200);
    const queueCalls = chainsWith("select", "creator_design_products").filter((call) =>
      (call.selectCols ?? "").includes("mockups")
    );
    expect(queueCalls[0].eqs).toContainEqual({ col: "status", val: "rejected" });
  });

  test("400 on an unknown status — no queries", async () => {
    const res = await GET(makeRequest("GET", { query: "?status=bogus" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("invalid_status");
    expect(mockChains).toHaveLength(0);
  });

  test("missing creator tables → 503 MIGRATION_REQUIRED", async () => {
    mockHarness.listError = {
      code: "PGRST205",
      message: "Could not find the table 'public.creator_profiles' in the schema cache",
    };
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("MIGRATION_REQUIRED");
    expect(json.context).toBe("admin.creators");
  });

  test("a database failure is reported as a failure, never as success", async () => {
    mockHarness.listError = { code: "XX000", message: "boom" };
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe("PATCH — review (RPC with actor parameters)", () => {
  test("400 on an unknown action — no RPC", async () => {
    const res = await PATCH(makeRequest("PATCH", { body: { action: "publish" } }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("400 on an unknown target or decision — no RPC", async () => {
    const badTarget = await PATCH(
      makeRequest("PATCH", { body: { action: "review", target: "store", id: ID, decision: "approve" } })
    );
    expect(badTarget.status).toBe(400);

    const badDecision = await PATCH(
      makeRequest("PATCH", { body: { action: "review", target: "product", id: ID, decision: "maybe" } })
    );
    expect(badDecision.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("400 on a non-UUID id — no RPC", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "review", target: "product", id: "nope", decision: "approve" } })
    );
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("reject without a reason is a 400 — no RPC", async () => {
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { action: "review", target: "gallery", id: ID, decision: "reject", reason: "   " },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("reason_required");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("approve passes the admin actor to the RPC and never writes status directly", async () => {
    mockRpcResult = {
      data: { target: "product", id: ID, decision: "approve", status: "approved", published: true },
      error: null,
    };

    const res = await PATCH(
      makeRequest("PATCH", {
        body: { action: "review", target: "product", id: ID, decision: "approve" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("approved");

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpcCalls[0].fn).toBe("admin_review_creator_submission");
    expect(mockRpcCalls[0].args).toMatchObject({
      p_target: "product",
      p_id: ID,
      p_decision: "approve",
      p_reason: null,
      p_actor_id: "admin-uid-1",
      p_actor_email: "admin@galaxy.test",
    });

    // The RPC owns approval state + its own audit row: no direct writes, no
    // double audit from the route.
    expect(chainsWith("update")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("maps review:not_found → 404 and review:invalid_status → 409", async () => {
    mockRpcResult = { data: null, error: { message: "review:not_found" } };
    const missing = await PATCH(
      makeRequest("PATCH", { body: { action: "review", target: "product", id: ID, decision: "approve" } })
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("not_found");

    mockRpcResult = { data: null, error: { message: "review:invalid_status" } };
    const wrongState = await PATCH(
      makeRequest("PATCH", {
        body: { action: "review", target: "gallery", id: ID, decision: "reject", reason: "x" },
      })
    );
    expect(wrongState.status).toBe(409);
    expect((await wrongState.json()).code).toBe("invalid_status");
  });

  test("maps review:reason_required raised by the RPC → 400", async () => {
    mockRpcResult = { data: null, error: { message: "review:reason_required" } };
    const res = await PATCH(
      makeRequest("PATCH", {
        body: { action: "review", target: "product", id: ID, decision: "reject", reason: "not ok" },
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("reason_required");
  });

  test("missing phase-7 function → 503 MIGRATION_REQUIRED naming the file", async () => {
    mockRpcResult = {
      data: null,
      error: { code: "42883", message: "function admin_review_creator_submission does not exist" },
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "review", target: "product", id: ID, decision: "approve" } })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("MIGRATION_REQUIRED");
    expect(json.message).toContain("20261110170000_creator_studio_publish_functions.sql");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH — creator toggles (feature / permissions / archive)", () => {
  test("400 when value is not a boolean — no queries", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: "yes" } })
    );
    expect(res.status).toBe(400);
    expect(mockChains).toHaveLength(0);
  });

  test("404 when the creator does not exist — no update, no audit", async () => {
    mockHarness.profileSingle = { data: null, error: null };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: true } })
    );
    expect(res.status).toBe(404);
    expect(chainsWith("update")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("an unchanged value answers unchanged without writing or auditing", async () => {
    mockHarness.profileSingle = {
      data: { id: ID, username: "alice", is_featured: true, can_publish: true, is_active: true },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: true } })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unchanged).toBe(true);
    expect(chainsWith("update")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("feature toggle updates is_featured and records an audit entry", async () => {
    mockHarness.profileSingle = {
      data: { id: ID, username: "alice", is_featured: false, can_publish: true, is_active: true },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: true } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).is_featured).toBe(true);

    const updates = chainsWith("update", "creator_profiles");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ is_featured: true });

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityType: string; entityId: string };
    expect(entry.action).toBe("creator.featured_toggled");
    expect(entry.entityType).toBe("creator_profile");
    expect(entry.entityId).toBe(ID);
  });

  test("permissions toggle updates can_publish and audits", async () => {
    mockHarness.profileSingle = {
      data: { id: ID, username: "alice", is_featured: false, can_publish: true, is_active: true },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "permissions", creator_id: ID, value: false } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).can_publish).toBe(false);

    const updates = chainsWith("update", "creator_profiles");
    expect(updates[0].payload).toMatchObject({ can_publish: false });
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("creator.publish_permission_toggled");
  });

  test("archive toggles is_active and audits", async () => {
    mockHarness.profileSingle = {
      data: { id: ID, username: "alice", is_featured: false, can_publish: true, is_active: true },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive", creator_id: ID, value: false } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).is_active).toBe(false);

    const updates = chainsWith("update", "creator_profiles");
    expect(updates[0].payload).toMatchObject({ is_active: false });
    const entry = mockAudit.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe("creator.active_toggled");
  });

  test("missing creator_profiles table → 503 before any write", async () => {
    mockHarness.profileSingle = {
      data: null,
      error: { code: "42P01", message: 'relation "public.creator_profiles" does not exist' },
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "feature", creator_id: ID, value: true } })
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
    expect(chainsWith("update")).toHaveLength(0);
  });
});

describe("PATCH — archive_submission (withdrawal escape hatch)", () => {
  test("hides the linked product BEFORE archiving the product row, then audits", async () => {
    mockHarness.rowSingle = {
      data: { id: ID, status: "approved", product_id: OTHER_ID, title: "Galaxy Tee" },
      error: null,
    };

    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive_submission", target: "product", id: ID } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("archived");

    const productHide = chainsWith("update", "products");
    expect(productHide).toHaveLength(1);
    expect(productHide[0].payload).toMatchObject({ status: "draft", visibility: "hidden" });

    const rowArchive = chainsWith("update", "creator_design_products");
    expect(rowArchive).toHaveLength(1);
    expect(rowArchive[0].payload).toMatchObject({ status: "archived" });

    // Fail-safe order: the listing is hidden first, never the reverse.
    expect(mockChains.indexOf(productHide[0])).toBeLessThan(
      mockChains.indexOf(rowArchive[0])
    );

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1] as { action: string; entityType: string };
    expect(entry.action).toBe("creator_submission_archived");
    expect(entry.entityType).toBe("creator_design_product");
  });

  test("archives a product row with no linked product without touching products", async () => {
    mockHarness.rowSingle = {
      data: { id: ID, status: "pending_review", product_id: null, title: "Galaxy Tee" },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive_submission", target: "product", id: ID } })
    );
    expect(res.status).toBe(200);
    expect(chainsWith("update", "products")).toHaveLength(0);
    expect(chainsWith("update", "creator_design_products")).toHaveLength(1);
  });

  test("archives a gallery row only and audits as creator_gallery_item", async () => {
    mockHarness.rowSingle = {
      data: { id: ID, status: "approved", product_id: null, title: "Night sky" },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive_submission", target: "gallery", id: ID } })
    );
    expect(res.status).toBe(200);
    expect(chainsWith("update", "creator_gallery_items")).toHaveLength(1);
    const entry = mockAudit.mock.calls[0][1] as { entityType: string };
    expect(entry.entityType).toBe("creator_gallery_item");
  });

  test("an already-archived row answers unchanged without writing", async () => {
    mockHarness.rowSingle = {
      data: { id: ID, status: "archived", product_id: OTHER_ID, title: "x" },
      error: null,
    };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive_submission", target: "product", id: ID } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).unchanged).toBe(true);
    expect(chainsWith("update")).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("404 when the submission does not exist", async () => {
    mockHarness.rowSingle = { data: null, error: null };
    const res = await PATCH(
      makeRequest("PATCH", { body: { action: "archive_submission", target: "gallery", id: ID } })
    );
    expect(res.status).toBe(404);
    expect(chainsWith("update")).toHaveLength(0);
  });
});
