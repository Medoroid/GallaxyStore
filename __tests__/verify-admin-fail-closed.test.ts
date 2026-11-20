/**
 * @jest-environment node
 *
 * Security regression tests for verifyAdmin:
 * a database error must NEVER downgrade to a weaker authorisation path, and
 * the ADMIN_EMAILS bootstrap list must not override a working RBAC "no".
 */

const state: {
  user: { id: string; email: string } | null;
  rpc: { data?: unknown; error?: { code?: string; message?: string } } | "throw";
  table: { data?: unknown; error?: { code?: string; message?: string } } | "throw";
} = {
  user: { id: "u-1", email: "plain@example.test" },
  rpc: { data: false, error: undefined },
  table: { data: null, error: undefined },
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: (state as typeof state).user },
        error: (state as typeof state).user ? null : new Error("no session"),
      })),
    },
    rpc: jest.fn(async () => {
      const r = (state as typeof state).rpc;
      if (r === "throw") throw new Error("connection reset");
      return r;
    }),
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const t = (state as typeof state).table;
            if (t === "throw") throw new Error("connection reset");
            return t;
          },
        }),
      }),
    })),
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type VerifyAdmin = (request: Request) => Promise<{ user?: unknown; error?: string; status?: number }>;
let verifyAdmin: VerifyAdmin;

beforeAll(async () => {
  process.env.ADMIN_EMAILS = "boss@example.test";
  ({ verifyAdmin } = await import("@/app/api/admin/_lib/verifyAdmin"));
});

function request(email = "plain@example.test") {
  state.user = { id: "u-1", email };
  return new Request("http://localhost/api/admin/products", {
    headers: { Authorization: "Bearer test-token" },
  });
}

beforeEach(() => {
  state.user = { id: "u-1", email: "plain@example.test" };
  state.rpc = { data: false, error: undefined };
  state.table = { data: null, error: undefined };
});

describe("verifyAdmin — fail closed", () => {
  it("accepts a database-confirmed admin", async () => {
    state.rpc = { data: true };
    const res = await verifyAdmin(request());
    expect(res.error).toBeUndefined();
    expect(res.user).toBeTruthy();
  });

  it("rejects a non-admin even when their email is in ADMIN_EMAILS (RBAC is healthy)", async () => {
    state.rpc = { data: false };
    state.table = { data: null };
    const res = await verifyAdmin(request("boss@example.test"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when is_admin() fails with a non-missing-schema error", async () => {
    state.rpc = { error: { code: "XX000", message: "database down" } };
    const res = await verifyAdmin(request("boss@example.test"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when is_admin() throws unexpectedly", async () => {
    state.rpc = "throw";
    const res = await verifyAdmin(request("boss@example.test"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when admin_users fails with a non-missing-schema error", async () => {
    state.rpc = { error: { code: "PGRST202" } };
    state.table = { error: { code: "XX000", message: "permission denied" } };
    const res = await verifyAdmin(request("boss@example.test"));
    expect(res.status).toBe(403);
  });

  it("allows the documented bootstrap fallback only when BOTH checks are absent", async () => {
    state.rpc = { error: { code: "PGRST202" } };
    state.table = { error: { code: "42P01" } };
    const ok = await verifyAdmin(request("boss@example.test"));
    expect(ok.error).toBeUndefined();
    const denied = await verifyAdmin(request("plain@example.test"));
    expect(denied.status).toBe(403);
  });
});
