import { Sparkles, Shield, Truck, Palette, Zap, Globe } from "lucide-react";
import { getPublicServerClient } from "@/lib/supabase/public-server";
import { getPublicStoreSettings } from "@/lib/storeSettings";

/**
 * B4 — About page reads real numbers from the database.
 * The previous fabricated stats (invented product/customer/country counts and
 * a fake review score) are gone; every figure shown here is counted at
 * request time, and sections without real data are hidden instead of being
 * filled with placeholders.
 */
async function getRealStats() {
  const supabase = getPublicServerClient();

  const [productsRes, zonesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("visibility", "visible")
      .is("deleted_at", null),
    supabase
      .from("shipping_zones")
      .select("countries")
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const countries = new Set<string>();
  for (const zone of zonesRes.data ?? []) {
    for (const code of zone.countries ?? []) countries.add(code);
  }

  return {
    publishedProducts: productsRes.count ?? 0,
    countriesServed: countries.size,
    readFailed: Boolean(productsRes.error ?? zonesRes.error),
  };
}

export const metadata = {
  title: "About",
  description: "Who we are and what Galaxy Store stands for.",
};

export default async function AboutPage() {
  const [stats, settings] = await Promise.all([getRealStats(), getPublicStoreSettings()]);

  const statCards = [
    { label: "Published products", value: String(stats.publishedProducts), icon: Sparkles },
    { label: "Countries served", value: String(stats.countriesServed), icon: Globe },
  ];

  const values = [
    {
      icon: Palette,
      title: "Custom Design",
      description:
        "Express yourself with our custom print studio. Upload your designs or choose from our collection.",
    },
    {
      icon: Shield,
      title: "Quality Guaranteed",
      description: "Premium materials and printing techniques ensure your products last.",
    },
    {
      icon: Truck,
      title: "Shipping at Checkout",
      description:
        "Delivery options, fees and timeframes are calculated on the server and shown at checkout — no surprises.",
    },
    {
      icon: Zap,
      title: "Responsive Support",
      description: settings.support_email
        ? "Reach our team by email at any time; we reply as soon as we can."
        : "Message us through the contact page and we'll get back to you.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#FF4FD8]/5 to-transparent" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 animate-fade-in">
            <span className="bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] bg-clip-text text-transparent">
              About Galaxy Store
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto animate-fade-in">
            Born from a passion for unique fashion and creative expression. We bring the multiverse of design to your doorstep.
          </p>
        </div>
      </section>

      {/* Stats — counted from the live catalog and shipping zones */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 gap-6">
          {statCards.map((stat, index) => (
            <div
              key={stat.label}
              className="glass rounded-2xl p-6 text-center animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <stat.icon className="w-8 h-8 text-[#FF4FD8] mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
        {stats.readFailed && (
          <p className="text-center text-xs text-gray-500 mt-4">
            Live counts are temporarily unavailable.
          </p>
        )}
      </section>

      {/* Story */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass rounded-3xl p-8 md:p-12 animate-fade-in">
            <h2 className="text-2xl font-bold text-white mb-6">Our Story</h2>
            <div className="space-y-4 text-gray-400">
              <p>
                Galaxy Store was founded with a simple mission: to make unique, high-quality fashion accessible to everyone.
                We believe that what you wear should reflect who you are.
              </p>
              <p>
                What started as a small custom print shop has grown into a full-fledged e-commerce platform offering
                everything from custom t-shirts and mugs to phone cases and posters.
              </p>
              <p>
                Our galaxy theme isn&apos;t just about aesthetics—it represents the infinite possibilities of self-expression.
                Like the universe, your style knows no bounds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Why Choose Us</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <div
                key={value.title}
                className="glass rounded-2xl p-6 hover:border-[#FF4FD8]/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <value.icon className="w-10 h-10 text-[#FF4FD8] mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{value.title}</h3>
                <p className="text-sm text-gray-400">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to Explore?</h2>
          <p className="text-gray-400 mb-8">Discover our galaxy of products and find something that speaks to you.</p>
          <a
            href="/products"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-bold hover:shadow-[0_0_30px_rgba(255,79,216,0.3)] transition-all"
          >
            Browse Products
          </a>
        </div>
      </section>
    </div>
  );
}
