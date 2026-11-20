/**
 * @jest-environment node
 *
 * Phase 4 — Design API contract tests (upload / persistence / boundaries):
 *
 * POST /api/designs (create)
 *   - rate limit → auth → migration guard → validation, in that order
 *   - honest 503 before ANY side effect when editor_state is missing
 *   - magic-byte validation (a .png-name JPEG still fails as unsupported/mismatch)
 *   - storage path is `${ownerId}/${designId}/…` (folder policy), caller-supplied
 *     owner_id never used, slug/version_number left to DB triggers
 *   - SVG is stored SANITIZED — scripts never reach the bucket
 *   - failure at any insert unwinds (soft-delete + storage removal), never a
 *     half-created design
 *
 * GET /api/designs (list)
 *   - RLS-shaped owner scoping, exact count, clamped pagination, current
 *     version + primary file merged per design
 *
 * GET/PATCH/DELETE /api/designs/[id]
 *   - 503 on missing editor_state (read/write surfaces), 404 without leaking
 *     other people's rows, allow-list rejects approval fields with NO write,
 *     soft delete stamps deleted_at
 *
 * POST /api/designs/[id]/artwork (replace)
 *   - new version is inserted NOT-current, file attached, THEN activated —
 *     a failure unwinds without touching the previous current version
 *   - placement (editor_state) is carried over and refit to the new aspect
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

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };
type StorageCall = { bucket: string; method: string; args: unknown[] };

type ClientMock = {
  client: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
    storage: { from: jest.Mock };
  };
  /** Convenience alias for `client.storage` (shorter in assertions). */
  storage: { from: jest.Mock };
  /** FIFO outcomes per table — each awaited operation shifts one entry. */
  queues: Map<string, Outcome[]>;
  calls: Call[];
  storageCalls: StorageCall[];
  /** Errors returned by storage.upload(), consumed in order. */
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

import { GET as listGet, POST as createPost } from "@/app/api/designs/route";
import {
  GET as designGet,
  PATCH as designPatch,
  DELETE as designDelete,
} from "@/app/api/designs/[id]/route";
import { POST as artworkPost } from "@/app/api/designs/[id]/artwork/route";

const AUTH = { Authorization: "Bearer valid-token" };
const MISSING_RELATION = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
};

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

const SVG_WITH_SCRIPT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
  '<script>alert("xss")</script><rect width="10" height="10" onclick="hack()"/></svg>';

function uploadRequest(url: string, file: { bytes: Uint8Array; name: string; type: string }, title?: string): Request {
  const form = new FormData();
  form.append("file", new File([file.bytes.slice().buffer as ArrayBuffer], file.name, { type: file.type }));
  if (title !== undefined) form.append("title", title);
  return new Request(url, { method: "POST", headers: AUTH, body: form });
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authed(url: string): Request {
  return new Request(url, { headers: AUTH });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PNG_FILE = { bytes: makePng(), name: "my art.png", type: "image/png" };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = makeClient();
  const rateMock = jest.requireMock("@/lib/rate-limit") as {
    __mockRateAllowed: { value: boolean };
  };
  rateMock.__mockRateAllowed.value = true;
});

/** Wires the happy-path queues for a successful create. */
function primeCreate() {
  mockSession.enqueue("design_versions", { data: [{ id: "probe" }], error: null }); // migration guard
  mockSession.enqueue("user_designs", {
    data: {
      id: "design-1",
      title: "My art",
      slug: "my-art",
      description: null,
      status: "draft",
      is_public: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    error: null,
  });
  mockSession.enqueue("design_versions", {
    data: { id: "ver-1", version_number: 1, status: "draft", is_current: true, created_at: "2026-01-01T00:00:00Z" },
    error: null,
  });
  mockSession.enqueue("design_files", {
    data: {
      id: "file-1",
      storage_path: "session-user-9/design-1/x.png",
      original_filename: "my art.png",
      file_format: "png",
      mime_type: "image/png",
      file_size_bytes: 45,
      width_px: 1200,
      height_px: 1200,
      dpi: 72,
      color_mode: "RGB",
      has_transparent_background: true,
      is_primary: true,
      scan_status: "pending",
    },
    error: null,
  });
}

// ---------------------------------------------------------------------------

describe("POST /api/designs — create", () => {
  test("401 without a token, no table or storage access", async () => {
    const res = await createPost(new Request("http://localhost:3000/api/designs", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(mockSession.client.from).not.toHaveBeenCalled();
    expect(mockSession.storage.from).not.toHaveBeenCalled();
  });

  test("429 when the upload rate limit trips", async () => {
    const rateMock = jest.requireMock("@/lib/rate-limit") as {
      __mockRateAllowed: { value: boolean };
    };
    rateMock.__mockRateAllowed.value = false;

    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", PNG_FILE));
    expect(res.status).toBe(429);
    expect(mockSession.storage.from).not.toHaveBeenCalled();
    expect(mockSession.client.from).not.toHaveBeenCalled();
  });

  test("503 MIGRATION_REQUIRED BEFORE any side effect", async () => {
    mockSession.enqueue("design_versions", MISSING_RELATION);

    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", PNG_FILE));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
    expect(mockSession.storageCalls).toHaveLength(0);
    expect(mockSession.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  test("400 for a missing file field", async () => {
    const form = new FormData();
    form.append("title", "No file");
    const res = await createPost(
      new Request("http://localhost:3000/api/designs", { method: "POST", headers: AUTH, body: form })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("missing_file");
  });

  test("400 unsupported type — magic bytes decide, not the file name", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    const fakePng = { bytes: new TextEncoder().encode("%PDF-1.7"), name: "harmless.png", type: "image/png" };
    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", fakePng));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("unsupported_type");
    expect(mockSession.storageCalls).toHaveLength(0);
    expect(mockSession.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  test("happy path: owner-scoped rows, trigger-generated slug/version, folder-scoped storage", async () => {
    primeCreate();

    const res = await createPost(
      uploadRequest("http://localhost:3000/api/designs", PNG_FILE, "Galaxy Tee")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.design.slug).toBe("my-art");
    expect(body.design.version.file.file_format).toBe("png");

    // Storage: owner folder first (policy requires foldername[1] = auth.uid()).
    const upload = mockSession.storageCalls.find((c) => c.method === "upload");
    expect(upload).toBeTruthy();
    expect(upload!.bucket).toBe("design-uploads");
    expect(String(upload!.args[0]).startsWith("session-user-9/")).toBe(true);
    expect(String(upload!.args[0]).split("/")).toHaveLength(3); // owner/design/file
    expect((upload!.args[2] as { contentType: string }).contentType).toBe("image/png");

    // Design insert: user_id from the session, no client-supplied identity/flags.
    const designInsert = mockSession.calls.find(
      (c) => c.table === "user_designs" && c.method === "insert"
    );
    expect(designInsert).toBeTruthy();
    const designValues = designInsert!.args[0] as Record<string, unknown>;
    expect(designValues.owner_id).toBe("session-user-9");
    expect(designValues.title).toBe("Galaxy Tee"); // the resolved title we wrote
    expect(designValues.status).toBe("draft");
    expect(designValues.is_public).toBe(false);
    expect(designValues.slug).toBeUndefined(); // DB trigger generates it

    // Version insert: is_current set, version_number left to the trigger.
    const versionInsert = mockSession.calls.find(
      (c) => c.table === "design_versions" && c.method === "insert"
    );
    expect(versionInsert).toBeTruthy();
    const versionValues = versionInsert!.args[0] as Record<string, unknown>;
    expect(versionValues.status).toBe("draft");
    expect(versionValues.is_current).toBe(true);
    expect(versionValues.version_number).toBeUndefined();

    // File row carries parsed metadata + checksum of the STORED bytes.
    const fileInsert = mockSession.calls.find(
      (c) => c.table === "design_files" && c.method === "insert"
    );
    expect(fileInsert).toBeTruthy();
    const fileValues = fileInsert!.args[0] as Record<string, unknown>;
    expect(fileValues.file_format).toBe("png");
    expect(fileValues.width_px).toBe(1200);
    expect(fileValues.height_px).toBe(1200);
    expect(fileValues.is_primary).toBe(true);
    expect(String(fileValues.checksum_sha256)).toMatch(/^[0-9a-f]{64}$/);

    // Response echoes the inserted row (mock DB returns its own title).
    expect(body.design.title).toBe("My art");
  });

  test("SVG is sanitized BEFORE storage — scripts and handlers never reach the bucket", async () => {
    primeCreate();
    const res = await createPost(
      uploadRequest("http://localhost:3000/api/designs", {
        bytes: new TextEncoder().encode(SVG_WITH_SCRIPT),
        name: "art.svg",
        type: "image/svg+xml",
      })
    );
    expect(res.status).toBe(201);

    const upload = mockSession.storageCalls.find((c) => c.method === "upload");
    const stored = (upload!.args[1] as Buffer).toString("utf8");
    expect(stored).not.toContain("<script");
    expect(stored).not.toContain("alert");
    expect(stored).not.toContain("onclick");
    expect(stored).toContain("<rect");
    expect((upload!.args[2] as { contentType: string }).contentType).toBe("image/svg+xml");
    expect(String(upload!.args[0]).endsWith(".svg")).toBe(true);

    const fileInsert = mockSession.calls.find(
      (c) => c.table === "design_files" && c.method === "insert"
    );
    const fileValues = fileInsert!.args[0] as Record<string, unknown>;
    expect(fileValues.file_format).toBe("svg");
    expect(fileValues.width_px).toBe(600);
    expect(fileValues.dpi).toBeNull(); // vector — no DPI claim
    expect(fileValues.has_transparent_background).toBeNull(); // unknown — no claim
  });

  test("storage rejection → 400, zero database writes", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    mockSession.uploadOutcomes.push({
      data: null,
      error: { message: "mime type image/jpeg not allowed" },
    });

    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", PNG_FILE));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("storage_rejected");
    expect(mockSession.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  test("version insert failure unwinds: soft-delete + storage removal", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null }); // guard
    mockSession.enqueue("user_designs", { data: { id: "design-9" }, error: null }); // create ok
    mockSession.enqueue("design_versions", { data: null, error: { message: "boom" } }); // version fails

    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", PNG_FILE));
    expect(res.status).toBe(500);

    const softDelete = mockSession.calls.find(
      (c) => c.table === "user_designs" && c.method === "update"
    );
    expect(softDelete).toBeTruthy();
    expect((softDelete!.args[0] as { deleted_at: string }).deleted_at).toBeTruthy();
    expect(mockSession.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });

  test("file insert failure unwinds version + design + storage", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null }); // guard
    mockSession.enqueue("user_designs", { data: { id: "design-9" }, error: null });
    mockSession.enqueue("design_versions", { data: { id: "ver-9" }, error: null });
    mockSession.enqueue("design_files", { data: null, error: { message: "check failed" } });

    const res = await createPost(uploadRequest("http://localhost:3000/api/designs", PNG_FILE));
    expect(res.status).toBe(500);

    const versionDelete = mockSession.calls.find(
      (c) => c.table === "design_versions" && c.method === "delete"
    );
    const designUpdate = mockSession.calls.find(
      (c) => c.table === "user_designs" && c.method === "update"
    );
    expect(versionDelete).toBeTruthy();
    expect(designUpdate).toBeTruthy();
    expect(mockSession.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });
});

describe("GET /api/designs — list", () => {
  test("401 without token", async () => {
    const res = await listGet(new Request("http://localhost:3000/api/designs"));
    expect(res.status).toBe(401);
  });

  test("merges the current version + primary file, scoped to the caller", async () => {
    mockSession.enqueue("user_designs", {
      data: [
        {
          id: "design-1",
          title: "A",
          slug: "a",
          description: null,
          status: "draft",
          is_public: false,
          rejection_reason: null,
          created_at: "c",
          updated_at: "u",
        },
      ],
      count: 1,
      error: null,
    });
    mockSession.enqueue("design_versions", {
      data: [
        {
          id: "ver-1",
          design_id: "design-1",
          version_number: 3,
          status: "draft",
          is_current: true,
          created_at: "c",
          updated_at: "u",
          design_files: [
            { id: "f2", is_primary: false, storage_path: "old" },
            { id: "f1", is_primary: true, storage_path: "owner/design/new.png", width_px: 1200 },
          ],
        },
      ],
      error: null,
    });

    const res = await listGet(authed("http://localhost:3000/api/designs?page=1&per_page=99"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(24); // clamped to MAX
    expect(body.total).toBe(1);
    expect(body.designs).toHaveLength(1);
    expect(body.designs[0].version.version_number).toBe(3);
    expect(body.designs[0].version.file.id).toBe("f1"); // primary preferred

    expect(mockSession.calls).toContainEqual({
      table: "user_designs",
      method: "eq",
      args: ["owner_id", "session-user-9"],
    });
    expect(mockSession.calls).toContainEqual({
      table: "user_designs",
      method: "is",
      args: ["deleted_at", null],
    });
  });

  test("empty library → honest empty page", async () => {
    mockSession.enqueue("user_designs", { data: [], count: 0, error: null });
    const res = await listGet(authed("http://localhost:3000/api/designs"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.designs).toEqual([]);
    expect(body.has_more).toBe(false);
  });
});

describe("GET /api/designs/[id]", () => {
  test("503 when editor_state is missing (migration not applied)", async () => {
    mockSession.enqueue("design_versions", MISSING_RELATION);
    const res = await designGet(authed("http://localhost:3000/api/designs/11111111-1111-1111-1111-111111111111"), paramsFor("11111111-1111-1111-1111-111111111111"));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });

  test("404 for a malformed id without touching the database", async () => {
    const res = await designGet(authed("http://localhost:3000/api/designs/nope"), paramsFor("nope"));
    expect(res.status).toBe(404);
    expect(mockSession.client.from).not.toHaveBeenCalled();
  });

  test("404 when the design is not the caller's (RLS-shaped, no existence leak)", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    mockSession.enqueue("user_designs", { data: null, error: null }); // maybeSingle → null
    const res = await designGet(
      authed("http://localhost:3000/api/designs/11111111-1111-1111-1111-111111111111"),
      paramsFor("11111111-1111-1111-1111-111111111111")
    );
    expect(res.status).toBe(404);
    expect(mockSession.calls).toContainEqual({
      table: "user_designs",
      method: "eq",
      args: ["owner_id", "session-user-9"],
    });
  });

  test("returns editor_state on the current version for the editor", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    mockSession.enqueue("user_designs", {
      data: {
        id: "design-1",
        title: "A",
        slug: "a",
        status: "draft",
        is_public: false,
        description: null,
        rejection_reason: null,
        category_id: null,
        created_at: "c",
        updated_at: "u",
        design_versions: [
          {
            id: "ver-1",
            version_number: 2,
            status: "draft",
            is_current: true,
            editor_state: {
              version: 1,
              transform: { cx: 0, cy: 0, width: 6, height: 3, rotation: 0 },
              zoom: 1.25,
              aspectLocked: true,
            },
            created_at: "c",
            updated_at: "u",
            design_files: [{ id: "f1", is_primary: true, storage_path: "p/f.png" }],
          },
        ],
      },
      error: null,
    });

    const res = await designGet(
      authed("http://localhost:3000/api/designs/11111111-1111-1111-1111-111111111111"),
      paramsFor("11111111-1111-1111-1111-111111111111")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.design.version.editor_state.zoom).toBe(1.25);
    expect(body.design.version.file.storage_path).toBe("p/f.png");
    expect(body.design.version.version_number).toBe(2);
  });
});

describe("PATCH /api/designs/[id] — allow-list boundary", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  async function primeForPatch() {
    mockSession.enqueue("design_versions", { data: [], error: null }); // guard
    mockSession.enqueue("user_designs", { data: { id: "design-1" }, error: null }); // exists
  }

  test("rejects approval fields with 400 and performs NO write", async () => {
    await primeForPatch();
    const res = await designPatch(
      jsonRequest(`http://localhost:3000/api/designs/${ID}`, "PATCH", {
        status: "approved",
        is_public: true,
        reviewed_by: "me",
      }),
      paramsFor(ID)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("field_not_allowed");
    expect(mockSession.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  test("rejects owner_id injection", async () => {
    await primeForPatch();
    const res = await designPatch(
      jsonRequest(`http://localhost:3000/api/designs/${ID}`, "PATCH", { owner_id: "victim" }),
      paramsFor(ID)
    );
    expect(res.status).toBe(400);
    expect(mockSession.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  test("rejects a structurally invalid editor_state without writing", async () => {
    await primeForPatch();
    const res = await designPatch(
      jsonRequest(`http://localhost:3000/api/designs/${ID}`, "PATCH", {
        editor_state: { version: 1, transform: { cx: 0, cy: 0, width: -5, height: 4, rotation: 0 } },
      }),
      paramsFor(ID)
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_editor_state");
    expect(mockSession.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });

  test("saves title + editor_state and returns the merged design", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null }); // guard
    mockSession.enqueue("user_designs", { data: { id: "design-1" }, error: null }); // exists
    mockSession.enqueue("user_designs", { data: { id: "design-1", error: null }, error: null }); // design update
    mockSession.enqueue("design_versions", { data: [{ id: "ver-1" }], error: null }); // state update
    mockSession.enqueue("user_designs", {
      data: {
        id: "design-1",
        title: "Renamed",
        slug: "a",
        status: "draft",
        is_public: false,
        description: null,
        rejection_reason: null,
        category_id: null,
        created_at: "c",
        updated_at: "u",
        design_versions: [
          {
            id: "ver-1",
            version_number: 1,
            status: "draft",
            is_current: true,
            editor_state: { version: 1, transform: { cx: 1, cy: 0, width: 4, height: 4, rotation: 0 }, zoom: 1, aspectLocked: true },
            created_at: "c",
            updated_at: "u",
            design_files: [],
          },
        ],
      },
      error: null,
    });

    const res = await designPatch(
      jsonRequest(`http://localhost:3000/api/designs/${ID}`, "PATCH", {
        title: "Renamed",
        editor_state: {
          version: 1,
          transform: { cx: 1, cy: 0, width: 4, height: 4, rotation: 0 },
          zoom: 1,
          aspectLocked: true,
          junk_key: "stripped",
        },
      }),
      paramsFor(ID)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).design.title).toBe("Renamed");

    const designUpdate = mockSession.calls.find(
      (c) => c.table === "user_designs" && c.method === "update"
    );
    expect((designUpdate!.args[0] as Record<string, unknown>).title).toBe("Renamed");

    // editor_state goes to the CURRENT version only.
    const stateUpdate = mockSession.calls.find(
      (c) => c.table === "design_versions" && c.method === "update"
    );
    expect(stateUpdate).toBeTruthy();
    const stateArgs = stateUpdate!.args as unknown[];
    // Supabase takes a single patch object: .update({ editor_state: … })
    expect(stateArgs).toEqual([
      { editor_state: expect.objectContaining({ version: 1, aspectLocked: true }) },
    ]);
    // Unknown keys were stripped by normalizeEditorState before the write.
    const writtenState = (stateArgs[0] as { editor_state: Record<string, unknown> }).editor_state;
    expect("junk_key" in writtenState).toBe(false);
    expect(mockSession.calls).toContainEqual({
      table: "design_versions",
      method: "eq",
      args: ["is_current", true],
    });
  });

  test("404 when the design does not belong to the caller", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    mockSession.enqueue("user_designs", { data: null, error: null });
    const res = await designPatch(
      jsonRequest(`http://localhost:3000/api/designs/${ID}`, "PATCH", { title: "x" }),
      paramsFor(ID)
    );
    expect(res.status).toBe(404);
    expect(mockSession.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });
});

describe("DELETE /api/designs/[id] — soft delete", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  test("stamps deleted_at (creators never hard-delete)", async () => {
    mockSession.enqueue("user_designs", { data: { id: "design-1" }, error: null });
    mockSession.enqueue("user_designs", { data: null, error: null });

    const res = await designDelete(
      new Request(`http://localhost:3000/api/designs/${ID}`, { method: "DELETE", headers: AUTH }),
      paramsFor(ID)
    );
    expect(res.status).toBe(200);

    const update = mockSession.calls.find((c) => c.method === "update");
    expect(update).toBeTruthy();
    expect(update!.table).toBe("user_designs");
    expect((update!.args[0] as { deleted_at: string }).deleted_at).toBeTruthy();
    // no hard delete anywhere
    expect(mockSession.calls.filter((c) => c.method === "delete")).toHaveLength(0);
  });

  test("404 when already deleted or foreign", async () => {
    mockSession.enqueue("user_designs", { data: null, error: null });
    const res = await designDelete(
      new Request(`http://localhost:3000/api/designs/${ID}`, { method: "DELETE", headers: AUTH }),
      paramsFor(ID)
    );
    expect(res.status).toBe(404);
    expect(mockSession.calls.filter((c) => c.method === "update")).toHaveLength(0);
  });
});

describe("POST /api/designs/[id]/artwork — replace versioning", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  const PREVIOUS_STATE = {
    version: 1,
    transform: { cx: 2, cy: -1, width: 6, height: 3, rotation: 45 },
    zoom: 2,
    aspectLocked: false,
  };

  function primeForReplace(opts: { fileOk?: boolean; activateOk?: boolean } = {}) {
    const { fileOk = true, activateOk = true } = opts;
    mockSession.enqueue("design_versions", { data: [], error: null }); // guard
    mockSession.enqueue("user_designs", {
      data: {
        id: ID,
        status: "draft",
        design_versions: [{ id: "ver-old", editor_state: PREVIOUS_STATE, version_number: 1 }],
      },
      error: null,
    }); // load current
    mockSession.enqueue("design_versions", {
      data: { id: "ver-new", version_number: 2, status: "draft", created_at: "c" },
      error: null,
    }); // insert new (not current)
    mockSession.enqueue(
      "design_files",
      fileOk
        ? { data: { id: "f-new" }, error: null }
        : { data: null, error: { message: "file check failed" } }
    );
    mockSession.enqueue(
      "design_versions",
      activateOk
        ? { data: null, error: null } // activate update
        : { data: null, error: { message: "activation failed" } }
    );
  }

  function finalRead() {
    mockSession.enqueue("user_designs", {
      data: {
        id: ID,
        title: "A",
        slug: "a",
        status: "draft",
        is_public: false,
        rejection_reason: null,
        updated_at: "u",
        design_versions: [
          {
            id: "ver-new",
            version_number: 2,
            status: "draft",
            is_current: true,
            editor_state: { version: 1, transform: { cx: 2, cy: -1, width: 3, height: 3, rotation: 45 }, zoom: 2, aspectLocked: false },
            design_files: [{ id: "f-new", is_primary: true, storage_path: "o/d/n.png" }],
          },
        ],
      },
      error: null,
    });
  }

  test("404 for malformed design id", async () => {
    const res = await artworkPost(uploadRequest("http://localhost:3000/api/designs/x/artwork", PNG_FILE), paramsFor("x"));
    expect(res.status).toBe(404);
    expect(mockSession.client.from).not.toHaveBeenCalled();
  });

  test("inserts NOT-current, attaches file, then activates; carries placement refit to the new aspect", async () => {
    primeForReplace();
    finalRead();

    const res = await artworkPost(
      uploadRequest(`http://localhost:3000/api/designs/${ID}/artwork`, PNG_FILE),
      paramsFor(ID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.design.status).toBe("draft");
    expect(body.design.version.version_number).toBe(2);
    expect(body.design.version.file.id).toBe("f-new");

    const versionInsert = mockSession.calls.find(
      (c) => c.table === "design_versions" && c.method === "insert"
    );
    const inserted = versionInsert!.args[0] as Record<string, unknown>;
    expect(inserted.is_current).toBe(false); // only activated AFTER the file exists
    // placement carried: center/rotation/zoom kept, box refit 6×3 → square 3×3
    const carried = inserted.editor_state as {
      transform: { cx: number; cy: number; width: number; height: number; rotation: number };
      zoom: number;
      aspectLocked: boolean;
    };
    expect(carried.transform.cx).toBe(2);
    expect(carried.transform.cy).toBe(-1);
    expect(carried.transform.rotation).toBe(45);
    expect(carried.transform.width).toBeCloseTo(3, 5);
    expect(carried.transform.height).toBeCloseTo(3, 5);
    expect(carried.zoom).toBe(2);
    expect(carried.aspectLocked).toBe(false);

    // Activation happened as its own update on the new version.
    const activate = mockSession.calls.find(
      (c) => c.table === "design_versions" && c.method === "update"
    );
    expect(activate).toBeTruthy();
    expect(activate!.args).toEqual([{ is_current: true }]);

    // The old version was never manually touched — the DB trigger flips it
    // (enforce_single_current_version), so there must be no eq(id old) update.
    const oldVersionEdits = mockSession.calls.filter(
      (c) =>
        c.table === "design_versions" &&
        c.method === "eq" &&
        c.args[0] === "id" &&
        c.args[1] === "ver-old"
    );
    expect(oldVersionEdits).toHaveLength(0);
  });

  test("file failure unwinds the new version BEFORE activation — previous version untouched", async () => {
    primeForReplace({ fileOk: false });

    const res = await artworkPost(
      uploadRequest(`http://localhost:3000/api/designs/${ID}/artwork`, PNG_FILE),
      paramsFor(ID)
    );
    expect(res.status).toBe(500);

    expect(mockSession.calls.some((c) => c.table === "design_versions" && c.method === "update")).toBe(
      false
    ); // never activated
    expect(mockSession.calls.filter((c) => c.table === "design_versions" && c.method === "delete")).toHaveLength(1);
    expect(mockSession.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });

  test("activation failure removes file + version + object, still never touching the old version", async () => {
    primeForReplace({ activateOk: false });

    const res = await artworkPost(
      uploadRequest(`http://localhost:3000/api/designs/${ID}/artwork`, PNG_FILE),
      paramsFor(ID)
    );
    expect(res.status).toBe(500);

    expect(mockSession.calls.filter((c) => c.table === "design_files" && c.method === "delete")).toHaveLength(1);
    expect(mockSession.calls.filter((c) => c.table === "design_versions" && c.method === "delete")).toHaveLength(1);
    expect(mockSession.storageCalls.some((c) => c.method === "remove")).toBe(true);
    const oldVersionEdits = mockSession.calls.filter(
      (c) =>
        c.table === "design_versions" &&
        c.method === "eq" &&
        c.args[0] === "id" &&
        c.args[1] === "ver-old"
    );
    expect(oldVersionEdits).toHaveLength(0);
  });

  test("replacing on a rejected design is allowed (resubmission path)", async () => {
    mockSession.enqueue("design_versions", { data: [], error: null });
    mockSession.enqueue("user_designs", {
      data: {
        id: ID,
        status: "rejected",
        design_versions: [{ id: "ver-old", editor_state: null, version_number: 1 }],
      },
      error: null,
    });
    mockSession.enqueue("design_versions", {
      data: { id: "ver-new", version_number: 2, status: "draft", created_at: "c" },
      error: null,
    });
    mockSession.enqueue("design_files", { data: { id: "f-new" }, error: null });
    mockSession.enqueue("design_versions", { data: null, error: null }); // activate → trigger syncs to draft
    finalRead();

    const res = await artworkPost(
      uploadRequest(`http://localhost:3000/api/designs/${ID}/artwork`, PNG_FILE),
      paramsFor(ID)
    );
    expect(res.status).toBe(201);
    // The final read represents the post-trigger state: rejected → draft.
    const body = await res.json();
    expect(body.design.status).toBe("draft");
    expect(body.design.rejection_reason).toBeNull();
  });
});
