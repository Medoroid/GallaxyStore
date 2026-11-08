import {
  aggregateOrderStatus,
  allowedShipmentTransitions,
  canTransitionShipment,
  estimateDeliveryDates,
  orderItemStatusForShipment,
  parseCarrier,
  parseShipmentNote,
  parseTrackingNumber,
  parseTrackingUrl,
  shipmentTimestamps,
} from "@/lib/shipments";

describe("shipment state machine", () => {
  test("allows only the live trigger's forward transitions", () => {
    expect(canTransitionShipment("pending", "label_created")).toBe(true);
    expect(canTransitionShipment("label_created", "picked_up")).toBe(true);
    expect(canTransitionShipment("in_transit", "out_for_delivery")).toBe(true);
    expect(canTransitionShipment("failed_delivery", "returned")).toBe(true);

    expect(canTransitionShipment("pending", "delivered")).toBe(false);
    expect(canTransitionShipment("delivered", "in_transit")).toBe(false);
    expect(canTransitionShipment("cancelled", "pending")).toBe(false);
  });

  test("re-sending the current status is allowed for tracking updates", () => {
    expect(canTransitionShipment("in_transit", "in_transit")).toBe(true);
  });

  test("allowed transitions include the current status first", () => {
    expect(allowedShipmentTransitions("out_for_delivery")).toEqual([
      "out_for_delivery",
      "delivered",
      "failed_delivery",
    ]);
  });
});

describe("shipment input parsing", () => {
  test("accepts http(s) tracking URLs only", () => {
    expect(parseTrackingUrl("https://track.example.com/abc")).toBe(
      "https://track.example.com/abc"
    );
    expect(parseTrackingUrl("http://track.example.com/abc")).toBe(
      "http://track.example.com/abc"
    );
    expect(() => parseTrackingUrl("javascript:alert(1)")).toThrow(/http/i);
    expect(() => parseTrackingUrl("not a url")).toThrow(/valid/i);
  });

  test("rejects control characters and overlong values", () => {
    expect(() => parseTrackingNumber("ABC\u0000DEF")).toThrow(/invalid characters/i);
    expect(() => parseCarrier("x".repeat(81))).toThrow(/too long/i);
    expect(() => parseShipmentNote("x".repeat(501))).toThrow(/too long/i);
    expect(parseTrackingNumber("  ")).toBeNull();
  });
});

describe("shipment dates and item status", () => {
  const now = new Date("2026-10-24T12:34:56.000Z");

  test("estimates delivery dates from the shipping method window", () => {
    expect(estimateDeliveryDates(2, 5, now)).toEqual({
      min: "2026-10-26",
      max: "2026-10-29",
    });
    expect(estimateDeliveryDates(null, undefined, now)).toEqual({
      min: null,
      max: null,
    });
  });

  test("sets shipped/delivered timestamps once", () => {
    expect(shipmentTimestamps("in_transit", {}, now)).toEqual({
      shipped_at: "2026-10-24T12:34:56.000Z",
    });
    expect(
      shipmentTimestamps(
        "delivered",
        { shipped_at: "2026-10-20T00:00:00.000Z", delivered_at: null },
        now
      )
    ).toEqual({
      delivered_at: "2026-10-24T12:34:56.000Z",
      actual_delivery_date: "2026-10-24",
    });

    // Re-sending "delivered" must not move the recorded delivery date.
    expect(
      shipmentTimestamps(
        "delivered",
        {
          shipped_at: "2026-10-20T00:00:00.000Z",
          delivered_at: "2026-10-21T08:00:00.000Z",
        },
        now
      )
    ).toEqual({
      delivered_at: "2026-10-21T08:00:00.000Z",
      actual_delivery_date: "2026-10-21",
    });
  });

  test("maps shipment status to order item status", () => {
    expect(orderItemStatusForShipment("picked_up")).toBe("shipped");
    expect(orderItemStatusForShipment("delivered")).toBe("delivered");
    expect(orderItemStatusForShipment("returned")).toBe("returned");
    expect(orderItemStatusForShipment("pending")).toBeNull();
  });

  test("aggregates order status only when every item reached the stage", () => {
    expect(aggregateOrderStatus(["shipped", "delivered"])).toBe("shipped");
    expect(aggregateOrderStatus(["delivered", "delivered"])).toBe("delivered");
    expect(aggregateOrderStatus(["shipped", "processing"])).toBeNull();
    expect(aggregateOrderStatus([])).toBeNull();
  });
});
