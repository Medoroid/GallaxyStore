"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { LogOut, Menu, ShoppingBag, Sparkles, User, X, Heart, Globe, Search, Bell } from "lucide-react";
import { useCartStore } from "../stores/cartStore";
import { useAuth } from "../lib/auth-context";
import { useLanguage } from "../lib/language-context";
import { localeNames, type Locale } from "@/lib/i18n";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ name: string; slug: string; id: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; is_read: boolean; created_at: string }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));
  const { user, getToken, signOut } = useAuth();
  const { locale, setLocale, t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); setShowSuggestions(false); }, [pathname]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setNotifications(data.notifications || []);
          setUnreadCount((data.notifications || []).filter((n: { is_read: boolean }) => !n.is_read).length);
        }
      } catch { /* ignore */ }
    };
    fetchNotifs();
  }, [user, getToken]);

  const fetchSuggestions = useCallback(async (prefix: string) => {
    if (prefix.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/search?mode=suggestions&q=${encodeURIComponent(prefix)}&limit=6`);
      const data = await res.json();
      if (data.success) setSuggestions(data.suggestions || []);
    } catch { /* ignore */ }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: { name: string }) => {
    setSearchQuery(suggestion.name);
    router.push(`/products?q=${encodeURIComponent(suggestion.name)}`);
    setShowSuggestions(false);
  };

  const markAllRead = async () => {
    try {
      const token = await getToken();
      await fetch("/api/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const links = [
    { href: "/", label: t("nav_home") },
    { href: "/products", label: t("nav_products") },
    { href: "/custom-print", label: t("nav_custom_print") },
    { href: "/gallery", label: t("nav_gallery") },
    { href: "/gift-boxes", label: t("nav_gift_boxes") },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "py-2" : "py-4"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div
          className={`glass-nav rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between transition-all duration-300 ${
            scrolled ? "pink-glow" : ""
          }`}
        >
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-neon flex items-center justify-center animate-pulse-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg md:text-xl font-extrabold tracking-tight">
              Galaxy<span className="text-gradient-neon">Store</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? "bg-white/10 text-foreground shadow-[inset_0_0_0_1px_rgba(255,79,216,0.4)]"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative" ref={searchRef}>
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                  placeholder="Search..."
                  className="h-10 w-32 lg:w-48 pl-9 pr-3 rounded-xl glass text-sm outline-none focus:pink-glow transition-all placeholder:text-muted-foreground"
                />
              </form>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-12 left-0 right-0 glass rounded-xl p-2 min-w-[220px] animate-fade-in-up z-50">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      className="w-full px-3 py-2 rounded-lg text-sm text-left hover:bg-white/10 transition-all truncate"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => setLangOpen((v) => !v)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                aria-label="Language"
              >
                <Globe className="h-4 w-4" />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-12 glass rounded-xl p-2 min-w-[120px] animate-fade-in-up z-50">
                  {(Object.keys(localeNames) as Locale[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => { setLocale(l); setLangOpen(false); }}
                      className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-all ${
                        locale === l ? "bg-gradient-neon text-white" : "hover:bg-white/10"
                      }`}
                    >
                      {localeNames[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            {user && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifications((v) => !v)}
                  className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white grid place-items-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-12 glass rounded-xl p-2 min-w-[300px] max-h-[400px] overflow-y-auto animate-fade-in-up z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                      <span className="text-sm font-semibold">Notifications</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-xs text-secondary hover:text-secondary/80">
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">No notifications</p>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div key={n.id} className={`px-3 py-2 rounded-lg text-sm ${n.is_read ? "opacity-60" : "bg-white/[0.03]"}`}>
                          <p className="font-medium">{n.title}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/profile"
                  className="text-xs text-muted-foreground max-w-20 truncate hover:text-foreground transition-colors"
                >
                  {user.user_metadata?.full_name ?? user.email?.split("@")[0]}
                </Link>
                <button
                  onClick={signOut}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                aria-label="Account"
              >
                <User className="h-4 w-4" />
              </Link>
            )}
            {user && (
              <Link
                href="/wishlist"
                className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                aria-label="Wishlist"
              >
                <Heart className="h-4 w-4" />
              </Link>
            )}
            <Link
              href="/cart"
              className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-neon text-white hover:scale-105 transition-transform"
              aria-label="Cart"
            >
              <ShoppingBag className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-[10px] font-bold text-background grid place-items-center gold-glow">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl glass"
              aria-label="Menu"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden mt-2 glass rounded-2xl p-3 animate-fade-in-up">
            <nav className="flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5"
                >
                  {l.label}
                </Link>
              ))}
              <Link href="/cart" className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5">
                {t("nav_cart")} ({cartCount})
              </Link>
              {user && (
                <Link href="/wishlist" className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5">
                  {t("nav_wishlist")}
                </Link>
              )}
              {user && (
                <Link href="/orders" className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5">
                  {t("nav_orders")}
                </Link>
              )}
              {user ? (
                <button
                  onClick={() => { signOut(); setOpen(false); }}
                  className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5 text-left"
                >
                  {t("nav_logout")}
                </button>
              ) : (
                <Link href="/login" className="px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/5">
                  {t("nav_login")}
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
