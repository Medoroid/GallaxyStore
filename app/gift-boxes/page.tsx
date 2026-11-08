"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Loader2, AlertTriangle, PackageOpen, RefreshCw, LogIn, ShoppingBag } from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { toProductCardProduct, type SupabaseProduct } from "@/lib/products";
import { useAuth } from "../lib/auth-context";

type SearchProduct = {
  id?: string | number;
  name?: string;
  price?: number;
  currency?: string;
  published?: boolean;
};

type RequestSubmission = { request_number: string; status: string; created_at: string };

const OCCASIONS = [
  { value: "birthday", label: "Birthday" },
  { value: "wedding", label: "Wedding" },
  { value: "graduation", label: "Graduation" },
  { value: "anniversary", label: "Anniversary" },
  { value: "holiday", label: "Holiday" },
  { value: "other", label: "Other" },
];

export default function GiftBoxes() {
  const { user, getToken } = useAuth();

  // ---- Real gift-worthy products (live store data, no hardcoded prices) ----
  const [picks, setPicks] = useState<SearchProduct[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [picksError, setPicksError] = useState("");

  // All state updates happen inside the promise callbacks (never synchronously
  // in the effect body). The first load reuses the initial loading=true state.
  const fetchPicks = () => {
    fetch("/api/search?page_size=8&sort=popularity")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setPicksError(data?.message || "Could not load products.");
          setPicks([]);
          return;
        }
        const rows: SearchProduct[] = data.products ?? [];
        // Never render/add a product without a real identifier from the database.
        setPicks(rows.filter((p) => p.id != null && p.id !== ""));
        setPicksError("");
      })
      .catch(() => setPicksError("Network error while loading products."))
      .finally(() => setPicksLoading(false));
  };

  useEffect(() => {
    fetchPicks();
  }, []);

  // ---- Custom gift box request (real API — no simulated success) ----
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [submission, setSubmission] = useState<RequestSubmission | null>(null);
  const [form, setForm] = useState({
    occasion: "",
    budget: "",
    message: "",
    name: "",
    email: "",
  });

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Server enforces the same rule (401) — fail fast with a clear message.
    if (!user) {
      setFormError("Please sign in to send this request. Your details stay on this page.");
      return;
    }

    setFormLoading(true);
    try {
      const token = await getToken().catch(() => null);
      const res = await fetch("/api/gift-box", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          occasion: form.occasion,
          budget: form.budget === "" ? undefined : Number(form.budget),
          message: form.message,
          name: form.name,
          email: form.email,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        setFormError("Please sign in to send this request. Your details stay on this page.");
        return;
      }
      if (!res.ok || !data?.success) {
        // Real failure — show the server's reason. NEVER fake a success.
        setFormError(data?.message || "Could not submit your request. Please try again.");
        return;
      }
      setSubmission(data.request);
    } catch {
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="glass-strong rounded-3xl p-8 md:p-12 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Curated</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Themed <span className="text-gradient-neon">Gift Boxes</span>
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Pick real products from the store to gift as-is, or ask us to curate a fully
          custom box for any occasion.
        </p>
      </header>

      {/* ---------------- Real products from the store ---------------- */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold inline-flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-accent" /> Gift-worthy picks
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Live products with real prices — add any of them to your cart.
            </p>
          </div>
          {!picksLoading && !picksError && picks.length > 0 && (
            <Link
              href="/products"
              className="text-sm font-semibold text-secondary hover:text-white transition-colors shrink-0"
            >
              View all →
            </Link>
          )}
        </div>

        {picksLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass rounded-3xl p-4 animate-pulse">
                <div className="aspect-[4/3] rounded-2xl bg-background/40" />
                <div className="h-4 w-3/4 rounded bg-background/40 mt-4" />
                <div className="h-4 w-1/2 rounded bg-background/40 mt-2" />
                <div className="h-9 w-full rounded-xl bg-background/40 mt-4" />
              </div>
            ))}
          </div>
        ) : picksError ? (
          <div className="glass rounded-3xl p-8 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-yellow-400" />
            <p className="text-muted-foreground mt-3">{picksError}</p>
            <button
              onClick={() => {
                setPicksLoading(true);
                fetchPicks();
              }}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl glass font-semibold hover:pink-glow transition-all text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : picks.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center">
            <PackageOpen className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-3">
              No products are available right now. Please check back soon.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {picks.map((product) => (
              <ProductCard
                key={String(product.id)}
                product={toProductCardProduct(product as unknown as SupabaseProduct)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Custom Box Request (real API) ---------------- */}
      <section className="mt-16 glass-strong rounded-3xl p-8 md:p-12 text-center">
        <Sparkles className="h-8 w-8 mx-auto text-accent" />
        <h2 className="text-2xl md:text-3xl font-extrabold mt-3">Need a fully custom box?</h2>
        <p className="text-muted-foreground mt-2">Tell us the vibe and budget — we&apos;ll curate it.</p>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold animate-pulse-glow"
          >
            Request Custom Box
          </button>
        ) : submission ? (
          <div className="mt-6 glass rounded-2xl p-6 max-w-md mx-auto">
            <div className="h-12 w-12 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-3">
              <Send className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="font-extrabold text-lg">Request received!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We&apos;ll get back to you within 24 hours.
            </p>
            <div className="glass rounded-xl p-3 mt-4 text-left">
              <p className="text-xs text-muted-foreground">Request number</p>
              <p className="font-mono font-bold text-secondary">{submission.request_number}</p>
            </div>
          </div>
        ) : (
          <>
            {!user && (
              <div
                role="status"
                className="mt-5 mx-auto max-w-md flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-left"
              >
                <LogIn className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200">
                  You need to sign in to send this request. You can fill everything in now —
                  sign in when you&apos;re ready to submit.{" "}
                  <Link href="/login" className="font-semibold underline text-yellow-100">
                    Sign in
                  </Link>
                </p>
              </div>
            )}

            <form onSubmit={handleCustomSubmit} className="mt-6 glass rounded-2xl p-6 max-w-md mx-auto text-left space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-300">{formError}</p>
                </div>
              )}
              <div>
                <label htmlFor="gift-occasion" className="text-sm font-semibold mb-1 block">
                  Occasion
                </label>
                <select
                  id="gift-occasion"
                  value={form.occasion}
                  onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm bg-transparent"
                  required
                >
                  <option value="" className="bg-black">Select occasion...</option>
                  {OCCASIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-black">
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gift-budget" className="text-sm font-semibold mb-1 block">
                  Budget (USD)
                </label>
                <input
                  id="gift-budget"
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  placeholder="e.g. 75"
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  min={20}
                  required
                />
              </div>
              <div>
                <label htmlFor="gift-message" className="text-sm font-semibold mb-1 block">
                  Tell us what you want
                </label>
                <textarea
                  id="gift-message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3}
                  placeholder="Themes, colors, items you'd like included..."
                  className="w-full glass rounded-xl p-4 outline-none focus:pink-glow resize-none text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="gift-name" className="text-sm font-semibold mb-1 block">
                    Your Name
                  </label>
                  <input
                    id="gift-name"
                    name="gift-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="gift-email" className="text-sm font-semibold mb-1 block">
                    Email
                  </label>
                  <input
                    id="gift-email"
                    name="gift-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={formLoading}
                className="w-full h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
              >
                {formLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : !user ? (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign in to send
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Request
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
