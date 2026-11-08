/**
 * @jest-environment node
 *
 * The Stripe success-page lookup is disabled with card checkout. A replayed
 * session id must never settle a new order.
 */

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from "@/app/api/checkout/verify/route";

describe("checkout verification (disabled)", () => {
  it("returns an explicit 410 without inspecting the session", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body).toMatchObject({ success: false, disabled: true });
    expect(JSON.stringify(body)).not.toMatch(/paid|succeeded/i);
  });
});
