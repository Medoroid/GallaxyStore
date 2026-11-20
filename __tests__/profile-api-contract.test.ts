/**
 * @jest-environment node
 *
 * Contract tests for POST /api/profile:
 * auth is required, the identity comes from the verified token (never from the
 * body), input is validated on the server, and a failed profile write is never
 * reported as success.
 */
const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
  })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({ upsert: mockUpsert })),
  })),
}));

jest.mock("@/lib/api-errors", () => ({
  handleApiError: (error: Error | null | undefined, _context: string, fallback: string) =>
    Response.json(
      { success: false, message: error?.message || fallback },
      { status: 500 }
    ),
}));

import { POST } from "@/app/api/profile/route";

function request(body: unknown, withAuth = true) {
  return new Request("http://localhost/api/profile", {
    method: "POST",
    headers: {
      ...(withAuth ? { Authorization: "Bearer test-token", "Content-Type": "application/json" } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockUpsert.mockResolvedValue({ error: null });
});

describe("POST /api/profile", () => {
  it("requires authentication", async () => {
    const res = await POST(request({ full_name: "Test" }, false));
    expect(res.status).toBe(401);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("bad token") });
    const res = await POST(request({ full_name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("validates the display name on the server", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ full_name: "a".repeat(101) }))).status).toBe(400);
    expect((await POST(request({ full_name: "bad\u0000name" }))).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("uses the verified user id and ignores client-supplied ids", async () => {
    const res = await POST(request({ full_name: "  New Name  ", user_id: "attacker" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, full_name: "New Name" });
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { full_name: "New Name" } });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "verified-user", full_name: "New Name" }),
      expect.objectContaining({ onConflict: "id" })
    );
  });

  it("does not claim success when the profile write fails", async () => {
    mockUpsert.mockResolvedValue({ error: new Error("db down") });
    const res = await POST(request({ full_name: "Name" }));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});
