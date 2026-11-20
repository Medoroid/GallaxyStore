/**
 * @jest-environment node
 *
 * Phase 8 — creator discovery directory contract:
 *
 * fetchCreatorDirectory (serves the public /creators page)
 *   - persona-only projection with an is_active filter, featured-first
 *     ordering and a hard cap; the creator id never leaves the server
 *   - product counts group the PUBLIC rows of creator_design_products (its
 *     RLS policy only exposes rows whose linked product is already
 *     published + visible — so the grouped number means "live products")
 *   - the gallery list mirrors the public policy (approved + public + not
 *     soft-deleted) with an exact total, per-creator counts derived from
 *     the same rows, and a capped first page
 *   - zero creators skips the count query entirely; every failure —
 *     including pending migrations — rejects so the page renders an honest
 *     error instead of a misleading "no creators yet" state
 */

jest.mock("@/lib/supabase/public-server", () => ({
  getPublicServerClient: () => mockSession.client,
}));

type Outcome = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

type ClientMock = {
  client: { from: jest.Mock };
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

  const client = { from: jest.fn((table: string) => builderFor(table)) };

  return {
    client,
    calls,
    enqueue(table, ...outcomes) {
      const queue = queues.get(table) ?? [];
      queue.push(...outcomes);
      queues.set(table, queue);
    },
  };
}

let mockSession: ClientMock;

import {
  DIRECTORY_CREATORS_LIMIT,
  DIRECTORY_GALLERY_LIMIT,
  MigrationsRequiredError,
  fetchCreatorDirectory,
} from "@/lib/creator/directory";

beforeEach(() => {
  mockSession = makeClient();
});

const callsTo = (table: string) =>
  mockSession.calls.filter((call) => call.table === table);

const CREATOR_ROWS = [
  {
    id: "prof-1",
    username: "alice",
    display_name: "Alice",
    avatar_url: null,
    bio: "Galaxy illustrator",
    is_featured: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "prof-2",
    username: "bob",
    display_name: "Bob",
    avatar_url: "bob.png",
    bio: null,
    is_featured: false,
    created_at: "2026-01-02T00:00:00.000Z",
  },
];

function galleryRow(
  id: string,
  profileId: string | null,
  username: string | null
) {
  return {
    id,
    title: `Design ${id}`,
    description: null,
    preview_path: `mockups/${id}/front.png`,
    tags: ["space"],
    product_id: `prod-${id}`,
    creator_profile_id: profileId,
    published_at: "2026-02-01T00:00:00.000Z",
    creator_profiles: username
      ? { username, display_name: username.toUpperCase() }
      : null,
  };
}

describe("fetchCreatorDirectory", () => {
  test("projects persona only, filters to active creators, orders featured-first, caps the list", async () => {
    mockSession.enqueue("creator_profiles", {
      data: CREATOR_ROWS,
      error: null,
    });
    mockSession.enqueue("creator_design_products", { data: [], error: null });
    mockSession.enqueue("creator_gallery_items", {
      data: [],
      error: null,
      count: 0,
    });

    const result = await fetchCreatorDirectory();

    const profileCalls = callsTo("creator_profiles");
    const select = profileCalls.find((call) => call.method === "select");
    expect(String(select?.args[0])).toBe(
      "id, username, display_name, avatar_url, bio, is_featured, created_at"
    );
    expect(String(select?.args[0])).not.toContain("user_id");
    expect(String(select?.args[0])).not.toContain("can_publish");
    expect(String(select?.args[0])).not.toContain("is_active");

    const eqCalls = profileCalls.filter((call) => call.method === "eq");
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].args).toEqual(["is_active", true]);

    const orderCalls = profileCalls.filter((call) => call.method === "order");
    expect(orderCalls[0].args).toEqual(["is_featured", { ascending: false }]);
    expect(orderCalls[1].args).toEqual([
      "display_name",
      { ascending: true },
    ]);

    const limit = profileCalls.find((call) => call.method === "limit");
    expect(limit?.args).toEqual([DIRECTORY_CREATORS_LIMIT]);
    expect(DIRECTORY_CREATORS_LIMIT).toBe(60);

    // The id is a server-side join key only — never part of the payload.
    expect(result.creators[0]).not.toHaveProperty("id");
    expect(Object.keys(result.creators[0]).sort()).toEqual([
      "avatar_url",
      "bio",
      "created_at",
      "display_name",
      "gallery",
      "is_featured",
      "products",
      "username",
    ]);
  });

  test("groups live-product and gallery counts per creator, ignoring unknown or null owners", async () => {
    mockSession.enqueue("creator_profiles", {
      data: CREATOR_ROWS,
      error: null,
    });
    mockSession.enqueue("creator_design_products", {
      data: [
        { creator_profile_id: "prof-1" },
        { creator_profile_id: "prof-1" },
        { creator_profile_id: "prof-2" },
        { creator_profile_id: "ghost-creator" },
        { creator_profile_id: null },
      ],
      error: null,
    });
    mockSession.enqueue("creator_gallery_items", {
      data: [
        galleryRow("g1", "prof-1", "alice"),
        galleryRow("g2", "prof-1", "alice"),
        galleryRow("g3", null, null),
      ],
      error: null,
      count: 3,
    });

    const result = await fetchCreatorDirectory();

    expect(result.creators[0].products).toBe(2);
    expect(result.creators[1].products).toBe(1);
    expect(result.creators[0].gallery).toBe(2);
    expect(result.creators[1].gallery).toBe(0);

    // Counting groups the public rows; visibility itself is RLS's job —
    // the count query carries no status/visibility filters of its own.
    const countCalls = callsTo("creator_design_products");
    expect(countCalls).toHaveLength(1);
    expect(countCalls[0].method).toBe("select");
    expect(countCalls[0].args[0]).toBe("creator_profile_id");
    expect(countCalls.filter((call) => call.method !== "select")).toHaveLength(
      0
    );
  });

  test("gallery: public-only scoping, exact total, embedded persona, capped first page", async () => {
    const rows = Array.from(
      { length: DIRECTORY_GALLERY_LIMIT + 1 },
      (_, index) =>
        galleryRow(
          `g-${index}`,
          index % 2 === 0 ? "prof-1" : "prof-2",
          index % 2 === 0 ? "alice" : "bob"
        )
    );

    mockSession.enqueue("creator_profiles", {
      data: CREATOR_ROWS,
      error: null,
    });
    mockSession.enqueue("creator_design_products", { data: [], error: null });
    mockSession.enqueue("creator_gallery_items", {
      data: rows,
      error: null,
      count: 99,
    });

    const result = await fetchCreatorDirectory();

    const galleryCalls = callsTo("creator_gallery_items");
    const select = galleryCalls.find((call) => call.method === "select");
    expect(String(select?.args[0])).toContain(
      "creator_profiles(username, display_name)"
    );
    expect(select?.args[1]).toEqual({ count: "exact" });

    const eqCalls = galleryCalls.filter((call) => call.method === "eq");
    expect(eqCalls.map((call) => call.args)).toEqual([
      ["status", "approved"],
      ["visibility", "public"],
    ]);
    const isCall = galleryCalls.find((call) => call.method === "is");
    expect(isCall?.args).toEqual(["deleted_at", null]);
    const orderCall = galleryCalls.find((call) => call.method === "order");
    expect(orderCall?.args).toEqual([
      "published_at",
      { ascending: false },
    ]);

    // Exact total stays honest even though the page itself is capped.
    expect(result.galleryTotal).toBe(99);
    expect(result.gallery).toHaveLength(DIRECTORY_GALLERY_LIMIT);
    expect(result.gallery[0].creator).toEqual({
      username: "alice",
      display_name: "ALICE",
    });
    expect(result.gallery[1].creator).toEqual({
      username: "bob",
      display_name: "BOB",
    });
    expect(result.gallery[1].product_id).toBe("prod-g-1");
  });

  test("zero creators skips the count query entirely and still serves the gallery", async () => {
    mockSession.enqueue("creator_profiles", { data: [], error: null });
    mockSession.enqueue("creator_gallery_items", {
      data: [galleryRow("g1", "prof-1", "alice")],
      error: null,
      count: 1,
    });

    const result = await fetchCreatorDirectory();

    expect(callsTo("creator_design_products")).toHaveLength(0);
    expect(result.creators).toEqual([]);
    expect(result.gallery).toHaveLength(1);
    expect(result.galleryTotal).toBe(1);
  });

  test("a profile read failure rejects before any other query runs", async () => {
    mockSession.enqueue("creator_profiles", {
      data: null,
      error: new Error("profile down"),
    });

    await expect(fetchCreatorDirectory()).rejects.toThrow("profile down");
    expect(callsTo("creator_design_products")).toHaveLength(0);
    expect(callsTo("creator_gallery_items")).toHaveLength(0);
  });

  test("pending migrations reject with an honest message (error page, not an empty state)", async () => {
    mockSession.enqueue("creator_profiles", {
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the table in the schema cache",
      },
    });

    // The dedicated error type lets the /creators page render its honest
    // "not available yet" notice while every other failure still throws.
    const failure = await fetchCreatorDirectory().catch((error) => error);
    expect(failure).toBeInstanceOf(MigrationsRequiredError);
    expect(String(failure)).toMatch(/creator studio migrations must be applied/);
  });

  test("a gallery read failure rejects — never a fake empty discovery feed", async () => {
    mockSession.enqueue("creator_profiles", {
      data: CREATOR_ROWS,
      error: null,
    });
    mockSession.enqueue("creator_design_products", { data: [], error: null });
    mockSession.enqueue("creator_gallery_items", {
      data: null,
      error: new Error("gallery down"),
    });

    await expect(fetchCreatorDirectory()).rejects.toThrow("gallery down");
  });
});
