/**
 * @jest-environment node
 *
 * A1 regression suite: proxy (middleware) authorization matrix.
 *
 * Guards against Proxy/middleware bypass regressions after Next.js upgrades
 * and verifies the protection rules themselves:
 *   - guest cannot reach /admin, /vendor, /checkout, /orders, /wishlist,
 *     /profile, /returns
 *   - authenticated customer cannot reach /admin or /vendor
 *   - admin (db role) and vendor (db role / store owner / admin allow-list)
 *     are allowed through
 *   - manipulated request headers cannot influence the decision
 *   - public routes pass through untouched
 *
 * NOTE: the proxy is only one layer. /api/* routes must still enforce auth
 * server-side (covered by the contract/gate tests). Redirect == UI guard,
 * never the sole proof of security.
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// ---------------------------------------------------------------------------
// controllable fake DB (profiles / stores / admin_users lookups)
type Row = Record<string, unknown>;
const tableRows: Record<string, Row | null> = {};
const tableShouldThrow: Record<string, boolean> = {};

function resetTables() {
  for (const key of Object.keys(tableRows)) delete tableRows[key];
  for (const key of Object.keys(tableShouldThrow)) delete tableShouldThrow[key];
}

let currentUser: { id: string; email?: string } | null = null;

const mockCreate = createServerClient as unknown as jest.Mock;

beforeAll(() => {
  mockCreate.mockImplementation(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: currentUser }, error: null })),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (tableShouldThrow[table]) throw new Error(`boom:${table}`);
            return { data: tableRows[table] ?? null, error: null };
          },
        }),
      }),
    }),
  }));
});

beforeEach(() => {
  resetTables();
  currentUser = null;
  process.env.ADMIN_EMAILS = "owner@galaxy.test";
});

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

async function locationOf(path: string, headers?: Record<string, string>) {
  const res = await proxy(req(path, headers));
  return { status: res.status, location: res.headers.get("location") };
}

describe("proxy: guest protection", () => {
  const protectedPaths = [
    "/admin",
    "/admin/orders",
    "/vendor",
    "/vendor/products",
    "/checkout",
    "/orders",
    "/wishlist",
    "/profile",
    "/returns",
  ];

  test.each(protectedPaths)("%s redirects guest to /login", async (path) => {
    const { status, location } = await locationOf(path);
    expect(status).toBe(307);
    expect(location).toContain("/login");
  });

  test("public routes pass through for guests", async () => {
    for (const path of ["/", "/products", "/cart", "/gift-boxes", "/contact"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(200);
    }
  });
});

describe("proxy: customer vs admin/vendor", () => {
  beforeEach(() => {
    currentUser = { id: "user-1", email: "customer@x.test" };
    tableRows["profiles"] = { role: "customer" };
  });

  test("customer cannot reach /admin (redirect to /)", async () => {
    const { status, location } = await locationOf("/admin");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });

  test("customer cannot reach /vendor (redirect to /)", async () => {
    const { status, location } = await locationOf("/vendor/products");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });

  test("customer still reaches their protected pages", async () => {
    for (const path of ["/orders", "/profile", "/wishlist", "/returns"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(200);
    }
  });

  test("customer with store ownership counts as vendor", async () => {
    tableRows["stores"] = { id: "store-1" };
    tableRows["profiles"] = { role: "customer" };
    const res = await proxy(req("/vendor"));
    expect(res.status).toBe(200);
  });
});

describe("proxy: admin access", () => {
  test("db admin passes /admin", async () => {
    currentUser = { id: "admin-1", email: "dbadmin@x.test" };
    tableRows["profiles"] = { role: "admin" };
    const res = await proxy(req("/admin/settings"));
    expect(res.status).toBe(200);
  });

  test("email allow-list admin passes /admin even without db row", async () => {
    currentUser = { id: "admin-2", email: "owner@galaxy.test" };
    tableRows["profiles"] = null;
    tableRows["admin_users"] = null;
    const res = await proxy(req("/admin"));
    expect(res.status).toBe(200);
  });

  test("non-admin email allow-list does not match", async () => {
    currentUser = { id: "user-9", email: "someone@x.test" };
    tableRows["profiles"] = { role: "customer" };
    const { status, location } = await locationOf("/admin");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });
});

describe("proxy: vendor access", () => {
  test("vendor role passes /vendor", async () => {
    currentUser = { id: "vendor-1", email: "v@x.test" };
    tableRows["profiles"] = { role: "vendor" };
    const res = await proxy(req("/vendor/earnings"));
    expect(res.status).toBe(200);
  });

  test("vendor role still blocked from /admin", async () => {
    currentUser = { id: "vendor-1", email: "v@x.test" };
    tableRows["profiles"] = { role: "vendor" };
    const { status, location } = await locationOf("/admin");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });

  test("vendor lookup failure does not crash (fail closed for role, open for store)", async () => {
    currentUser = { id: "vendor-2", email: "v2@x.test" };
    tableShouldThrow["profiles"] = true;
    tableRows["stores"] = null;
    // profile lookup threw, store absent, email not allow-listed -> deny
    const { status, location } = await locationOf("/vendor");
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });

  test("admin allow-list may open the vendor panel", async () => {
    currentUser = { id: "admin-3", email: "owner@galaxy.test" };
    tableRows["profiles"] = null;
    tableRows["stores"] = null;
    const res = await proxy(req("/vendor"));
    expect(res.status).toBe(200);
  });
});

describe("proxy: header manipulation", () => {
  test("spoofed identity/role headers are ignored", async () => {
    currentUser = null; // guest session
    const { status, location } = await locationOf("/admin", {
      "x-user-id": "admin-1",
      "x-role": "admin",
      "x-forwarded-role": "superadmin",
      authorization: "Bearer forged",
    });
    expect(status).toBe(307);
    expect(location).toContain("/login");
  });

  test("customer with spoofed role header still denied /admin", async () => {
    currentUser = { id: "user-2", email: "c@x.test" };
    tableRows["profiles"] = { role: "customer" };
    const { status, location } = await locationOf("/admin", { "x-role": "admin" });
    expect(status).toBe(307);
    expect(location).toBe("http://localhost:3000/");
  });
});

describe("proxy: matcher coverage (bypass regression)", () => {
  test("config.matcher includes every protected surface", async () => {
    const { config } = await import("@/proxy");
    const matcher: string[] = config.matcher;
    for (const required of [
      "/admin/:path*",
      "/vendor/:path*",
      "/checkout/:path*",
      "/orders/:path*",
      "/wishlist/:path*",
      "/profile/:path*",
      "/returns",
    ]) {
      expect(matcher).toContain(required);
    }
  });
});
