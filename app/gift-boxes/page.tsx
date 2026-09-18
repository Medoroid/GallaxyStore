"use client";

import { useState } from "react";
import Image from "next/image";
import { Cake, Gamepad2, Heart, Sparkles, GraduationCap, Stars, ShoppingBag, Send, Loader2 } from "lucide-react";
import { useCartStore } from "../stores/cartStore";

const boxes = [
  { id: "birthday", name: "Birthday Box", icon: Cake, image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48", price: 49, tag: "Best Seller", desc: "Personalized birthday celebration kit with cake-themed surprises." },
  { id: "couples", name: "Couples Box", icon: Heart, image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d", price: 59, tag: "Romantic", desc: "Matching mugs, prints and love notes — for the duo who shines together." },
  { id: "anime", name: "Anime Box", icon: Stars, image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f", price: 69, tag: "Hot", desc: "Curated anime drops: posters, stickers, keychains and figurines." },
  { id: "gaming", name: "Gamer Box", icon: Gamepad2, image: "https://images.unsplash.com/photo-1541560052-5e137f229371", price: 79, tag: "Premium", desc: "Loot for true gamers — neon gear, retro prints, and collectibles." },
  { id: "graduation", name: "Graduation Box", icon: GraduationCap, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab", price: 54, desc: "Celebrate the next chapter with custom prints and keepsakes." },
];

export default function GiftBoxes() {
  const addItem = useCartStore((s) => s.addItem);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formSent, setFormSent] = useState(false);
  const [form, setForm] = useState({
    occasion: "",
    budget: "",
    message: "",
    name: "",
    email: "",
  });

  const handleAddBox = (box: typeof boxes[number]) => {
    addItem({
      product_id: `gift-${box.id}`,
      name: box.name,
      price: box.price,
      image: box.image,
    });
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500));
    setFormLoading(false);
    setFormSent(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="glass-strong rounded-3xl p-8 md:p-12 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Curated</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Themed <span className="text-gradient-neon">Gift Boxes</span>
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          Hand-picked surprises for every occasion. Wrapped in cosmic vibes, ready to ship.
        </p>
      </header>

      <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {boxes.map((b) => (
          <article key={b.id} className="group glass rounded-3xl p-4 hover:pink-glow transition-all hover:-translate-y-1">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-background/40">
              <Image src={b.image} alt={b.name} fill sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
              {b.tag && (
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-gradient-neon text-white">{b.tag}</span>
              )}
              <div className="absolute top-3 right-3 h-10 w-10 rounded-xl bg-gradient-gold grid place-items-center gold-glow">
                <b.icon className="h-5 w-5 text-background" />
              </div>
            </div>
            <div className="p-3 space-y-2">
              <h3 className="text-xl font-extrabold">{b.name}</h3>
              <p className="text-sm text-muted-foreground">{b.desc}</p>
              <div className="flex items-center justify-between pt-2">
                <p className="text-2xl font-extrabold text-gradient-gold">${b.price}</p>
                <button onClick={() => handleAddBox(b)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-neon text-white text-sm font-semibold hover:scale-105 transition-transform">
                  <ShoppingBag className="h-4 w-4" /> Add
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Custom Box Request */}
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
        ) : formSent ? (
          <div className="mt-6 glass rounded-2xl p-6 max-w-md mx-auto">
            <div className="h-12 w-12 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-3">
              <Send className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="font-extrabold text-lg">Request Sent!</h3>
            <p className="text-sm text-muted-foreground mt-1">We&apos;ll get back to you within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="mt-6 glass rounded-2xl p-6 max-w-md mx-auto text-left space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">Occasion</label>
              <select
                value={form.occasion}
                onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm bg-transparent"
                required
              >
                <option value="" className="bg-black">Select occasion...</option>
                <option value="birthday" className="bg-black">Birthday</option>
                <option value="wedding" className="bg-black">Wedding</option>
                <option value="graduation" className="bg-black">Graduation</option>
                <option value="anniversary" className="bg-black">Anniversary</option>
                <option value="holiday" className="bg-black">Holiday</option>
                <option value="other" className="bg-black">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">Budget (USD)</label>
              <input
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
              <label className="text-sm font-semibold mb-1 block">Tell us what you want</label>
              <textarea
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
                <label className="text-sm font-semibold mb-1 block">Your Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Email</label>
                <input
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
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Request
                </>
              )}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
