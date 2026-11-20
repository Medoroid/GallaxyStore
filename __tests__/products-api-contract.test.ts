/**
 * @jest-environment node
 *
 * Phase 6 — product configuration contract tests:
 *
 * GET /api/designs/[id]/products
 *   - auth → UUID → migration guard → owner check → list, in that order;
 *     no rate limit on reads; `deleted_at IS NULL` + created_at ordering;
 *     rows normalized with the catalog embed
 *
 * POST /api/designs/[id]/products
 *   - rate (design-products, fail_open) → auth → UUID → guard → body → PURE
 *     registry validation → owner → profile → catalog → idempotent create
 *   - protected fields / unknown template / unknown colors rejected with NO
 *     database read (validation is pure)
 *   - creator_profile_id comes from the caller's OWN profile, never the body;
 *     an existing (design × template) row is returned with created:false and
 *     never overwritten; a 23505 race returns the winner untouched
 *
 * PATCH /api/designs/[id]/products/[rowId]
 *   - allow-list: only view_states / selected_colors / selected_sizes are
 *     writable — status, fulfillment, product_id, mockups and every ownership
 *     column are structurally rejected (no self-approval, no fake fulfillment)
 *   - values validated against the row's OWN template in the TS registry;
 *     writes go through the service role with the normalized subset only
 *
 * DELETE /api/designs/[id]/products/[rowId]
 *   - SOFT delete only (deleted_at); never a hard DELETE statement
 *   - a row that already produced a store listing is refused with
 *     409 product_linked (withdrawal is an admin action), with no write
 */

jest.mock("@/lib/rate-limit", () => {
  const mockRateAllowed = { value: true };
  return {
    checkRateLimitAsync: jest.fn(async () => ({
      allowed: mockRateAllowed.value,
      remaining: 30,
      backend: "memory",
    })),
    getClientIp: () => "127.0.0.1",
    __mockRateAllowed: mockRateAllowed,
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSession.client),
}));

// Writes go through the service role (the four studio tables are SELECT-only
// for owners). The module caches its client, so the mock is pinned to the
// per-test session explicitly.
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockSession.client),
}));

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

type ClientMock = {
  client: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
    storage: { from: jest.Mock };
  };
  storage: { from: jest.Mock };
  queues: Map<string, Outcome[]>;
  calls: Call[];
  enqueue: (table: string, ...outcomes: Outcome[]) => void;
};

function makeClient(): ClientMock {
  const queues = new Map<string, Outcome[]>();
  const calls: Call[] = [];

  const shift = (table: string): Outcome => {
    const queue = queues.get(table);
    if (queue && queue.length > 0) return queue.shift() as Outcome;
    return { data: null, error: null };
  };

  function builderFor(table: string) {
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };

    for (const method of [
      "select",
      "eq",
      "neq",
      "is",
      "not",
      "order",
      "limit",
      "range",
      "in",
      "insert",
      "update",
      "delete",
      "upsert",
    ]) {
      builder[method] = jest.fn(chain(method));
    }

    const awaitOutcome = () => shift(table);
    builder.maybeSingle = jest.fn(async () => awaitOutcome());
    builder.single = jest.fn(async () => awaitOutcome());
    builder.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(awaitOutcome()).then(
        onFulfilled as (value: unknown) => unknown,
        onRejected as (reason: unknown) => unknown
      );

    return builder;
  }

  const client = {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: "session-user-9", email: "a@b.c" } },
        error: null,
      })),
    },
    from: jest.fn((table: string) => builderFor(table)),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: { path: "x" }, error: null })),
        remove: jest.fn(async () => ({ data: [], error: null })),
      })),
    },
  };

  return {
    client,
    storage: client.storage,
    queues,
    calls,
    enqueue(table, ...outcomes) {
      const queue = queues.get(table) ?? [];
      queue.push(...outcomes);
      queues.set(table, queue);
    },
  };
}

let mockSession: ClientMock;

import { GET as listGet, POST as createPost } from "@/app/api/designs/[id]/products/route";
import {
  DELETE as deleteRow,
  PATCH as patchRow,
} from "@/app/api/designs/[id]/products/[rowId]/route";

const AUTH = { Authorization: "Bearer valid-token" };
const MISSING_RELATION = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
};

const DESIGN_ID = "11111111-1111-4111-8111-111111111111";
const ROW_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "ffffffff-0000-4000-8000-000000000001";
const CATALOG_ID = "ffffffff-0000-4000-8000-000000000002";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

const LIST_URL = `http://localhost:3000/api/designs/${DESIGN_ID}/products`;
const ROW_URL = `${LIST_URL}/${ROW_ID}`;
const LIST_PARAMS = { params: Promise.resolve({ id: DESIGN_ID }) };
const ROW_PARAMS = { params: Promise.resolve({ id: DESIGN_ID, rowId: ROW_ID }) };

const EMBED = {
  id: CATALOG_ID,
  template_key: "tshirt",
  name: "T-Shirt",
  name_ar: "تيشيرت",
  category: "apparel",
  is_active: true,
};

const ROW = {
  id: ROW_ID,
  design_id: DESIGN_ID,
  template_id: CATALOG_ID,
  view_states: {},
  selected_colors: [],
  selected_sizes: [],
  mockups: [],
  status: "draft",
  rejection_reason: null,
  submitted_at: null,
  product_id: null,
  fulfillment_mode: "unconfigured",
  stock_buffer: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  creator_product_templates: EMBED,
};

function rowFixture(overrides: Record<string, unknown> = {}) {
  return { ...ROW, ...overrides };
}

// --- request / queue helpers ------------------------------------------------

function jsonRequest(
  url: string,
  body: unknown,
  method = "POST",
  headers: Record<string, string> = AUTH
): Request {
  return new Request(url, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function primeGuard(outcome: Outcome = { data: [{ id: "probe" }], error: null }) {
  mockSession.enqueue("design_versions", outcome);
}
function primeDesign(exists = true) {
  mockSession.enqueue("user_designs", {
    data: exists ? { id: DESIGN_ID } : null,
    error: null,
  });
}
function primeProfile(id: string | null = PROFILE_ID) {
  mockSession.enqueue("creator_profiles", { data: id ? { id } : null, error: null });
}
function primeCatalog(active = true) {
  // One response for the published-catalog resolver, one for the route's
  // own template-row lookup.
  for (let i = 0; i < 2; i++) {
    mockSession.enqueue("creator_product_templates", {
      data: { id: CATALOG_ID, is_active: active },
      error: null,
    });
  }
}
function primeCatalogMissing() {
  mockSession.enqueue("creator_product_templates", { data: null, error: null });
}
function primeRow(row: unknown = null) {
  mockSession.enqueue("creator_design_products", { data: row, error: null });
}
function primeInsert(outcome: Outcome) {
  mockSession.enqueue("creator_design_products", outcome);
}
function primeUpdate(outcome: Outcome) {
  mockSession.enqueue("creator_design_products", outcome);
}

const callsOn = (table: string, method?: string) =>
  mockSession.calls.filter(
    (call) => call.table === table && (method === undefined || call.method === method)
  );

const rateMock = () =>
  jest.requireMock("@/lib/rate-limit") as {
    checkRateLimitAsync: jest.Mock;
    __mockRateAllowed: { value: boolean };
  };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = makeClient();
  rateMock().__mockRateAllowed.value = true;
});

// --- GET --------------------------------------------------------------------

describe("GET /api/designs/[id]/products", () => {
  it("401s without a bearer token and touches no table", async () => {
    const response = await listGet(new Request(LIST_URL), LIST_PARAMS);
    expect(response.status).toBe(401);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("does not rate-limit reads", async () => {
    primeGuard();
    primeDesign();
    primeRow([]);
    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), LIST_PARAMS);
    expect(response.status).toBe(200);
    expect(rateMock().checkRateLimitAsync).not.toHaveBeenCalled();
  });

  it("404s a malformed design id before reading anything", async () => {
    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("503s honestly when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);
    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), LIST_PARAMS);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MIGRATION_REQUIRED");
    expect(callsOn("user_designs")).toHaveLength(0);
    expect(callsOn("creator_design_products")).toHaveLength(0);
  });

  it("404s a design the caller does not own, without listing rows", async () => {
    primeGuard();
    primeDesign(false);
    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), LIST_PARAMS);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
    expect(callsOn("creator_design_products")).toHaveLength(0);
  });

  it("lists live rows normalized, scoped to the design, newest-last", async () => {
    primeGuard();
    primeDesign();
    primeRow([rowFixture({ status: "draft" })]);

    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), LIST_PARAMS);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.products).toHaveLength(1);
    expect(body.products[0]).toMatchObject({
      id: ROW_ID,
      design_id: DESIGN_ID,
      template_key: "tshirt",
      status: "draft",
      fulfillment_mode: "unconfigured",
      selected_colors: [],
      mockups: [],
    });

    const select = callsOn("creator_design_products", "select")[0];
    expect(String(select.args[0])).toContain("creator_product_templates");
    expect(
      callsOn("creator_design_products", "eq").some(
        (call) => call.args[0] === "design_id" && call.args[1] === DESIGN_ID
      )
    ).toBe(true);
    expect(
      callsOn("creator_design_products", "is").some(
        (call) => call.args[0] === "deleted_at" && call.args[1] === null
      )
    ).toBe(true);
    expect(callsOn("creator_design_products", "order")[0].args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("returns an empty array when no products are configured", async () => {
    primeGuard();
    primeDesign();
    primeRow([]);
    const response = await listGet(new Request(LIST_URL, { headers: AUTH }), LIST_PARAMS);
    expect(response.status).toBe(200);
    expect((await response.json()).products).toEqual([]);
  });
});

// --- POST -------------------------------------------------------------------

describe("POST /api/designs/[id]/products", () => {
  it("429s when rate-limited — before auth — on the shared design-products bucket", async () => {
    rateMock().__mockRateAllowed.value = false;
    const response = await createPost(
      new Request(LIST_URL, { method: "POST", body: "{}" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(429);
    expect(mockSession.calls).toHaveLength(0);
    expect(rateMock().checkRateLimitAsync).toHaveBeenCalledWith(
      "design-products:127.0.0.1",
      { maxRequests: 30, failureMode: "fail_open" }
    );
  });

  it("404s a malformed design id before the guard", async () => {
    const response = await createPost(jsonRequest(LIST_URL, {}), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("503s before the body when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);
    const response = await createPost(jsonRequest(LIST_URL, "{not json"), LIST_PARAMS);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MIGRATION_REQUIRED");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("400s unreadable JSON before any database read", async () => {
    primeGuard();
    const response = await createPost(jsonRequest(LIST_URL, "{not json"), LIST_PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("rejects protected fields and invalid templates/colors with NO database read", async () => {
    const cases: Array<[unknown, string, string?]> = [
      [{ template_key: "tshirt", status: "approved" }, "field_not_allowed", "status"],
      [{ template_key: "tshirt", fulfillment_mode: "configured" }, "field_not_allowed", "fulfillment_mode"],
      [{ template_key: "tshirt", mockups: [] }, "field_not_allowed", "mockups"],
      [{ template_key: "toaster" }, "invalid_template", "template_key"],
      [{ template_key: "tshirt", selected_colors: ["chartreuse"] }, "invalid_colors", "selected_colors"],
      [{ template_key: "mug", selected_sizes: ["xxl"] }, "invalid_sizes", "selected_sizes"],
      [{}, "invalid_template", "template_key"],
    ];
    for (const [body, code, field] of cases) {
      primeGuard();
      const response = await createPost(jsonRequest(LIST_URL, body), LIST_PARAMS);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.code).toBe(code);
      if (field) expect(parsed.field).toBe(field);
    }
    expect(callsOn("user_designs")).toHaveLength(0);
    expect(callsOn("creator_profiles")).toHaveLength(0);
  });

  it("404s a foreign design before the profile lookup", async () => {
    primeGuard();
    primeDesign(false);
    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(404);
    expect(callsOn("creator_profiles")).toHaveLength(0);
    expect(callsOn("creator_product_templates")).toHaveLength(0);
  });

  it("403s without a creator profile, before the catalog read", async () => {
    primeGuard();
    primeDesign();
    primeProfile(null);
    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("creator_profile_required");
    expect(callsOn("creator_product_templates")).toHaveLength(0);
  });

  it("503s when the catalog row was never seeded", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeCatalogMissing();
    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("templates_not_seeded");
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
  });

  it("400s when an admin deactivated the product type", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeCatalog(false);
    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("template_inactive");
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
  });

  it("creates the row with caller-derived ownership and defaults (201)", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeCatalog();
    primeRow(null);
    primeInsert({ data: [rowFixture({ selected_colors: ["black"] })], error: null });

    const response = await createPost(
      jsonRequest(LIST_URL, {
        template_key: "tshirt",
        selected_colors: ["black"],
        selected_sizes: ["m"],
      }),
      LIST_PARAMS
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.product).toMatchObject({
      id: ROW_ID,
      template_key: "tshirt",
      status: "draft",
      fulfillment_mode: "unconfigured",
      selected_colors: ["black"],
    });

    const inserts = callsOn("creator_design_products", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual({
      design_id: DESIGN_ID,
      template_id: CATALOG_ID,
      creator_profile_id: PROFILE_ID,
      view_states: {},
      selected_colors: ["black"],
      selected_sizes: ["m"],
      mockups: [],
    });
  });

  it("returns an existing row with created:false and never overwrites it", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeCatalog();
    primeRow(rowFixture({ selected_colors: ["navy"] }));

    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt", selected_colors: ["black"] }),
      LIST_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.product.selected_colors).toEqual(["navy"]); // first write wins
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("recovers from a create race (23505) by returning the winner untouched", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeCatalog();
    primeRow(null);
    primeInsert({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    primeRow(rowFixture({ selected_colors: ["red"] }));

    const response = await createPost(
      jsonRequest(LIST_URL, { template_key: "tshirt" }),
      LIST_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.product.selected_colors).toEqual(["red"]);
    expect(callsOn("creator_design_products", "insert")).toHaveLength(1);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });
});

// --- PATCH ------------------------------------------------------------------

describe("PATCH /api/designs/[id]/products/[rowId]", () => {
  it("429s on the shared design-products bucket before auth", async () => {
    rateMock().__mockRateAllowed.value = false;
    const response = await patchRow(
      new Request(ROW_URL, { method: "PATCH", body: "{}" }),
      ROW_PARAMS
    );
    expect(response.status).toBe(429);
    expect(mockSession.calls).toHaveLength(0);
    expect(rateMock().checkRateLimitAsync).toHaveBeenCalledWith(
      "design-products:127.0.0.1",
      { maxRequests: 30, failureMode: "fail_open" }
    );
  });

  it("404s a malformed row id before the guard", async () => {
    const response = await patchRow(jsonRequest(ROW_URL, {}, "PATCH"), {
      params: Promise.resolve({ id: DESIGN_ID, rowId: "nope" }),
    });
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("503s before the body when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);
    const response = await patchRow(jsonRequest(ROW_URL, "{not json", "PATCH"), ROW_PARAMS);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MIGRATION_REQUIRED");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("400s unreadable JSON before any database read", async () => {
    primeGuard();
    const response = await patchRow(jsonRequest(ROW_URL, "{not json", "PATCH"), ROW_PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("404s a foreign design before reading the row", async () => {
    primeGuard();
    primeDesign(false);
    const response = await patchRow(
      jsonRequest(ROW_URL, { selected_colors: ["black"] }, "PATCH"),
      ROW_PARAMS
    );
    expect(response.status).toBe(404);
    expect(callsOn("creator_design_products")).toHaveLength(0);
  });

  it("404s a row that is not part of this design (or was soft-deleted)", async () => {
    primeGuard();
    primeDesign();
    primeRow(null);
    const response = await patchRow(
      jsonRequest(ROW_URL, { selected_colors: ["black"] }, "PATCH"),
      ROW_PARAMS
    );
    expect(response.status).toBe(404);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("structurally rejects every protected field with no write", async () => {
    const cases: Array<[unknown, string]> = [
      [{ status: "approved" }, "status"],
      [{ reviewed_by: "admin" }, "reviewed_by"],
      [{ submitted_at: "2026-01-01" }, "submitted_at"],
      [{ product_id: "p-1" }, "product_id"],
      [{ fulfillment_mode: "configured" }, "fulfillment_mode"],
      [{ stock_buffer: 5 }, "stock_buffer"],
      [{ mockups: [] }, "mockups"],
      [{ creator_profile_id: "other" }, "creator_profile_id"],
      [{ deleted_at: null }, "deleted_at"],
    ];
    for (const [body, field] of cases) {
      primeGuard();
      primeDesign();
      primeRow(rowFixture());
      const response = await patchRow(jsonRequest(ROW_URL, body, "PATCH"), ROW_PARAMS);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.code).toBe("field_not_allowed");
      expect(parsed.field).toBe(field);
    }
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("validates values against the row's OWN template in the registry", async () => {
    // mint exists on the mug, not on the tshirt row:
    primeGuard();
    primeDesign();
    primeRow(rowFixture());
    const colors = await patchRow(
      jsonRequest(ROW_URL, { selected_colors: ["mint"] }, "PATCH"),
      ROW_PARAMS
    );
    expect(colors.status).toBe(400);
    expect((await colors.json()).code).toBe("invalid_colors");

    primeGuard();
    primeDesign();
    primeRow(rowFixture());
    const view = await patchRow(
      jsonRequest(ROW_URL, { view_states: { side: { x: 0 } } }, "PATCH"),
      ROW_PARAMS
    );
    expect(view.status).toBe(400);
    expect((await view.json()).code).toBe("invalid_view_states");

    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("writes ONLY the normalized presentation subset through the service role", async () => {
    primeGuard();
    primeDesign();
    primeRow(rowFixture());
    primeUpdate({
      data: [
        rowFixture({
          selected_colors: ["black", "navy"],
          view_states: {
            front: { x: 1, y: 0, scale: 1, rotation: 0, lockAspect: false },
          },
          updated_at: "2026-01-03T00:00:00.000Z",
        }),
      ],
      error: null,
    });

    const response = await patchRow(
      jsonRequest(
        ROW_URL,
        {
          selected_colors: ["black", "navy"],
          view_states: { front: { x: 1 } }, // partial → normalized server-side
        },
        "PATCH"
      ),
      ROW_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.product).toMatchObject({
      id: ROW_ID,
      template_key: "tshirt",
      selected_colors: ["black", "navy"],
      view_states: {
        front: { x: 1, y: 0, scale: 1, rotation: 0, lockAspect: false },
      },
    });

    const updates = callsOn("creator_design_products", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({
      selected_colors: ["black", "navy"],
      view_states: {
        front: { x: 1, y: 0, scale: 1, rotation: 0, lockAspect: false },
      },
    });
    expect(Object.keys(updates[0].args[0] as object).sort()).toEqual([
      "selected_colors",
      "view_states",
    ]);
    // bound to this row AND this design:
    expect(
      callsOn("creator_design_products", "eq").some(
        (call) => call.args[0] === "id" && call.args[1] === ROW_ID
      )
    ).toBe(true);
    expect(
      callsOn("creator_design_products", "eq").some(
        (call) => call.args[0] === "design_id" && call.args[1] === DESIGN_ID
      )
    ).toBe(true);
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
  });

  it("404s when the row vanished between read and write", async () => {
    primeGuard();
    primeDesign();
    primeRow(rowFixture());
    primeUpdate({ data: [], error: null });
    const response = await patchRow(
      jsonRequest(ROW_URL, { selected_colors: ["black"] }, "PATCH"),
      ROW_PARAMS
    );
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
  });
});

// --- DELETE -----------------------------------------------------------------

describe("DELETE /api/designs/[id]/products/[rowId]", () => {
  it("401s without a bearer token and touches no table", async () => {
    const response = await deleteRow(new Request(ROW_URL, { method: "DELETE" }), ROW_PARAMS);
    expect(response.status).toBe(401);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("404s a malformed row id before the guard", async () => {
    const response = await deleteRow(
      new Request(ROW_URL, { method: "DELETE", headers: AUTH }),
      { params: Promise.resolve({ id: DESIGN_ID, rowId: "nope" }) }
    );
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("503s honestly when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);
    const response = await deleteRow(
      new Request(ROW_URL, { method: "DELETE", headers: AUTH }),
      ROW_PARAMS
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MIGRATION_REQUIRED");
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("404s a row that is not part of this design, with no write", async () => {
    primeGuard();
    primeDesign();
    primeRow(null);
    const response = await deleteRow(
      new Request(ROW_URL, { method: "DELETE", headers: AUTH }),
      ROW_PARAMS
    );
    expect(response.status).toBe(404);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("409s a row that already produced a store listing (product_linked), with no write", async () => {
    primeGuard();
    primeDesign();
    primeRow(rowFixture({ product_id: PRODUCT_ID, status: "pending_review" }));

    const response = await deleteRow(
      new Request(ROW_URL, { method: "DELETE", headers: AUTH }),
      ROW_PARAMS
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("product_linked");
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
    expect(callsOn("creator_design_products", "delete")).toHaveLength(0);
  });

  it("soft-deletes only: sets deleted_at, never issues a hard DELETE", async () => {
    primeGuard();
    primeDesign();
    primeRow(rowFixture());
    primeUpdate({ data: null, error: null });

    const response = await deleteRow(
      new Request(ROW_URL, { method: "DELETE", headers: AUTH }),
      ROW_PARAMS
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, id: ROW_ID });

    const updates = callsOn("creator_design_products", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({ deleted_at: expect.any(String) });
    expect(callsOn("creator_design_products", "delete")).toHaveLength(0);
    expect(
      callsOn("creator_design_products", "eq").some(
        (call) => call.args[0] === "design_id" && call.args[1] === DESIGN_ID
      )
    ).toBe(true);
    expect(
      callsOn("creator_design_products", "is").some(
        (call) => call.args[0] === "deleted_at" && call.args[1] === null
      )
    ).toBe(true);
  });
});
