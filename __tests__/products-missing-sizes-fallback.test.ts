/**
 * @jest-environment node
 *
 * Read-side fallback for migration 20261115120000 (`products.available_sizes`):
 *
 *   - every read tries the FULL select first, so sizes appear the moment the
 *     migration lands
 *   - only the known missing-column error (42703 from Postgres / PGRST204 from
 *     the PostgREST schema cache, naming `available_sizes`) triggers exactly
 *     one retry with the reduced select
 *   - every other failure is surfaced untouched — a permission error or a
 *     missing column of some OTHER name must never be swallowed by the retry
 *
 * Regression context: commit 5e6cbad added `available_sizes` to the storefront
 * select before its SQL was applied to the live database, which made every
 * products read answer HTTP 400 (`column products.available_sizes does not
 * exist`) and emptied the homepage.
 *
 * Covers all four storefront readers (fetchProducts / fetchFeaturedProducts /
 * fetchProductById / fetchRelatedProducts), the `selectProductsWithFallback`
 * helper used by the store detail page, and the shared predicate that both
 * the admin and vendor product APIs rely on.
 */

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: jest.fn((table: string) => mockSession.client.from(table)),
  },
}));

type Outcome = { data?: unknown; error?: unknown };
type Call = { table: string; method: string; args: unknown[] };

type ClientMock = {
  client: { from: jest.Mock };
  calls: Call[];
  enqueue: (table: string, ...outcomes: Outcome[]) => void;
};

function makeCli(): ClientMock {
  const queues = new Map<string, Outcome[]>();
  const calls: Call[] = [];

  const shift = (table: string): Outcome => {
    const queue = queues.get(table);
    if (queue && queue.length > 0) return queue.shift() as Outcome;
    return { data: [], error: null };
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
  fetchProductById,
  fetchProducts,
  fetchRelatedProducts,
  productSelect,
  productSelectWithoutSizes,
  selectProductsWithFallback,
  type SupabaseProduct,
} from "@/lib/products";
import { isMissingSizesColumn } from "@/lib/product-admin";

const MISSING_SIZES_42703 = {
  code: "42703",
  message: "column products.available_sizes does not exist",
};
const MISSING_SIZES_PGRST204 = {
  code: "PGRST204",
  message:
    "Could not find the 'available_sizes' column of 'products' in the schema cache",
};

const PRODUCT_ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Galaxy Tee",
  base_price: 150,
};

beforeEach(() => {
  mockSession = makeCli();
});

const productCalls = (method: string) =>
  mockSession.calls.filter(
    (call) => call.table === "products" && call.method === method
  );

const selectColumns = () =>
  productCalls("select").map((call) => String(call.args[0] ?? ""));

describe("productSelectWithoutSizes", () => {
  it("keeps the full select intact for the normal (post-migration) path", () => {
    expect(productSelect).toContain("available_sizes");
  });

  it("drops only the available_sizes column", () => {
    expect(productSelectWithoutSizes).not.toContain("available_sizes");
    for (const fragment of [
      "id,",
      "available_colors,",
      "base_price,",
      "categories(id, name, slug)",
      "product_images(id, storage_path",
      "stores(id, name)",
    ]) {
      expect(productSelectWithoutSizes).toContain(fragment);
    }
  });
});

describe("isMissingSizesColumn (shared read + write predicate)", () => {
  it("matches the read error Postgres answers before the migration (42703)", () => {
    expect(isMissingSizesColumn(MISSING_SIZES_42703)).toBe(true);
  });

  it("matches the schema-cache error PostgREST answers on writes (PGRST204)", () => {
    expect(isMissingSizesColumn(MISSING_SIZES_PGRST204)).toBe(true);
  });

  it("rejects 42703 for some OTHER column — real schema bugs must surface", () => {
    expect(
      isMissingSizesColumn({
        code: "42703",
        message: "column products.view_count does not exist",
      })
    ).toBe(false);
  });

  it("rejects unrelated codes and empty input", () => {
    expect(
      isMissingSizesColumn({ code: "42501", message: "permission denied" })
    ).toBe(false);
    expect(isMissingSizesColumn(null)).toBe(false);
    expect(isMissingSizesColumn(undefined)).toBe(false);
  });
});

describe("selectProductsWithFallback", () => {
  it("returns a successful first attempt without ever building a second query", async () => {
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const seen: string[] = [];
    const result = await selectProductsWithFallback((select) => {
      seen.push(select);
      return { query: mockSession.client.from("products").select(select) };
    });

    expect(seen).toEqual([productSelect]);
    expect(result.data).toEqual([PRODUCT_ROW]);
    expect(result.error).toBeNull();
    expect(productCalls("select")).toHaveLength(1);
  });

  it("retries exactly once with the reduced select on 42703 and resolves", async () => {
    mockSession.enqueue("products", { data: null, error: MISSING_SIZES_42703 });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const seen: string[] = [];
    const result = await selectProductsWithFallback((select) => {
      seen.push(select);
      return { query: mockSession.client.from("products").select(select) };
    });

    expect(seen).toEqual([productSelect, productSelectWithoutSizes]);
    expect(result.data).toEqual([PRODUCT_ROW]);
    expect(result.error).toBeNull();
  });

  it("retries on the PGRST204 schema-cache variant too", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: MISSING_SIZES_PGRST204,
    });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const seen: string[] = [];
    const result = await selectProductsWithFallback((select) => {
      seen.push(select);
      return { query: mockSession.client.from("products").select(select) };
    });

    expect(seen).toEqual([productSelect, productSelectWithoutSizes]);
    expect(result.data).toEqual([PRODUCT_ROW]);
  });

  it("never retries an unrelated failure — it is returned untouched", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: { code: "42501", message: "permission denied for table products" },
    });

    const seen: string[] = [];
    const result = await selectProductsWithFallback((select) => {
      seen.push(select);
      return { query: mockSession.client.from("products").select(select) };
    });

    expect(seen).toHaveLength(1);
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: "42501" });
  });

  it("never retries 42703 naming a DIFFERENT column", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: { code: "42703", message: "column products.view_count does not exist" },
    });

    const seen: string[] = [];
    const result = await selectProductsWithFallback((select) => {
      seen.push(select);
      return { query: mockSession.client.from("products").select(select) };
    });

    expect(seen).toHaveLength(1);
    expect(result.error).toMatchObject({ code: "42703" });
  });

  it("invokes the caller's cleanup exactly once per attempt", async () => {
    mockSession.enqueue("products", { data: null, error: MISSING_SIZES_42703 });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const done = jest.fn();
    await selectProductsWithFallback((select) => ({
      query: mockSession.client.from("products").select(select),
      done,
    }));

    expect(done).toHaveBeenCalledTimes(2);
  });

  it("invokes cleanup even when the attempt fails with an unrelated error", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const done = jest.fn();
    const result = await selectProductsWithFallback((select) => ({
      query: mockSession.client.from("products").select(select),
      done,
    }));

    expect(result.error).toMatchObject({ code: "42501" });
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("storefront readers", () => {
  it("fetchProducts falls back once and resolves rows", async () => {
    mockSession.enqueue("products", { data: null, error: MISSING_SIZES_42703 });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const rows = await fetchProducts();

    expect(rows).toEqual([PRODUCT_ROW]);
    const cols = selectColumns();
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain("available_sizes");
    expect(cols[1]).not.toContain("available_sizes");
    expect(productCalls("abortSignal")).toHaveLength(2);
  });

  it("fetchFeaturedProducts falls back once and resolves rows", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: MISSING_SIZES_PGRST204,
    });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const rows = await fetchFeaturedProducts(8);

    expect(rows).toEqual([PRODUCT_ROW]);
    const cols = selectColumns();
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain("available_sizes");
    expect(cols[1]).not.toContain("available_sizes");
  });

  it("fetchProductById falls back with a second single-row read", async () => {
    mockSession.enqueue("products", { data: null, error: MISSING_SIZES_42703 });
    mockSession.enqueue("products", { data: PRODUCT_ROW, error: null });

    const product = await fetchProductById(PRODUCT_ROW.id);

    expect(product).toEqual(PRODUCT_ROW);
    expect(productCalls("single")).toHaveLength(2);
    const cols = selectColumns();
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain("available_sizes");
    expect(cols[1]).not.toContain("available_sizes");
  });

  it("fetchRelatedProducts falls back once and resolves rows", async () => {
    mockSession.enqueue("products", { data: null, error: MISSING_SIZES_42703 });
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const rows = await fetchRelatedProducts(
      { id: "other-product", category_id: null } as unknown as SupabaseProduct,
      4
    );

    expect(rows).toEqual([PRODUCT_ROW]);
    const cols = selectColumns();
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain("available_sizes");
    expect(cols[1]).not.toContain("available_sizes");
  });

  it("still rejects when the failure is unrelated — one attempt, no retry", async () => {
    mockSession.enqueue("products", {
      data: null,
      error: { code: "42501", message: "permission denied for table products" },
    });

    await expect(fetchProducts()).rejects.toMatchObject({ code: "42501" });
    expect(productCalls("select")).toHaveLength(1);
  });

  it("a successful read performs exactly one attempt (no needless reprocessing)", async () => {
    mockSession.enqueue("products", { data: [PRODUCT_ROW], error: null });

    const rows = await fetchFeaturedProducts(4);

    expect(rows).toEqual([PRODUCT_ROW]);
    expect(productCalls("select")).toHaveLength(1);
    expect(productCalls("abortSignal")).toHaveLength(1);
  });
});
