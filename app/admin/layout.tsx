"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Image,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Star,
  RotateCcw,
  Store,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/admin/vendors", label: "Vendors", icon: Store },
  { href: "/admin/gallery", label: "Gallery", icon: Image },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    const checkAdmin = async () => {
      try {
        const { data: { session } } = await import("@/lib/supabaseClient").then(m => m.supabase.auth.getSession());
        const token = session?.access_token;
        
        const res = await fetch("/api/admin", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.is_admin) {
          setIsAdmin(true);
        } else {
          router.push("/");
        }
      } catch {
        router.push("/");
      } finally {
        setChecking(false);
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0018]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#FF4FD8]/30 border-t-[#FF4FD8] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const currentPage = navItems.find(item => item.href === pathname);

  return (
    <div className="min-h-screen bg-[#0a0018] flex">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#12001f] border-r border-white/[0.08] transform transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/[0.08]">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-white">Galaxy</span>
                <span className="text-lg font-bold text-[#FF4FD8]">Admin</span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-[#FF4FD8]/20 to-[#A855F7]/20 text-[#FF4FD8] border border-[#FF4FD8]/30"
                      : "text-gray-400 hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/[0.08]">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] flex items-center justify-center text-white text-sm font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                <p className="text-xs text-gray-500">Admin</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0a0018]/80 backdrop-blur-xl border-b border-white/[0.08]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Link href="/admin" className="hover:text-white transition-colors">Admin</Link>
                {currentPage && (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-white">{currentPage.label}</span>
                  </>
                )}
              </div>
            </div>
            <Link
              href="/"
              target="_blank"
              className="px-4 py-2 rounded-xl bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all text-sm font-medium"
            >
              View Store ↗
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 mt-5">{children}</main>
      </div>
    </div>
  );
}
