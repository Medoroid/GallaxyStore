"use client";

import { Sparkles, Globe, Shield, Heart, Star, Truck, Palette, Zap } from "lucide-react";

const stats = [
  { label: "Products", value: "500+", icon: Sparkles },
  { label: "Customers", value: "10K+", icon: Heart },
  { label: "Countries", value: "50+", icon: Globe },
  { label: "Reviews", value: "4.9★", icon: Star },
];

const values = [
  {
    icon: Palette,
    title: "Custom Design",
    description: "Express yourself with our custom print studio. Upload your designs or choose from our collection.",
  },
  {
    icon: Shield,
    title: "Quality Guaranteed",
    description: "Premium materials and printing techniques ensure your products last.",
  },
  {
    icon: Truck,
    title: "Fast Shipping",
    description: "Free shipping on orders over $500. Express delivery available.",
  },
  {
    icon: Zap,
    title: "Lightning Support",
    description: "24/7 customer support to help you with anything you need.",
  },
];

export default function AboutPage() {
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

      {/* Stats */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
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
