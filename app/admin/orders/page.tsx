"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Package,
  ShieldAlert,
  Smartphone,
  Truck,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { ReceiptViewer } from "@/app/components/payment/ReceiptViewer";
import { apiErrorMessage } from "@/app/lib/api-error-message";

type Payment = {
  id?: string;
  provider: string;
  provider_payment_id?: string | null;
  amount?: number | null;
  status: string;
  created_at?: string;
  receipt_url?: string | null;
  raw_response?: {
    payer_phone?: string;
    receipt_path?: string;
    uploaded_at?: string;
    verified_at?: string;
    verify_note?: string | null;
    rejected?: boolean;
    rejection_reason?: string | null;
  } | null;
};

type ShippingMethod = {
  id: string;
  name: string;
  slug: string;
  type: string;
  carrier: string | null;
  min_delivery_days: number | null;
  max_delivery_days: number | null;
};

type Order = {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  coupon_code: string | null;
  shipping_address_snapshot: {
    full_name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
  } | null;
  customer_note: string | null;
  payment?: Payment | null;
  payments?: Payment[] | null;
  shipping_method?: ShippingMethod | null;
  created_at: string;
  updated_at: string;
};

const BADGE_BASE = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-400" },
  { value: "paid", label: "Paid", icon: CheckCircle2, color: "text-blue-400" },
  { value: "processing", label: "Processing", icon: Package, color: "text-purple-400" },
  { value: "printing", label: "Printing", icon: Package, color: "text-indigo-400" },
  { value: "shipped", label: "Shipped", icon: Truck, color: "text-cyan-400" },
  { value: "delivered", label: "Delivered", icon: CheckCircle2, color: "text-green-400" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-400" },
] as const;

type PaymentFilter = "all" | "awaiting" | "paid" | "rejected" | "cod" | "vodafone";

const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting verification" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
  { key: "cod", label: "COD" },
  { key: "vodafone", label: "Vodafone Cash" },
];

function hasReceipt(order: Order) {
  return Boolean(order.payment?.raw_response?.receipt_path);
}

function paymentRejected(payment?: Payment | null) {
  return Boolean(payment && payment.status === "failed" && payment.raw_response?.rejected);
}

function isRejected(order: Order) {
  return paymentRejected(order.payment);
}

function isAwaitingVerification(order: Order) {
  const payment = order.payment;
  if (!payment || payment.provider !== "vodafone_cash") return false;
  if (payment.status === "pending" || payment.status === "processing") return true;
  // A failed row without an admin rejection means the reconciliation sweep
  // timed it out — it still needs a human check, and is never called "Rejected".
  return payment.status === "failed" && !payment.raw_response?.rejected;
}

function isPaid(order: Order) {
  return order.payment?.status === "succeeded";
}

function matchesPaymentFilter(order: Order, filter: PaymentFilter) {
  switch (filter) {
    case "awaiting":
      return isAwaitingVerification(order);
    case "paid":
      return isPaid(order);
    case "rejected":
      return isRejected(order);
    case "cod":
      return order.payment?.provider === "cod";
    case "vodafone":
      return order.payment?.provider === "vodafone_cash";
    default:
      return true;
  }
}

function paymentBadge(order: Order) {
  const payment = order.payment;

  if (!payment) {
    return {
      icon: Clock,
      className: `${BADGE_BASE} text-slate-300 bg-slate-950/50 border-white/10`,
      label: "Awaiting payment",
      detail: "",
    };
  }

  if (payment.provider === "vodafone_cash") {
    if (paymentRejected(payment)) {
      return {
        icon: XCircle,
        className: `${BADGE_BASE} text-red-300 bg-red-950/40 border-red-500/40`,
        label: "Vodafone Cash",
        detail: "Rejected",
      };
    }
    if (isAwaitingVerification(order)) {
      return {
        icon: Smartphone,
        className: `${BADGE_BASE} text-amber-300 bg-amber-950/40 border-amber-500/40`,
        label: "Vodafone Cash",
        detail: "Awaiting verification",
      };
    }
    if (payment.status === "succeeded") {
      return {
        icon: Wallet,
        className: `${BADGE_BASE} text-emerald-300 bg-emerald-950/40 border-emerald-500/40`,
        label: "Vodafone Cash",
        detail: "Paid",
      };
    }
  }

  if (payment.provider === "cod") {
    return {
      icon: Banknote,
      className: `${BADGE_BASE} text-amber-300 bg-amber-950/40 border-amber-500/30`,
      label: "Cash on delivery",
      detail: payment.status === "succeeded" ? "Paid" : "Due on delivery",
    };
  }

  if (payment.provider === "wallet") {
    return {
      icon: Wallet,
      className: `${BADGE_BASE} text-purple-300 bg-purple-950/40 border-purple-500/30`,
      label: "Wallet",
      detail: payment.status === "succeeded" ? "Paid" : payment.status,
    };
  }

  return {
    icon: CreditCard,
    className: `${BADGE_BASE} ${
      payment.status === "succeeded"
        ? "text-emerald-300 bg-emerald-950/40 border-emerald-500/30"
        : "text-sky-300 bg-sky-950/40 border-sky-500/30"
    }`,
    label: "Card payment",
    detail: payment.status === "succeeded" ? "Paid" : payment.status,
  };
}

function deliveryBadge(order: Order) {
  const method = order.shipping_method;

  if (!method) {
    return {
      icon: Truck,
      className: `${BADGE_BASE} text-slate-300 bg-slate-950/50 border-white/10`,
      label: "Delivery not set",
      detail: "",
    };
  }

  const express = method.type === "express";
  const days =
    method.min_delivery_days && method.max_delivery_days
      ? `${method.min_delivery_days}–${method.max_delivery_days} days`
      : "";

  return {
    icon: express ? Zap : Truck,
    className: `${BADGE_BASE} ${
      express
        ? "text-cyan-300 bg-cyan-950/40 border-cyan-500/30"
        : "text-indigo-300 bg-indigo-950/40 border-indigo-500/30"
    }`,
    label: express ? "Express delivery" : "Standard delivery",
    detail: days,
  };
}

export default function AdminOrdersPage() {
  const { user, getToken } = useAuth();
  const queryClient = useQueryClient();

  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [confirming, setConfirming] = useState<Order | null>(null);

  const adminQuery = useQuery({
    queryKey: ["admin", "me"],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.is_admin) throw new Error("You don't have admin privileges.");
      return data as { is_admin: boolean };
    },
  });

  const isAdmin = Boolean(adminQuery.data?.is_admin);

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders"],
    enabled: isAdmin,
    retry: false,
    queryFn: async (): Promise<Order[]> => {
      const token = await getToken();
      const res = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to load orders"));
      }
      return (data.orders ?? []) as Order[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const token = await getToken();
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to update order status"));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      approve: boolean;
      note?: string;
    }) => {
      const token = await getToken();
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: payload.orderId,
          action: "verify_payment",
          approve: payload.approve,
          ...(payload.note ? { note: payload.note } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to verify payment"));
      }
      return data;
    },
    onSuccess: () => {
      // The PATCH response carries no payment data — refetch for the truth.
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      setRejectingId(null);
      setRejectNote("");
      setConfirming(null);
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to access admin panel.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (adminQuery.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" aria-label="Loading" />
      </div>
    );
  }

  if (adminQuery.error || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <XCircle className="h-16 w-16 mx-auto text-red-400 mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            {adminQuery.error instanceof Error
              ? adminQuery.error.message
              : "You don't have admin privileges."}
          </p>
        </div>
      </div>
    );
  }

  const orders = ordersQuery.data ?? [];
  const filteredOrders = orders.filter(
    (order) => matchesPaymentFilter(order, paymentFilter) && (statusFilter === "all" || order.status === statusFilter)
  );
  const countFor = (filter: PaymentFilter) => orders.filter((order) => matchesPaymentFilter(order, filter)).length;
  const verificationError = statusMutation.error ?? verifyMutation.error ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          Manage <span className="text-gradient-neon">Orders</span>
        </h1>
        <p className="text-muted-foreground mt-2">{orders.length} total orders</p>
      </div>

      {(ordersQuery.error || verificationError) && (
        <div role="alert" className="mb-6 p-4 rounded-xl text-sm text-red-400 bg-red-950/40 border border-red-500/30">
          {verificationError instanceof Error
            ? verificationError.message
            : ordersQuery.error instanceof Error
              ? ordersQuery.error.message
              : "Something went wrong"}
        </div>
      )}

      {/* Payment-oriented filters */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-2" role="group" aria-label="Filter by payment">
        {PAYMENT_FILTERS.map((option) => {
          const count = countFor(option.key);
          const active = paymentFilter === option.key;
          return (
            <button
              key={option.key}
              onClick={() => setPaymentFilter(option.key)}
              aria-pressed={active}
              data-testid={`filter-${option.key}`}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                active ? "bg-gradient-neon text-white" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Order status filter */}
      <div className="flex items-center gap-3 mb-6">
        <label htmlFor="order-status-filter" className="text-sm text-muted-foreground">
          Order status
        </label>
        <select
          id="order-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 px-3 rounded-lg glass text-sm outline-none cursor-pointer"
        >
          <option value="all" className="bg-black text-white">
            All statuses
          </option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-black text-white">
              {option.label}
            </option>
          ))}
        </select>
        {ordersQuery.isFetching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Refreshing orders" />
        )}
      </div>

      {ordersQuery.isPending ? (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" aria-label="Loading orders" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-20 w-20 mx-auto text-muted-foreground mb-4" aria-hidden="true" />
          <h2 className="text-2xl font-extrabold mb-2">No Orders</h2>
          <p className="text-muted-foreground">No orders match the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusInfo = STATUS_OPTIONS.find((option) => option.value === order.status) || STATUS_OPTIONS[0];
            const payment = paymentBadge(order);
            const delivery = deliveryBadge(order);
            const PaymentIcon = payment.icon;
            const DeliveryIcon = delivery.icon;
            const paymentRow = order.payment;
            const awaiting = isAwaitingVerification(order);
            const rejected = isRejected(order);
            const canVerify = Boolean(paymentRow && awaiting && hasReceipt(order));
            const busy = statusMutation.isPending || verifyMutation.isPending;

            return (
              <div key={order.id} className="glass-strong rounded-2xl p-5 hover:pink-glow transition-all">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="font-mono text-sm font-semibold">Order {order.order_number || `${order.id.slice(0, 8)}…`}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusMutation.isPending && statusMutation.variables?.orderId === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-label="Updating status" />
                    ) : (
                      <select
                        aria-label={`Order status for ${order.order_number || order.id.slice(0, 8)}`}
                        value={order.status}
                        onChange={(event) =>
                          statusMutation.mutate({ orderId: order.id, status: event.target.value })
                        }
                        disabled={busy}
                        className={`h-9 px-3 rounded-lg glass text-sm font-semibold ${statusInfo.color} bg-transparent outline-none cursor-pointer`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} className="bg-black text-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Nature of the order: how it is paid + how it is shipped */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={payment.className} data-testid="admin-payment-badge">
                    <PaymentIcon className="h-3.5 w-3.5" />
                    {payment.label}
                    {payment.detail && <span className="opacity-70 font-medium">· {payment.detail}</span>}
                  </span>
                  <span className={delivery.className}>
                    <DeliveryIcon className="h-3.5 w-3.5" />
                    {delivery.label}
                    {delivery.detail && <span className="opacity-70 font-medium">· {delivery.detail}</span>}
                  </span>
                </div>

                {/* Vodafone Cash: transfer details awaiting admin verification */}
                {paymentRow?.provider === "vodafone_cash" && (
                  <div className="glass rounded-xl p-4 mb-4 space-y-3" data-testid="vodafone-panel">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-sm flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                        Vodafone Cash transfer
                      </p>
                      <span className="text-xs font-semibold px-2 py-1 rounded-lg border border-white/10 text-muted-foreground">
                        {awaiting
                          ? "Waiting for your check"
                          : paymentRow.status === "succeeded"
                            ? "Verified"
                            : rejected
                              ? "Rejected"
                              : "Awaiting verification"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="font-semibold">{order.shipping_address_snapshot?.full_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Amount due</p>
                        <p className="font-extrabold text-gradient-gold" data-testid="admin-amount-due">
                          {formatCurrency(paymentRow.amount ?? order.total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Transfer reference</p>
                        <p className="font-mono font-semibold">{paymentRow.provider_payment_id || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Payer phone</p>
                        <p className="font-mono">{paymentRow.raw_response?.payer_phone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Receipt uploaded</p>
                        <p>
                          {paymentRow.raw_response?.uploaded_at
                            ? new Date(paymentRow.raw_response.uploaded_at).toLocaleString()
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Order</p>
                        <p className="font-mono text-xs">{order.order_number}</p>
                      </div>
                    </div>

                    {paymentRow.receipt_url ? (
                      <ReceiptViewer
                        src={paymentRow.receipt_url}
                        alt={`Transfer receipt for order ${order.order_number || order.id.slice(0, 8)}`}
                        label="Open receipt"
                        className="max-w-md"
                        meta={[
                          { label: "Order", value: order.order_number || order.id.slice(0, 8) },
                          { label: "Amount due", value: formatCurrency(paymentRow.amount ?? order.total) },
                          { label: "Reference", value: paymentRow.provider_payment_id || null },
                          { label: "Payer", value: paymentRow.raw_response?.payer_phone || null },
                        ]}
                      />
                    ) : (
                      <div className="flex items-start gap-2 rounded-xl bg-amber-950/40 border border-amber-500/30 p-3 text-xs text-amber-200">
                        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <p>
                          {paymentRow.raw_response?.receipt_path
                            ? "The receipt image could not be loaded. Ask the customer to resend it before verifying."
                            : "The customer has not uploaded a receipt yet. Verification stays open until one arrives."}
                        </p>
                      </div>
                    )}

                    {(paymentRow.raw_response?.verify_note || paymentRow.raw_response?.rejection_reason) && (
                      <p className="text-xs text-muted-foreground">
                        Note: {paymentRow.raw_response?.verify_note || paymentRow.raw_response?.rejection_reason}
                      </p>
                    )}

                    {canVerify && rejectingId !== order.id && (
                      <div className="flex flex-wrap gap-2 pt-1" data-testid="verify-actions">
                        <button
                          onClick={() => setConfirming(order)}
                          disabled={busy}
                          className="flex-1 min-w-[170px] h-10 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-500 transition-colors disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Confirm payment
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(order.id);
                            setRejectNote("");
                          }}
                          disabled={busy}
                          className="px-4 h-10 rounded-xl glass text-red-400 text-sm font-bold flex items-center gap-2 hover:bg-red-950/40 transition-colors disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Reject
                        </button>
                      </div>
                    )}

                    {canVerify && rejectingId === order.id && (
                      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 space-y-2">
                        <label
                          htmlFor={`reject-reason-${order.id}`}
                          className="text-xs font-semibold text-red-300"
                        >
                          Why is this transfer being rejected? (the customer sees this)
                        </label>
                        <textarea
                          id={`reject-reason-${order.id}`}
                          value={rejectNote}
                          onChange={(event) => setRejectNote(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="e.g. Amount received does not match the order total"
                          className="w-full rounded-lg glass p-2 text-sm outline-none resize-y"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              verifyMutation.mutate({
                                orderId: order.id,
                                approve: false,
                                note: rejectNote.trim() || undefined,
                              })
                            }
                            disabled={verifyMutation.isPending}
                            className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors disabled:opacity-60"
                          >
                            {verifyMutation.isPending && verifyMutation.variables?.approve === false ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-label="Rejecting" />
                            ) : (
                              "Send rejection"
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectNote("");
                            }}
                            disabled={verifyMutation.isPending}
                            className="h-9 px-4 rounded-lg glass text-sm font-semibold disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {order.shipping_address_snapshot && (
                  <div className="glass rounded-xl p-3 mb-4 text-sm">
                    <p className="font-semibold">{order.shipping_address_snapshot.full_name}</p>
                    <p className="text-muted-foreground">
                      {order.shipping_address_snapshot.address}, {order.shipping_address_snapshot.city},{" "}
                      {order.shipping_address_snapshot.country}
                    </p>
                    <p className="text-muted-foreground">{order.shipping_address_snapshot.phone}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                  <div className="text-sm">
                    {order.coupon_code && <span className="text-secondary">Coupon: {order.coupon_code}</span>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-extrabold text-gradient-gold">{formatCurrency(order.total)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm payment dialog */}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-payment-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          onClick={() => setConfirming(null)}
        >
          <div
            className="glass-strong rounded-3xl p-6 max-w-md w-full space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 id="confirm-payment-title" className="text-lg font-extrabold">
                  Confirm payment
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Confirm that the transferred amount matches the order total?
                </p>
              </div>
            </div>

            <dl className="glass rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Order total</dt>
                <dd className="font-extrabold text-gradient-gold">{formatCurrency(confirming.total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Payment requested</dt>
                <dd className="font-semibold">{formatCurrency(confirming.payment?.amount ?? confirming.total)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Transfer reference</dt>
                <dd className="font-mono text-xs">{confirming.payment?.provider_payment_id || "—"}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="h-10 px-4 rounded-xl glass text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  verifyMutation.mutate({ orderId: confirming.id, approve: true })
                }
                disabled={verifyMutation.isPending}
                className="h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-colors disabled:opacity-60"
              >
                {verifyMutation.isPending && verifyMutation.variables?.approve ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-label="Confirming" />
                ) : (
                  "Yes, confirm payment"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
