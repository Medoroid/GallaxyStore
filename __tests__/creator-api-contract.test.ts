/**
 * @jest-environment node
 *
 * Phase 3 — Creator API contract tests:
 *
 * profile (GET/PATCH /api/creator/profile)
 *   - rate limit first (429), then authentication (401) before any validation
 *   - allow-list: identity/flag fields are rejected with 400 and NO write
 *   - user_id always comes from the verified session, never the payload
 *   - 409 on username conflict, 503 MIGRATION_REQUIRED when tables are absent
 *
 * public persona (GET /api/creators/[username])
 *   - malformed/unknown usernames -> 404 without a lookup
 *   - response strips user_id / can_publish / is_active / id
 *   - counts are RLS-shaped head counts
 *
 * public content (GET /api/creators/[username]/content)
 *   - only rows with a real published product are returned
 *   - pagination math + clamping, honest 503 when tables are absent
 *
 * dashboard (GET /api/creator/dashboard)
 *   - scoped to the caller's session user, zeroed payload without a persona
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

jest.mock("@/lib/supabase/public-server", () => ({
  getPublicServerClient: jest.fn(() => mockPublic.client),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => mockService.client),
}));

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type TableBehavior = { select?: Outcome; upsert?: Outcome };
type Call = { table: string; method: string; args: unknown[] };

type ClientMock = {
  client: {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
  };
  tables: Map<string, TableBehavior>;
  calls: Call[];
  setAuth: (result: { data: { user: { id: string } | null }; error: unknown }) => void;
};

/**
 * Chainable PostgREST stand-in: every builder method records the call and
 * returns the builder; awaiting resolves the configured outcome. `.upsert()`
 * flips the outcome source so a single table can answer both the
 * existence check (select) and the write (upsert) inside one request.
 */
function makeClient(): ClientMock {
  const tables = new Map<string, TableBehavior>();
  const calls: Call[] = [];
  let authResult: { data: { user: { id: string } | null }; error: unknown } = {
    data: { user: { id: "session-user-9" } },
    error: null,
  };

  function builderFor(table: string) {
    const behavior = tables.get(table) ?? {};
    let mode: "select" | "upsert" = "select";
    const outcome = (): Outcome =>
      mode === "upsert"
        ? behavior.upsert ?? { data: null, error: null }
        : behavior.select ?? { data: null, error: null };

    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === "upsert") mode = "upsert";
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
      "insert",
      "update",
      "upsert",
    ]) {
      builder[method] = jest.fn(chain(method));
    }
    builder.maybeSingle = jest.fn(async () => {
      const o = outcome();
      return { data: o.data ?? null, error: o.error ?? null };
    });
    builder.single = jest.fn(async () => {
      const o = outcome();
      return { data: o.data ?? null, error: o.error ?? null };
    });
    builder.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(outcome()).then(
        onFulfilled as (value: unknown) => unknown,
        onRejected as (reason: unknown) => unknown
      );

    return builder;
  }

  return {
    client: {
      auth: { getUser: jest.fn(async () => authResult) },
      from: jest.fn((table: string) => builderFor(table)),
    },
    tables,
    calls,
    setAuth(result) {
      authResult = result;
    },
  };
}

let mockSession: ClientMock;
let mockPublic: ClientMock;
let mockService: ClientMock;

import { GET as profileGet, PATCH as profilePatch } from "@/app/api/creator/profile/route";
import { GET as dashboardGet } from "@/app/api/creator/dashboard/route";
import { GET as personaGet } from "@/app/api/creators/[username]/route";
import { GET as contentGet } from "@/app/api/creators/[username]/content/route";

const AUTH = { Authorization: "Bearer valid-token" };

function profileRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/creator/profile", {
    method,
    headers: {
      ...AUTH,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authedGet(url: string): Request {
  return new Request(url, { headers: AUTH });
}

function paramsFor(username: string) {
  return { params: Promise.resolve({ username }) };
}

function upsertCalls(client: ClientMock): Call[] {
  return client.calls.filter((call) => call.method === "upsert");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = makeClient();
  mockPublic = makeClient();
  mockService = makeClient();
  // Rate-limit mock is created inside the jest.mock factory; reach it here.
  const rateMock = jest.requireMock("@/lib/rate-limit") as {
    __mockRateAllowed: { value: boolean };
  };
  rateMock.__mockRateAllowed.value = true;
});

describe("GET /api/creator/profile", () => {
  test("401 without a token and no table access", async () => {
    const res = await profileGet(new Request("http://localhost:3000/api/creator/profile"));

    expect(res.status).toBe(401);
    expect(mockSession.client.from).not.toHaveBeenCalled();
  });

  test("returns the caller's own persona scoped by session user_id", async () => {
    mockSession.tables.set("creator_profiles", {
      select: {
        data: {
          id: "prof-1",
          username: "star_artist",
          display_name: "Star Artist",
          can_publish: true,
        },
      },
    });

    const res = await profileGet(
      authedGet("http://localhost:3000/api/creator/profile")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.username).toBe("star_artist");
    expect(mockSession.calls).toContainEqual({
      table: "creator_profiles",
      method: "eq",
      args: ["user_id", "session-user-9"],
    });
  });

  test("honest 503 when creator_profiles does not exist yet", async () => {
    mockSession.tables.set("creator_profiles", {
      select: {
        data: null,
        error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
      },
    });

    const res = await profileGet(
      authedGet("http://localhost:3000/api/creator/profile")
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });
});

describe("PATCH /api/creator/profile", () => {
  beforeEach(() => {
    // Default: no existing persona (create path), service write succeeds.
    mockSession.tables.set("creator_profiles", { select: { data: null, error: null } });
    mockSession.tables.set("profiles", {
      select: { data: { full_name: "Medo Ahmed", avatar_url: "avatars/m.png" } },
    });
    mockService.tables.set("creator_profiles", {
      upsert: {
        data: {
          id: "prof-1",
          username: "star_artist",
          display_name: "Medo Ahmed",
          is_featured: false,
          is_active: true,
          can_publish: true,
        },
        error: null,
      },
    });
  });

  test("401 without a token — before validation, no write", async () => {
    const res = await profilePatch(
      new Request("http://localhost:3000/api/creator/profile", { method: "PATCH" })
    );

    expect(res.status).toBe(401);
    expect(upsertCalls(mockService)).toHaveLength(0);
  });

  test("401 for an invalid/expired token", async () => {
    mockSession.setAuth({ data: { user: null }, error: { message: "jwt expired" } });

    const res = await profilePatch(profileRequest("PATCH", { username: "star_artist" }));

    expect(res.status).toBe(401);
    expect(upsertCalls(mockService)).toHaveLength(0);
  });

  test("429 when the rate limit rejects", async () => {
    const rateMock = jest.requireMock("@/lib/rate-limit") as {
      __mockRateAllowed: { value: boolean };
    };
    rateMock.__mockRateAllowed.value = false;

    const res = await profilePatch(profileRequest("PATCH", { username: "star_artist" }));

    expect(res.status).toBe(429);
    expect(upsertCalls(mockService)).toHaveLength(0);
  });

  test("malformed JSON body -> 400", async () => {
    const res = await profilePatch(
      new Request("http://localhost:3000/api/creator/profile", {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: "{not json",
      })
    );

    expect(res.status).toBe(400);
  });

  test("invalid username on create -> 400 with field errors and no write", async () => {
    const res = await profilePatch(profileRequest("PATCH", { username: "x" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.username).toBeTruthy();
    expect(upsertCalls(mockService)).toHaveLength(0);
  });

  test("identity and flag fields are rejected -> 400 and no write", async () => {
    const res = await profilePatch(
      profileRequest("PATCH", {
        username: "star_artist",
        display_name: "Star Artist",
        user_id: "attacker-controlled",
        is_featured: true,
        can_publish: true,
        is_active: true,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.user_id).toBe("Field is not allowed");
    expect(body.errors.is_featured).toBe("Field is not allowed");
    expect(body.errors.can_publish).toBe("Field is not allowed");
    expect(body.errors.is_active).toBe("Field is not allowed");
    expect(upsertCalls(mockService)).toHaveLength(0);
  });

  test("create derives identity/defaults from the session, never the payload", async () => {
    const res = await profilePatch(profileRequest("PATCH", { username: "star_artist" }));

    expect(res.status).toBe(200);
    const writes = upsertCalls(mockService);
    expect(writes).toHaveLength(1);

    const payload = writes[0].args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe("session-user-9");
    expect(payload.username).toBe("star_artist");
    expect(payload.display_name).toBe("Medo Ahmed");
    expect(payload.avatar_url).toBe("avatars/m.png");
    expect(payload).not.toHaveProperty("is_featured");
    expect(payload).not.toHaveProperty("can_publish");
    expect(payload).not.toHaveProperty("is_active");
    expect(writes[0].args[1]).toEqual({ onConflict: "user_id" });
  });

  test("partial update of an existing persona does not require a username", async () => {
    mockSession.tables.set("creator_profiles", {
      select: { data: { id: "prof-1" }, error: null },
    });

    const res = await profilePatch(profileRequest("PATCH", { bio: "New bio" }));

    expect(res.status).toBe(200);
    const writes = upsertCalls(mockService);
    expect(writes).toHaveLength(1);
    const payload = writes[0].args[0] as Record<string, unknown>;
    expect(payload.bio).toBe("New bio");
    expect(payload.user_id).toBe("session-user-9");
    expect(payload).not.toHaveProperty("display_name");
    // No account fallback lookup happens on updates.
    expect(mockSession.calls.some((call) => call.table === "profiles")).toBe(false);
  });

  test("username conflict -> 409 username_taken", async () => {
    mockService.tables.set("creator_profiles", {
      upsert: {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      },
    });

    const res = await profilePatch(
      profileRequest("PATCH", { username: "star_artist" })
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("username_taken");
  });

  test("missing table on the write path -> 503 MIGRATION_REQUIRED", async () => {
    mockService.tables.set("creator_profiles", {
      upsert: {
        data: null,
        error: { code: "PGRST202", message: "Could not find the table in the schema cache" },
      },
    });

    const res = await profilePatch(
      profileRequest("PATCH", { username: "star_artist" })
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });

  test("missing table on the existence check -> 503 before validation", async () => {
    mockSession.tables.set("creator_profiles", {
      select: {
        data: null,
        error: { code: "42P01", message: 'relation "public.creator_profiles" does not exist' },
      },
    });

    const res = await profilePatch(profileRequest("PATCH", { username: "star_artist" }));

    expect(res.status).toBe(503);
    expect(upsertCalls(mockService)).toHaveLength(0);
  });
});

describe("GET /api/creators/[username] (public persona)", () => {
  test("malformed username -> 404 without a lookup", async () => {
    const res = await personaGet(
      new Request("http://localhost:3000/api/creators/A!%20B"),
      paramsFor("A! B")
    );

    expect(res.status).toBe(404);
    expect(mockPublic.client.from).not.toHaveBeenCalled();
  });

  test("valid username with no persona -> 404", async () => {
    mockPublic.tables.set("creator_profiles", { select: { data: null, error: null } });

    const res = await personaGet(
      new Request("http://localhost:3000/api/creators/nobody_here"),
      paramsFor("nobody_here")
    );

    expect(res.status).toBe(404);
  });

  test("response contains only public persona fields and RLS-shaped counts", async () => {
    mockPublic.tables.set("creator_profiles", {
      select: {
        data: {
          id: "prof-1",
          user_id: "auth-uid-1",
          username: "star_artist",
          display_name: "Star Artist",
          avatar_url: "avatars/star.png",
          bio: "I draw galaxies",
          social_links: { instagram: "https://instagram.com/star" },
          is_featured: true,
          is_active: true,
          can_publish: true,
          created_at: "2026-01-05T00:00:00.000Z",
        },
      },
    });
    mockPublic.tables.set("creator_design_products", {
      select: { data: null, error: null, count: 4 },
    });
    mockPublic.tables.set("creator_gallery_items", {
      select: { data: null, error: null, count: 2 },
    });
    mockPublic.tables.set("user_designs", {
      select: { data: null, error: null, count: 7 },
    });

    const res = await personaGet(
      new Request("http://localhost:3000/api/creators/star_artist"),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.creator).toEqual({
      username: "star_artist",
      display_name: "Star Artist",
      avatar_url: "avatars/star.png",
      bio: "I draw galaxies",
      social_links: { instagram: "https://instagram.com/star" },
      is_featured: true,
      created_at: "2026-01-05T00:00:00.000Z",
    });
    // Private fields never leave this endpoint.
    expect(body.creator).not.toHaveProperty("user_id");
    expect(body.creator).not.toHaveProperty("can_publish");
    expect(body.creator).not.toHaveProperty("is_active");
    expect(body.creator).not.toHaveProperty("id");
    expect(body).toEqual({
      success: true,
      creator: body.creator,
      counts: { products: 4, gallery: 2, designs: 7 },
    });

    // The designs count is constrained to approved + public + not deleted.
    expect(mockPublic.calls).toContainEqual({
      table: "user_designs",
      method: "eq",
      args: ["status", "approved"],
    });
    expect(mockPublic.calls).toContainEqual({
      table: "user_designs",
      method: "eq",
      args: ["is_public", true],
    });
    expect(mockPublic.calls).toContainEqual({
      table: "user_designs",
      method: "is",
      args: ["deleted_at", null],
    });
  });

  test("honest 503 when creator_profiles is missing", async () => {
    mockPublic.tables.set("creator_profiles", {
      select: { data: null, error: { code: "PGRST202", message: "schema cache" } },
    });

    const res = await personaGet(
      new Request("http://localhost:3000/api/creators/star_artist"),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });
});

describe("GET /api/creators/[username]/content", () => {
  beforeEach(() => {
    mockPublic.tables.set("creator_profiles", {
      select: { data: { id: "prof-1" }, error: null },
    });
  });

  test("unknown creator -> 404", async () => {
    mockPublic.tables.set("creator_profiles", { select: { data: null, error: null } });

    const res = await contentGet(
      new Request("http://localhost:3000/api/creators/nobody/content?type=products"),
      paramsFor("nobody")
    );

    expect(res.status).toBe(404);
  });

  test("products: rows without a published product are dropped, totals stay honest", async () => {
    mockPublic.tables.set("creator_design_products", {
      select: {
        data: [
          { id: "cdp-1", product: { id: "prod-1", name: "Galaxy Tee" } },
          { id: "cdp-2", product: null },
        ],
        error: null,
        count: 2,
      },
    });

    const res = await contentGet(
      new Request("http://localhost:3000/api/creators/star_artist/content?type=products"),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("products");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].product.id).toBe("prod-1");
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(12);
    expect(body.total_pages).toBe(1);
    // Only configurations with a product id are even queried.
    expect(mockPublic.calls).toContainEqual({
      table: "creator_design_products",
      method: "not",
      args: ["product_id", "is", null],
    });
  });

  test("gallery: clamps per_page to 24 and pages correctly", async () => {
    mockPublic.tables.set("creator_gallery_items", {
      select: { data: [], error: null, count: 30 },
    });

    const res = await contentGet(
      new Request(
        "http://localhost:3000/api/creators/star_artist/content?type=gallery&page=2&per_page=100"
      ),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("gallery");
    expect(body.page).toBe(2);
    expect(body.per_page).toBe(24);
    expect(body.total).toBe(30);
    expect(body.total_pages).toBe(2);
    expect(mockPublic.calls).toContainEqual({
      table: "creator_gallery_items",
      method: "range",
      args: [24, 47],
    });
    // Gallery rows are constrained server-side too.
    expect(mockPublic.calls).toContainEqual({
      table: "creator_gallery_items",
      method: "eq",
      args: ["status", "approved"],
    });
    expect(mockPublic.calls).toContainEqual({
      table: "creator_gallery_items",
      method: "eq",
      args: ["visibility", "public"],
    });
  });

  test("unknown type falls back to products", async () => {
    mockPublic.tables.set("creator_design_products", {
      select: { data: [], error: null, count: 0 },
    });

    const res = await contentGet(
      new Request("http://localhost:3000/api/creators/star_artist/content?type=banana"),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe("products");
    expect(
      mockPublic.calls.some((call) => call.table === "creator_gallery_items")
    ).toBe(false);
  });

  test("garbage pagination params fall back to page 1 / 12 per page", async () => {
    mockPublic.tables.set("creator_design_products", {
      select: { data: [], error: null, count: 0 },
    });

    const res = await contentGet(
      new Request(
        "http://localhost:3000/api/creators/star_artist/content?page=abc&per_page=xyz"
      ),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(12);
    expect(mockPublic.calls).toContainEqual({
      table: "creator_design_products",
      method: "range",
      args: [0, 11],
    });
  });

  test("honest 503 when the content tables are missing", async () => {
    mockPublic.tables.set("creator_design_products", {
      select: { data: null, error: { code: "PGRST202", message: "schema cache" } },
    });

    const res = await contentGet(
      new Request("http://localhost:3000/api/creators/star_artist/content?type=products"),
      paramsFor("star_artist")
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });
});

describe("GET /api/creator/dashboard", () => {
  test("401 without a token", async () => {
    const res = await dashboardGet(
      new Request("http://localhost:3000/api/creator/dashboard")
    );

    expect(res.status).toBe(401);
    expect(mockSession.client.from).not.toHaveBeenCalled();
  });

  test("no persona yet -> zeroed payload for the onboarding form", async () => {
    mockSession.tables.set("creator_profiles", { select: { data: null, error: null } });

    const res = await dashboardGet(
      authedGet("http://localhost:3000/api/creator/dashboard")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeNull();
    expect(body.stats).toMatchObject({
      designs: 0,
      products: 0,
      gallery: 0,
      published_products: 0,
      pending: 0,
      rejected: 0,
    });
    expect(body.sections.designs.items).toEqual([]);
    expect(body.sections.products.total).toBe(0);
    expect(body.sections.gallery.total).toBe(0);
    // Nothing beyond the persona was queried.
    expect(mockSession.client.from).toHaveBeenCalledTimes(1);
  });

  test("sections and stats come from the caller's own rows", async () => {
    mockSession.tables.set("creator_profiles", {
      select: {
        data: {
          id: "prof-1",
          username: "star_artist",
          display_name: "Star Artist",
          can_publish: true,
        },
      },
    });
    mockSession.tables.set("user_designs", {
      select: {
        data: [
          { id: "d1", title: "Nebula", status: "draft", rejection_reason: null, updated_at: "2026-01-01T00:00:00Z" },
          { id: "d2", title: "Comet", status: "pending_review", rejection_reason: null, updated_at: "2026-01-02T00:00:00Z" },
        ],
        error: null,
        count: 5,
      },
    });
    mockSession.tables.set("creator_design_products", {
      select: {
        data: [
          {
            id: "cdp-1",
            status: "approved",
            product_id: "prod-1",
            rejection_reason: null,
            updated_at: "2026-01-03T00:00:00Z",
            template: { template_key: "tshirt", name: "T-Shirt", name_ar: "تيشيرت", mockup_format: "png" },
            design: { id: "d3", title: "Nebula Tee", status: "approved" },
            product: { id: "prod-1", name: "Nebula Tee", slug: "nebula-tee", status: "published", visibility: "visible" },
          },
        ],
        error: null,
        count: 1,
      },
    });
    mockSession.tables.set("creator_gallery_items", {
      select: {
        data: [
          {
            id: "g1",
            title: "Aurora",
            status: "rejected",
            rejection_reason: "Too low resolution",
            updated_at: "2026-01-04T00:00:00Z",
          },
        ],
        error: null,
        count: 2,
      },
    });

    const res = await dashboardGet(
      authedGet("http://localhost:3000/api/creator/dashboard")
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.profile.username).toBe("star_artist");
    expect(body.stats).toMatchObject({
      designs: 5,
      products: 1,
      gallery: 2,
      published_products: 1,
      pending: 1,
      rejected: 1,
    });
    expect(body.stats.by_status.designs).toMatchObject({ draft: 1, pending_review: 1 });
    expect(body.sections.designs.total).toBe(5);
    expect(body.sections.products.items[0].product.name).toBe("Nebula Tee");
    expect(body.sections.gallery.items[0].rejection_reason).toBe("Too low resolution");

    // Every section query is scoped to the caller.
    expect(mockSession.calls).toContainEqual({
      table: "user_designs",
      method: "eq",
      args: ["owner_id", "session-user-9"],
    });
    expect(mockSession.calls).toContainEqual({
      table: "creator_design_products",
      method: "eq",
      args: ["creator_profile_id", "prof-1"],
    });
    expect(mockSession.calls).toContainEqual({
      table: "creator_gallery_items",
      method: "eq",
      args: ["owner_id", "session-user-9"],
    });
    expect(mockSession.calls).toContainEqual({
      table: "creator_profiles",
      method: "eq",
      args: ["user_id", "session-user-9"],
    });
  });

  test("honest 503 when the dashboard tables are missing", async () => {
    mockSession.tables.set("creator_profiles", {
      select: { data: null, error: { code: "PGRST202", message: "schema cache" } },
    });

    const res = await dashboardGet(
      authedGet("http://localhost:3000/api/creator/dashboard")
    );

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MIGRATION_REQUIRED");
  });
});
