"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  ShieldCheck,
  Smartphone,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { ReceiptUploader } from "@/app/components/payment/ReceiptUploader";
import { ReceiptViewer } from "@/app/components/payment/ReceiptViewer";
import { ExternalWalletInstructions } from "@/app/components/payment/VodafoneInstructions";
import { apiErrorMessage } from "@/app/lib/api-error-message";
import {
  TONE_CLASS,
  TRANSFER_STATE_COPY,
  canSubmitReceipt,
  describeShippingMethod,
  getRejectionReason,
  getTransferState,
  isExternalWalletEnabled,
  isExternalWalletSettings,
  isManualTransferProvider,
  paymentProviderLabel,
  pickPayment,
  pickTransferPayment,
  resolveWalletNumber,
  toPaymentProvider,
  type ExternalWalletSettings,
  type PaymentAttempt,
} from "@/app/lib/payment-status";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  status: string;
  options_snapshot: Record<string, string> | null;
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
  status: string;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  payment_method?: string | null;
  shipping_address_snapshot: Record<string, string>;
  customer_note: string | null;
  placed_at: string;
  created_at: string;
  items?: OrderItem[];
  payment?: PaymentAttempt | null;
  payments?: PaymentAttempt[];
  shipping_method?: ShippingMethod | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: "Pending", color: "text-yellow-400", icon: Clock },
  paid: { label: "Paid", color: "text-blue-400", icon: CheckCircle2 },
  processing: { label: "Processing", color: "text-blue-400", icon: Package },
  printing: { label: "Printing", color: "text-purple-400", icon: Package },
  shipped: { label: "Shipped", color: "text-orange-400", icon: Truck },
  delivered: { label: "Delivered", color: "text-green-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "text-red-400", icon: XCircle },
  refunded: { label: "Refunded", color: "text-gray-400", icon: XCircle },
  partially_refunded: { label: "Partially Refunded", color: "text-gray-400", icon: XCircle },
};

const PROVIDER_ICONS: Record<string, typeof Package> = {
  cod: Banknote,
  external_wallet: Smartphone,
  vodafone_cash: Smartphone,
  wallet: Wallet,
  stripe: CreditCard,
  paymob: CreditCard,
};

/** Human payment status — never claims "Rejected" without admin proof. */
function paymentStatusCopy(payment: PaymentAttempt | null): { label: string; color: string } {
  if (!payment) return { label: "Awaiting payment", color: "text-slate-300" };
  const provider = toPaymentProvider(payment.provider);
  switch (payment.status) {
    case "succeeded":
      return { label: "Paid", color: "text-emerald-300" };
    case "pending":
    case "processing":
      return provider === "cod"
        ? { label: "Due on delivery", color: "text-amber-300" }
        : { label: "Awaiting verification", color: "text-amber-300" };
    case "failed":
      return isManualTransferProvider(provider)
        ? payment.raw_response?.rejected
          ? { label: "Rejected", color: "text-red-300" }
          : { label: "Awaiting verification", color: "text-amber-300" }
        : { label: "Failed", color: "text-red-300" };
    default:
      return { label: payment.status, color: "text-slate-300" };
  }
}

export default function OrderDetailPage() {
  const params = useParams();
  const { user, getToken } = useAuth();
  const queryClient = useQueryClient();

  const orderId = (params?.id as string) ?? "";

  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    enabled: Boolean(user && orderId),
    retry: false,
    queryFn: async (): Promise<Order> => {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to load order"));
      }
      return data.order as Order;
    },
  });

  const order = orderQuery.data ?? null;
  const orderCurrency = order?.currency || "USD";
  const payments = order?.payments ?? [];
  const storedMethod = toPaymentProvider(order?.payment_method);
  // A COD order can still have an older rejected wallet attempt. Keep that
  // evidence in the database, but do not show it as the active payment UI.
  const transferPayment =
    storedMethod === "cod" ? null : pickTransferPayment(payments, storedMethod);
  const receiptPath = transferPayment?.raw_response?.receipt_path;
  // An order can be created with no payment at all when its payment RPC failed
  // (a transient error, or the wallet setting was missing). The customer needs a
  // way to choose a method and resume the payment instead of being stuck.
  const needsPaymentSetup =
    order?.status === "pending" &&
    payments.length === 0 &&
    !isManualTransferProvider(storedMethod);
  const needsWalletSettings = Boolean(
    storedMethod === "external_wallet" ||
      toPaymentProvider(transferPayment?.provider) === "external_wallet" ||
      needsPaymentSetup
  );

  // The account details live in a private store setting. Only the display-only
  // shape is fetched, and only when this order actually uses a wallet transfer.
  const walletSettingsQuery = useQuery({
    queryKey: ["payment-methods"],
    enabled: Boolean(user && needsWalletSettings),
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<ExternalWalletSettings | null> => {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");

      const res = await fetch("/api/payment-methods", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to load transfer details"));
      }
      return isExternalWalletSettings(data.external_wallet) ? data.external_wallet : null;
    },
  });
  const walletSettings = walletSettingsQuery.data ?? null;

  const receiptQuery = useQuery({
    queryKey: ["order-receipt", orderId, transferPayment?.id ?? "none"],
    enabled: Boolean(user && orderId && receiptPath),
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");

      const paymentQuery = transferPayment?.id
        ? `?payment=${encodeURIComponent(transferPayment.id)}`
        : "";
      const res = await fetch(`/api/orders/${orderId}/receipt${paymentQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to load the receipt"));
      }
      return data.url as string;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const token = await getToken();
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: targetId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to cancel order"));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });

  const startPaymentMutation = useMutation({
    mutationFn: async (method: "cod" | "external_wallet") => {
      const token = await getToken();
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payment_method: method }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(apiErrorMessage(res.status, data, "Failed to start the payment"));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-receipt", orderId] });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to view this order.</p>
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

  if (orderQuery.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-accent" aria-label="Loading order" />
      </div>
    );
  }

  if (orderQuery.error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Order Not Found</h1>
          <p className="text-muted-foreground mb-4">
            {orderQuery.error instanceof Error
              ? orderQuery.error.message
              : "This order does not exist."}
          </p>
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  const activePayment = pickPayment(payments);
  const transferState = getTransferState({
    orderStatus: order.status,
    payment: transferPayment,
    paymentMethod: storedMethod,
  });

  // A zero-total (fully discounted) order is settled without a payment row, so
  // it must read as paid rather than "awaiting payment".
  const totalDue = Number(order.total ?? 0);
  const isFreeOrder = order.status === "paid" && totalDue <= 0 && payments.length === 0;

  // `payment_method` is persisted on the order, so a wallet order is labelled
  // correctly even before its first receipt creates a payment row.
  const displayProvider =
    activePayment?.provider ??
    storedMethod ??
    (transferState !== "not_applicable" ? "external_wallet" : "");
  const PaymentIcon = PROVIDER_ICONS[toPaymentProvider(displayProvider) ?? "stripe"] ?? CreditCard;
  const statusCopy = isFreeOrder
    ? { label: "Paid", color: "text-emerald-300" }
    : activePayment
      ? paymentStatusCopy(activePayment)
      : transferState === "receipt_required"
        ? { label: "Receipt required", color: "text-amber-300" }
        : { label: "Awaiting payment", color: "text-slate-300" };

  const transferCopy = TRANSFER_STATE_COPY[transferState];
  const transferTone = TONE_CLASS[transferCopy.tone];
  const rejectionReason = getRejectionReason(transferPayment);
  const showReceiptForm = canSubmitReceipt({
    orderStatus: order.status,
    payments,
    paymentMethod: storedMethod,
  });

  const legacyProvider =
    storedMethod === "vodafone_cash" ||
    toPaymentProvider(transferPayment?.provider) === "vodafone_cash";
  const legacyWallet = resolveWalletNumber();
  const walletProviderName = legacyProvider
    ? "Vodafone Cash"
    : walletSettings?.provider_name || "Mobile wallet";
  const walletAccountName = legacyProvider ? null : walletSettings?.account_name || null;
  const walletNumber = legacyProvider ? legacyWallet.number : walletSettings?.account_number || null;
  const walletInstructions = legacyProvider ? null : walletSettings?.instructions || null;
  const walletDetailsUnavailable = legacyProvider
    ? !legacyWallet.number
    : needsWalletSettings &&
      !walletSettingsQuery.isPending &&
      !walletSettings?.account_number;
  const showTransferPanel = transferState !== "not_applicable" || Boolean(transferPayment);
  const receiptEndpoint = legacyProvider
    ? "/api/payments/vodafone-cash"
    : "/api/payments/external-wallet";
  const showCodNotice = toPaymentProvider(activePayment?.provider) === "cod";
  const walletAvailable = isExternalWalletEnabled(walletSettings);
  const delivery = describeShippingMethod(order.shipping_method);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold">
              Order <span className="text-gradient-neon">#{order.order_number || order.id.slice(0, 8)}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Placed on {new Date(order.placed_at || order.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl glass ${statusConfig.color}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            <span className="font-semibold">{statusConfig.label}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Main column */}
        <div className="md:col-span-2 space-y-6">
          {/* Payment */}
          <section className="glass-strong rounded-3xl p-6" aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="text-lg font-extrabold mb-4">
              Payment
            </h2>

            <div className="grid gap-3 sm:grid-cols-3 text-sm mb-4">
              <div className="glass rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="font-semibold flex items-center gap-1.5 mt-0.5" data-testid="payment-method">
                  <PaymentIcon className="h-4 w-4" aria-hidden="true" />
                  {isFreeOrder ? "Free order" : paymentProviderLabel(displayProvider || undefined)}
                </p>
              </div>
              <div className="glass rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-extrabold text-gradient-gold mt-0.5">
                  {isFreeOrder ? "Free" : formatCurrency(activePayment?.amount ?? order.total, orderCurrency)}
                </p>
              </div>
              <div className="glass rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`font-semibold mt-0.5 ${statusCopy.color}`} data-testid="payment-status">
                  {statusCopy.label}
                </p>
              </div>
            </div>

            {showTransferPanel && (
              <div className={`rounded-xl border p-4 space-y-3 ${transferTone.panel}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{walletProviderName} transfer</p>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-lg border ${transferTone.badge}`}
                    data-testid="transfer-state"
                  >
                    {transferCopy.badge}
                  </span>
                </div>

                <div>
                  <p className="font-semibold">{transferCopy.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{transferCopy.body}</p>
                </div>

                {rejectionReason && (
                  <div className="rounded-lg bg-red-950/40 border border-red-500/30 p-3 text-sm">
                    <p className="font-semibold text-red-300">Reason given by our team</p>
                    <p className="text-red-200/90 mt-0.5">{rejectionReason}</p>
                  </div>
                )}

                {transferPayment && (
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="font-mono font-semibold">
                        {transferPayment.provider_payment_id || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Sent from</dt>
                      <dd className="font-mono">
                        {transferPayment.raw_response?.payer_phone || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Submitted</dt>
                      <dd>
                        {transferPayment.raw_response?.uploaded_at
                          ? new Date(transferPayment.raw_response.uploaded_at).toLocaleString()
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Order</dt>
                      <dd className="font-mono text-xs">{order.order_number}</dd>
                    </div>
                  </dl>
                )}

                {receiptPath && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Your submitted receipt</p>
                    {receiptQuery.data ? (
                      <ReceiptViewer
                        src={receiptQuery.data}
                        alt={`Transfer receipt for order ${order.order_number || order.id.slice(0, 8)}`}
                        label="View receipt"
                        className="max-w-xs"
                        meta={[
                          { label: "Order", value: order.order_number || order.id.slice(0, 8) },
                          { label: "Amount", value: formatCurrency(order.total, orderCurrency) },
                          {
                            label: "Reference",
                            value: transferPayment?.provider_payment_id ?? null,
                          },
                          {
                            label: "Submitted",
                            value: transferPayment?.raw_response?.uploaded_at
                              ? new Date(
                                  transferPayment.raw_response.uploaded_at
                                ).toLocaleString()
                              : null,
                          },
                        ]}
                      />
                    ) : receiptQuery.isPending ? (
                      <div className="glass rounded-xl h-28 w-64 grid place-items-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading receipt" />
                      </div>
                    ) : (
                      <p className="text-xs text-red-300" role="alert">
                        {receiptQuery.error instanceof Error
                          ? receiptQuery.error.message
                          : "Receipt could not be loaded."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {showCodNotice && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm">
                <p className="font-semibold flex items-center gap-2 text-emerald-200">
                  <Banknote className="h-4 w-4" aria-hidden="true" />
                  Cash on delivery
                </p>
                <p className="text-muted-foreground mt-1">
                  Pay the courier in cash when your order arrives. The payment is recorded only
                  after the cash is actually collected.
                </p>
              </div>
            )}

            {/* Finish a checkout whose payment attempt failed after the order
                was created — the customer would otherwise be stuck. */}
            {needsPaymentSetup ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
                <div>
                  <p className="font-semibold text-sm text-amber-100">Finish setting up your payment</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {totalDue <= 0
                      ? "Your discount covers the full order, so there is nothing to pay. Confirm to complete it."
                      : "This order has no payment method yet. Choose how you would like to pay."}
                  </p>
                </div>

                {startPaymentMutation.error && (
                  <p role="alert" className="text-sm text-red-300">
                    {startPaymentMutation.error instanceof Error
                      ? startPaymentMutation.error.message
                      : "Failed to start the payment"}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  {totalDue <= 0 ? (
                    <button
                      onClick={() => startPaymentMutation.mutate("cod")}
                      disabled={startPaymentMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-neon text-white text-sm font-semibold hover:scale-[1.02] transition-transform disabled:opacity-50"
                    >
                      {startPaymentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      Complete order
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => startPaymentMutation.mutate("cod")}
                        disabled={startPaymentMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-semibold hover:pink-glow transition-all disabled:opacity-50"
                      >
                        {startPaymentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Banknote className="h-4 w-4" aria-hidden="true" />
                        )}
                        Pay cash on delivery
                      </button>
                      <button
                        onClick={() => startPaymentMutation.mutate("external_wallet")}
                        disabled={
                          startPaymentMutation.isPending ||
                          walletSettingsQuery.isPending ||
                          !walletAvailable
                        }
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-semibold hover:pink-glow transition-all disabled:opacity-50"
                      >
                        <Smartphone className="h-4 w-4" aria-hidden="true" />
                        Pay by mobile wallet
                      </button>
                    </>
                  )}
                </div>

                {totalDue > 0 && !walletSettingsQuery.isPending && !walletAvailable && (
                  <p className="text-xs text-muted-foreground">
                    Wallet transfers are unavailable right now. Cash on delivery is still available.
                  </p>
                )}
              </div>
            ) : isFreeOrder ? (
              <p className="text-sm text-emerald-300">
                This order was fully covered by a discount — no payment is due.
              </p>
            ) : (
              !activePayment &&
              !showTransferPanel &&
              !showReceiptForm && (
                <p className="text-sm text-muted-foreground">
                  No payment has been recorded for this order yet. It will update automatically once
                  the payment provider confirms it.
                </p>
              )
            )}
          </section>

          {/* Wallet transfer: instructions + receipt submission */}
          {showTransferPanel && (
              <section className="glass-strong rounded-3xl p-6" aria-labelledby="receipt-heading">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 id="receipt-heading" className="text-lg font-extrabold flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                    Pay with {walletProviderName}
                  </h2>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-lg border ${transferTone.badge}`}
                  >
                    {transferCopy.badge}
                  </span>
                </div>

                {!legacyProvider && walletSettingsQuery.isPending ? (
                  <div className="glass rounded-2xl p-6 flex items-center gap-3 text-sm text-muted-foreground mb-4">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Loading transfer details…
                  </div>
                ) : (
                  <ExternalWalletInstructions
                    number={walletNumber}
                    providerName={walletProviderName}
                    accountName={walletAccountName}
                    instructions={walletInstructions}
                    amountLabel={formatCurrency(order.total, orderCurrency)}
                    orderNumber={order.order_number || order.id.slice(0, 8)}
                    showFileSpecs={showReceiptForm}
                    className="mb-4"
                  />
                )}

                {!legacyProvider && walletSettingsQuery.error && (
                  <p role="alert" className="text-xs text-red-300 mb-3">
                    {walletSettingsQuery.error instanceof Error
                      ? walletSettingsQuery.error.message
                      : "Transfer details could not be loaded."}
                  </p>
                )}

                {showReceiptForm ? (
                  <div className="border-t border-white/10 pt-4">
                    {!legacyProvider && walletSettingsQuery.isPending ? (
                      <p className="text-xs text-muted-foreground">
                        Loading transfer details before the receipt form…
                      </p>
                    ) : walletDetailsUnavailable ? (
                      <p role="alert" className="text-sm text-amber-200">
                        Transfer account details are unavailable right now. Please contact support
                        before sending money.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">
                          {transferState === "receipt_required"
                            ? "Upload the receipt after you complete the transfer."
                            : "Upload a new receipt to replace the one we could not verify."}
                        </p>
                        <ReceiptUploader
                          orderId={order.id}
                          endpoint={receiptEndpoint}
                          idPrefix={`receipt-${order.id}`}
                          onSubmitted={() => {
                            void orderQuery.refetch();
                            void receiptQuery.refetch();
                          }}
                          submitLabel={
                            transferState === "receipt_required"
                              ? "Submit receipt for verification"
                              : "Submit a new receipt"
                          }
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-white/10 pt-4 text-sm text-muted-foreground flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <p>
                      {transferState === "confirmed"
                        ? "Nothing else is needed — this order is paid."
                        : "Your receipt is with our payment team. No further action is needed from you."}
                    </p>
                  </div>
                )}
              </section>
            )}

          {/* Order Items */}
          <div className="glass-strong rounded-3xl p-6">
            <h2 className="text-lg font-extrabold mb-4">Order Items</h2>
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="glass rounded-xl p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="font-semibold">{item.product_name_snapshot}</p>
                        <p className="text-sm text-muted-foreground">
                          SKU: {item.sku_snapshot}
                          {item.options_snapshot &&
                            Object.entries(item.options_snapshot).map(([k, v]) => (
                              <span key={k}>
                                {" "}
                                · {k}: {v}
                              </span>
                            ))}
                        </p>
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold">{formatCurrency(item.line_total, orderCurrency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Items not loaded. View order list for details.</p>
            )}
          </div>

          {/* Shipping Address */}
          {order.shipping_address_snapshot && (
            <div className="glass-strong rounded-3xl p-6">
              <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-accent" aria-hidden="true" />
                Shipping Address
              </h2>
              <div className="glass rounded-xl p-4">
                <p className="font-semibold">{order.shipping_address_snapshot.full_name || "N/A"}</p>
                <p className="text-sm text-muted-foreground">
                  {order.shipping_address_snapshot.address}, {order.shipping_address_snapshot.city},{" "}
                  {order.shipping_address_snapshot.state} {order.shipping_address_snapshot.zip_code}
                </p>
                <p className="text-sm text-muted-foreground">{order.shipping_address_snapshot.country}</p>
                <p className="text-sm text-muted-foreground">
                  Phone: {order.shipping_address_snapshot.phone || "N/A"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="md:col-span-1">
          <div className="glass-strong rounded-3xl p-6 h-fit sticky top-28 space-y-4">
            <h3 className="text-lg font-extrabold">Order Summary</h3>

            <div className="glass rounded-xl p-3 flex items-start gap-2 text-sm">
              <Truck className="h-4 w-4 mt-0.5 text-indigo-300 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">{delivery.label}</p>
                {delivery.detail && (
                  <p className="text-xs text-muted-foreground">{delivery.detail}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatCurrency(order.subtotal, orderCurrency)}</span>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-semibold">{formatCurrency(order.tax, orderCurrency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className={`font-semibold ${order.shipping_fee === 0 ? "text-green-400" : ""}`}>
                  {order.shipping_fee === 0 ? "Free" : formatCurrency(order.shipping_fee, orderCurrency)}
                </span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-semibold text-green-400">-{formatCurrency(order.discount_amount, orderCurrency)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-extrabold text-lg text-gradient-gold">{formatCurrency(order.total, orderCurrency)}</span>
              </div>
            </div>

            {/* Cancel Button */}
            {(order.status === "pending" || order.status === "paid") && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to cancel this order?")) {
                    cancelMutation.mutate(order.id);
                  }
                }}
                disabled={cancelMutation.isPending}
                className="w-full h-10 rounded-xl bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" aria-label="Cancelling" />
                ) : (
                  "Cancel Order"
                )}
              </button>
            )}

            {cancelMutation.error && (
              <p role="alert" className="text-xs text-red-400">
                {cancelMutation.error instanceof Error
                  ? cancelMutation.error.message
                  : "Failed to cancel order"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
