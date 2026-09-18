"use client";
import Link from "next/link";
import {
  FaInstagram,
  FaWhatsapp,
  FaTiktok,
} from "react-icons/fa";

import { HiSparkles } from "react-icons/hi2";
export function Footer() {
  return (
    <footer className="relative mt-24">
      <div className="mx-auto max-w-7xl px-4 pb-10">
        <div className="glass rounded-3xl p-8 md:p-12 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-neon grid place-items-center animate-pulse-glow">
                <HiSparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-extrabold">
                Galaxy<span className="text-gradient-neon">Store</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-md">
              Premium custom printing & galaxy-themed gifts. Bring your ideas to life with stellar
              quality, neon-bright colors, and out-of-this-world delivery.
            </p>
            <div className="flex items-center gap-3 pt-2">
              {[
                { Icon: FaInstagram, label: "Instagram", href: "#" },
                { Icon: FaTiktok, label: "TikTok", href: "#" },
                { Icon: FaWhatsapp, label: "WhatsApp", href: "#" },
              ].map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="h-11 w-11 rounded-xl glass grid place-items-center hover:pink-glow hover:scale-110 transition-all"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gradient-gold">Shop</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/products" className="hover:text-foreground">All Products</Link></li>
              <li><Link href="/custom-print" className="hover:text-foreground">Custom Print</Link></li>
              <li><Link href="/gift-boxes" className="hover:text-foreground">Gift Boxes</Link></li>
              <li><Link href="/gallery" className="hover:text-foreground">Gallery</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gradient-gold">Help</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/track-order" className="hover:text-foreground">Track Order</Link></li>
              <li><Link href="/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-foreground">Contact Us</Link></li>
              <li><Link href="/shipping" className="hover:text-foreground">Shipping Policy</Link></li>
              <li><Link href="/returns" className="hover:text-foreground">Return Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/about" className="hover:text-foreground">About Us</Link>
          <Link href="/terms" className="hover:text-foreground">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Galaxy Store. Crafted across the cosmos.
        </p>
      </div>
    </footer>
  );
}
