/**
 * @jest-environment node
 *
 * Pre-launch regression tests for verified API defects:
 *   - /api/email: an authenticated user must not be able to trigger an email
 *     for somebody else's order (explicit owner/admin check, not just RLS)
 *   - /api/notifications: register_push/unregister_push must not call
 *     request.json() a second time (the body is already consumed)
 *   - /api/admin/custom-print GET must forward the incoming request to
 *     verifyAdmin; it used to build a fresh headerless Request and always 401
 */

const state: {
  user: { id: string } | null;
  isAdmin: boolean;
  order: Record<string, unknown> | null;
  rpcCalls: Array<{ fn: string; args: unknown }>;
} = {
  user: { id: "user-1" },
  isAdmin: false,
  order: {
    id: "order-1",
    user_id: "owner-1",
    status: "paid",
    total: 100,
    shipping_address_snapshot: { full_name: "Test Customer", email: "customer@example.test" },
  },
  rpcCalls: [],
};

const mockSendConfirmation = jest.fn(async (...args: unknown[]) => {
  void args;
  return { id: "email-1" };
});
const mockSendStatus = jest.fn(async (...args: unknown[]) => {
  void args;
  return { id: "email-2" };
});

jest.mock("@/lib/email", () => ({
  sendOrderConfirmation: (...args: unknown[]) => mockSendConfirmation(...args),
  sendOrderStatusUpdate: (...args: unknown[]) => mockSendStatus(...args),
}));

jest.mock("@/lib/api-errors", () => ({
  handleApiError: (_error: unknown, _context: string, fallback: string) =>
    Response.json({ success: false, message: fallback }, { status: 500 }),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: (state as typeof state).user },
        error: null,
      })),
    },
    rpc: jest.fn(async (fn: string, args: unknown) => {
      (state as typeof state).rpcCalls.push({ fn, args });
      return { data: fn === "is_admin" ? (state as typeof state).isAdmin : {}, error: null };
    }),
    from: jest.fn((table: string) => ({
      select: () => ({
        eq: () =>
          table === "orders"
            ? { single: async () => ({ data: (state as typeof state).order, error: null }) }
            : Promise.resolve({ data: [], error: null }),
      }),
    })),
  })),
}));

const mockVerifyAdmin = jest.fn(async (request: Request) => {
  if (!request?.headers?.get?.("authorization")) {
    return { error: "Unauthorized", status: 401 };
  }
  return { user: { id: "admin-1" } };
});
jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: (request: Request) => mockVerifyAdmin(request),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }) }),
    })),
  })),
}));

jest.mock("@/lib/creator/api", () => ({
  isMissingRelation: () => false,
  migrationRequiredResponse: () =>
    Response.json({ success: false, message: "MIGRATION_REQUIRED" }, { status: 503 }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST as emailPost } from "@/app/api/email/route";
import { POST as notificationsPost } from "@/app/api/notifications/route";
import { GET as adminCustomPrintGet } from "@/app/api/admin/custom-print/route";

const AUTH = { Authorization: "Bearer test-token", "Content-Type": "application/json" };

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  state.user = { id: "user-1" };
  state.isAdmin = false;
  state.order = {
    id: "order-1",
    user_id: "owner-1",
    status: "paid",
    total: 100,
    shipping_address_snapshot: { full_name: "Test Customer", email: "customer@example.test" },
  };
  state.rpcCalls = [];
});

describe("POST /api/email — ownership", () => {
  it("refuses to email another customer's order", async () => {
    const res = await emailPost(post("/api/email", { type: "confirmation", order_id: "order-1" }));
    expect(res.status).toBe(403);
    expect(mockSendConfirmation).not.toHaveBeenCalled();
    expect(mockSendStatus).not.toHaveBeenCalled();
  });

  it("allows the owner to resend the confirmation", async () => {
    state.order = { ...state.order!, user_id: "user-1" };
    const res = await emailPost(post("/api/email", { type: "confirmation", order_id: "order-1" }));
    expect(res.status).toBe(200);
    expect(mockSendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("allows an admin to resend for any order", async () => {
    state.isAdmin = true;
    const res = await emailPost(post("/api/email", { type: "status_update", order_id: "order-1" }));
    expect(res.status).toBe(200);
    expect(mockSendStatus).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/notifications — push registration", () => {
  it("registers a device using the single parsed request body", async () => {
    const res = await notificationsPost(
      post("/api/notifications", {
        action: "register_push",
        platform: "web",
        push_token: "token-1",
        device_name: "Chrome",
      })
    );
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual([
      {
        fn: "register_push_device",
        args: { p_platform: "web", p_push_token: "token-1", p_device_name: "Chrome" },
      },
    ]);
  });

  it("unregisters a device using the single parsed request body", async () => {
    const res = await notificationsPost(
      post("/api/notifications", { action: "unregister_push", push_token: "token-1" })
    );
    expect(res.status).toBe(200);
    expect(state.rpcCalls[0]).toEqual({
      fn: "unregister_push_device",
      args: { p_push_token: "token-1" },
    });
  });
});

describe("GET /api/admin/custom-print — authentication forwarding", () => {
  it("passes the caller's Authorization header to verifyAdmin", async () => {
    const res = await adminCustomPrintGet(
      new Request("http://localhost/api/admin/custom-print", { headers: AUTH })
    );
    expect(res.status).toBe(200);
    expect(mockVerifyAdmin).toHaveBeenCalledTimes(1);
    expect(mockVerifyAdmin.mock.calls[0][0].headers.get("authorization")).toBe("Bearer test-token");
  });
});
