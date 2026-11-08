"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SafeImage } from "@/app/components/SafeImage";
import {
  ArrowRight,
  Loader2,
  MapPin,
  CreditCard,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  Wallet,
} from "lucide-react";
import { useCartStore } from "../stores/cartStore";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { computeOrderTotal } from "@/lib/checkout-calculations";
import { ReceiptUploader } from "@/app/components/payment/ReceiptUploader";
import { ExternalWalletInstructions } from "@/app/components/payment/VodafoneInstructions";
import { apiErrorMessage } from "@/app/lib/api-error-message";
import {
  EMPTY_EXTERNAL_WALLET_SETTINGS,
  formatDeliveryEstimate,
  isExternalWalletEnabled,
  isExternalWalletSettings,
  PAYMENT_PROVIDER_LABELS,
  toPaymentProvider,
  type ExternalWalletSettings,
} from "@/app/lib/payment-status";

type CheckoutPaymentMethod = "cod" | "external_wallet";

type ShippingAddress = {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
};

type ShippingOption = {
  method_id: string;
  method_name: string;
  method_type?: string;
  carrier?: string | null;
  fee: number;
  is_free: boolean;
  min_delivery_days?: number | null;
  max_delivery_days?: number | null;
};

type PreviewItem = {
  cart_item_id: string;
  variant_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  color: string | null;
  size: string | null;
};

type CheckoutPreview = {
  cart_id: string;
  currency: string;
  item_count: number;
  subtotal: number;
  discount: number;
  stored_discount: number;
  tax: number;
  shipping_fee: number;
  gift_wrap_fee: number;
  gift_wrap_item_count: number;
  total: number;
  items: PreviewItem[];
  coupon: { id: string; code: string; valid: boolean; error: string | null } | null;
  coupon_error: string | null;
  price_changes: Array<{
    cart_item_id: string;
    product_name: string | null;
    old_price: number;
    new_price: number;
  }>;
  stock_issues: Array<{
    cart_item_id: string;
    product_name: string | null;
    requested: number;
    available: number;
  }>;
  shipping_options: ShippingOption[];
  selected_shipping_method_id: string | null;
  selected_shipping_method: ShippingOption | null;
};

type PaymentOption = {
  id: CheckoutPaymentMethod;
  label: string;
  desc: string;
  disabled?: boolean;
};

export default function CheckoutPage() {
  const { user, getToken } = useAuth();
  const { items, getTotal, getCount, clearCart } = useCartStore();
  const [step, setStep] = useState<"address" | "payment" | "confirm" | "wallet" | "success">("address");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [amountDue, setAmountDue] = useState(0);
  const [orderCurrency, setOrderCurrency] = useState<string | null>(null);
  const [freeOrder, setFreeOrder] = useState(false);
  const [setupFailedOrder, setSetupFailedOrder] = useState<{
    id: string;
    number: string | null;
  } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [address, setAddress] = useState<ShippingAddress>({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "Egypt",
  });

  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("cod");
  const [notes, setNotes] = useState("");
  const [walletSettings, setWalletSettings] = useState<ExternalWalletSettings>(
    EMPTY_EXTERNAL_WALLET_SETTINGS
  );
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<{
    method_id: string;
    fee: number;
  } | null>(null);
  const [cartId, setCartId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [finalTotalAdjusted, setFinalTotalAdjusted] = useState(false);

  const localSubtotal = getTotal();
  const currency = preview?.currency ?? items[0]?.currency ?? "USD";
  // Shipping is server-owned: use the selected option's fee and never invent a
  // fallback amount here, otherwise the displayed total would disagree with the
  // total the checkout RPC actually charges.
  const shipping = selectedShipping?.fee ?? preview?.shipping_fee ?? 0;
  const subtotal = preview?.subtotal ?? localSubtotal;
  const discount = preview?.discount ?? 0;
  const tax = preview?.tax ?? 0;
  const giftWrap = preview?.gift_wrap_fee ?? 0;
  const total = computeOrderTotal({ subtotal, tax, shipping, giftWrap, discount });
  const walletEnabled = isExternalWalletEnabled(walletSettings);
  const previewPriceByKey = new Map(
    (preview?.items ?? []).map((item) => [
      `${item.variant_id ?? ""}|${item.color ?? ""}|${item.size ?? ""}`,
      item.unit_price,
    ])
  );

  const paymentOptions: PaymentOption[] = [
    { id: "cod", label: "Cash on Delivery", desc: "Pay when you receive your order" },
    {
      id: "external_wallet",
      label: walletSettings.provider_name
        ? `${walletSettings.provider_name} transfer`
        : "Mobile wallet transfer",
      desc: walletEnabled
        ? "Transfer now, then upload your receipt for verification"
        : walletLoading
          ? "Checking transfer availability…"
          : walletSettings.availability_message || "Transfer details are not configured yet",
      disabled: !walletEnabled,
    },
  ];

  useEffect(() => {
    if (!user?.email) return;
    setAddress((prev) => (prev.email ? prev : { ...prev, email: user.email ?? "" }));
  }, [user?.email]);

  // Account details are private and server-owned. The browser only receives the
  // display fields, and only after the user signs in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setWalletLoading(true);
      setWalletError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Please sign in again.");
        const res = await fetch("/api/payment-methods", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(apiErrorMessage(res.status, data, "Could not load payment methods"));
        }
        if (cancelled) return;
        setWalletSettings(
          isExternalWalletSettings(data.external_wallet)
            ? data.external_wallet
            : EMPTY_EXTERNAL_WALLET_SETTINGS
        );
      } catch (error) {
        if (cancelled) return;
        setWalletSettings(EMPTY_EXTERNAL_WALLET_SETTINGS);
        setWalletError(error instanceof Error ? error.message : "Could not load payment methods");
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, getToken]);
  // Derived from the data instead of a synchronous setState in the effect.
  const shippingLoading = step === "payment" && shippingOptions === null;
  const selectedOption =
    selectedShipping && shippingOptions
      ? shippingOptions.find((opt) => opt.method_id === selectedShipping.method_id) ?? null
      : null;

  // Fetch shipping options when the address changes
  useEffect(() => {
    if (!address.country || step !== "payment") return;
    let cancelled = false;

    // B6 — send item ids/quantities so the server can compute the real
    // package weight. The server never trusts a client-supplied weight.
    const itemsParam = encodeURIComponent(
      JSON.stringify(
        items.map((i) => ({
          product_id: i.product_id || null,
          variant_id: i.variant_id || null,
          quantity: i.quantity,
        }))
      )
    );

    fetch(
      `/api/shipping?country=${encodeURIComponent(address.country)}&subtotal=${subtotal}&items=${itemsParam}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const options: ShippingOption[] =
          data.success && Array.isArray(data.options) ? data.options : [];
        setShippingOptions(options);
        if (options.length > 0) {
          setSelectedShipping(
            (current) =>
              current ?? { method_id: options[0].method_id, fee: options[0].fee }
          );
        }
      })
      .catch(() => {
        if (!cancelled) setShippingOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [address.country, step, subtotal, items]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Login Required</h1>
          <p className="text-muted-foreground mb-4">Please log in to proceed with checkout.</p>
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

  // The cart is cleared the moment the order exists, so the empty-cart screen
  // must not take over the post-order steps.
  const cartRequired = step === "address" || step === "payment" || step === "confirm";
  if (items.length === 0 && cartRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">Cart is Empty</h1>
          <p className="text-muted-foreground mb-4">Add some products before checkout.</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };

  async function syncCartToServer(token: string) {
    const cartRes = await fetch("/api/cart", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cartData = await cartRes.json().catch(() => null);

    if (!cartRes.ok || !cartData?.success || !cartData.cart_id) {
      throw new Error(cartData?.message || "Failed to sync your cart. Please try again.");
    }

    const syncRes = await fetch("/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          price: i.price,
          color: i.color,
          size: i.size,
        })),
      }),
    });
    const syncData = await syncRes.json().catch(() => null);

    if (!syncRes.ok || !syncData?.success) {
      throw new Error(syncData?.message || "Failed to sync your cart. Please try again.");
    }

    const failedReasons = [
      ...new Set(
        (syncData.failed_items ?? []).map(
          (f: { item?: { name?: string }; reason?: string }) =>
            `${f.item?.name ?? "Item"}: ${f.reason ?? "unknown error"}`
        )
      ),
    ];
    const serverItemCount =
      typeof syncData.item_count === "number" ? syncData.item_count : null;

    if (failedReasons.length > 0 || serverItemCount === 0) {
      throw new Error(
        failedReasons.length > 0
          ? `These items could not be added to your order: ${failedReasons.join(" | ")}`
          : "Your cart is empty on the server. Please review your cart and try again."
      );
    }

    setCartId(cartData.cart_id);
    return cartData.cart_id as string;
  }

  async function fetchPreview(token: string, id: string, methodId: string | null) {
    const response = await fetch("/api/checkout/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cart_id: id,
        country: address.country,
        shipping_address: address,
        shipping_method_id: methodId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(
        apiErrorMessage(response.status, payload, "Could not calculate order totals")
      );
    }
    return payload as CheckoutPreview;
  }

  const handlePaymentSubmit = async () => {
    if (previewLoading) return;
    if (paymentMethod === "external_wallet" && !walletEnabled) {
      setMessage({
        type: "error",
        text: "Wallet transfers are not available right now. Please choose cash on delivery.",
      });
      return;
    }
    if (shippingOptions && shippingOptions.length > 0 && !selectedShipping) {
      setMessage({ type: "error", text: "Please choose a shipping method." });
      return;
    }

    setPreviewLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Please sign in again.");

      const id = await syncCartToServer(token);
      const nextPreview = await fetchPreview(
        token,
        id,
        selectedShipping?.method_id ?? null
      );
      setPreview(nextPreview);

      if (nextPreview.shipping_options?.length > 0) {
        setShippingOptions(nextPreview.shipping_options);
        const selected = nextPreview.selected_shipping_method;
        setSelectedShipping(
          selected ? { method_id: selected.method_id, fee: selected.fee } : null
        );
      }

      if (nextPreview.stock_issues.length > 0) {
        setMessage({
          type: "error",
          text: `Some items no longer have enough stock: ${nextPreview.stock_issues
            .map(
              (issue) =>
                `${issue.product_name || "Item"} (requested ${issue.requested}, available ${issue.available})`
            )
            .join(", ")}. Please update your cart before continuing.`,
        });
        return;
      }

      if (nextPreview.coupon_error) {
        setMessage({
          type: "error",
          text: `${nextPreview.coupon_error} Remove or change the coupon in your cart, then try again.`,
        });
        return;
      }

      if (nextPreview.price_changes.length > 0) {
        setMessage({
          type: "success",
          text: "Some prices changed since you added these items. The review below uses the latest server prices.",
        });
      }

      setStep("confirm");
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not calculate order totals. Please try again.",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (loading) return; // guard against a double click

    // Only two methods are available. The server validates this again, so a
    // stale tab cannot fall back to a disabled provider.
    const provider = toPaymentProvider(paymentMethod);
    if (provider !== "cod" && provider !== "external_wallet") {
      setMessage({
        type: "error",
        text: `Unsupported payment method: ${String(paymentMethod)}. Please pick another option.`,
      });
      return;
    }
    if (provider === "external_wallet" && !walletEnabled) {
      setMessage({
        type: "error",
        text: "Wallet transfers are not available right now. Please choose cash on delivery.",
      });
      return;
    }

    if (shippingOptions && shippingOptions.length > 0 && !selectedShipping) {
      setMessage({ type: "error", text: "Please choose a shipping method." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "error", text: "Please sign in again." });
        setLoading(false);
        return;
      }

      const id = cartId ?? (await syncCartToServer(token));
      let currentPreview = preview;
      if (!currentPreview) {
        currentPreview = await fetchPreview(
          token,
          id,
          selectedShipping?.method_id ?? null
        );
        setPreview(currentPreview);
      }

      if (currentPreview.stock_issues.length > 0) {
        setMessage({
          type: "error",
          text: "Some items are no longer available in the requested quantity. Please update your cart.",
        });
        setLoading(false);
        return;
      }
      if (currentPreview.coupon_error) {
        setMessage({
          type: "error",
          text: `${currentPreview.coupon_error} Remove or change the coupon in your cart, then try again.`,
        });
        setLoading(false);
        return;
      }

      const orderShipping = selectedShipping?.fee ?? currentPreview.shipping_fee ?? 0;
      const expectedTotal = computeOrderTotal({
        subtotal: currentPreview.subtotal,
        tax: currentPreview.tax,
        shipping: orderShipping,
        giftWrap: currentPreview.gift_wrap_fee,
        discount: currentPreview.discount,
      });

      // Create order via checkout RPC
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cart_id: id,
          shipping_address: address,
          customer_note: notes || null,
          shipping_fee: orderShipping,
          payment_method: provider,
          shipping_method_id: selectedShipping?.method_id || null,
        }),
      });

      const orderData = await orderRes.json().catch(() => null);

      if (!orderData?.success) {
        // The order may already exist even when the request failed: the checkout
        // RPC commits the order, then the payment RPC can still fail. The cart is
        // already converted, so the customer cannot re-checkout — send them to the
        // order page, where they can choose/resume a payment method.
        if (orderData?.order_id) {
          setOrderId(orderData.order_id);
          setOrderNumber(orderData.order_number || null);
          clearCart();
          setMessage(null);
          setSetupFailedOrder({
            id: orderData.order_id,
            number: orderData.order_number || null,
          });
          setLoading(false);
          return;
        }

        const failure = apiErrorMessage(orderRes.status, orderData, "Failed to create order");
        setMessage({ type: "error", text: failure });
        setLoading(false);
        return;
      }

      const newOrderId = orderData.order_id;
      const actualTotal = Number(orderData.total ?? expectedTotal);
      setOrderId(newOrderId);
      setOrderNumber(orderData.order_number || null);
      setAmountDue(actualTotal);
      setOrderCurrency(orderData.currency || currency);
      setFinalTotalAdjusted(Math.abs(actualTotal - expectedTotal) >= 0.01);
      clearCart();

      // A fully discounted order is already settled, so there is nothing to
      // transfer or collect. Go straight to the confirmation.
      if (orderData.free_order) {
        setFreeOrder(true);
        setMessage(null);
        setStep("success");
        return;
      }

      // External wallet: show the transfer account, then collect the receipt.
      // Uploading the receipt only creates a pending review; it never pays.
      if (provider === "external_wallet") {
        setMessage(null);
        setStep("wallet");
        return;
      }

      // Cash on delivery: the order is placed, payment is due on delivery.
      setStep("success");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Network error. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptSubmitted = () => {
    setMessage(null);
    setStep("success");
  };

  if (step === "wallet") {
    const providerName = walletSettings.provider_name || "mobile wallet";
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 w-full max-w-lg space-y-5">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 grid place-items-center mx-auto mb-3">
              <Wallet className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-extrabold">Pay with {providerName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your order is created. Transfer the amount below, then send us the receipt.
            </p>
          </div>

          {message && (
            <div
              className={`p-3 rounded-xl text-sm ${
                message.type === "success"
                  ? "text-green-400 bg-green-950/40 border border-green-500/30"
                  : "text-red-400 bg-red-950/40 border border-red-500/30"
              }`}
            >
              {message.text}
            </div>
          )}

          {walletError ? (
            <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm text-amber-100">
              <p className="font-semibold">Transfer details could not be loaded.</p>
              <p className="mt-1">{walletError}</p>
              <p className="mt-2">
                Please open the order and try again, or contact support before sending money.
              </p>
            </div>
          ) : (
            <ExternalWalletInstructions
              number={walletSettings.account_number || null}
              providerName={walletSettings.provider_name || null}
              accountName={walletSettings.account_name || null}
              instructions={walletSettings.instructions || null}
              amountLabel={formatCurrency(amountDue, orderCurrency ?? currency)}
              orderNumber={orderNumber}
              showFileSpecs
            />
          )}

          {orderId && !walletError && walletEnabled && (
            <div className="border-t border-white/10 pt-4">
              <h2 className="text-sm font-extrabold mb-1">Upload your receipt</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Uploading does not complete the payment — the order stays{" "}
                <span className="text-amber-400 font-semibold">
                  Awaiting payment verification
                </span>{" "}
                until our team confirms the transfer.
              </p>
              <ReceiptUploader
                orderId={orderId}
                onSubmitted={handleReceiptSubmitted}
                submitLabel="Submit receipt for verification"
              />
            </div>
          )}

          <div className="text-center">
            <Link href={orderId ? `/orders/${orderId}` : "/orders"} className="text-xs text-secondary hover:underline">
              I will submit the receipt later
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (setupFailedOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <div className="h-20 w-20 rounded-full bg-amber-500/20 grid place-items-center mx-auto mb-4">
            <Clock className="h-10 w-10 text-amber-400" />
          </div>
          <h1 className="text-2xl font-extrabold mb-2">Order Created</h1>
          <p className="text-muted-foreground mb-4">
            Your order was created, but we could not start the payment automatically. Open the
            order to choose how you want to pay — nothing has been charged.
          </p>
          <p className="text-sm text-secondary mb-6">
            Order:{" "}
            <span className="font-mono">
              {setupFailedOrder.number || `${setupFailedOrder.id.slice(0, 8)}...`}
            </span>
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href={`/orders/${setupFailedOrder.id}`}
              className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
            >
              Finish payment
            </Link>
            <Link
              href="/orders"
              className="px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
            >
              View Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "success") {
    const wallet = paymentMethod === "external_wallet" && !freeOrder;
    const paid = freeOrder;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <div
            className={`h-20 w-20 rounded-full grid place-items-center mx-auto mb-4 ${
              wallet ? "bg-amber-500/20" : "bg-green-500/20"
            }`}
          >
            {wallet ? (
              <Clock className="h-10 w-10 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            )}
          </div>
          <h1 className="text-3xl font-extrabold mb-2">
            {wallet ? "Receipt Submitted" : paid ? "Order Confirmed!" : "Order Placed!"}
          </h1>
          <p className="text-muted-foreground mb-4">
            {wallet
              ? "Your order is awaiting payment verification. We'll mark it as paid once our team confirms your transfer."
              : paid
              ? "Your discount covered the full amount, so there is nothing to pay. We'll send you a confirmation email shortly."
              : "Thank you for your order. Pay in cash when it arrives. We'll send you a confirmation email shortly."}
          </p>
          {orderId && (
            <p className="text-sm text-secondary mb-2">
              Order:{" "}
              <span className="font-mono">{orderNumber || `${orderId.slice(0, 8)}...`}</span>
            </p>
          )}
          {finalTotalAdjusted && (
            <p className="text-sm text-amber-300 mb-4">
              The final total was recalculated on the server to{" "}
              {formatCurrency(amountDue, orderCurrency ?? currency)}.
            </p>
          )}
          <div className="flex gap-3 justify-center flex-wrap">
            {orderId && (
              <Link
                href={`/orders/${orderId}`}
                className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
              >
                {wallet ? "Track this order" : "View Order"}
              </Link>
            )}
            <Link
              href="/orders"
              className={`px-6 py-3 rounded-2xl font-semibold transition-all ${
                orderId ? "glass hover:pink-glow" : "bg-gradient-neon text-white hover:scale-105"
              }`}
            >
              View Orders
            </Link>
            <Link
              href="/products"
              className="px-6 py-3 rounded-2xl glass font-semibold hover:pink-glow transition-all"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 pb-20">
      {/* Header */}
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          Checkout
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          <span className="text-gradient-neon">Complete</span> Your Order
        </h1>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl text-sm ${
          message.type === "success"
            ? "text-green-400 bg-green-950/40 border border-green-500/30"
            : "text-red-400 bg-red-950/40 border border-red-500/30"
        }`}>
          {message.text}
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-10 overflow-x-auto pb-2">
        {[
          { key: "address", label: "Address", icon: MapPin },
          { key: "payment", label: "Payment", icon: CreditCard },
          { key: "confirm", label: "Confirm", icon: CheckCircle2 },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (s.key === "address") setStep("address");
                if (s.key === "payment" && step !== "address") setStep("payment");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                step === s.key
                  ? "bg-gradient-neon text-white"
                  : step === "confirm" || (step === "payment" && s.key === "address")
                  ? "bg-green-500/20 text-green-400"
                  : "glass text-muted-foreground"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
            {i < 2 && <div className="w-8 h-px bg-white/20" />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Step 1: Address */}
          {step === "address" && (
            <form onSubmit={handleAddressSubmit} className="glass-strong rounded-3xl p-6 space-y-4">
              <h2 className="text-xl font-extrabold flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-accent" />
                Shipping Address
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Full Name</label>
                  <input
                    type="text"
                    value={address.full_name}
                    onChange={(e) => setAddress({ ...address, full_name: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Email (for order confirmation)</label>
                <input
                  type="email"
                  value={address.email}
                  onChange={(e) => setAddress({ ...address, email: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Address</label>
                <input
                  type="text"
                  value={address.address}
                  onChange={(e) => setAddress({ ...address, address: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  placeholder="Street address, apartment, suite, etc."
                  required
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-semibold mb-1 block">City</label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">State</label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">ZIP Code</label>
                  <input
                    type="text"
                    value={address.zip_code}
                    onChange={(e) => setAddress({ ...address, zip_code: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Country</label>
                <select
                  value={address.country}
                  onChange={(e) => setAddress({ ...address, country: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm bg-transparent"
                >
                  <option value="Egypt">Egypt</option>
                  <option value="Saudi Arabia">Saudi Arabia</option>
                  <option value="UAE">UAE</option>
                  <option value="Kuwait">Kuwait</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
              >
                Continue to Payment
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Step 2: Payment */}
          {step === "payment" && (
            <div className="glass-strong rounded-3xl p-6 space-y-4">
              <h2 className="text-xl font-extrabold flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-accent" />
                Payment Method
              </h2>

              <div className="space-y-3" role="radiogroup" aria-label="Payment method">
                {paymentOptions.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === method.id}
                    disabled={method.disabled}
                    onClick={() => !method.disabled && setPaymentMethod(method.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      method.disabled
                        ? "glass opacity-50 cursor-not-allowed"
                        : paymentMethod === method.id
                          ? "bg-gradient-neon/20 border border-secondary"
                          : "glass hover:bg-white/5"
                    }`}
                  >
                    <p className="font-semibold">{method.label}</p>
                    <p className="text-sm text-muted-foreground">{method.desc}</p>
                  </button>
                ))}
              </div>
              {walletError && (
                <p role="status" className="text-xs text-amber-300">
                  Wallet transfer details could not be loaded. Cash on delivery is still available.
                </p>
              )}

              {/* The transfer account is server-configured: show the current
                  number before the order is placed, never a hard-coded value. */}
              {paymentMethod === "external_wallet" && walletEnabled && !walletError && (
                <div data-testid="checkout-wallet-preview">
                  <p className="text-sm font-semibold mb-2">
                    Where to send the transfer
                  </p>
                  <ExternalWalletInstructions
                    number={walletSettings.account_number || null}
                    providerName={walletSettings.provider_name || null}
                    accountName={walletSettings.account_name || null}
                    instructions={walletSettings.instructions || null}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    The exact amount and order number appear after the order is created. Uploading
                    the receipt does not complete the payment — our team verifies the transfer
                    first.
                  </p>
                </div>
              )}

              {/* Shipping Options */}
              {shippingOptions && shippingOptions.length > 0 && (
                <div className="space-y-2" role="radiogroup" aria-label="Shipping method">
                  <p className="text-sm font-semibold">Shipping Method</p>
                  {shippingOptions.map((opt) => {
                    const estimate = formatDeliveryEstimate(
                      opt.min_delivery_days,
                      opt.max_delivery_days
                    );
                    const selected = selectedShipping?.method_id === opt.method_id;
                    return (
                      <button
                        key={opt.method_id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          setSelectedShipping({ method_id: opt.method_id, fee: opt.fee })
                        }
                        className={`w-full p-3 rounded-xl text-left transition-all ${
                          selected
                            ? "bg-gradient-neon/20 border border-secondary"
                            : "glass hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-sm">{opt.method_name}</p>
                          <p className="text-sm font-bold">
                            {opt.is_free || opt.fee === 0
                              ? "Free"
                              : formatCurrency(opt.fee, currency)}
                          </p>
                        </div>
                        {estimate && (
                          <p className="text-xs text-muted-foreground">Delivery in {estimate}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {shippingLoading && (
                <p className="text-xs text-muted-foreground" role="status">
                  Loading shipping options...
                </p>
              )}
              {!shippingLoading && shippingOptions && shippingOptions.length === 0 && (
                <p className="text-xs text-amber-400" role="status">
                  No shipping options for this address — shipping will be confirmed by support.
                </p>
              )}

              <div>
                <label className="text-sm font-semibold mb-1 block">Order Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any special instructions for your order..."
                  className="w-full glass rounded-xl p-4 outline-none focus:pink-glow resize-none text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("address")}
                  className="px-6 h-12 rounded-xl glass font-semibold hover:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePaymentSubmit}
                  disabled={previewLoading}
                  className="flex-1 h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {previewLoading ? "Calculating totals…" : "Review Order"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && (
            <div className="glass-strong rounded-3xl p-6 space-y-6">
              <h2 className="text-xl font-extrabold flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-accent" />
                Review Your Order
              </h2>

              {/* Items */}
              {preview && preview.price_changes.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-100">
                  Some prices changed since you added these items. The line totals and order total
                  below use the latest server prices.
                </div>
              )}
              <div className="space-y-3">
                {items.map((item) => {
                  const key = `${item.variant_id ?? ""}|${item.color ?? ""}|${item.size ?? ""}`;
                  const unitPrice = previewPriceByKey.get(key) ?? item.price;
                  return (
                    <div key={item.id} className="glass rounded-xl p-3 flex gap-3 items-center">
                      <div className="relative h-14 w-14 rounded-lg overflow-hidden shrink-0">
                        <SafeImage src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity}
                          {item.color && ` · ${item.color}`}
                          {item.size && ` · ${item.size}`}
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        {formatCurrency(unitPrice * item.quantity, currency)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Address */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Shipping to:</p>
                <p className="font-semibold">{address.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {address.address}, {address.city}, {address.state} {address.zip_code}
                </p>
                <p className="text-sm text-muted-foreground">{address.country}</p>
              </div>

              {/* Payment */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Payment:</p>
                <p className="font-semibold" data-testid="confirm-payment-method">
                  {paymentMethod === "external_wallet"
                    ? `${walletSettings.provider_name || "Mobile wallet"} transfer (receipt verification)`
                    : PAYMENT_PROVIDER_LABELS[paymentMethod]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentMethod === "external_wallet"
                    ? "Your order is created now and stays unpaid until our team verifies your transfer."
                    : "You'll pay in cash when the order arrives."}
                </p>
              </div>

              {/* Delivery */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Delivery:</p>
                <p className="font-semibold">
                  {selectedOption
                    ? selectedOption.method_name
                    : shippingOptions === null
                      ? "Loading…"
                      : "Standard delivery"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDeliveryEstimate(
                    selectedOption?.min_delivery_days,
                    selectedOption?.max_delivery_days
                  )
                    ? `Estimated delivery in ${formatDeliveryEstimate(
                        selectedOption?.min_delivery_days,
                        selectedOption?.max_delivery_days
                      )}`
                    : "Estimated delivery confirmed at checkout"}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("payment")}
                  className="px-6 h-12 rounded-xl glass font-semibold hover:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={loading}
                  className="flex-1 h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {paymentMethod === "external_wallet" ? (
                        <Wallet className="h-5 w-5" />
                      ) : (
                        <Truck className="h-5 w-5" />
                      )}
                      {paymentMethod === "external_wallet"
                        ? `Continue to ${walletSettings.provider_name || "wallet"} · ${formatCurrency(total, currency)}`
                        : `Place Order · ${formatCurrency(total, currency)}`}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="glass-strong rounded-3xl p-6 h-fit sticky top-28 space-y-4">
            <h3 className="text-lg font-extrabold">Order Summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Items ({preview?.item_count ?? getCount()})
                </span>
                <span className="font-semibold">{formatCurrency(subtotal, currency)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Discount{preview?.coupon?.code ? ` · ${preview.coupon.code}` : ""}
                  </span>
                  <span className="font-semibold text-emerald-300">
                    −{formatCurrency(discount, currency)}
                  </span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-semibold">{formatCurrency(tax, currency)}</span>
                </div>
              )}
              {giftWrap > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Gift wrap{preview?.gift_wrap_item_count ? ` (${preview.gift_wrap_item_count})` : ""}
                  </span>
                  <span className="font-semibold">{formatCurrency(giftWrap, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Shipping{selectedOption ? ` · ${selectedOption.method_name}` : ""}
                </span>
                <span className={`font-semibold ${shipping === 0 ? "text-green-400" : ""}`}>
                  {shipping === 0 ? "Free" : formatCurrency(shipping, currency)}
                </span>
              </div>
              {selectedOption &&
                formatDeliveryEstimate(
                  selectedOption.min_delivery_days,
                  selectedOption.max_delivery_days
                ) && (
                  <p className="text-xs text-muted-foreground">
                    Delivery in{" "}
                    {formatDeliveryEstimate(
                      selectedOption.min_delivery_days,
                      selectedOption.max_delivery_days
                    )}
                  </p>
                )}
              {previewLoading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" /> Recalculating on the server…
                </p>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-extrabold text-lg text-gradient-gold">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
