import { createClient } from "@supabase/supabase-js";

/**
 * Anon-key client for public server-side reads. RLS still applies, so this is
 * safe to use in Server Components for approved stores and published products.
 */
export function getPublicServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase public environment variables are not configured");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
