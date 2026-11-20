/**
 * @jest-environment node
 *
 * /auth/callback contracts:
 *   - provider errors are surfaced on /login (never swallowed)
 *   - `next` is restricted to local paths (no open redirects)
 *   - a bad/expired code fails honestly instead of creating a fake session
 */

const mockExchange = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: mockExchange } }),
}));

import { GET } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";

function req(url: string) {
  return new NextRequest(url, { headers: { cookie: "" } });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

describe("GET /auth/callback", () => {
  it("redirects provider errors back to login with the message", async () => {
    const res = await GET(req("http://localhost:3000/auth/callback?error=access_denied&error_description=User+cancelled"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/login?error=");
    expect(location).toContain("User%20cancelled");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("does not follow external `next` URLs (open-redirect guard)", async () => {
    mockExchange.mockResolvedValue({ error: null });
    const res = await GET(req("http://localhost:3000/auth/callback?code=ok&next=https%3A%2F%2Fevil.example"));
    const location = res.headers.get("location") || "";
    expect(location).toBe("http://localhost:3000/");
  });

  it("accepts a safe local `next` path after a successful exchange", async () => {
    mockExchange.mockResolvedValue({ error: null });
    const res = await GET(req("http://localhost:3000/auth/callback?code=ok&next=%2Forders"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/orders");
  });

  it("redirects to login with an error when the code exchange fails", async () => {
    mockExchange.mockResolvedValue({ error: new Error("bad code") });
    const res = await GET(req("http://localhost:3000/auth/callback?code=bad"));
    const location = res.headers.get("location") || "";
    expect(location).toContain("/login?error=");
    expect(location).toContain("Authentication%20failed");
  });

  it("redirects to login when no code is present", async () => {
    const res = await GET(req("http://localhost:3000/auth/callback"));
    expect(res.headers.get("location")).toContain("/login?error=");
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
