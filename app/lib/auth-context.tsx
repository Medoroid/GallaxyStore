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
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
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
  const syncWithServer = useCartStore((s) => s.syncWithServer);
  const clearLocalCart = useCartStore((s) => s.clearLocalCart);
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      if (session?.access_token) {
        syncWithServer(session.access_token);
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
      }
    });

    return () => subscription.unsubscribe();
  }, [syncWithServer, clearLocalCart]);

  const signOut = async () => {
    clearLocalCart();
    await supabase.auth.signOut();
    setSession(null);
    clearGuestSessionToken();
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
        signOut,
        getToken,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
