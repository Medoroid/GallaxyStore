"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ImagePlus,
  Type,
  Sparkles,
  Send,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";

const productTypes = [
  {
    id: "tshirt",
    name: "T-Shirt",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
    from: 29.99,
  },
  {
    id: "mug",
    name: "Mug",
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d",
    from: 19.99,
  },
  {
    id: "phonecase",
    name: "Phone Case",
    image: "https://images.unsplash.com/photo-1541560052-5e137f229371",
    from: 24.99,
  },
  {
    id: "poster",
    name: "Poster",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f",
    from: 34.99,
  },
] as const;

const sizes = ["S", "M", "L", "XL", "XXL"];
const colors = [
  { name: "Black", value: "#0a0011" },
  { name: "Neon Purple", value: "#8A2BE2" },
  { name: "Pink", value: "#FF4FD8" },
  { name: "Gold", value: "#FFD166" },
  { name: "White", value: "#ffffff" },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Submission = { request_number: string; status: string; created_at: string };

export default function CustomPrint() {
  const { user, getToken } = useAuth();
  const [product, setProduct] = useState<(typeof productTypes)[number]>(productTypes[0]);
  const [text, setText] = useState("");
  const [size, setSize] = useState("M");
  const [color, setColor] = useState(colors[1]);
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(user?.user_metadata?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);

  const onFile = (selected: File | null) => {
    setError("");
    if (!selected) {
      setFile(null);
      setPreview("");
      return;
    }
    if (!/^(image\/(jpeg|jpg|png|webp|gif|avif)|application\/pdf)$/.test(selected.type)) {
      setError("Use a JPG, PNG, WebP, GIF, AVIF or PDF file.");
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setError("The design file must be 10MB or smaller.");
      return;
    }
    setFile(selected);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(selected.type === "application/pdf" ? "" : URL.createObjectURL(selected));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // C4/C3 — the API requires sign-in (401 before validation). Fail fast so
    // a guest who skipped the banner never uploads a file that would 401;
    // their filled form stays on the page.
    const token = await getToken().catch(() => null);
    if (!token) {
      setError(
        "Please sign in to submit your print request — your details stay filled on this page."
      );
      return;
    }

    if (!name.trim() || !email.trim()) {
      setError("Your name and email are required so we can send the quote.");
      return;
    }
    if (!file) {
      setError("Upload your design before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("customer_name", name.trim());
      form.append("customer_email", email.trim());
      form.append("customer_phone", phone.trim());
      form.append("product_type", product.id);
      form.append("size", product.id === "tshirt" ? size : "");
      form.append("color", color.name);
      form.append("custom_text", text.trim());
      form.append("notes", notes.trim());
      form.append("design", file);

      const res = await fetch("/api/custom-print", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not submit your request. Please try again.");
        return;
      }

      setSubmission(data.request);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setFile(null);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submission) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-24 pb-20">
        <div className="glass-strong rounded-3xl p-8 md:p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-500/15 grid place-items-center">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold mt-5">Request received</h1>
          <p className="text-muted-foreground mt-3">
            Our print team will review your artwork and contact you at{" "}
            <strong className="text-foreground">{email}</strong> with a quote.
          </p>
          <div className="glass rounded-2xl p-4 mt-6 text-left">
            <p className="text-xs text-muted-foreground">Request number</p>
            <p className="font-mono font-bold text-lg text-secondary">
              {submission.request_number}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Save this number. A request is not a paid order until a quote is accepted.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link
              href="/products"
              className="flex-1 h-12 rounded-xl bg-gradient-neon text-white font-bold grid place-items-center"
            >
              Continue shopping
            </Link>
            <Link
              href="/contact"
              className="flex-1 h-12 rounded-xl glass font-semibold grid place-items-center"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="text-center max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Studio</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Custom <span className="text-gradient-neon">Print</span> Studio
        </h1>
        <p className="text-muted-foreground mt-3">
          Upload your artwork and tell us what you want. We review every design and send you a
          quote before anything is charged.
        </p>
      </header>

      {!user && (
        <div className="mt-8 mx-auto max-w-3xl glass rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">
            <strong className="text-amber-400">Guest sign-in required — </strong>
            print requests are tied to your account so we can email the quote and
            keep it trackable. Your details stay filled on this page while you
            sign in.
          </p>
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-xl bg-gradient-neon text-white text-sm font-bold whitespace-nowrap text-center"
          >
            Sign In
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-10 grid lg:grid-cols-5 gap-6">
        {/* Preview */}
        <div className="lg:col-span-3">
          <div className="glass-strong rounded-3xl p-6 lg:sticky lg:top-28">
            <div
              className="relative aspect-square rounded-2xl overflow-hidden bg-background/60"
              style={{ boxShadow: `inset 0 0 60px ${color.value}33` }}
            >
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover opacity-90"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="relative h-1/2 w-1/2 grid place-items-center text-center p-4 rounded-2xl"
                  style={{ background: color.value === "#0a0011" ? "transparent" : `${color.value}22` }}
                >
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt="Your uploaded design preview"
                      className="absolute inset-0 h-full w-full object-contain mix-blend-screen opacity-90"
                    />
                  )}
                  {text && (
                    <span className="relative font-extrabold text-2xl md:text-4xl tracking-wider drop-shadow-[0_0_18px_rgba(255,79,216,0.8)] text-white">
                      {text}
                    </span>
                  )}
                </div>
              </div>
              <div className="absolute top-3 left-3 glass px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" /> Preview
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="font-semibold">
                  {product.name} · {color.name}
                  {product.id === "tshirt" ? ` · ${size}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Starting at</p>
                <p className="text-2xl font-extrabold text-gradient-gold">
                  {formatCurrency(product.from)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Final price depends on artwork, material and quantity. You will receive a quote
              before production.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="lg:col-span-2 space-y-5">
          <Panel title="1. Choose Product">
            <div className="grid grid-cols-2 gap-3">
              {productTypes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setProduct(item)}
                  className={`group glass rounded-2xl p-2 text-left transition-all ${
                    product.id === item.id ? "pink-glow ring-1 ring-secondary" : "hover:pink-glow"
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl mb-2">
                    <Image src={item.image} alt={item.name} fill sizes="50vw" className="object-cover" />
                  </div>
                  <p className="text-sm font-semibold px-1 pb-1">{item.name}</p>
                  <p className="text-xs text-secondary px-1">from {formatCurrency(item.from)}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2. Upload Design">
            <label className="block glass rounded-2xl border border-dashed border-secondary/40 p-6 text-center cursor-pointer hover:pink-glow transition-all">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <ImagePlus className="h-6 w-6 mx-auto mb-2 text-secondary" />
              <p className="text-sm font-medium">
                {file ? file.name : "Click to upload your artwork"}
              </p>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF, AVIF or PDF · max 10MB</p>
            </label>
          </Panel>

          <Panel title="3. Custom Text (optional)">
            <div className="relative">
              <Type className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="YOUR TEXT"
                className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow"
              />
            </div>
          </Panel>

          {product.id === "tshirt" && (
            <Panel title="4. Size">
              <div className="flex flex-wrap gap-2">
                {sizes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSize(option)}
                    className={`h-11 w-11 rounded-xl font-bold text-sm transition-all ${
                      size === option ? "bg-gradient-neon text-white pink-glow" : "glass hover:pink-glow"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={product.id === "tshirt" ? "5. Color" : "4. Color"}>
            <div className="flex flex-wrap gap-3">
              {colors.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={option.name}
                  className={`h-10 w-10 rounded-full ring-2 transition-all ${
                    color.name === option.name ? "ring-secondary scale-110 pink-glow" : "ring-white/20"
                  }`}
                  style={{ background: option.value }}
                />
              ))}
            </div>
          </Panel>

          <Panel title={product.id === "tshirt" ? "6. Notes" : "5. Notes"}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Quantity, deadline, artwork details..."
              className="w-full glass rounded-2xl p-4 outline-none focus:pink-glow resize-none"
            />
          </Panel>

          <Panel title="Contact details">
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                placeholder="Your name"
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                placeholder="Phone (optional)"
                className="w-full glass rounded-xl h-11 px-4 outline-none focus:pink-glow"
              />
            </div>
          </Panel>

          {error && (
            <div className="glass rounded-2xl p-4 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-14 rounded-2xl bg-gradient-neon text-white font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" /> Request a Quote
              </>
            )}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Not a paid order. We will contact you with a quote first.{" "}
            <Link href="/contact" className="text-secondary inline-flex items-center gap-1">
              Need help? <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}
