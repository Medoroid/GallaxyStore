"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";
import { useCartStore } from "../stores/cartStore";
import { getGuestSessionToken, onLoginSuccess, clearGuestSessionToken } from "@/lib/cartService";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
  getToken: async () => null,
  updatePassword: async () => ({}),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const syncWithServer = useCartStore((s) => s.syncWithServer);
  const clearLocalCart = useCartStore((s) => s.clearLocalCart);
  const prevSessionRef = useRef<Session | null>(null);

  const checkAdminStatus = async (token: string, currentUser?: User | null) => {
    // Fast initial check via metadata
    if (
      currentUser?.user_metadata?.role === "admin" ||
      currentUser?.app_metadata?.role === "admin"
    ) {
      setIsAdmin(true);
    }
    try {
      const res = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setIsAdmin(Boolean(data.is_admin));
    } catch {
      // keep metadata role if api failed or default to false
      if (
        currentUser?.user_metadata?.role !== "admin" &&
        currentUser?.app_metadata?.role !== "admin"
      ) {
        setIsAdmin(false);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      prevSessionRef.current = session;
      setLoading(false);

      if (session?.access_token) {
        syncWithServer(session.access_token);
        checkAdminStatus(session.access_token, session.user);
      } else {
        setIsAdmin(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const prevSession = prevSessionRef.current;
      const wasGuest = !prevSession?.user;
      const isLoggedIn = !!session?.user;

      setSession(session);
      prevSessionRef.current = session;

      if (isLoggedIn && session?.access_token) {
        checkAdminStatus(session.access_token, session.user);
        if (wasGuest) {
          const guestToken = getGuestSessionToken();
          if (guestToken) {
            onLoginSuccess().then(() => {
              syncWithServer(session.access_token);
            });
          } else {
            syncWithServer(session.access_token);
          }
        } else {
          syncWithServer(session.access_token);
        }
      } else if (!isLoggedIn && prevSession?.user) {
        clearLocalCart();
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [syncWithServer, clearLocalCart]);

  const signOut = async () => {
    // A failed server-side revoke (expired/already-revoked refresh token →
    // GoTrue answers 403 "Session not found") must never leave the UI stuck in
    // a signed-in state: the local session is always cleared below.
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore — the local cleanup in `finally` is what matters here.
    } finally {
      clearLocalCart();
      clearGuestSessionToken();
      prevSessionRef.current = null;
      setSession(null);
      setIsAdmin(false);
    }
  };

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { error: error.message };
    }
    return {};
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        signOut,
        getToken,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
