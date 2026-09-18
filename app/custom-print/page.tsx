"use client";

import Image from "next/image";
import { useState } from "react";
import { ImagePlus, Type, ShoppingBag, Sparkles } from "lucide-react";
import { useCartStore } from "../stores/cartStore";

const tshirt = "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab";
const mug = "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d";
const phonecase = "https://images.unsplash.com/photo-1541560052-5e137f229371";
const poster = "https://images.unsplash.com/photo-1550745165-9bc0b252726f";

const productTypes = [
  { id: "tshirt", name: "T-Shirt", image: tshirt, price: 29.99 },
  { id: "mug", name: "Mug", image: mug, price: 19.99 },
  { id: "phonecase", name: "Phone Case", image: phonecase, price: 24.99 },
  { id: "poster", name: "Poster", image: poster, price: 34.99 },
];

const sizes = ["S", "M", "L", "XL", "XXL"];
const colors = [
  { name: "Black", value: "#0a0011" },
  { name: "Neon Purple", value: "#8A2BE2" },
  { name: "Pink", value: "#FF4FD8" },
  { name: "Gold", value: "#FFD166" },
  { name: "White", value: "#ffffff" },
];

import { formatCurrency } from "@/lib/formatCurrency";

export default function CustomPrint() {
  const [product, setProduct] = useState(productTypes[0]);
  const [text, setText] = useState("YOUR TEXT");
  const [size, setSize] = useState("M");
  const [color, setColor] = useState(colors[1]);
  const [upload, setUpload] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const addItem = useCartStore((s) => s.addItem);

  const onFile = (f: File) => {
    const r = new FileReader();
    r.onload = (e) => setUpload(e.target?.result as string);
    r.readAsDataURL(f);
  };

  const handleAddToCart = () => {
    addItem({
      product_id: `custom-${product.id}`,
      name: `Custom ${product.name} - ${text}`,
      price: product.price,
      image: product.image,
      color: color.name,
      size: product.id === "tshirt" ? size : undefined,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="text-center max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Studio</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Custom <span className="text-gradient-neon">Print</span> Studio
        </h1>
        <p className="text-muted-foreground mt-3">
          Upload your artwork, add text, choose product type and preview it live. We handle the rest.
        </p>
      </header>

      <div className="mt-10 grid lg:grid-cols-5 gap-6">
        {/* Preview */}
        <div className="lg:col-span-3">
          <div className="glass-strong rounded-3xl p-6 sticky top-28">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-background/60" style={{ boxShadow: `inset 0 0 60px ${color.value}33` }}>
              <Image src={product.image} alt={product.name} fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover opacity-90" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-1/2 w-1/2 grid place-items-center text-center p-4 rounded-2xl" style={{ background: color.value === "#0a0011" ? "transparent" : `${color.value}22` }}>
                  {upload && (
                    <Image
                      src={upload}
                      alt="upload"
                      fill
                      unoptimized
                      className="absolute inset-0 h-full w-full object-contain mix-blend-screen opacity-90"
                    />
                  )}
                  <span className="relative font-extrabold text-2xl md:text-4xl tracking-wider drop-shadow-[0_0_18px_rgba(255,79,216,0.8)] text-white">
                    {text}
                  </span>
                </div>
              </div>
              <div className="absolute top-3 left-3 glass px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" /> Live Preview
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="font-semibold">{product.name} · {color.name}{product.id === "tshirt" ? ` · ${size}` : ""}</p>
              </div>
              <p className="text-2xl font-extrabold text-gradient-gold">{formatCurrency(product.price)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="lg:col-span-2 space-y-5">
          <Panel title="1. Choose Product">
            <div className="grid grid-cols-2 gap-3">
              {productTypes.map((p) => (
                <button key={p.id} onClick={() => setProduct(p)} className={`group glass rounded-2xl p-2 text-left transition-all ${product.id === p.id ? "pink-glow ring-1 ring-secondary" : "hover:pink-glow"}`}>
                  <div className="relative aspect-square overflow-hidden rounded-xl mb-2">
                    <Image src={p.image} alt={p.name} fill sizes="50vw" className="object-cover" />
                  </div>
                  <p className="text-sm font-semibold px-1 pb-1">{p.name}</p>
                  <p className="text-xs text-secondary px-1">{formatCurrency(p.price)}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2. Upload Image">
            <label className="block glass rounded-2xl border border-dashed border-secondary/40 p-6 text-center cursor-pointer hover:pink-glow transition-all">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <ImagePlus className="h-6 w-6 mx-auto mb-2 text-secondary" />
              <p className="text-sm font-medium">{upload ? "Image uploaded — click to replace" : "Drop or click to upload"}</p>
              <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
            </label>
          </Panel>

          <Panel title="3. Custom Text">
            <div className="relative">
              <Type className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={text} onChange={(e) => setText(e.target.value)} className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow" />
            </div>
          </Panel>

          {product.id === "tshirt" && (
            <Panel title="4. Size">
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button key={s} onClick={() => setSize(s)} className={`h-11 w-11 rounded-xl font-bold text-sm transition-all ${size === s ? "bg-gradient-neon text-white pink-glow" : "glass hover:pink-glow"}`}>{s}</button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={product.id === "tshirt" ? "5. Color" : "4. Color"}>
            <div className="flex flex-wrap gap-3">
              {colors.map((c) => (
                <button key={c.name} onClick={() => setColor(c)} aria-label={c.name} className={`h-10 w-10 rounded-full ring-2 transition-all ${color.name === c.name ? "ring-secondary scale-110 pink-glow" : "ring-white/20"}`} style={{ background: c.value }} />
              ))}
            </div>
          </Panel>

          <Panel title={product.id === "tshirt" ? "6. Notes" : "5. Notes"}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything special we should know?" className="w-full glass rounded-2xl p-4 outline-none focus:pink-glow resize-none" />
          </Panel>

          <button onClick={handleAddToCart} className="w-full h-14 rounded-2xl bg-gradient-neon text-white font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform animate-pulse-glow">
            <ShoppingBag className="h-5 w-5" /> Add to Cart · {formatCurrency(product.price)}
          </button>
        </div>
      </div>
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
