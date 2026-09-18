"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Tag,
  Sparkles,
  Loader2,
  Package,
} from "lucide-react";
import { useCartStore, type CartItem } from "../stores/cartStore";
import { useAuth } from "../lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

function CartItemRow({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: CartItem;
  onRemove: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="glass-strong rounded-3xl p-4 md:p-5 flex gap-4 items-center group hover:pink-glow transition-all animate-fade-in-up">
      {/* Product Image */}
      <div className="relative h-24 w-24 md:h-28 md:w-28 rounded-2xl overflow-hidden shrink-0 bg-white/5">
        {!imageError ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="112px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground">
            <Package className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-base md:text-lg truncate">{item.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.color && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full glass">
              <span
                className="h-3 w-3 rounded-full border border-white/20"
                style={{ background: item.color.startsWith("#") ? item.color : undefined }}
              />
              {item.color}
            </span>
          )}
          {item.size && (
            <span className="text-xs px-2 py-0.5 rounded-full glass">
              {item.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-lg md:text-xl font-extrabold text-gradient-gold">
            {formatCurrency(item.price)}
          </p>
          {item.quantity > 1 && (
            <p className="text-xs text-muted-foreground">
              = {formatCurrency(item.price * item.quantity)}
            </p>
          )}
        </div>
      </div>

      {/* Quantity Controls */}
      <div className="flex flex-col items-center gap-2">
        <div className="glass rounded-xl flex items-center h-10 px-1">
          <button
            onClick={() => onUpdateQty(item.id, item.quantity - 1)}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Decrease"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-8 text-center font-bold text-sm select-none">
            {item.quantity}
          </span>
          <button
            onClick={() => onUpdateQty(item.id, item.quantity + 1)}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Increase"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <button
          onClick={() => onRemove(item.id)}
          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition-all"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="relative mb-6">
        <div className="h-32 w-32 rounded-full glass-strong grid place-items-center animate-pulse-glow">
          <ShoppingBag className="h-14 w-14 text-muted-foreground" />
        </div>
        <div className="absolute -top-2 -right-2 h-10 w-10 rounded-full bg-gradient-neon grid place-items-center animate-float-y">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
      </div>
      <h1 className="text-3xl md:text-4xl font-extrabold mb-3">
        سلة <span className="text-gradient-neon">فارغة</span>
      </h1>
      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
        لم تقم بإضافة أي منتجات بعد. تصفح متجرنا واكتشف منتجاتنا المميزة من
        الملابس، الأكواب، الملصقات والمزيد.
      </p>
      <Link
        href="/products"
        className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-neon text-white font-bold text-lg hover:scale-105 transition-transform pink-glow"
      >
        <ShoppingBag className="h-5 w-5" />
        تصفح المنتجات
        <ArrowRight className="h-5 w-5 rotate-180" />
      </Link>
    </div>
  );
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, getTotal, getCount, syncing } =
    useCartStore();
  const { user, getToken } = useAuth();
  const router = useRouter();
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState("");

  if (items.length === 0) {
    return <EmptyCart />;
  }

  const subtotal = getTotal();
  const shipping = subtotal > 500 ? 0 : 49;
  const total = subtotal + shipping - discount;

  const handleCheckout = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push("/checkout");
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim() || !user) return;
    setPromoError("");
    try {
      const token = await getToken();
      if (!token) return;

      const cartRes = await fetch("/api/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const cartData = await cartRes.json();
      if (!cartData.success || !cartData.cart_id) return;

      const res = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "apply_coupon", cart_id: cartData.cart_id, code: promoCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setPromoApplied(true);
        setDiscount(data.discount_amount || 0);
      } else {
        setPromoError(data.message || "Invalid coupon code");
      }
    } catch {
      setPromoError("Failed to apply coupon");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 pb-20">
      {/* Page Header */}
      <div className="mb-10 text-center md:text-right">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          <ShoppingBag className="h-4 w-4" />
          Shopping Cart
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          سلة <span className="text-gradient-neon">المشتريات</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          {getCount()} منتج في سلتك
          {syncing && (
            <span className="mr-2 inline-flex items-center gap-1 text-xs text-secondary">
              <Loader2 className="h-3 w-3 animate-spin" />
              جاري المزامنة...
            </span>
          )}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onRemove={removeItem}
              onUpdateQty={updateQuantity}
            />
          ))}

          {/* Clear Cart */}
          <div className="flex justify-between items-center pt-4">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              متابعة التسوق
            </Link>
            <button
              onClick={clearCart}
              className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 px-4 py-2 rounded-xl transition-all"
            >
              <Trash2 className="h-4 w-4" />
              تفريغ السلة
            </button>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="glass-strong rounded-3xl p-6 md:p-8 h-fit sticky top-28 space-y-6">
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <Tag className="h-5 w-5 text-accent" />
              ملخص الطلب
            </h2>

            {/* Promo Code */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">كود الخصم</p>
              <div className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="GALAXY10"
                  className="flex-1 h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  disabled={promoApplied}
                />
                <button
                  onClick={handleApplyPromo}
                  disabled={promoApplied || !promoCode.trim()}
                  className={`px-4 h-11 rounded-xl font-semibold text-sm transition-all ${
                    promoApplied
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "glass hover:text-foreground"
                  }`}
                >
                  {promoApplied ? "تم" : "تطبيق"}
                </button>
              </div>
              {promoApplied && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  تم تطبيق الكوبون - وفرت {formatCurrency(discount)}
                </p>
              )}
              {promoError && (
                <p className="text-xs text-red-400">{promoError}</p>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  المنتجات ({getCount()})
                </span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الشحن</span>
                <span
                  className={`font-semibold ${
                    shipping === 0 ? "text-green-400" : ""
                  }`}
                >
                  {shipping === 0 ? "مجاني" : formatCurrency(shipping)}
                </span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-muted-foreground">
                  الشحن مجاني للطلبات فوق {formatCurrency(500)}
                </p>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>الخصم</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-3 flex justify-between">
                <span className="font-bold text-lg">المجموع</span>
                <span className="font-extrabold text-2xl text-gradient-gold">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              className="w-full h-14 rounded-2xl bg-gradient-neon text-white font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform pink-glow"
            >
              <ShoppingBag className="h-5 w-5" />
              {user ? "إتمام الشراء" : "تسجيل الدخول للشراء"}
            </button>

            {!user && (
              <Link
                href="/login"
                className="block text-center text-sm text-secondary hover:text-secondary/80 transition-colors"
              >
                تسجيل الدخول أولاً للمتابعة
              </Link>
            )}

            {/* Trust Badges */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="glass rounded-xl p-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-accent shrink-0" />
                <p className="text-[11px] text-muted-foreground">شحن سريع</p>
              </div>
              <div className="glass rounded-xl p-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
                <p className="text-[11px] text-muted-foreground">دفع آمن</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
