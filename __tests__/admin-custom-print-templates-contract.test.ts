/**
 * @jest-environment node
 *
 * Admin mockup template CRUD contracts:
 *   - auth FIRST on every verb
 *   - validation/sanitisation before any DB write
 *   - template_key frozen (it namespaces saved mockup paths)
 *   - delete is a soft delete (orders keep their artwork reference)
 *   - preview renders unsaved edits without persisting anything
 *   - asset uploads reject unsupported files
 */

const mockVerifyAdmin = jest.fn();
const mockDbFrom = jest.fn();

jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: (...args: unknown[]) => mockVerifyAdmin(...args),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({
    from: mockDbFrom,
    storage: { from: () => ({ upload: mockUpload }) },
  }),
}));

const mockUpload = jest.fn(async () => ({ error: null }));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 20, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/custom-print/templates/route";
import { POST as PREVIEW } from "@/app/api/admin/custom-print/templates/preview/route";
import { POST as ASSETS } from "@/app/api/admin/custom-print/assets/route";

type Op = { table: string; method: string; args: unknown[] };
type Outcome = { data?: unknown; error?: unknown };

const ADMIN = { user: { id: "admin-1", email: "admin@galaxy.test" } };
const UUID = "33333333-3333-4333-8333-333333333333";

const VALID = {
  template_key: "custom_tee",
  name: "Custom Tee",
  category: "apparel",
  dimensionsMm: { w: 560, h: 700 },
  colors: [{ key: "black", name: "Black", hex: "#1f1f26", shadeHex: "#000000" }],
  sizes: [{ key: "m", name: "Medium", label: "M" }],
  views: [{
    key: "front",
    label: "Front",
    canvas: { w: 1000, h: 1000 },
    printArea: { x: 350, y: 290, w: 300, h: 400 },
    maskPath: "M 350 290 H 650 V 690 H 350 Z",
  }],
  bodySvg: '<path d="M0 0H100V100Z" fill="{{hex}}"/>',
  provenance: { source: "original-vector", author: "Galaxy Store", license: "CC0-1.0" },
  is_active: true,
};

let ops: Op[];
let outcomes: Map<string, Outcome[]>;

function take(table: string): Outcome {
  const queue = outcomes.get(table);
  return queue && queue.length ? queue.shift()! : { data: [], error: null };
}

function makeDb() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = (method: string) => (...args: unknown[]) => {
        ops.push({ table, method, args });
        return builder;
      };
      for (const method of [
        "select", "insert", "update", "delete", "eq", "is", "order", "range", "in",
      ]) {
        builder[method] = jest.fn(chain(method));
      }
      const resolve = () => take(table);
      builder.maybeSingle = jest.fn(async () => resolve());
      builder.single = jest.fn(async () => resolve());
      builder.then = (onFulfilled: unknown, onRejected: unknown) =>
        Promise.resolve(resolve()).then(
          onFulfilled as (value: unknown) => unknown,
          onRejected as (reason: unknown) => unknown
        );
      return builder;
    },
  };
}

function request(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  ops = [];
  outcomes = new Map();
  mockVerifyAdmin.mockReset();
  mockVerifyAdmin.mockImplementation(async () => ADMIN);
  mockDbFrom.mockReset();
  mockDbFrom.mockImplementation(makeDb().from);
  mockUpload.mockClear();
});

describe("auth-first", () => {
  it("GET rejects an unauthenticated caller before touching the DB", async () => {
    mockVerifyAdmin.mockResolvedValue({ error: "Unauthorized", status: 401 });
    const res = await GET(request("http://localhost/api/admin/custom-print/templates"));
    expect(res.status).toBe(401);
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it("POST rejects a non-admin before validating the body", async () => {
    mockVerifyAdmin.mockResolvedValue({ error: "Forbidden", status: 403 });
    const res = await POST(request("http://localhost/api/admin/custom-print/templates", VALID));
    expect(res.status).toBe(403);
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it("preview and asset upload are admin-only", async () => {
    mockVerifyAdmin.mockResolvedValue({ error: "Unauthorized", status: 401 });
    expect((await PREVIEW(request("http://localhost/api/admin/custom-print/templates/preview", VALID))).status).toBe(401);
    expect((await ASSETS(request("http://localhost/api/admin/custom-print/assets", VALID))).status).toBe(401);
  });
});

describe("template CRUD", () => {
  it("GET lists templates with their geometry", async () => {
    outcomes.set("mockup_templates", [{ data: [VALID], error: null }]);
    const res = await GET(request("http://localhost/api/admin/custom-print/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates[0].template_key).toBe("custom_tee");
  });

  it("POST rejects an invalid payload without inserting a row", async () => {
    const res = await POST(request("http://localhost/api/admin/custom-print/templates", {
      ...VALID, template_key: "BAD KEY",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("template_key");
    expect(ops.filter((op) => op.method === "insert" && op.table === "mockup_templates")).toHaveLength(0);
  });

  it("POST creates a sanitised template and writes an audit row", async () => {
    outcomes.set("mockup_templates", [{ data: { id: UUID, ...VALID }, error: null }]);
    const res = await POST(request("http://localhost/api/admin/custom-print/templates", VALID));
    expect(res.status).toBe(201);
    const insert = ops.find((op) => op.method === "insert" && op.table === "mockup_templates");
    expect(insert).toBeDefined();
    expect(ops.some((op) => op.method === "insert" && op.table === "admin_audit_log")).toBe(true);
  });

  it("PATCH refuses to change template_key (it namespaces saved mockups)", async () => {
    outcomes.set("mockup_templates", [
      { data: { template_key: "custom_tee" }, error: null },
    ]);
    const res = await PATCH(request("http://localhost/api/admin/custom-print/templates", {
      id: UUID, template: { ...VALID, template_key: "renamed" },
    }));
    expect(res.status).toBe(409);
    expect(ops.some((op) => op.method === "update" && op.table === "mockup_templates")).toBe(false);
  });

  it("PATCH updates geometry and audits the change", async () => {
    outcomes.set("mockup_templates", [
      { data: { template_key: "custom_tee" }, error: null },
      { data: { id: UUID, ...VALID }, error: null },
    ]);
    const res = await PATCH(request("http://localhost/api/admin/custom-print/templates", {
      id: UUID, template: VALID,
    }));
    expect(res.status).toBe(200);
    expect(ops.some((op) => op.method === "update" && op.table === "mockup_templates")).toBe(true);
    expect(ops.some((op) => op.method === "insert" && op.table === "admin_audit_log")).toBe(true);
  });

  it("DELETE soft-deletes and disables without removing rows", async () => {
    outcomes.set("mockup_templates", [{ data: { id: UUID, template_key: "custom_tee" }, error: null }]);
    const res = await DELETE(new Request(
      `http://localhost/api/admin/custom-print/templates?id=${UUID}`,
      { method: "DELETE" }
    ));
    expect(res.status).toBe(200);
    const update = ops.find((op) => op.method === "update" && op.table === "mockup_templates");
    expect(update).toBeDefined();
    const payload = update!.args[0] as Record<string, unknown>;
    expect(payload.deleted_at).toBeDefined();
    expect(payload.is_active).toBe(false);
    expect(ops.some((op) => op.method === "delete")).toBe(false);
  });
});

describe("preview before publish", () => {
  it("renders an SVG from unsaved edits without any DB write", async () => {
    const res = await PREVIEW(request("http://localhost/api/admin/custom-print/templates/preview", {
      template: VALID,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.svg).toContain("<svg");
    expect(body.svg).not.toContain("{{hex}}");
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it("refuses to render unsafe perspective in a draft template", async () => {
    const res = await PREVIEW(request("http://localhost/api/admin/custom-print/templates/preview", {
      template: {
        ...VALID,
        views: [{ ...VALID.views[0], perspective: "matrix(1 0 0 1 0 0) onload=x" }],
      },
    }));
    expect(res.status).toBe(400);
  });

  it("never renders script markup from a draft SVG layer", async () => {
    const res = await PREVIEW(request("http://localhost/api/admin/custom-print/templates/preview", {
      template: { ...VALID, bodySvg: '<script>alert(1)</script><path d="M0 0H10"/>' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.svg).not.toContain("script");
  });
});

describe("asset upload", () => {
  it("rejects an unsupported file before touching storage", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "bad.exe", { type: "application/octet-stream" });
    const form = new FormData();
    form.append("file", file);
    const routeReq = new Request("http://localhost/api/admin/custom-print/assets", {
      method: "POST", body: form,
    });
    const routeRes = await ASSETS(routeReq);
    expect(routeRes.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("stores a valid PNG in the private bucket and returns an inline data URL", async () => {
    const png = new Uint8Array(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64"
    ));
    const form = new FormData();
    form.append("file", new File([png], "mockup.png", { type: "image/png" }));
    const res = await ASSETS(new Request("http://localhost/api/admin/custom-print/assets", {
      method: "POST", body: form,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data_url).toMatch(/^data:image\/png;base64,/);
    expect(mockUpload).toHaveBeenCalled();
  });
});
