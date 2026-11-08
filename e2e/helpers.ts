import type { Page } from "@playwright/test";

/** Production Supabase host — reads allowed, writes are guarded below. */
export const PRODUCTION_HOST = "httywgkwfqvrbuwuzutu.supabase.co";

export interface WriteGuardCounters {
  /** Direct browser → PostgREST non-GET requests that were blocked. */
  blockedRestWrites: number;
  /** /api/cart mutations (add/update/remove/apply_coupon/clear) blocked. */
  blockedCartMutations: number;
  /** POST /api/products/[id]/track (INSERT recently_viewed_products) blocked. */
  blockedViewTracking: number;
  /** POST /api/contact (real outbound email via Resend) blocked. */
  blockedContactSubmits: number;
  /** /api/search requests answered from the local fixture (q non-empty). */
  mockedSearches: number;
  /** /api/search requests that reached the server (read-only paths). */
  realSearches: number;
}

/**
 * Installs the production-write guards on a page.
 * MUST be called before page.goto().
 */
export async function installWriteGuards(page: Page): Promise<WriteGuardCounters> {
  const counters: WriteGuardCounters = {
    blockedRestWrites: 0,
    blockedCartMutations: 0,
    blockedViewTracking: 0,
    blockedContactSubmits: 0,
    mockedSearches: 0,
    realSearches: 0,
  };

  // 1) Block any direct browser-side database write (PostgREST non-GET).
  //    GET/HEAD continue: those are the reads this suite is allowed to do.
  await page.route(
    (url) => url.hostname === PRODUCTION_HOST && url.pathname.startsWith("/rest/v1/"),
    async (route) => {
      const method = route.request().method();
      if (method === "GET" || method === "HEAD") return route.continue();
      counters.blockedRestWrites += 1;
      await route.abort("blockedbyclient");
    }
  );

  // 2) Block cart mutations through the Next API (guest flows never need them;
  //    GET without a token is a read-only 401 for guests and is allowed).
  await page.route(
    (url) => url.pathname === "/api/cart",
    async (route) => {
      if (route.request().method() === "GET") return route.continue();
      counters.blockedCartMutations += 1;
      await route.abort("blockedbyclient");
    }
  );

  // 3) Block product view tracking (INSERT into recently_viewed_products).
  await page.route(
    (url) => /^\/api\/products\/[^/]+\/track$/.test(url.pathname),
    async (route) => {
      counters.blockedViewTracking += 1;
      await route.abort("blockedbyclient");
    }
  );

  // 4) Block contact delivery — a valid submission would send a real email.
  await page.route(
    (url) => url.pathname === "/api/contact",
    async (route) => {
      if (route.request().method() === "GET") return route.continue();
      counters.blockedContactSubmits += 1;
      await route.abort("blockedbyclient");
    }
  );

  return counters;
}

/**
 * Fixture answering /api/search for a non-empty q.
 *
 * The real handler fire-and-forgets `log_search` (INSERT into search_logs)
 * whenever q is set, which would be a production write — so those requests are
 * answered here instead. Shape mirrors app/api/search/route.js.
 */
function searchFixtureFor(q: string): Record<string, unknown> {
  return {
    success: true,
    products: [
      {
        id: "00000000-0000-4000-8000-00000000e2e1",
        slug: "e2e-fixture-result",
        name: `Fixture result for “${q}”`,
        short_description:
          "Answered from the local E2E fixture so the run performs no production search-log write.",
        base_price: 450,
        compare_at_price: null,
        currency: "EGP",
        avg_rating: 4.5,
        rating_count: 3,
        is_featured: false,
        in_stock: true,
        categories: null,
        product_images: [],
      },
    ],
    facets: { categories: [], brands: [] },
    total: 1,
    page: 1,
    page_size: 24,
    total_pages: 1,
    query: q,
  };
}

/**
 * Search routing for the products page:
 *   - mode=suggestions|facets|popular → real server (read-only RPCs),
 *   - q empty → real server (search_products is read-only and the handler
 *     skips log_search when q is unset),
 *   - q non-empty → local fixture (the real handler would INSERT search_logs).
 */
export async function installSearchRouting(page: Page, counters: WriteGuardCounters): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/search",
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const mode = requestUrl.searchParams.get("mode");
      const q = (requestUrl.searchParams.get("q") ?? "").trim();

      if (mode && mode !== "search") {
        counters.realSearches += 1;
        return route.continue();
      }
      if (!q) {
        counters.realSearches += 1;
        return route.continue();
      }

      counters.mockedSearches += 1;
      return route.fulfill({ json: searchFixtureFor(q) });
    }
  );
}
