/**
 * @jest-environment node
 *
 * Phase 7 — publishing contract tests:
 *
 * POST /api/designs/[id]/publish
 *   - rate (design-publish, fail_open) → auth → uuid → migration guard →
 *     body → PURE allow-list validation → owned design → archived gate →
 *     profile (creator_profile_required / publish_disabled) → target branch
 *   - approval, ownership, commerce and fulfillment fields are structurally
 *     rejected BEFORE any database read — a creator can never self-approve,
 *     never claim fulfillment, never point at another design's files
 *   - product: row read → status gates → ≥1 preview inside THIS design's
 *     mockup namespace → category (service role) → store currency (never
 *     client-supplied) → `creator_publish_product` RPC whose payload carries
 *     ONLY presentation data → fresh row; 201 first publish, 200 re-submission
 *   - missing RPC → honest 503 naming the phase-7 migration file; `publish:*`
 *     errors map to house codes; a 23505 slug race retries exactly once
 *   - gallery: pending → idempotent 200; approved/archived → 409;
 *     draft/rejected → resubmit updates the SAME row; first submit inserts
 *     with caller-derived ownership (201); a 23505 race returns the winner
 *   - publishing never mutates `user_designs` and never writes `products`
 *     directly (the service-role RPC owns that transition)
 *
 * fetchProductAttribution — the "Designed by" link reads only the public
 * persona fields of the profile linked to the store product; ordinary
 * vendor/admin products return null and render nothing.
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

// Writes go through the service role (the gallery tables are SELECT-only for
// owners). The module caches its client, so the mock is pinned to the
// per-test session explicitly.
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockSession.client),
}));

// Store currency comes from settings — never from the request body.
jest.mock("@/lib/storeSettings", () => ({
  getPublicStoreSettings: jest.fn(async () => ({ currency: "EGP" })),
  EMPTY_PUBLIC_SETTINGS: { currency: null },
  normalizePublicSettings: jest.fn(),
}));

// Attribution reads through the shared browser client; delegate it to the
// same FIFO harness so the query chain can be asserted.
jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: jest.fn((table: string) => mockSession.client.from(table)),
  },
}));

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

type ClientMock = {
  client: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
    rpc: jest.Mock;
  };
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
    // RPCs share the same per-table FIFO, keyed `rpc:<function name>`.
    rpc: jest.fn(async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, method: "rpc", args: [fn, args] });
      return shift(`rpc:${fn}`);
    }),
  };

  return {
    client,
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

import { POST as publishPost } from "@/app/api/designs/[id]/publish/route";
import { fetchProductAttribution } from "@/lib/products";

const AUTH = { Authorization: "Bearer valid-token" };
const MISSING_RELATION = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
};

const DESIGN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DESIGN_ID = "99999999-9999-4999-8999-999999999999";
const ROW_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const GALLERY_ID = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "ffffffff-0000-4000-8000-000000000001";
const CATALOG_ID = "ffffffff-0000-4000-8000-000000000002";
const SESSION_USER = "session-user-9";

// The route reads this at call time when building public preview URLs.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://galaxy-test.supabase.co";

const PUBLISH_URL = `http://localhost:3000/api/designs/${DESIGN_ID}/publish`;
const PUBLISH_PARAMS = { params: Promise.resolve({ id: DESIGN_ID }) };

const PREVIEW_BASE =
  "https://galaxy-test.supabase.co/storage/v1/object/public/design-previews";
const FRONT_PATH = `mockups/${DESIGN_ID}/tshirt/front-black-a1.png`;
const BACK_PATH = `mockups/${DESIGN_ID}/tshirt/back-black-a1.png`;

const EMBED = {
  id: CATALOG_ID,
  template_key: "tshirt",
  name: "T-Shirt",
  name_ar: "تيشيرت",
  category: "apparel",
  is_active: true,
};

const MOCKUPS = [
  {
    view: "front",
    color: "black",
    path: FRONT_PATH,
    width: 1200,
    height: 1200,
    config_hash: "h1",
    generated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    view: "back",
    color: "black",
    path: BACK_PATH,
    width: 1200,
    height: 1200,
    config_hash: "h2",
    generated_at: "2026-01-01T00:00:01.000Z",
  },
  {
    // duplicate → deduped before it reaches the RPC payload
    view: "front",
    color: "black",
    path: FRONT_PATH,
    width: 1200,
    height: 1200,
    config_hash: "h1",
    generated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    // another design's file → never shipped as this product's preview
    view: "front",
    color: "black",
    path: `mockups/${OTHER_DESIGN_ID}/tshirt/front-black-zz.png`,
    width: 1200,
    height: 1200,
    config_hash: "h3",
    generated_at: "2026-01-01T00:00:02.000Z",
  },
];

const ROW = {
  id: ROW_ID,
  design_id: DESIGN_ID,
  template_id: CATALOG_ID,
  view_states: {},
  selected_colors: ["black"],
  selected_sizes: [],
  mockups: MOCKUPS,
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

const GALLERY_ROW = {
  id: GALLERY_ID,
  design_id: DESIGN_ID,
  owner_id: SESSION_USER,
  creator_profile_id: PROFILE_ID,
  title: "Neon Galaxy Tee",
  description: "A galaxy print",
  preview_path: FRONT_PATH,
  tags: ["space"],
  visibility: "public",
  status: "pending_review",
  rejection_reason: null,
  reviewed_by: null,
  reviewed_at: null,
  submitted_at: "2026-01-02T00:00:00.000Z",
  published_at: null,
  product_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

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
function primeDesign(overrides: Record<string, unknown> = {}) {
  mockSession.enqueue("user_designs", {
    data: { id: DESIGN_ID, title: "Galaxy Tee", status: "draft", ...overrides },
    error: null,
  });
}
function primeDesignMissing() {
  mockSession.enqueue("user_designs", { data: null, error: null });
}
function primeProfile(canPublish: boolean | null = true) {
  mockSession.enqueue("creator_profiles", {
    data: canPublish === null ? null : { id: PROFILE_ID, can_publish: canPublish },
    error: null,
  });
}
function primeRow(row: unknown = null) {
  mockSession.enqueue("creator_design_products", { data: row, error: null });
}
function primeCategory(exists = true) {
  mockSession.enqueue("categories", {
    data: exists ? { id: CATEGORY_ID } : null,
    error: null,
  });
}
function primeRpc(outcome: Outcome) {
  mockSession.enqueue("rpc:creator_publish_product", outcome);
}
function primeGallery(outcome: Outcome) {
  mockSession.enqueue("creator_gallery_items", outcome);
}
function primeDerive(rows: unknown[]) {
  mockSession.enqueue("creator_design_products", { data: rows, error: null });
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

const PRODUCT_BODY = {
  target: "product",
  design_product_id: ROW_ID,
  base_price: 499,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = makeClient();
  rateMock().__mockRateAllowed.value = true;
});

// --- ordering / gates -------------------------------------------------------

describe("POST /api/designs/[id]/publish — ordering and gates", () => {
  it("429s when rate-limited — before auth — on the design-publish bucket", async () => {
    rateMock().__mockRateAllowed.value = false;
    const response = await publishPost(
      new Request(PUBLISH_URL, { method: "POST", body: "{}" }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(429);
    expect(mockSession.calls).toHaveLength(0);
    expect(rateMock().checkRateLimitAsync).toHaveBeenCalledWith(
      "design-publish:127.0.0.1",
      { maxRequests: 30, failureMode: "fail_open" }
    );
  });

  it("401s without a bearer token and touches no table", async () => {
    const response = await publishPost(new Request(PUBLISH_URL, { method: "POST" }), PUBLISH_PARAMS);
    expect(response.status).toBe(401);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("404s a malformed design id before the guard", async () => {
    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("503s before the body when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);
    const response = await publishPost(jsonRequest(PUBLISH_URL, "{not json"), PUBLISH_PARAMS);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
    expect(body.context).toBe("designs.publish");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("400s unreadable JSON before any database read", async () => {
    primeGuard();
    const response = await publishPost(jsonRequest(PUBLISH_URL, "{not json"), PUBLISH_PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("structurally rejects approval, ownership and commerce fields with NO database read", async () => {
    const cases: Array<[unknown, string, string]> = [
      [{}, "invalid_target", "target"],
      [{ ...PRODUCT_BODY, status: "approved" }, "field_not_allowed", "status"],
      [{ ...PRODUCT_BODY, visibility: "visible" }, "field_not_allowed", "visibility"],
      [{ ...PRODUCT_BODY, published_at: "2026-01-01" }, "field_not_allowed", "published_at"],
      [{ ...PRODUCT_BODY, product_id: PRODUCT_ID }, "field_not_allowed", "product_id"],
      [{ ...PRODUCT_BODY, fulfillment_mode: "configured" }, "field_not_allowed", "fulfillment_mode"],
      [{ ...PRODUCT_BODY, stock_buffer: 5 }, "field_not_allowed", "stock_buffer"],
      [{ ...PRODUCT_BODY, owner_id: SESSION_USER }, "field_not_allowed", "owner_id"],
      [{ ...PRODUCT_BODY, creator_profile_id: PROFILE_ID }, "field_not_allowed", "creator_profile_id"],
      [{ ...PRODUCT_BODY, design_product_id: "not-a-uuid" }, "invalid_product_id", "design_product_id"],
      [{ ...PRODUCT_BODY, base_price: -1 }, "invalid_price", "base_price"],
      [{ target: "gallery", title: "Galaxy", status: "approved" }, "field_not_allowed", "status"],
      [{ target: "gallery", title: "Galaxy", reviewed_by: SESSION_USER }, "field_not_allowed", "reviewed_by"],
      [
        { target: "gallery", title: "Galaxy", preview_path: `mockups/${OTHER_DESIGN_ID}/x.png` },
        "invalid_preview_path",
        "preview_path",
      ],
      [{ target: "gallery", title: "x" }, "invalid_title", "title"],
    ];
    for (const [body, code, field] of cases) {
      primeGuard();
      const response = await publishPost(jsonRequest(PUBLISH_URL, body), PUBLISH_PARAMS);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.code).toBe(code);
      expect(parsed.field).toBe(field);
    }
    expect(callsOn("user_designs")).toHaveLength(0);
    expect(callsOn("creator_profiles")).toHaveLength(0);
    expect(callsOn("rpc:creator_publish_product")).toHaveLength(0);
    expect(callsOn("creator_gallery_items")).toHaveLength(0);
  });

  it("404s a design the caller does not own, before the profile lookup", async () => {
    primeGuard();
    primeDesignMissing();
    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(404);
    expect(callsOn("creator_profiles")).toHaveLength(0);
    expect(
      callsOn("user_designs", "eq").some(
        (call) => call.args[0] === "owner_id" && call.args[1] === SESSION_USER
      )
    ).toBe(true);
  });

  it("409s an archived design before the profile lookup", async () => {
    primeGuard();
    primeDesign({ status: "archived" });
    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("design_archived");
    expect(callsOn("creator_profiles")).toHaveLength(0);
  });

  it("403s without a creator profile, before the target branch", async () => {
    primeGuard();
    primeDesign();
    primeProfile(null);
    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("creator_profile_required");
    expect(
      callsOn("creator_profiles", "eq").some(
        (call) => call.args[0] === "user_id" && call.args[1] === SESSION_USER
      )
    ).toBe(true);
    expect(callsOn("creator_gallery_items")).toHaveLength(0);
    expect(callsOn("creator_design_products")).toHaveLength(0);
  });

  it("403s when an admin disabled publishing for the profile", async () => {
    primeGuard();
    primeDesign();
    primeProfile(false);
    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("publish_disabled");
    expect(callsOn("creator_gallery_items")).toHaveLength(0);
  });
});

// --- target A: store product ------------------------------------------------

describe("POST /api/designs/[id]/publish — product target", () => {
  it("404s a product configuration that is not part of this design", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(null);
    const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
    expect(callsOn("rpc:creator_publish_product")).toHaveLength(0);
  });

  it("409s rows that are not publishable, before reading previews", async () => {
    const cases: Array<[string, string]> = [
      ["pending_review", "already_submitted"],
      ["approved", "already_published"],
      ["archived", "invalid_status"],
    ];
    for (const [status, code] of cases) {
      primeGuard();
      primeDesign();
      primeProfile();
      primeRow(rowFixture({ status }));
      const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
    }
    expect(callsOn("rpc:creator_publish_product")).toHaveLength(0);
  });

  it("409s when no preview exists in THIS design's namespace", async () => {
    const rows = [
      rowFixture({ mockups: [] }),
      rowFixture({
        mockups: [
          { view: "front", color: "black", path: `mockups/${OTHER_DESIGN_ID}/tshirt/front.png` },
        ],
      }),
    ];
    for (const row of rows) {
      primeGuard();
      primeDesign();
      primeProfile();
      primeRow(row);
      const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe("no_mockups");
    }
    expect(callsOn("rpc:creator_publish_product")).toHaveLength(0);
    expect(callsOn("categories")).toHaveLength(0);
  });

  it("400s an unavailable category before the RPC", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeCategory(false);
    const response = await publishPost(
      jsonRequest(PUBLISH_URL, { ...PRODUCT_BODY, category_id: CATEGORY_ID }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_category");
    expect(callsOn("rpc:creator_publish_product")).toHaveLength(0);
  });

  it("submits via the RPC with presentation-only payload and answers 201", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeCategory(true);
    primeRpc({ data: PRODUCT_ID, error: null });
    primeRow(
      rowFixture({
        status: "pending_review",
        product_id: PRODUCT_ID,
        submitted_at: "2026-01-03T00:00:00.000Z",
      })
    );

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, {
        ...PRODUCT_BODY,
        name: "Galaxy Tee",
        compare_at_price: 699,
        description: "A galaxy print",
        short_description: "Soft cotton tee",
        category_id: CATEGORY_ID,
      }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.target).toBe("product");
    expect(body.product_id).toBe(PRODUCT_ID);
    expect(body.product).toMatchObject({
      id: ROW_ID,
      template_key: "tshirt",
      status: "pending_review",
      product_id: PRODUCT_ID,
    });

    const rpcCalls = callsOn("rpc:creator_publish_product", "rpc");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args[0]).toBe("creator_publish_product");
    const rpcArgs = rpcCalls[0].args[1] as {
      p_design_product_id: string;
      p_payload: Record<string, unknown>;
    };
    expect(Object.keys(rpcArgs).sort()).toEqual(["p_design_product_id", "p_payload"]);
    expect(rpcArgs.p_design_product_id).toBe(ROW_ID);
    // Exactly the presentation keys — no status, visibility, slug or owner.
    expect(Object.keys(rpcArgs.p_payload).sort()).toEqual([
      "base_price",
      "category_id",
      "compare_at_price",
      "currency",
      "description",
      "images",
      "name",
      "short_description",
    ]);
    expect(rpcArgs.p_payload).toMatchObject({
      name: "Galaxy Tee",
      base_price: 499,
      compare_at_price: 699,
      description: "A galaxy print",
      short_description: "Soft cotton tee",
      category_id: CATEGORY_ID,
      currency: "EGP", // from store settings, never the body
      images: [`${PREVIEW_BASE}/${FRONT_PATH}`, `${PREVIEW_BASE}/${BACK_PATH}`],
    });

    // The store row transitions only inside the RPC; the design row is read-only.
    expect(callsOn("products")).toHaveLength(0);
    expect(callsOn("user_designs", "update")).toHaveLength(0);
    expect(callsOn("user_designs", "insert")).toHaveLength(0);

    const selects = callsOn("creator_design_products", "select");
    expect(selects).toHaveLength(2); // row read + fresh re-read
    expect(String(selects[0].args[0])).toContain("creator_product_templates");
    expect(String(selects[1].args[0])).toContain("product_id");
  });

  it("answers 200 on re-submission and falls back to the design title for the name", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture({ status: "rejected", product_id: PRODUCT_ID }));
    primeRpc({ data: PRODUCT_ID, error: null });
    primeRow(rowFixture({ status: "pending_review", product_id: PRODUCT_ID }));

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, { target: "product", design_product_id: ROW_ID, base_price: 750 }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(200);
    expect((await response.json()).product_id).toBe(PRODUCT_ID);

    const rpcCalls = callsOn("rpc:creator_publish_product", "rpc");
    expect(rpcCalls).toHaveLength(1);
    const payload = (rpcCalls[0].args[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect(payload.name).toBe("Galaxy Tee"); // design title fallback
    expect(payload.base_price).toBe(750);
    expect(payload.compare_at_price).toBeNull();
    expect(payload.images).toHaveLength(2);
    expect(callsOn("categories")).toHaveLength(0);
  });

  it("maps publish:* RPC failures to house codes", async () => {
    const cases: Array<[string, number, string]> = [
      ["publish:already_submitted", 409, "already_submitted"],
      ["publish:invalid_price", 400, "invalid_price"],
      ["publish:publish_disabled", 403, "publish_disabled"],
      ["publish:design_product_not_found", 409, "not_found"],
    ];
    for (const [message, status, code] of cases) {
      primeGuard();
      primeDesign();
      primeProfile();
      primeRow(rowFixture());
      primeRpc({ data: null, error: { code: "P0001", message } });
      const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
    // one row read per attempt, and never a fresh re-read after a failure
    expect(callsOn("creator_design_products", "select")).toHaveLength(cases.length);
  });

  it("503s naming the phase-7 migration when the publish functions are absent", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeRpc({
      data: null,
      error: {
        code: "42883",
        message: "Could not find the function public.creator_publish_product(p_design_product_id, p_payload)",
      },
    });
    const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
    expect(body.context).toBe("designs.publish");
    expect(body.message).toContain("20261110170000_creator_studio_publish_functions.sql");
  });

  it("503s when the RPC reports a missing relation (core migration absent)", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeRpc({ data: null, error: MISSING_RELATION.error });
    const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
    expect(body.message).toContain("20261110120000_creator_studio_core.sql");
  });

  it("retries exactly once on a slug race (23505) and then succeeds", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeRpc({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    primeRpc({ data: PRODUCT_ID, error: null });
    primeRow(rowFixture({ status: "pending_review", product_id: PRODUCT_ID }));

    const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
    expect(response.status).toBe(201);
    expect((await response.json()).product_id).toBe(PRODUCT_ID);
    expect(callsOn("rpc:creator_publish_product", "rpc")).toHaveLength(2);
  });

  it("fails honestly when the race persists after the single retry", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeRow(rowFixture());
    primeRpc({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    primeRpc({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const response = await publishPost(jsonRequest(PUBLISH_URL, PRODUCT_BODY), PUBLISH_PARAMS);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Could not submit for publishing.");
    expect(callsOn("rpc:creator_publish_product", "rpc")).toHaveLength(2);
    expect(callsOn("creator_design_products", "select")).toHaveLength(1); // no re-read
  });
});

// --- target B: creator gallery ----------------------------------------------

describe("POST /api/designs/[id]/publish — gallery target", () => {
  it("creates the first gallery item with caller-derived ownership and a derived cover (201)", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeGallery({ data: null, error: null });
    primeDerive([rowFixture()]);
    primeGallery({ data: GALLERY_ROW, error: null });

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, {
        target: "gallery",
        title: "Neon Galaxy Tee",
        description: "A galaxy print",
        tags: ["space"],
        visibility: "public",
      }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.created).toBe(true);
    expect(body.gallery).toMatchObject({
      id: GALLERY_ID,
      design_id: DESIGN_ID,
      title: "Neon Galaxy Tee",
      status: "pending_review",
      preview_path: FRONT_PATH,
      tags: ["space"],
      visibility: "public",
    });
    // reviewer / ownership columns are never part of the API shape
    expect(body.gallery).not.toHaveProperty("owner_id");
    expect(body.gallery).not.toHaveProperty("creator_profile_id");
    expect(body.gallery).not.toHaveProperty("reviewed_by");

    const inserts = callsOn("creator_gallery_items", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual({
      design_id: DESIGN_ID,
      owner_id: SESSION_USER,
      creator_profile_id: PROFILE_ID,
      title: "Neon Galaxy Tee",
      description: "A galaxy print",
      preview_path: FRONT_PATH,
      tags: ["space"],
      visibility: "public",
      status: "pending_review",
      submitted_at: expect.any(String),
    });
    expect(callsOn("products")).toHaveLength(0);
  });

  it("creates a gallery item without any generated mockups, deriving the title", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeGallery({ data: null, error: null });
    primeDerive([{ mockups: [], created_at: "2026-01-01T00:00:00.000Z" }]);
    primeGallery({ data: { ...GALLERY_ROW, preview_path: null }, error: null });

    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.gallery.preview_path).toBeNull(); // primed insert row
    // title fallback + defaults are asserted on the WRITE, not the response
    const inserts = callsOn("creator_gallery_items", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toMatchObject({
      title: "Galaxy Tee", // design title fallback
      preview_path: null,
      tags: [],
      visibility: "public",
    });
  });

  it("returns an existing pending submission idempotently (200, created:false)", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeGallery({ data: GALLERY_ROW, error: null });

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, { target: "gallery", title: "Neon Galaxy Tee" }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.gallery.status).toBe("pending_review");
    expect(callsOn("creator_gallery_items", "insert")).toHaveLength(0);
    expect(callsOn("creator_gallery_items", "update")).toHaveLength(0);
  });

  it("409s gallery items that are already approved or archived", async () => {
    const cases: Array<[string, string]> = [
      ["approved", "already_published"],
      ["archived", "invalid_status"],
    ];
    for (const [status, code] of cases) {
      primeGuard();
      primeDesign();
      primeProfile();
      primeGallery({ data: { ...GALLERY_ROW, status }, error: null });
      const response = await publishPost(
        jsonRequest(PUBLISH_URL, { target: "gallery", title: "Neon Galaxy Tee" }),
        PUBLISH_PARAMS
      );
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
    }
    expect(callsOn("creator_gallery_items", "update")).toHaveLength(0);
    expect(callsOn("creator_gallery_items", "insert")).toHaveLength(0);
  });

  it("resubmits a rejected item by updating the SAME row and keeping its cover", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeGallery({
      data: { ...GALLERY_ROW, status: "rejected", rejection_reason: "fix the text" },
      error: null,
    });
    primeGallery({
      data: {
        ...GALLERY_ROW,
        status: "pending_review",
        rejection_reason: null,
        submitted_at: "2026-01-05T00:00:00.000Z",
        title: "Neon Galaxy Tee",
        description: "Updated description",
        tags: ["art"],
        visibility: "unlisted",
      },
      error: null,
    });

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, {
        target: "gallery",
        title: "Neon Galaxy Tee",
        description: "Updated description",
        tags: ["art"],
        visibility: "unlisted",
      }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.gallery.status).toBe("pending_review");
    expect(body.gallery.visibility).toBe("unlisted");

    const updates = callsOn("creator_gallery_items", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({
      title: "Neon Galaxy Tee",
      description: "Updated description",
      tags: ["art"],
      visibility: "unlisted",
      preview_path: FRONT_PATH, // kept — no needless regeneration
      status: "pending_review",
      rejection_reason: null,
      submitted_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(
      callsOn("creator_gallery_items", "eq").some(
        (call) => call.args[0] === "id" && call.args[1] === GALLERY_ID
      )
    ).toBe(true);
    expect(callsOn("creator_design_products")).toHaveLength(0); // cover kept → no derive
    expect(callsOn("creator_gallery_items", "insert")).toHaveLength(0);
  });

  it("recovers from a gallery insert race (23505) by returning the winner", async () => {
    primeGuard();
    primeDesign();
    primeProfile();
    primeGallery({ data: null, error: null });
    primeGallery({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    primeGallery({ data: GALLERY_ROW, error: null });

    const response = await publishPost(
      jsonRequest(PUBLISH_URL, {
        target: "gallery",
        title: "Neon Galaxy Tee",
        preview_path: FRONT_PATH,
      }),
      PUBLISH_PARAMS
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.gallery.id).toBe(GALLERY_ID);
    // existing read + the insert's .select() projection + the winner read
    expect(callsOn("creator_gallery_items", "select")).toHaveLength(3);
    expect(callsOn("creator_gallery_items", "insert")).toHaveLength(1);
    expect(callsOn("creator_design_products")).toHaveLength(0); // preview supplied → no derive
  });

  it("400s when neither the body nor the design yields a valid gallery title", async () => {
    primeGuard();
    primeDesign({ title: "x" });
    primeProfile();
    primeGallery({ data: null, error: null });

    const response = await publishPost(jsonRequest(PUBLISH_URL, { target: "gallery" }), PUBLISH_PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_title");
    expect(callsOn("creator_gallery_items", "insert")).toHaveLength(0);
    expect(callsOn("creator_design_products")).toHaveLength(0);
  });
});

// --- "Designed by" attribution ----------------------------------------------

describe("fetchProductAttribution", () => {
  it("returns only the public persona fields linked to the product", async () => {
    mockSession.enqueue("creator_design_products", {
      data: {
        creator_profiles: {
          username: "nova",
          display_name: "Nova",
          avatar_url: "https://cdn.example/x.png",
        },
      },
      error: null,
    });

    const result = await fetchProductAttribution(PRODUCT_ID);
    expect(result).toEqual({
      username: "nova",
      display_name: "Nova",
      avatar_url: "https://cdn.example/x.png",
    });

    const selects = callsOn("creator_design_products", "select");
    expect(selects).toHaveLength(1);
    expect(String(selects[0].args[0]).replace(/\s+/g, " ").trim()).toBe(
      "creator_profiles(username, display_name, avatar_url)"
    );
    expect(
      callsOn("creator_design_products", "eq").some(
        (call) => call.args[0] === "product_id" && call.args[1] === PRODUCT_ID
      )
    ).toBe(true);
    expect(
      callsOn("creator_design_products", "is").some(
        (call) => call.args[0] === "deleted_at" && call.args[1] === null
      )
    ).toBe(true);
    expect(callsOn("creator_design_products", "limit")[0].args).toEqual([1]);
  });

  it("returns null when the product has no linked row (ordinary vendor product)", async () => {
    mockSession.enqueue("creator_design_products", { data: null, error: null });
    expect(await fetchProductAttribution(PRODUCT_ID)).toBeNull();
  });

  it("returns null when the embed resolves to no profile", async () => {
    mockSession.enqueue("creator_design_products", {
      data: { creator_profiles: null },
      error: null,
    });
    expect(await fetchProductAttribution(PRODUCT_ID)).toBeNull();
  });

  it("falls back to the username and drops a non-string avatar", async () => {
    mockSession.enqueue("creator_design_products", {
      data: { creator_profiles: { username: "nova", display_name: "", avatar_url: 123 } },
      error: null,
    });
    expect(await fetchProductAttribution(PRODUCT_ID)).toEqual({
      username: "nova",
      display_name: "nova",
      avatar_url: null,
    });
  });

  it("propagates query errors instead of rendering a fake credit", async () => {
    mockSession.enqueue("creator_design_products", {
      data: null,
      error: { message: "boom" },
    });
    await expect(fetchProductAttribution(PRODUCT_ID)).rejects.toMatchObject({ message: "boom" });
  });
});
