/**
 * @jest-environment node
 *
 * Custom-print cart contracts — proves the artwork/print configuration is
 * attached through the EXISTING cart RPC and that privacy is opt-in only.
 */

const mockRequireUser = jest.fn();
const mockDbFrom = jest.fn();
const mockUserFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/creator/api", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
  isMissingRelation: (error: unknown) => {
    const e = error as { code?: string; message?: string } | null;
    return Boolean(e && (e.code === "42P01" || e.code === "PGRST205" ||
      String(e.message ?? "").includes("schema cache")));
  },
  migrationRequiredResponse: (context: string) =>
    Response.json({ success: false, code: "MIGRATION_REQUIRED", context }, { status: 503 }),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockDbFrom }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 29 }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/api-errors", () => ({
  handleApiError: () => Response.json({ success: false, message: "failed" }, { status: 500 }),
}));

import { POST } from "@/app/api/custom-print/cart/route";

const USER = {
  ok: true,
  user: { id: "user-1", email: "buyer@galaxy.test" },
  client: { from: (...args: unknown[]) => mockUserFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args) },
};
const DESIGN_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

const BODY = {
  design_id: DESIGN_ID,
  template_key: "tshirt",
  view_key: "front",
  color_key: "black",
  size_key: "m",
  quantity: 1,
  transform: { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 },
  share_opt_in: false,
};

type Op = { table: string; method: string; args: unknown[] };
let ops: Op[];
let queue: Map<string, Array<{ data?: unknown; error?: unknown }>>;

function take(table: string) {
  const q = queue.get(table);
  return q && q.length ? q.shift()! : { data: null, error: null };
}

beforeEach(() => {
  ops = [];
  queue = new Map();
  mockRequireUser.mockReset();
  mockRequireUser.mockImplementation(async () => USER);
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      ops.push({ table, method, args });
      return builder;
    };
    for (const method of ["select", "insert", "update", "eq", "is"]) {
      builder[method] = jest.fn(chain(method));
    }
    const result = () => take(table);
    builder.maybeSingle = jest.fn(async () => result());
    builder.single = jest.fn(async () => result());
    builder.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve(result()).then(
        resolve as (value: unknown) => unknown,
        reject as (reason: unknown) => unknown
      );
    return builder;
  };
  mockDbFrom.mockReset();
  mockDbFrom.mockImplementation(makeBuilder);
  mockUserFrom.mockReset();
  mockUserFrom.mockImplementation(makeBuilder);
  queue.set("user_designs", [{ data: { id: DESIGN_ID, owner_id: "user-1", title: "My art" }, error: null }]);
  queue.set("mockup_templates", [{
    data: { id: "template-1", template_key: "tshirt", store_product_id: PRODUCT_ID, store_variant_id: VARIANT_ID, is_active: true },
    error: null,
  }]);
  queue.set("product_customizations", [{ data: { id: "customization-1" }, error: null }]);
  queue.set("shared_designs", [{ data: { id: "shared-1", status: "pending_review" }, error: null }]);
});

function req(body: unknown = BODY) {
  return new Request("http://localhost/api/custom-print/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth and input validation", () => {
  it("authenticates before any database work", async () => {
    mockRequireUser.mockResolvedValue({ ok: false, response: new Response("no", { status: 401 }) });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it("rejects invalid quantity and transform before any write", async () => {
    expect((await POST(req({ ...BODY, quantity: 500 }))).status).toBe(400);
    expect((await POST(req({ ...BODY, transform: { cx: 0 } }))).status).toBe(400);
    expect(ops.filter((op) => op.method === "insert")).toHaveLength(0);
  });

  it("does not trust a client-supplied owner: another user's design is 404", async () => {
    queue.set("user_designs", [{ data: { id: DESIGN_ID, owner_id: "someone-else", title: "X" }, error: null }]);
    const res = await POST(req({ ...BODY, owner_id: "admin" }));
    expect(res.status).toBe(404);
    expect(ops.filter((op) => op.method === "insert")).toHaveLength(0);
  });
});

describe("cart handoff (existing checkout)", () => {
  it("creates a customisation with the full print config and uses add_to_cart", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);

    const insert = ops.find((op) => op.method === "insert" && op.table === "product_customizations");
    expect(insert).toBeDefined();
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload.owner_id).toBe("user-1");
    const settings = payload.preview_settings as Record<string, unknown>;
    expect(settings.source).toBe("custom_print");
    expect(settings.design_id).toBe(DESIGN_ID);
    expect(settings.transform).toEqual(BODY.transform);
    expect(settings.view).toBe("front");
    expect(settings.share_opt_in).toBe(false);

    expect(mockRpc).toHaveBeenCalledWith("add_to_cart", expect.objectContaining({
      p_variant_id: VARIANT_ID,
      p_quantity: 1,
      p_customization_id: "customization-1",
    }));
    expect(ops.some((op) => op.table === "shared_designs" && op.method === "insert")).toBe(false);
  });

  it("creates a public submission ONLY when sharing is opted in", async () => {
    const res = await POST(req({ ...BODY, share_opt_in: true }));
    expect(res.status).toBe(200);
    const share = ops.find((op) => op.method === "insert" && op.table === "shared_designs");
    expect(share).toBeDefined();
    const payload = share!.args[0] as Record<string, unknown>;
    expect(payload.owner_id).toBe("user-1");
    expect(payload.status).toBe("pending_review");
  });

  it("fails honestly when the template has no linked sellable variant", async () => {
    queue.set("mockup_templates", [{ data: { id: "template-1", is_active: true, store_variant_id: null }, error: null }]);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("reports a missing migration rather than simulating success", async () => {
    queue.set("mockup_templates", [{ data: null, error: { code: "42P01", message: "relation does not exist" } }]);
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("MIGRATION_REQUIRED");
  });
});
