/**
 * Shipment lifecycle helpers shared by the vendor shipment API and its UI.
 *
 * The database enum is authoritative; these helpers only encode the transitions
 * the storefront is allowed to perform. Admin-only SQL RPCs still exist, but a
 * vendor must never be able to move a shipment backwards or to an unknown
 * status.
 */

export const SHIPMENT_STATUSES = [
  "pending",
  "label_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed_delivery",
  "returned",
  "cancelled",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  label_created: "Label created",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed_delivery: "Failed delivery",
  returned: "Returned",
  cancelled: "Cancelled",
};

/**
 * This map is copied from the live `validate_shipment_status_transition`
 * trigger. Keeping it identical means the API can return a useful 409 before
 * the database raises a raw trigger error.
 */
const TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending: ["label_created", "cancelled"],
  label_created: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "cancelled"],
  in_transit: ["out_for_delivery", "failed_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed_delivery"],
  failed_delivery: ["in_transit", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === "string" && (SHIPMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionShipment(
  from: ShipmentStatus,
  to: ShipmentStatus
): boolean {
  // Re-sending the same status is allowed so a vendor can attach a tracking
  // number after the status was already set.
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedShipmentTransitions(status: ShipmentStatus): ShipmentStatus[] {
  return [status, ...(TRANSITIONS[status] ?? [])];
}

const MAX_CARRIER = 80;
const MAX_TRACKING_NUMBER = 120;
const MAX_TRACKING_URL = 500;
const MAX_NOTE = 500;

export function parseCarrier(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const carrier = String(value).trim();
  if (!carrier) return null;
  if (carrier.length > MAX_CARRIER) throw new Error("Carrier name is too long");
  return carrier;
}

export function parseTrackingNumber(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const tracking = String(value).trim();
  if (!tracking) return null;
  if (tracking.length > MAX_TRACKING_NUMBER) throw new Error("Tracking number is too long");
  if (/[\u0000-\u001f\u007f]/.test(tracking)) {
    throw new Error("Tracking number contains invalid characters");
  }
  return tracking;
}

export function parseTrackingUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.length > MAX_TRACKING_URL) throw new Error("Tracking URL is too long");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Tracking URL must be a valid http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Tracking URL must use http or https");
  }
  return parsed.toString();
}

export function parseShipmentNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > MAX_NOTE) throw new Error("Shipment note is too long");
  return note;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Estimated dates are derived from the selected shipping method, never from
 * the browser. Returns null when the method has no delivery window.
 */
export function estimateDeliveryDates(
  minDays: unknown,
  maxDays: unknown,
  now: Date = new Date()
): { min: string | null; max: string | null } {
  // Number(null) is 0, which would turn "no delivery window" into "today".
  const hasMin =
    minDays !== null && minDays !== undefined && String(minDays).trim() !== "";
  const hasMax =
    maxDays !== null && maxDays !== undefined && String(maxDays).trim() !== "";
  const min = hasMin ? Number(minDays) : Number.NaN;
  const max = hasMax ? Number(maxDays) : Number.NaN;
  const base = new Date(now.getTime());
  base.setUTCHours(0, 0, 0, 0);

  const addDays = (days: number) => {
    const copy = new Date(base.getTime());
    copy.setUTCDate(copy.getUTCDate() + Math.max(0, Math.trunc(days)));
    return isoDate(copy);
  };

  return {
    min: Number.isFinite(min) ? addDays(min) : null,
    max: Number.isFinite(max) ? addDays(max) : null,
  };
}

export function shipmentTimestamps(
  status: ShipmentStatus,
  current: { shipped_at?: string | null; delivered_at?: string | null },
  now: Date = new Date()
): {
  shipped_at?: string;
  delivered_at?: string;
  actual_delivery_date?: string;
} {
  const timestamp = now.toISOString();
  const updates: {
    shipped_at?: string;
    delivered_at?: string;
    actual_delivery_date?: string;
  } = {};

  if (
    !current.shipped_at &&
    ["picked_up", "in_transit", "out_for_delivery", "delivered"].includes(status)
  ) {
    updates.shipped_at = timestamp;
  }

  if (status === "delivered") {
    const deliveredAt = current.delivered_at || timestamp;
    updates.delivered_at = deliveredAt;
    // Keep the delivery date stable when the same status is re-sent later.
    updates.actual_delivery_date = deliveredAt.slice(0, 10);
  }

  return updates;
}

export function orderItemStatusForShipment(status: ShipmentStatus): string | null {
  if (["picked_up", "in_transit", "out_for_delivery"].includes(status)) return "shipped";
  if (status === "delivered") return "delivered";
  if (status === "returned") return "returned";
  if (status === "cancelled") return "cancelled";
  return null;
}

/**
 * Advance an order only when every item has reached the matching stage. A
 * multi-vendor order therefore stays `processing` until the last vendor ships.
 */
export function aggregateOrderStatus(
  itemStatuses: Array<string | null | undefined>
): "shipped" | "delivered" | null {
  const statuses = itemStatuses.filter(Boolean) as string[];
  if (statuses.length === 0) return null;
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.every((status) => status === "shipped" || status === "delivered")) {
    return "shipped";
  }
  return null;
}
