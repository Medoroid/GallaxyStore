"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { ReceiptUploader } from "@/app/components/payment/ReceiptUploader";
import { VodafoneInstructions } from "@/app/components/payment/VodafoneInstructions";
import { apiErrorMessage } from "@/app/lib/api-error-message";
import {
  formatDeliveryEstimate,
  PAYMENT_PROVIDER_LABELS,
  rememberVodafoneOrder,
  resolveWalletNumber,
  toPaymentProvider,
  type PaymentProvider,
} from "@/app/lib/payment-status";

const WALLET = resolveWalletNumber();

type ShippingAddress = {
  full_name: string;
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
  fee: number;
  is_free: boolean;
  min_delivery_days?: number | null;
  max_delivery_days?: number | null;
};

const PAYMENT_OPTIONS: { id: PaymentProvider; label: string; desc: string }[] = [
  { id: "cod", label: "Cash on Delivery", desc: "Pay when you receive your order" },
  {
    id: "stripe",
    label: "Credit/Debit Card",
    desc: "Pay securely online via Stripe",
  },
  {
    id: "vodafone_cash",
    label: "Vodafone Cash",
    desc: "Transfer now, then upload your receipt for verification",
  },
];

export default function CheckoutPage() {
  const { user, getToken } = useAuth();
  const { items, getTotal, getCount, clearCart } = useCartStore();
  const [step, setStep] = useState<"address" | "payment" | "confirm" | "vodafone" | "success">("address");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [amountDue, setAmountDue] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [address, setAddress] = useState<ShippingAddress>({
    full_name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "Egypt",
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentProvider>("cod");
  const [notes, setNotes] = useState("");

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<{
    method_id: string;
    fee: number;
  } | null>(null);

  const subtotal = getTotal();
  const shipping = selectedShipping?.fee ?? (subtotal > 500 ? 0 : 49);
  const total = subtotal + shipping;
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

    fetch(`/api/shipping?country=${encodeURIComponent(address.country)}&subtotal=${subtotal}`)
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
  }, [address.country, step, subtotal]);

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

  const handlePaymentSubmit = () => {
    setStep("confirm");
  };

  const handlePlaceOrder = async () => {
    if (loading) return; // guard against a double click

    // Reject unknown providers instead of silently falling back to COD.
    const provider = toPaymentProvider(paymentMethod);
    if (!provider) {
      setMessage({
        type: "error",
        text: `Unsupported payment method: ${String(paymentMethod)}. Please pick another option.`,
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

      // First, get or create the Supabase cart and sync items
      const cartRes = await fetch("/api/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const cartData = await cartRes.json();

      if (!cartData.success || !cartData.cart_id) {
        setMessage({ type: "error", text: "Failed to sync cart. Please try again." });
        setLoading(false);
        return;
      }

      // Push current cart items to server before checkout
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
        setMessage({
          type: "error",
          text: syncData?.message || "Failed to sync your cart. Please try again.",
        });
        setLoading(false);
        return;
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
        setMessage({
          type: "error",
          text:
            failedReasons.length > 0
              ? `These items could not be added to your order: ${failedReasons.join(" | ")}`
              : "Your cart is empty on the server. Please review your cart and try again.",
        });
        setLoading(false);
        return;
      }

      // Create order via checkout RPC
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cart_id: cartData.cart_id,
          shipping_address: address,
          customer_note: notes || null,
          shipping_fee: shipping,
          payment_method: provider,
          shipping_method_id: selectedShipping?.method_id || null,
        }),
      });

      const orderData = await orderRes.json().catch(() => null);

      if (!orderData?.success) {
        setMessage({
          type: "error",
          text: apiErrorMessage(orderRes.status, orderData, "Failed to create order"),
        });
        setLoading(false);
        return;
      }

      const newOrderId = orderData.order_id;

      // Vodafone Cash: show the wallet number, then collect the transfer receipt
      if (provider === "vodafone_cash") {
        rememberVodafoneOrder(newOrderId);
        setOrderId(newOrderId);
        setOrderNumber(orderData.order_number || null);
        setAmountDue(orderData.total ?? total);
        setMessage(null);
        clearCart();
        setStep("vodafone");
        return;
      }

      // If card payment, redirect to Stripe
      if (provider === "stripe") {
        const checkoutRes = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            order_id: newOrderId,
            order_number: orderData.order_number,
            items: items.map((i) => ({
              name: i.name,
              price: i.price,
              image: i.image,
              quantity: i.quantity,
            })),
            total: orderData.total,
            currency: "USD",
          }),
        });

        const checkoutData = await checkoutRes.json();

        if (checkoutData.success && checkoutData.url) {
          clearCart();
          window.location.href = checkoutData.url;
          return;
        } else {
          setMessage({ type: "error", text: checkoutData.message || "Failed to create payment session" });
          setLoading(false);
          return;
        }
      }

      // COD or wallet - complete directly
      setOrderId(newOrderId);
      clearCart();
      setStep("success");
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptSubmitted = () => {
    setMessage(null);
    setStep("success");
  };

  if (step === "vodafone") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 w-full max-w-lg space-y-5">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 grid place-items-center mx-auto mb-3">
              <Wallet className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-extrabold">Pay with Vodafone Cash</h1>
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

          <VodafoneInstructions
            number={WALLET.number}
            amountLabel={formatCurrency(amountDue)}
            orderNumber={orderNumber}
            showFileSpecs
          />

          {orderId && (
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
            <Link
              href={orderId ? `/orders/${orderId}?pay=vodafone_cash` : "/orders"}
              onClick={() => orderId && rememberVodafoneOrder(orderId)}
              className="text-xs text-secondary hover:underline"
            >
              I will submit the receipt later
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "success") {
    const vodafone = paymentMethod === "vodafone_cash";
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <div
            className={`h-20 w-20 rounded-full grid place-items-center mx-auto mb-4 ${
              vodafone ? "bg-amber-500/20" : "bg-green-500/20"
            }`}
          >
            {vodafone ? (
              <Clock className="h-10 w-10 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            )}
          </div>
          <h1 className="text-3xl font-extrabold mb-2">
            {vodafone ? "Receipt Submitted" : "Order Placed!"}
          </h1>
          <p className="text-muted-foreground mb-4">
            {vodafone
              ? "Your order is awaiting payment verification. We'll mark it as paid once our team confirms your transfer."
              : "Thank you for your order. We'll send you a confirmation email shortly."}
          </p>
          {orderId && (
            <p className="text-sm text-secondary mb-6">
              Order:{" "}
              <span className="font-mono">{orderNumber || `${orderId.slice(0, 8)}...`}</span>
            </p>
          )}
          <div className="flex gap-3 justify-center flex-wrap">
            {orderId && (
              <Link
                href={`/orders/${orderId}${vodafone ? "?pay=vodafone_cash" : ""}`}
                onClick={() => vodafone && rememberVodafoneOrder(orderId)}
                className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
              >
                {vodafone ? "Track this order" : "View Order"}
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
                {PAYMENT_OPTIONS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      paymentMethod === method.id
                        ? "bg-gradient-neon/20 border border-secondary"
                        : "glass hover:bg-white/5"
                    }`}
                  >
                    <p className="font-semibold">{method.label}</p>
                    <p className="text-sm text-muted-foreground">{method.desc}</p>
                  </button>
                ))}
              </div>

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
                              : formatCurrency(opt.fee)}
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
                  className="flex-1 h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                >
                  Review Order
                  <ArrowRight className="h-4 w-4" />
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
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="glass rounded-xl p-3 flex gap-3 items-center">
                    <div className="relative h-14 w-14 rounded-lg overflow-hidden shrink-0">
                      <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity}
                        {item.color && ` · ${item.color}`}
                        {item.size && ` · ${item.size}`}
                      </p>
                    </div>
                    <p className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                ))}
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
                  {paymentMethod === "vodafone_cash"
                    ? "Vodafone Cash (transfer + receipt verification)"
                    : PAYMENT_PROVIDER_LABELS[paymentMethod]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {paymentMethod === "vodafone_cash"
                    ? "Your order is created now and stays unpaid until our team verifies your transfer."
                    : paymentMethod === "stripe"
                      ? "You'll be redirected to a secure card payment page."
                      : paymentMethod === "cod"
                        ? "You'll pay in cash when the order arrives."
                        : "Payment will be collected with your wallet balance."}
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
                      {paymentMethod === "stripe" ? (
                        <CreditCard className="h-5 w-5" />
                      ) : paymentMethod === "vodafone_cash" ? (
                        <Wallet className="h-5 w-5" />
                      ) : (
                        <Truck className="h-5 w-5" />
                      )}
                      {paymentMethod === "stripe"
                        ? `Pay with Card · ${formatCurrency(total)}`
                        : paymentMethod === "vodafone_cash"
                          ? `Continue to Vodafone Cash · ${formatCurrency(total)}`
                          : `Place Order · ${formatCurrency(total)}`}
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
                <span className="text-muted-foreground">Items ({getCount()})</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Shipping{selectedOption ? ` · ${selectedOption.method_name}` : ""}
                </span>
                <span className={`font-semibold ${shipping === 0 ? "text-green-400" : ""}`}>
                  {shipping === 0 ? "Free" : formatCurrency(shipping)}
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
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-extrabold text-lg text-gradient-gold">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
