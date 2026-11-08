/**
 * @jest-environment node
 *
 * Receipt upload contract:
 *   - authenticated owner only
 *   - owner-scoped private object path
 *   - real image signature validation (not the browser MIME type)
 *   - no paid settlement on upload
 *   - legacy Vodafone endpoint remains wired to its original RPC
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockDownload = jest.fn();
const mockRemove = jest.fn();
const mockStorageFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    storage: { from: mockStorageFrom },
    rpc: mockRpc,
  })),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST as externalWalletPost } from "@/app/api/payments/external-wallet/route";
import { POST as vodafonePost } from "@/app/api/payments/vodafone-cash/route";

const USER_ID = "user-1";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_PATH = `${USER_ID}/${ORDER_ID}/receipt.png`;

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

function fakeFile(bytes: Uint8Array, size = bytes.length) {
  return {
    size,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function request(overrides: Record<string, unknown> = {}, authorized = true) {
  return new Request("http://localhost/api/payments/external-wallet", {
    method: "POST",
    headers: {
      ...(authorized ? { authorization: "Bearer user-token" } : {}),
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({
      order_id: ORDER_ID,
      payer_phone: "01012345678",
      transfer_reference: "TRX-998877",
      receipt_path: RECEIPT_PATH,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockStorageFrom.mockReturnValue({ download: mockDownload, remove: mockRemove });
  mockDownload.mockResolvedValue({ data: fakeFile(PNG_BYTES), error: null });
  mockRemove.mockResolvedValue({ data: [], error: null });
  mockRpc.mockResolvedValue({
    data: { id: "receipt-1", status: "pending", transfer_reference: "TRX-998877" },
    error: null,
  });
});

describe("external wallet receipt submission", () => {
  test("requires authentication", async () => {
    const res = await externalWalletPost(request({}, false));
    expect(res.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  test("rejects a receipt path outside the caller's order folder", async () => {
    const res = await externalWalletPost(
      request({ receipt_path: `user-2/${ORDER_ID}/receipt.png` })
    );
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("returns 400 when the private object is missing", async () => {
    mockDownload.mockResolvedValue({ data: null, error: new Error("not found") });
    const res = await externalWalletPost(request());
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects a file whose real content is not an image and removes it", async () => {
    mockDownload.mockResolvedValue({ data: fakeFile(SVG_BYTES), error: null });

    const res = await externalWalletPost(request());
    const body = await res.json();

    expect(res.status).toBe(415);
    expect(body.message).toMatch(/not a supported receipt image/i);
    expect(mockRemove).toHaveBeenCalledWith([RECEIPT_PATH]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("rejects an oversized object before reading it", async () => {
    mockDownload.mockResolvedValue({
      data: fakeFile(PNG_BYTES, 5 * 1024 * 1024 + 1),
      error: null,
    });

    const res = await externalWalletPost(request());
    expect(res.status).toBe(413);
    expect(mockRemove).toHaveBeenCalledWith([RECEIPT_PATH]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("creates a pending receipt and never claims the order is paid", async () => {
    const res = await externalWalletPost(request());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.receipt).toMatchObject({ status: "pending" });
    expect(JSON.stringify(body)).not.toMatch(/succeeded|"paid"/i);
    expect(mockRpc).toHaveBeenCalledWith("submit_external_wallet_receipt", {
      p_order_id: ORDER_ID,
      p_payer_phone: "01012345678",
      p_transfer_reference: "TRX-998877",
      p_receipt_path: RECEIPT_PATH,
    });
  });

  test("maps a duplicate transfer reference to a safe 409", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("That transfer reference is already used by another order"),
    });

    const res = await externalWalletPost(request());
    expect(res.status).toBe(409);
  });

  test("maps a foreign order to a safe 403", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("Order not found or access denied"),
    });

    const res = await externalWalletPost(request());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.message).toBe("Order not found or access denied.");
  });

  test("keeps the legacy Vodafone RPC for historical orders", async () => {
    const res = await vodafonePost(request());
    expect(res.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("submit_vodafone_cash_receipt", {
      p_order_id: ORDER_ID,
      p_payer_phone: "01012345678",
      p_transfer_reference: "TRX-998877",
      p_receipt_path: RECEIPT_PATH,
    });
  });

  test("maps a legacy cross-method rejection to a safe 409", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("This order is not using Vodafone Cash"),
    });

    const res = await vodafonePost(request());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.message).toBe("This order is not using Vodafone Cash");
  });
});
