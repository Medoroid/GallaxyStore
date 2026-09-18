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
  Package,
  Truck,
} from "lucide-react";
import { useCartStore } from "../stores/cartStore";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

type ShippingAddress = {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
};

export default function CheckoutPage() {
  const { user, getToken } = useAuth();
  const { items, getTotal, getCount, clearCart } = useCartStore();
  const [step, setStep] = useState<"address" | "payment" | "confirm" | "success">("address");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
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

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");

  const [shippingOptions, setShippingOptions] = useState<Array<{ method_id: string; method_name: string; fee: number; is_free: boolean }>>([]);
  const [selectedShipping, setSelectedShipping] = useState<{ method_id: string; fee: number } | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  const subtotal = getTotal();
  const shipping = selectedShipping?.fee ?? (subtotal > 500 ? 0 : 49);
  const total = subtotal + shipping;

  // Fetch shipping options when address changes
  useEffect(() => {
    if (!address.country || step !== "payment") return;
    setShippingLoading(true);
    fetch(`/api/shipping?country=${encodeURIComponent(address.country)}&subtotal=${subtotal}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.options) {
          setShippingOptions(data.options);
          if (data.options.length > 0 && !selectedShipping) {
            setSelectedShipping({ method_id: data.options[0].method_id, fee: data.options[0].fee });
          }
        }
      })
      .catch(() => {})
      .finally(() => setShippingLoading(false));
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

  if (items.length === 0 && step !== "success") {
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
      await fetch("/api/cart", {
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
          payment_method: paymentMethod,
        }),
      });

      const orderData = await orderRes.json();

      if (!orderData.success) {
        setMessage({ type: "error", text: orderData.message || "Failed to create order" });
        setLoading(false);
        return;
      }

      const newOrderId = orderData.order_id;

      // If card payment, redirect to Stripe
      if (paymentMethod === "card") {
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

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <div className="h-20 w-20 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-extrabold mb-2">Order Placed!</h1>
          <p className="text-muted-foreground mb-4">
            Thank you for your order. We&apos;ll send you a confirmation email shortly.
          </p>
          {orderId && (
            <p className="text-sm text-secondary mb-6">
              Order ID: <span className="font-mono">{orderId.slice(0, 8)}...</span>
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Link
              href="/orders"
              className="px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
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

              <div className="space-y-3">
                {[
                  { id: "cod", label: "Cash on Delivery", desc: "Pay when you receive your order" },
                  { id: "card", label: "Credit/Debit Card", desc: "Pay securely online via Stripe" },
                ].map((method) => (
                  <button
                    key={method.id}
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
              {shippingOptions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Shipping Method</p>
                  {shippingOptions.map((opt) => (
                    <button
                      key={opt.method_id}
                      onClick={() => setSelectedShipping({ method_id: opt.method_id, fee: opt.fee })}
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        selectedShipping?.method_id === opt.method_id
                          ? "bg-gradient-neon/20 border border-secondary"
                          : "glass hover:bg-white/5"
                      }`}
                    >
                      <p className="font-semibold text-sm">{opt.method_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {opt.is_free ? "Free" : formatCurrency(opt.fee)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {shippingLoading && (
                <p className="text-xs text-muted-foreground">Loading shipping options...</p>
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
                <p className="font-semibold">
                  {paymentMethod === "card" ? "Credit/Debit Card (Stripe)" : "Cash on Delivery"}
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
                      {paymentMethod === "card" ? <CreditCard className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                      {paymentMethod === "card" ? `Pay with Card · ${formatCurrency(total)}` : `Place Order · ${formatCurrency(total)}`}
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
                <span className="text-muted-foreground">Shipping</span>
                <span className={`font-semibold ${shipping === 0 ? "text-green-400" : ""}`}>
                  {shipping === 0 ? "Free" : formatCurrency(shipping)}
                </span>
              </div>
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
