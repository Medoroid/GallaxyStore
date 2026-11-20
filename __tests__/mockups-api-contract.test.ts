/**
 * @jest-environment node
 *
 * Phase 5 — POST /api/designs/[id]/mockups contract tests:
 *
 *   - rate limit (fail_closed, design-mockup key) → auth → UUID → migration
 *     guard → body → config → artwork, in that order; 503 with NO side effects
 *   - config is validated against the PURE registry and re-hashed server-side
 *     from the NORMALIZED object (client junk fields can never influence the
 *     idempotency key); transform/area must be finite, fileId must be a UUID
 *   - only the design's CURRENT artwork file is mockup-able (409 on mismatch)
 *   - non-PNG uploads are rejected; bucket writes are service-role into
 *     `design-previews` at a deterministic, hash-suffixed path
 *   - idempotent: same config_hash → 200 cached with ZERO storage writes
 *   - design×template row is created once (creator_profile_id comes from the
 *     caller's OWN profile, never the request), unique-violation races append
 *   - any DB failure after upload removes the orphan object
 */

jest.mock("@/lib/rate-limit", () => {
  const mockRateAllowed = { value: true };
  return {
    checkRateLimitAsync: jest.fn(async () => ({
      allowed: mockRateAllowed.value,
      remaining: 10,
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

// The route writes via the service role (design-previews is admin-only under
// RLS; the four studio tables are SELECT-only for owners). The module caches
// its client, so the mock is pinned to the per-test session explicitly.
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockSession.client),
}));

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };
type StorageCall = { bucket: string; method: string; args: unknown[] };

type ClientMock = {
  client: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
    storage: { from: jest.Mock };
  };
  storage: { from: jest.Mock };
  queues: Map<string, Outcome[]>;
  calls: Call[];
  storageCalls: StorageCall[];
  uploadOutcomes: Outcome[];
  enqueue: (table: string, ...outcomes: Outcome[]) => void;
};

function makeClient(): ClientMock {
  const queues = new Map<string, Outcome[]>();
  const calls: Call[] = [];
  const storageCalls: StorageCall[] = [];
  const uploadOutcomes: Outcome[] = [];

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
      from: jest.fn((bucket: string) => ({
        upload: jest.fn(async (path: string, body: unknown, opts: unknown) => {
          storageCalls.push({ bucket, method: "upload", args: [path, body, opts] });
          const forced = uploadOutcomes.shift();
          if (forced) return forced;
          return { data: { path }, error: null };
        }),
        remove: jest.fn(async (paths: unknown) => {
          storageCalls.push({ bucket, method: "remove", args: [paths] });
          return { data: [], error: null };
        }),
      })),
    },
  };

  return {
    client,
    storage: client.storage,
    queues,
    calls,
    storageCalls,
    uploadOutcomes,
    enqueue(table, ...outcomes) {
      const queue = queues.get(table) ?? [];
      queue.push(...outcomes);
      queues.set(table, queue);
    },
  };
}

let mockSession: ClientMock;

import { POST as mockupsPost } from "@/app/api/designs/[id]/mockups/route";
import {
  MOCKUP_RENDERER_VERSION,
  mockupConfigHash,
} from "@/lib/design-studio/mockup-hash";

const AUTH = { Authorization: "Bearer valid-token" };
const MISSING_RELATION = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
};

const DESIGN_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_FILE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
const PROFILE_ID = "ffffffff-0000-4000-8000-000000000001";
const CATALOG_ID = "ffffffff-0000-4000-8000-000000000002";
const ROW_ID = "ffffffff-0000-4000-8000-000000000003";

const URL_ = `http://localhost:3000/api/designs/${DESIGN_ID}/mockups`;
const PARAMS = { params: Promise.resolve({ id: DESIGN_ID }) };

const BASE_CONFIG = {
  renderer: MOCKUP_RENDERER_VERSION,
  template: "tshirt",
  view: "front",
  color: "black",
  fileId: FILE_ID,
  transform: { cx: 0, cy: 0, width: 6, height: 6, rotation: 0 },
  area: { widthIn: 12, heightIn: 12 },
};

const HASH = mockupConfigHash(BASE_CONFIG);
const EXPECTED_PATH = `mockups/${DESIGN_ID}/tshirt/front-black-${HASH}.png`;

// --- fixtures ---------------------------------------------------------------

function be32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function ascii(s: string): number[] {
  return Array.from(s, (ch) => ch.charCodeAt(0));
}

/** Minimal structurally valid PNG header (1200×1200, RGBA). */
function makePng(): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  bytes.push(...be32(13), ...ascii("IHDR"), ...be32(1200), ...be32(1200));
  bytes.push(8, 6, 0, 0, 0, 0, 0, 0, 0);
  bytes.push(...be32(4), ...ascii("IDAT"), 1, 2, 3, 4, 0, 0, 0, 0);
  return new Uint8Array(bytes);
}

function mockupRequest(
  config: unknown,
  file?: { bytes: Uint8Array; name: string; type: string },
  url: string = URL_
): Request {
  const form = new FormData();
  if (file) {
    form.append(
      "file",
      new File([file.bytes.slice().buffer as ArrayBuffer], file.name, { type: file.type })
    );
  }
  form.append("config", typeof config === "string" ? config : JSON.stringify(config));
  return new Request(url, { method: "POST", headers: AUTH, body: form });
}

const PNG_FILE = { bytes: makePng(), name: "mockup.png", type: "image/png" };

// --- queue wiring -----------------------------------------------------------

function primeGuard(outcome: Outcome = { data: [{ id: "probe" }], error: null }) {
  mockSession.enqueue("design_versions", outcome);
}
function primeDesign(files: Array<{ id: string; is_primary?: boolean }>) {
  mockSession.enqueue("user_designs", {
    data: {
      id: DESIGN_ID,
      design_versions: [{ id: "ver-1", design_files: files }],
    },
    error: null,
  });
}
function primeDesignMissing() {
  mockSession.enqueue("user_designs", { data: null, error: null });
}
function primeProfile(id: string | null = PROFILE_ID) {
  mockSession.enqueue("creator_profiles", { data: id ? { id } : null, error: null });
}
function primeCatalog(id: string | null = CATALOG_ID) {
  // One response for the published-catalog resolver, one for route lookups.
  for (let i = 0; i < 2; i++) {
    mockSession.enqueue("creator_product_templates", { data: id ? { id } : null, error: null });
  }
}
function primeRow(row: unknown = null) {
  mockSession.enqueue("creator_design_products", { data: row, error: null });
}
function primeInsert(outcome: Outcome = { data: null, error: null }) {
  mockSession.enqueue("creator_design_products", outcome);
}
function primeUpdate(outcome: Outcome = { data: null, error: null }) {
  mockSession.enqueue("creator_design_products", outcome);
}

/** Wires everything up to (and including) the product-row read. */
function primeThroughRowRead(row: unknown = null) {
  primeGuard();
  primeDesign([{ id: FILE_ID, is_primary: true }]);
  primeProfile();
  primeCatalog();
  primeRow(row);
}

const callsOn = (table: string, method?: string) =>
  mockSession.calls.filter(
    (call) => call.table === table && (method === undefined || call.method === method)
  );
const uploads = () => mockSession.storageCalls.filter((c) => c.method === "upload");

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = makeClient();
  const rateMock = jest.requireMock("@/lib/rate-limit") as {
    __mockRateAllowed: { value: boolean };
  };
  rateMock.__mockRateAllowed.value = true;
});

// --- ordering / auth boundaries --------------------------------------------

describe("ordering and auth", () => {
  it("429s when rate-limited, before auth, with the fail_closed design-mockup key", async () => {
    const rateMock = jest.requireMock("@/lib/rate-limit") as {
      checkRateLimitAsync: jest.Mock;
    };
    const { __mockRateAllowed } = jest.requireMock("@/lib/rate-limit") as {
      __mockRateAllowed: { value: boolean };
    };
    __mockRateAllowed.value = false;

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(429);
    expect(mockSession.calls).toHaveLength(0);
    expect(rateMock.checkRateLimitAsync).toHaveBeenCalledWith("design-mockup:127.0.0.1", {
      maxRequests: 10,
      failureMode: "fail_closed",
    });
  });

  it("401s without a bearer token and touches no table", async () => {
    const form = new FormData();
    form.append("config", JSON.stringify(BASE_CONFIG));
    const response = await mockupsPost(
      new Request(URL_, { method: "POST", body: form }),
      PARAMS
    );
    expect(response.status).toBe(401);
    expect(mockSession.calls).toHaveLength(0);
  });

  it("404s a malformed design id before reading anything", async () => {
    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(response.status).toBe(404);
    expect(mockSession.calls).toHaveLength(0);
    expect(mockSession.storageCalls).toHaveLength(0);
  });

  it("returns an honest 503 before the body or storage when the migration is absent", async () => {
    primeGuard(MISSING_RELATION);

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
    expect(mockSession.storageCalls).toHaveLength(0);
    expect(callsOn("user_designs")).toHaveLength(0);
  });
});

// --- input validation -------------------------------------------------------

describe("input validation", () => {
  it("400s when the PNG field is missing (after the guard)", async () => {
    primeGuard();
    const response = await mockupsPost(mockupRequest(BASE_CONFIG), PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("missing_file");
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("400s on config that is not valid JSON", async () => {
    primeGuard();
    const response = await mockupsPost(mockupRequest("{oops", PNG_FILE), PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_config");
  });

  it("400s unknown template / view / color against the pure registry", async () => {
    for (const [override, code] of [
      [{ template: "toaster" }, "unknown_template"],
      [{ view: "side" }, "unknown_view"],
      [{ color: "chartreuse" }, "unknown_color"],
    ] as const) {
      primeGuard();
      const response = await mockupsPost(
        mockupRequest({ ...BASE_CONFIG, ...override }, PNG_FILE),
        PARAMS
      );
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe(code);
    }
    expect(callsOn("user_designs")).toHaveLength(0);
  });

  it("400s non-finite or malformed transform/area/fileId", async () => {
    const badConfigs: unknown[] = [
      { ...BASE_CONFIG, transform: { ...BASE_CONFIG.transform, cx: "left" } },
      { ...BASE_CONFIG, transform: { ...BASE_CONFIG.transform, width: 0 } },
      { ...BASE_CONFIG, transform: { ...BASE_CONFIG.transform, rotation: null } },
      { ...BASE_CONFIG, area: { widthIn: 0, heightIn: 12 } },
      { ...BASE_CONFIG, fileId: "file-1" },
      { ...BASE_CONFIG, renderer: 0 },
      { ...BASE_CONFIG, transform: undefined },
    ];
    for (const config of badConfigs) {
      primeGuard();
      const response = await mockupsPost(mockupRequest(config, PNG_FILE), PARAMS);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_config");
    }
  });

  it("400s a non-PNG preview before touching the design", async () => {
    primeGuard();
    const pdf = { bytes: new Uint8Array(ascii("%PDF-1.4 fake")), name: "x.pdf", type: "application/pdf" };
    const response = await mockupsPost(mockupRequest(BASE_CONFIG, pdf), PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("unsupported_type");
    expect(callsOn("user_designs")).toHaveLength(0);
  });
});

// --- ownership / state boundaries ------------------------------------------

describe("ownership and state boundaries", () => {
  it("404s a design the caller does not own, without reading the profile", async () => {
    primeGuard();
    primeDesignMissing();

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
    expect(callsOn("creator_profiles")).toHaveLength(0);
    expect(mockSession.storageCalls).toHaveLength(0);
  });

  it("409s when the design has no artwork yet", async () => {
    primeGuard();
    primeDesign([]);

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("no_artwork");
    expect(callsOn("creator_profiles")).toHaveLength(0);
  });

  it("409s when the config references a REPLACED artwork file", async () => {
    primeGuard();
    primeDesign([{ id: OTHER_FILE_ID, is_primary: true }]);

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("stale_artwork");
    expect(callsOn("creator_profiles")).toHaveLength(0);
  });

  it("403s without a creator profile, before any service-role read", async () => {
    primeGuard();
    primeDesign([{ id: FILE_ID, is_primary: true }]);
    primeProfile(null);

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("creator_profile_required");
    expect(callsOn("creator_product_templates")).toHaveLength(0);
    expect(mockSession.storageCalls).toHaveLength(0);
  });

  it("503s honestly when the template catalog was never seeded", async () => {
    primeGuard();
    primeDesign([{ id: FILE_ID, is_primary: true }]);
    primeProfile();
    primeCatalog(null);

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("templates_not_seeded");
    expect(callsOn("creator_design_products")).toHaveLength(0);
    expect(mockSession.storageCalls).toHaveLength(0);
  });
});

// --- persistence ------------------------------------------------------------

describe("persistence", () => {
  it("creates the design×template row and stores the PNG via service role (201)", async () => {
    primeThroughRowRead(null);
    primeInsert();

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.cached).toBeUndefined();

    // deterministic, hash-suffixed path in the PUBLIC previews bucket
    expect(uploads()).toHaveLength(1);
    const [path, , opts] = uploads()[0].args as [string, unknown, Record<string, unknown>];
    expect(path).toBe(EXPECTED_PATH);
    expect(uploads()[0].bucket).toBe("design-previews");
    expect(opts.upsert).toBe(true);
    expect(opts.contentType).toBe("image/png");

    // record fields — width/height come from the SNIFFED PNG, not the client
    expect(body.mockup).toEqual({
      view: "front",
      color: "black",
      path: EXPECTED_PATH,
      width: 1200,
      height: 1200,
      config_hash: HASH,
      generated_at: expect.any(String),
    });
    expect(Date.parse(body.mockup.generated_at)).not.toBeNaN();

    // owner-derived ids only: profile from the caller's own row, never the body
    const inserts = callsOn("creator_design_products", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual({
      design_id: DESIGN_ID,
      template_id: CATALOG_ID,
      creator_profile_id: PROFILE_ID,
      mockups: [body.mockup],
    });
  });

  it("normalizes the config before hashing — extraneous client fields do not change the key", async () => {
    primeThroughRowRead(null);
    primeInsert();

    const polluted = { ...BASE_CONFIG, evil: "x", owner_id: "someone-else" };
    const response = await mockupsPost(mockupRequest(polluted, PNG_FILE), PARAMS);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.mockup.config_hash).toBe(HASH);
    expect(body.mockup.path).toBe(EXPECTED_PATH);
  });

  it("returns the cached record with ZERO storage writes on an identical config", async () => {
    const cachedRecord = {
      view: "front",
      color: "black",
      path: EXPECTED_PATH,
      width: 1200,
      height: 1200,
      config_hash: HASH,
      generated_at: "2026-01-01T00:00:00.000Z",
    };
    primeThroughRowRead({ id: ROW_ID, mockups: [cachedRecord] });

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, cached: true, mockup: cachedRecord });
    expect(mockSession.storageCalls).toHaveLength(0);
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("appends to an existing row when the hash is new (201)", async () => {
    const other = {
      view: "back",
      color: "white",
      path: "mockups/x/back-white-0.png",
      width: 10,
      height: 10,
      config_hash: "0".repeat(64),
      generated_at: "2026-01-01T00:00:00.000Z",
    };
    primeThroughRowRead({ id: ROW_ID, mockups: [other] });
    primeUpdate();

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(201);
    const record = (await response.json()).mockup;
    expect(record.config_hash).toBe(HASH);

    expect(uploads()).toHaveLength(1);
    const updates = callsOn("creator_design_products", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({ mockups: [other, record] });
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
  });

  it("recovers from a design×template insert race (23505) by appending to the winner", async () => {
    primeThroughRowRead(null);
    primeInsert({ data: null, error: { code: "23505", message: "duplicate key value" } });
    // re-read after the unique violation:
    const winner = {
      id: ROW_ID,
      mockups: [
        {
          view: "front",
          color: "navy",
          path: "mockups/y/front-navy-9.png",
          width: 5,
          height: 5,
          config_hash: "9".repeat(64),
          generated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    primeRow(winner);
    primeUpdate();

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(201);
    const record = (await response.json()).mockup;

    const updates = callsOn("creator_design_products", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({ mockups: [winner.mockups[0], record] });
    expect(mockSession.storageCalls.filter((c) => c.method === "remove")).toHaveLength(0);
  });

  it("400s a rejected upload with no database writes", async () => {
    primeThroughRowRead(null);
    mockSession.uploadOutcomes.push({ data: null, error: { message: "quota" } });

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("storage_rejected");
    expect(callsOn("creator_design_products", "insert")).toHaveLength(0);
    expect(callsOn("creator_design_products", "update")).toHaveLength(0);
  });

  it("removes the uploaded object when the database write fails", async () => {
    primeThroughRowRead(null);
    primeInsert({ data: null, error: { message: "db exploded" } });

    const response = await mockupsPost(mockupRequest(BASE_CONFIG, PNG_FILE), PARAMS);
    expect(response.status).toBe(500);

    const removes = mockSession.storageCalls.filter((c) => c.method === "remove");
    expect(removes).toHaveLength(1);
    expect(removes[0].bucket).toBe("design-previews");
    expect(removes[0].args[0]).toEqual([EXPECTED_PATH]);
  });
});
