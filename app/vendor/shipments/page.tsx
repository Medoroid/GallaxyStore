"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/lib/auth-context";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import {
  allowedShipmentTransitions,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@/lib/shipments";

type ShipmentItem = {
  order_item_id: string;
  product_name: string | null;
  quantity: number;
  status?: string | null;
};

type Shipment = {
  id: string;
  order_id: string;
  shipping_method_id: string;
  status: ShipmentStatus;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_delivery_date_min: string | null;
  estimated_delivery_date_max: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  item_count: number;
  shipping_method: { id: string; name: string; carrier: string | null } | null;
  items: ShipmentItem[];
};

type EligibleOrder = {
  order_id: string;
  order_number: string | null;
  order_status: string;
  placed_at: string;
  shipping_method: { id: string; name: string; carrier: string | null } | null;
  suggested_carrier: string | null;
  items: ShipmentItem[];
};

type ShippingMethod = {
  id: string;
  name: string;
  carrier: string | null;
  min_delivery_days: number;
  max_delivery_days: number;
  type: string;
};

type Payload = {
  success: boolean;
  message?: string;
  shipments: Shipment[];
  eligible_orders: EligibleOrder[];
  shipping_methods: ShippingMethod[];
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20",
  label_created: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  picked_up: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  in_transit: "bg-violet-400/10 text-violet-300 border-violet-400/20",
  out_for_delivery: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  delivered: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  failed_delivery: "bg-red-400/10 text-red-300 border-red-400/20",
  returned: "bg-orange-400/10 text-orange-300 border-orange-400/20",
  cancelled: "bg-white/5 text-white/50 border-white/10",
};

function statusLabel(status: string) {
  return SHIPMENT_STATUS_LABELS[status as ShipmentStatus] ?? status;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function VendorShipmentsPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    order_item_ids: [] as string[],
    shipping_method_id: "",
    carrier: "",
    tracking_number: "",
    tracking_url: "",
    note: "",
  });

  const [statusForms, setStatusForms] = useState<
    Record<
      string,
      { status: string; tracking_number: string; tracking_url: string; carrier: string; note: string }
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/vendor/shipments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload?.success) {
        setError(payload?.message || "Could not load shipments. Please try again.");
        return;
      }
      setData(payload);
    } catch {
      setError("Could not load shipments. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const eligibleOrders = data?.eligible_orders ?? [];
  const shipments = data?.shipments ?? [];
  const shippingMethods = data?.shipping_methods ?? [];

  const selectedOrder =
    eligibleOrders.find((order) => order.order_id === expandedOrder) ?? null;

  function openOrder(order: EligibleOrder) {
    setExpandedOrder(order.order_id);
    setExpandedShipment(null);
    setMessage(null);
    setCreateForm({
      order_item_ids: order.items.map((item) => item.order_item_id),
      shipping_method_id: order.shipping_method?.id ?? "",
      carrier: order.suggested_carrier ?? order.shipping_method?.carrier ?? "",
      tracking_number: "",
      tracking_url: "",
      note: "",
    });
  }

  function openShipment(shipment: Shipment) {
    setExpandedShipment(shipment.id);
    setExpandedOrder(null);
    setMessage(null);
    const current = statusForms[shipment.id];
    if (!current) {
      setStatusForms((previous) => ({
        ...previous,
        [shipment.id]: {
          status: shipment.status,
          tracking_number: shipment.tracking_number ?? "",
          tracking_url: shipment.tracking_url ?? "",
          carrier: shipment.carrier ?? "",
          note: "",
        },
      }));
    }
  }

  function toggleCreateItem(orderItemId: string) {
    setCreateForm((previous) => ({
      ...previous,
      order_item_ids: previous.order_item_ids.includes(orderItemId)
        ? previous.order_item_ids.filter((id) => id !== orderItemId)
        : [...previous.order_item_ids, orderItemId],
    }));
  }

  async function createShipment() {
    if (!selectedOrder) return;
    if (createForm.order_item_ids.length === 0) {
      setMessage({ type: "error", text: "Select at least one item to ship." });
      return;
    }
    if (!createForm.shipping_method_id) {
      setMessage({ type: "error", text: "Select a shipping method." });
      return;
    }

    setBusy("create");
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Your session expired. Please sign in again." });
        return;
      }
      const response = await fetch("/api/vendor/shipments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create",
          order_id: selectedOrder.order_id,
          order_item_ids: createForm.order_item_ids,
          shipping_method_id: createForm.shipping_method_id,
          carrier: createForm.carrier,
          tracking_number: createForm.tracking_number,
          tracking_url: createForm.tracking_url,
          note: createForm.note,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setMessage({ type: "error", text: payload?.message || "Could not create the shipment." });
        return;
      }
      setMessage({ type: "success", text: "Shipment created. You can now add tracking updates." });
      setExpandedOrder(null);
      await load();
    } catch {
      setMessage({ type: "error", text: "Could not create the shipment. Please retry." });
    } finally {
      setBusy(null);
    }
  }

  async function updateStatus(shipment: Shipment) {
    const form = statusForms[shipment.id];
    if (!form) return;
    setBusy(shipment.id);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Your session expired. Please sign in again." });
        return;
      }
      const response = await fetch("/api/vendor/shipments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_status",
          shipment_id: shipment.id,
          status: form.status,
          tracking_number: form.tracking_number,
          tracking_url: form.tracking_url,
          carrier: form.carrier,
          note: form.note,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setMessage({ type: "error", text: payload?.message || "Could not update the shipment." });
        return;
      }
      setMessage({ type: "success", text: "Shipment updated." });
      setStatusForms((previous) => {
        const next = { ...previous };
        delete next[shipment.id];
        return next;
      });
      await load();
    } catch {
      setMessage({ type: "error", text: "Could not update the shipment. Please retry." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Shipments</h1>
          <p className="mt-1 text-sm text-white/50">
            Create shipments for your own order items and keep tracking status up to date.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/20 bg-red-400/10 text-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-16 text-white/60">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading shipments…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm hover:bg-red-300/10"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-300" />
              <h2 className="text-lg font-medium text-white">Ready to ship</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                {eligibleOrders.length}
              </span>
            </div>

            {eligibleOrders.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
                No unshipped items. New paid or COD orders will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {eligibleOrders.map((order) => {
                  const isOpen = expandedOrder === order.order_id;
                  return (
                    <div
                      key={order.order_id}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                    >
                      <button
                        type="button"
                        onClick={() => (isOpen ? setExpandedOrder(null) : openOrder(order))}
                        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.04]"
                      >
                        <div>
                          <p className="font-medium text-white">
                            {order.order_number ? `Order ${order.order_number}` : order.order_id}
                          </p>
                          <p className="mt-1 text-xs text-white/50">
                            {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                            {formatDate(order.placed_at)} · {order.shipping_method?.name || "No method recorded"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                            {order.order_status}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4 text-white/50" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-white/50" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="space-y-4 border-t border-white/10 p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-white/80">Items in this shipment</p>
                            {order.items.map((item) => (
                              <label
                                key={item.order_item_id}
                                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-white/80"
                              >
                                <input
                                  type="checkbox"
                                  checked={createForm.order_item_ids.includes(item.order_item_id)}
                                  onChange={() => toggleCreateItem(item.order_item_id)}
                                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                                />
                                <span className="flex-1">{item.product_name || "Item"}</span>
                                <span className="text-white/50">×{item.quantity}</span>
                              </label>
                            ))}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="text-sm text-white/70">
                              Shipping method
                              <select
                                value={createForm.shipping_method_id}
                                onChange={(event) =>
                                  setCreateForm((previous) => ({
                                    ...previous,
                                    shipping_method_id: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-emerald-400/50"
                              >
                                <option value="">Select a method</option>
                                {shippingMethods.map((method) => (
                                  <option key={method.id} value={method.id}>
                                    {method.name}
                                    {method.carrier ? ` · ${method.carrier}` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm text-white/70">
                              Carrier
                              <input
                                value={createForm.carrier}
                                onChange={(event) =>
                                  setCreateForm((previous) => ({
                                    ...previous,
                                    carrier: event.target.value,
                                  }))
                                }
                                placeholder="Carrier name"
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                              />
                            </label>
                            <label className="text-sm text-white/70">
                              Tracking number
                              <input
                                value={createForm.tracking_number}
                                onChange={(event) =>
                                  setCreateForm((previous) => ({
                                    ...previous,
                                    tracking_number: event.target.value,
                                  }))
                                }
                                placeholder="Optional"
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                              />
                            </label>
                            <label className="text-sm text-white/70">
                              Tracking URL
                              <input
                                value={createForm.tracking_url}
                                onChange={(event) =>
                                  setCreateForm((previous) => ({
                                    ...previous,
                                    tracking_url: event.target.value,
                                  }))
                                }
                                placeholder="https://…"
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                              />
                            </label>
                          </div>

                          <label className="block text-sm text-white/70">
                            Internal note
                            <textarea
                              value={createForm.note}
                              onChange={(event) =>
                                setCreateForm((previous) => ({ ...previous, note: event.target.value }))
                              }
                              rows={2}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                              placeholder="Optional note for your team"
                            />
                          </label>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => void createShipment()}
                              disabled={busy === "create"}
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-50"
                            >
                              {busy === "create" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Truck className="h-4 w-4" />
                              )}
                              Create shipment
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-sky-300" />
              <h2 className="text-lg font-medium text-white">Shipments</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                {shipments.length}
              </span>
            </div>

            {shipments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
                No shipments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {shipments.map((shipment) => {
                  const isOpen = expandedShipment === shipment.id;
                  const form = statusForms[shipment.id];
                  const transitions = allowedShipmentTransitions(shipment.status);
                  return (
                    <div
                      key={shipment.id}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                    >
                      <button
                        type="button"
                        onClick={() => (isOpen ? setExpandedShipment(null) : openShipment(shipment))}
                        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.04]"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs ${
                                STATUS_STYLES[shipment.status] ?? STATUS_STYLES.cancelled
                              }`}
                            >
                              {statusLabel(shipment.status)}
                            </span>
                            <p className="font-medium text-white">
                              {shipment.items[0]?.product_name || "Shipment"}
                              {shipment.items.length > 1 ? ` +${shipment.items.length - 1}` : ""}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-white/50">
                            {shipment.item_count} item{shipment.item_count === 1 ? "" : "s"} ·{" "}
                            {shipment.shipping_method?.name || "Shipping method"} ·{" "}
                            {shipment.tracking_number
                              ? `Tracking ${shipment.tracking_number}`
                              : "No tracking number"}
                          </p>
                          <p className="mt-1 text-xs text-white/40">
                            ETA {formatDate(shipment.estimated_delivery_date_min)} –{" "}
                            {formatDate(shipment.estimated_delivery_date_max)}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-white/50" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-white/50" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="space-y-4 border-t border-white/10 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="text-sm text-white/70">
                              Status
                              <select
                                value={form?.status ?? shipment.status}
                                onChange={(event) =>
                                  setStatusForms((previous) => ({
                                    ...previous,
                                    [shipment.id]: {
                                      ...(previous[shipment.id] ?? {
                                        status: shipment.status,
                                        tracking_number: shipment.tracking_number ?? "",
                                        tracking_url: shipment.tracking_url ?? "",
                                        carrier: shipment.carrier ?? "",
                                        note: "",
                                      }),
                                      status: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400/50"
                              >
                                {transitions.map((status) => (
                                  <option key={status} value={status}>
                                    {statusLabel(status)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm text-white/70">
                              Carrier
                              <input
                                value={form?.carrier ?? shipment.carrier ?? ""}
                                onChange={(event) =>
                                  setStatusForms((previous) => ({
                                    ...previous,
                                    [shipment.id]: {
                                      ...(previous[shipment.id] ?? {
                                        status: shipment.status,
                                        tracking_number: shipment.tracking_number ?? "",
                                        tracking_url: shipment.tracking_url ?? "",
                                        carrier: shipment.carrier ?? "",
                                        note: "",
                                      }),
                                      carrier: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400/50"
                              />
                            </label>
                            <label className="text-sm text-white/70">
                              Tracking number
                              <input
                                value={form?.tracking_number ?? shipment.tracking_number ?? ""}
                                onChange={(event) =>
                                  setStatusForms((previous) => ({
                                    ...previous,
                                    [shipment.id]: {
                                      ...(previous[shipment.id] ?? {
                                        status: shipment.status,
                                        tracking_number: shipment.tracking_number ?? "",
                                        tracking_url: shipment.tracking_url ?? "",
                                        carrier: shipment.carrier ?? "",
                                        note: "",
                                      }),
                                      tracking_number: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400/50"
                              />
                            </label>
                            <label className="text-sm text-white/70">
                              Tracking URL
                              <input
                                value={form?.tracking_url ?? shipment.tracking_url ?? ""}
                                onChange={(event) =>
                                  setStatusForms((previous) => ({
                                    ...previous,
                                    [shipment.id]: {
                                      ...(previous[shipment.id] ?? {
                                        status: shipment.status,
                                        tracking_number: shipment.tracking_number ?? "",
                                        tracking_url: shipment.tracking_url ?? "",
                                        carrier: shipment.carrier ?? "",
                                        note: "",
                                      }),
                                      tracking_url: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="https://…"
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
                              />
                            </label>
                          </div>

                          <label className="block text-sm text-white/70">
                            Status note
                            <textarea
                              value={form?.note ?? ""}
                              onChange={(event) =>
                                setStatusForms((previous) => ({
                                  ...previous,
                                  [shipment.id]: {
                                    ...(previous[shipment.id] ?? {
                                      status: shipment.status,
                                      tracking_number: shipment.tracking_number ?? "",
                                      tracking_url: shipment.tracking_url ?? "",
                                      carrier: shipment.carrier ?? "",
                                      note: "",
                                    }),
                                    note: event.target.value,
                                  },
                                }))
                              }
                              rows={2}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400/50"
                              placeholder="Optional note stored with the status change"
                            />
                          </label>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-white/40">
                              Created {formatDate(shipment.created_at)}
                              {shipment.shipped_at ? ` · Shipped ${formatDate(shipment.shipped_at)}` : ""}
                              {shipment.delivered_at
                                ? ` · Delivered ${formatDate(shipment.delivered_at)}`
                                : ""}
                            </div>
                            <button
                              type="button"
                              onClick={() => void updateStatus(shipment)}
                              disabled={busy === shipment.id}
                              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-400 disabled:opacity-50"
                            >
                              {busy === shipment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Update status
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
