"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Menu, ShoppingBag, Sparkles, User, X, Heart, Globe, Search, Bell, Package, LayoutDashboard, LogOut } from "lucide-react";
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
  const { user, getToken, isAdmin, signOut } = useAuth();
  const { locale, setLocale, t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setShowSuggestions(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
    { href: "/designs", label: t("nav_designs") },
    { href: "/gift-boxes", label: t("nav_gift_boxes") },
    // { href: "/creators", label: t("nav_creators") },
  ];

  // User initial letter (capitalized)
  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const userInitial = (
    user?.user_metadata?.full_name?.trim()?.[0] ||
    user?.email?.trim()?.[0] ||
    "U"
  ).toUpperCase();

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "py-2" : "py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4">
          <div
            className={`glass-nav rounded-2xl px-3 md:px-6 py-2.5 flex items-center justify-between transition-all duration-300 ${
              scrolled ? "pink-glow" : ""
            }`}
          >
            <Link href="/" className="flex items-center gap-2 group shrink-0" aria-label="Galaxy Store Home">
              <div className="relative h-10 md:h-12 w-32 md:w-40 flex items-center">
                <Image
                  src="/logo.png"
                  alt="Galaxy Store"
                  fill
                  priority
                  sizes="(max-width: 768px) 128px, 160px"
                  className="object-contain object-left rtl:object-right group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_12px_rgba(255,79,216,0.35)]"
                />
              </div>
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
                        ? "bg-white/10 text-foreground shadow-[inset_0_0_0_1px_var(--brand-ring)]"
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
                    aria-label="Search products"
                    className="h-10 w-28 sm:w-36 lg:w-48 pl-9 pr-3 rounded-xl glass text-sm outline-none focus:pink-glow transition-all placeholder:text-muted-foreground"
                  />
                </form>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-12 left-0 right-0 glass rounded-xl p-2 min-w-[220px] animate-fade-in-up z-[200]">
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

              {/* Language Switcher (Desktop) */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all"
                  aria-label="Language"
                >
                  <Globe className="h-4 w-4" />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-12 glass rounded-xl p-2 min-w-[120px] animate-fade-in-up z-[200]">
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
                    <div className="absolute right-0 top-12 bg-[#9D31E0] rounded-xl p-2 min-w-[300px] max-h-[400px] overflow-y-auto animate-fade-in-up z-[200]">
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

              {/* Admin Dashboard Button (Only for Admin) */}
              {/* {isAdmin && (
                <Link
                  href="/admin"
                  className="h-10 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white font-bold text-xs inline-flex items-center gap-1.5 hover:scale-105 hover:pink-glow transition-all shadow-md shrink-0 border border-pink-400/40"
                  aria-label="Admin Dashboard"
                  title="Admin Dashboard"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )} */}

              {/* User Profile Button: Displays single initial letter when logged in */}
              {user ? (
                <Link
                  href="/profile"
                  className="h-10 w-10 rounded-xl bg-gradient-neon text-white font-extrabold md:flex items-center justify-center hover:scale-105 hover:pink-glow transition-all shadow-md text-base shrink-0 border border-white/20 select-none hidden"
                  aria-label="Profile"
                  title={userDisplayName}
                >
                  {userInitial}
                </Link>
              ) : null}
{/* 
              {user && (
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                    router.refresh();
                  }}
                  aria-label="Sign out"
                  title="Sign out"
                  className="hidden h-10 w-10 items-center justify-center rounded-xl glass hover:text-red-300 transition-colors shrink-0 md:flex"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )} */}

              {!user ? (
                <Link
                  href="/login"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl glass hover:pink-glow transition-all shrink-0"
                  aria-label="Account"
                >
                  <User className="h-4 w-4" />
                </Link>
              ) : null}

              {user && (
                <Link
                  href="/wishlist"
                  className="relative h-10 w-10 md:inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all hidden"
                  aria-label="Wishlist"
                >
                  <Heart className="h-4 w-4" />
                </Link>
              )}

              <Link
                href="/cart"
                className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-neon text-white hover:scale-105 transition-transform shrink-0"
                aria-label="Cart"
              >
                <ShoppingBag className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-accent text-[10px] font-bold text-background grid place-items-center gold-glow">
                    {cartCount}
                  </span>
                )}
              </Link>

              {/* Hamburger Button for Mobile Drawer */}
              <button
                onClick={() => setOpen((v) => !v)}
                className="lg:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl glass hover:pink-glow transition-all shrink-0"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
              >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Modern Slide-over Mobile Drawer with solid backdrop */}
      {open && (
        <>
          {/* Dark Backdrop to eliminate overlapping text with page background */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[240] transition-opacity duration-300 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <aside
            className="fixed top-0 bottom-0 end-0 w-[88%] max-w-sm bg-[#120018]/95 backdrop-blur-2xl border-s border-pink-500/20 shadow-2xl z-[250] flex flex-col justify-between p-5 sm:p-6 overflow-y-auto animate-fade-in-up lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
          >
            <div>
              {/* Header inside drawer */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 group" aria-label="Galaxy Store Home">
                  <div className="relative h-10 w-32 flex items-center">
                    <Image
                      src="/logo.png"
                      alt="Galaxy Store"
                      fill
                      sizes="128px"
                      className="object-contain object-left rtl:object-right group-hover:scale-105 transition-transform drop-shadow-[0_0_12px_rgba(255,79,216,0.35)]"
                    />
                  </div>
                </Link>

                <button
                  onClick={() => setOpen(false)}
                  className="h-9 w-9 rounded-xl glass hover:pink-glow flex items-center justify-center transition-all text-white/80 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Profile Card Section */}
              <div className="py-4">
                {user ? (
                  <Link
                    href="/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3.5 rounded-2xl glass hover:border-pink-500/40 border border-white/10 transition-all group"
                  >
                    <div className="h-11 w-11 rounded-xl bg-gradient-neon text-white font-extrabold flex items-center justify-center text-lg shrink-0 shadow-md pink-glow">
                      {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-white truncate group-hover:text-pink-300 transition-colors">
                        {userDisplayName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <span className="text-[11px] text-pink-400 font-semibold mt-0.5 inline-block">
                        View Profile →
                      </span>
                    </div>
                  </Link>
                ) : null}

                {user && (
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      setOpen(false);
                      router.push("/");
                      router.refresh();
                    }}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-3.5 text-sm font-semibold text-red-300"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                )}

                {!user ? (
                  <div className="p-4 rounded-2xl glass border border-white/10 space-y-3">
                    <div>
                      <p className="text-sm font-bold text-white">Welcome to Galaxy Store</p>
                      <p className="text-xs text-muted-foreground">Sign in to manage orders and track wishlist</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href="/login"
                        onClick={() => setOpen(false)}
                        className="flex-1 h-9 rounded-xl bg-gradient-neon text-white font-semibold text-xs flex items-center justify-center hover:scale-105 transition-transform"
                      >
                        {t("nav_login") || "Sign In"}
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setOpen(false)}
                        className="flex-1 h-9 rounded-xl glass font-semibold text-xs flex items-center justify-center hover:bg-white/10 transition-colors text-white"
                      >
                        Register
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Admin Dashboard Banner (Only for Admin) */}
              {isAdmin && (
                <div className="pb-3">
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/80 via-pink-900/60 to-purple-900/80 border border-pink-500/50 text-white font-bold text-sm hover:scale-[1.02] transition-all shadow-lg group pink-glow"
                  >
                    <span className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-gradient-neon flex items-center justify-center text-white shrink-0 shadow-md">
                        <LayoutDashboard className="h-4.5 w-4.5" />
                      </div>
                      <div className="text-left rtl:text-right">
                        <p className="font-bold text-white text-sm">لوحة تحكم الأدمن</p>
                        <p className="text-[11px] text-pink-300 font-normal">Admin Dashboard</p>
                      </div>
                    </span>
                    <span className="text-[11px] bg-pink-500 text-white font-bold px-2.5 py-1 rounded-full shadow-sm">
                      Admin
                    </span>
                  </Link>
                </div>
              )}

              {/* Main Navigation Links */}
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold px-3 mb-2">
                  Navigation
                </p>
                {links.map((l) => {
                  const active = pathname === l.href;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? "bg-gradient-neon text-white font-bold shadow-md"
                          : "text-foreground/80 hover:text-foreground hover:bg-white/5"
                      }`}
                    >
                      <span>{l.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                    </Link>
                  );
                })}

                {/* My Activity Section */}
                <div className="pt-3 pb-1 border-t border-white/10 mt-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold px-3 mb-2">
                    My Activity
                  </p>
                  <Link
                    href="/cart"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-pink-400" />
                      {t("nav_cart")}
                    </span>
                    {cartCount > 0 && (
                      <span className="h-5 px-2 rounded-full bg-accent text-[11px] font-bold text-background grid place-items-center">
                        {cartCount}
                      </span>
                    )}
                  </Link>

                  {user && (
                    <>
                      <Link
                        href="/wishlist"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/5 transition-all"
                      >
                        <Heart className="h-4 w-4 text-pink-400" />
                        {t("nav_wishlist")}
                      </Link>
                      <Link
                        href="/orders"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/5 transition-all"
                      >
                        <Package className="h-4 w-4 text-secondary" />
                        {t("nav_orders")}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Controls: Language Selector */}
            <div className="pt-4 border-t border-white/10 space-y-3 mt-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <Globe className="h-3.5 w-3.5 text-secondary" />
                  <span>Language / اللغة</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(localeNames) as Locale[]).map((l) => {
                    const isSelected = locale === l;
                    return (
                      <button
                        key={l}
                        onClick={() => setLocale(l)}
                        className={`h-9 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-gradient-neon text-white shadow-md pink-glow"
                            : "glass text-muted-foreground hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <span>{localeNames[l]}</span>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
