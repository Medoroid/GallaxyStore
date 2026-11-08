/**
 * @jest-environment node
 *
 * Contract tests for the disabled Stripe webhook. The endpoint must acknowledge
 * legacy events (so Stripe stops retrying) without ever settling an order.
 */

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET, POST } from "@/app/api/stripe/webhook/route";

describe("Stripe webhook (disabled)", () => {
  it("acknowledges a legacy event without settling anything", async () => {
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ received: true, ignored: true, settled: false });
    expect(JSON.stringify(body)).not.toMatch(/succeeded|paid/i);
  });

  it("does not expose an enabled webhook", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.enabled).toBe(false);
  });
});
