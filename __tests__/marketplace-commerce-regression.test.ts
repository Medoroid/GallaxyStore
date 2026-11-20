/**
 * @jest-environment node
 *
 * Phase 8 — marketplace integration regression:
 *
 * Creator products must behave exactly like ordinary products: the same
 * detail/list/related queries, the same card mapping, and an attribution
 * read that can never touch or break the commerce path.
 *
 *   - fetchProductById: id-scoped, soft-delete-aware single read (visibility
 *     itself comes from the public products RLS policy — drafts never
 *     resolve for the browser client)
 *   - fetchRelatedProducts / fetchFeaturedProducts: published + visible +
 *     not-deleted scoping unchanged
 *   - fetchProducts: soft-delete scoping unchanged (RLS owns visibility)
 *   - fetchProductAttribution: reads ONLY creator_design_products — zero
 *     product-table calls; a failure rejects independently while the detail
 *     read still resolves, and an ordinary product maps to null
 *   - toProductCardProduct: creator-shaped and vendor-shaped inputs produce
 *     the identical card contract — no creator-specific branching
 *
 * Cart/checkout/order ownership stays covered by the existing suites
 * (cartStore, cart-totals, checkout-*, orders-*, receipt, webhook) — the
 * full-suite run is the regression proof for those flows.
 */

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: jest.fn((table: string) => mockSession.client.from(table)),
  },
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
      "abortSignal",
    ]) {
      builder[method] = jest.fn(chain(method));
    }

    const awaitOutcome = () => shift(table);
    builder.maybeSingle = jest.fn(async () => {
      calls.push({ table, method: "maybeSingle", args: [] });
      return awaitOutcome();
    });
    builder.single = jest.fn(async () => {
      calls.push({ table, method: "single", args: [] });
      return awaitOutcome();
    });
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
  fetchFeaturedProducts,
  fetchProductAttribution,
  fetchProductById,
  fetchProducts,
  fetchRelatedProducts,
  toProductCardProduct,
  type SupabaseProduct,
} from "@/lib/products";

beforeEach(() => {
  mockSession = makeClient();
});

const callsTo = (table: string) =>
  mockSession.calls.filter((call) => call.table === table);
const chainFor = (table: string) =>
  callsTo(table).map((call) => [call.method, call.args] as const);

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  name: "Galaxy Tee",
  slug: "galaxy-tee",
  base_price: 150,
  compare_at_price: null,
  currency: "EGP",
  avg_rating: 4.5,
  rating_count: 10,
  is_featured: false,
  category_id: null,
  categories: { id: "cat-1", name: "Apparel", slug: "apparel" },
  brands: null,
  stores: null,
  product_images: [],
};

describe("product detail / listing scoping (creator products included)", () => {
  test("the detail read is id-scoped, soft-delete aware and single-row", async () => {
    mockSession.enqueue("products", { data: PRODUCT_ROW, error: null });

    const product = await fetchProductById(PRODUCT_ID);
    expect(product.name).toBe("Galaxy Tee");

    expect(chainFor("products")).toEqual([
      ["select", [expect.stringContaining("product_images")]],
      ["eq", ["id", PRODUCT_ID]],
      ["is", ["deleted_at", null]],
      ["abortSignal", [expect.any(AbortSignal)]],
      ["single", []],
    ]);
  });

  test("related products stay published + visible + not-deleted and never self", async () => {
    mockSession.enqueue("products", { data: [], error: null });

    await fetchRelatedProducts(PRODUCT_ROW as unknown as SupabaseProduct, 4);

    expect(chainFor("products")).toEqual([
      ["select", [expect.stringContaining("product_images")]],
      ["neq", ["id", PRODUCT_ID]],
      ["eq", ["status", "published"]],
      ["eq", ["visibility", "visible"]],
      ["is", ["deleted_at", null]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [4]],
      ["abortSignal", [expect.any(AbortSignal)]],
    ]);
  });

  test("related products keep the category preference when the source has one", async () => {
    mockSession.enqueue("products", { data: [], error: null });

    await fetchRelatedProducts({
      ...(PRODUCT_ROW as unknown as SupabaseProduct),
      category_id: "cat-1",
    });

    const chain = chainFor("products");
    const categoryFilter = chain.find(
      ([method, args]) =>
        method === "eq" && (args as unknown[])[0] === "category_id"
    );
    expect(categoryFilter?.[1]).toEqual(["category_id", "cat-1"]);
    // appended after the base scoping, before the timeout wrapper
    expect(chain[chain.length - 2][0]).toBe("eq");
    expect(chain[chain.length - 1][0]).toBe("abortSignal");
  });

  test("featured products stay published + visible + not-deleted", async () => {
    mockSession.enqueue("products", { data: [], error: null });

    await fetchFeaturedProducts(8);

    expect(chainFor("products")).toEqual([
      ["select", [expect.stringContaining("product_images")]],
      ["eq", ["status", "published"]],
      ["eq", ["visibility", "visible"]],
      ["is", ["deleted_at", null]],
      ["order", ["is_featured", { ascending: false }]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [8]],
      ["abortSignal", [expect.any(AbortSignal)]],
    ]);
  });

  test("the store listing only excludes soft-deleted rows — visibility stays behind public RLS", async () => {
    mockSession.enqueue("products", { data: [], error: null });

    await fetchProducts();

    const methods = chainFor("products").map(([method]) => method);
    expect(methods).toEqual(["select", "is", "order", "abortSignal"]);
    const deletedFilter = chainFor("products").find(
      ([method]) => method === "is"
    );
    expect(deletedFilter?.[1]).toEqual(["deleted_at", null]);
  });
});

describe("fetchProductAttribution isolation", () => {
  test("reads only creator_design_products — zero product-table calls", async () => {
    mockSession.enqueue("creator_design_products", {
      data: {
        creator_profiles: {
          username: "alice",
          display_name: "Alice",
          avatar_url: null,
        },
      },
      error: null,
    });

    const attribution = await fetchProductAttribution(PRODUCT_ID);

    expect(attribution).toEqual({
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
    });
    expect(callsTo("products")).toHaveLength(0);

    expect(chainFor("creator_design_products")).toEqual([
      [
        "select",
        ["creator_profiles(username, display_name, avatar_url)"],
      ],
      ["eq", ["product_id", PRODUCT_ID]],
      ["is", ["deleted_at", null]],
      ["limit", [1]],
      ["maybeSingle", []],
    ]);
  });

  test("an attribution failure rejects independently — the detail read still resolves", async () => {
    mockSession.enqueue("creator_design_products", {
      data: null,
      error: new Error("attribution down"),
    });
    await expect(fetchProductAttribution(PRODUCT_ID)).rejects.toThrow(
      "attribution down"
    );

    mockSession.enqueue("products", { data: PRODUCT_ROW, error: null });
    const product = await fetchProductById(PRODUCT_ID);
    expect(product.name).toBe("Galaxy Tee");
  });

  test("an ordinary product resolves to null attribution — the detail page renders unchanged", async () => {
    mockSession.enqueue("creator_design_products", {
      data: { creator_profiles: null },
      error: null,
    });

    expect(await fetchProductAttribution(PRODUCT_ID)).toBeNull();
  });

  test("attribution falls back to the username when the display name is missing", async () => {
    mockSession.enqueue("creator_design_products", {
      data: {
        creator_profiles: {
          username: "alice",
          display_name: null,
          avatar_url: null,
        },
      },
      error: null,
    });

    const attribution = await fetchProductAttribution(PRODUCT_ID);
    expect(attribution).toEqual({
      username: "alice",
      display_name: "alice",
      avatar_url: null,
    });
  });
});

describe("toProductCardProduct (shared commerce card)", () => {
  test("creator-shaped and vendor-shaped inputs produce the identical card contract", () => {
    const vendorCard = toProductCardProduct(
      PRODUCT_ROW as unknown as SupabaseProduct
    );

    // Content-API embed shape: no categories/brands/stores/is_featured.
    const creatorCard = toProductCardProduct({
      id: "prod-2",
      name: "Nebula Mug",
      slug: "nebula-mug",
      base_price: 90,
      compare_at_price: null,
      currency: "EGP",
      avg_rating: 0,
      rating_count: 0,
      product_images: [],
    } as unknown as SupabaseProduct);

    expect(Object.keys(creatorCard).sort()).toEqual(
      Object.keys(vendorCard).sort()
    );
    expect(creatorCard.title).toBe("Nebula Mug");
    expect(creatorCard.price).toBe(90);
    expect(creatorCard.discountPercentage).toBe(0);
    expect(creatorCard.originalPrice).toBeNull();
    expect(creatorCard.currency).toBe("EGP");
    expect(creatorCard.rating).toBe(0);
  });

  test("a real discount is computed the same way for every product", () => {
    const card = toProductCardProduct({
      ...(PRODUCT_ROW as unknown as SupabaseProduct),
      compare_at_price: 200,
    });

    expect(card.originalPrice).toBe(200);
    expect(card.discountPercentage).toBe(25);
  });
});
