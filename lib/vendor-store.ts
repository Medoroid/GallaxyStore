import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreResolution =
  | {
      ok: true;
      store: { id: string; name?: string | null; status?: string | null };
      stores: Array<{ id: string; name?: string | null; status?: string | null }>;
      multiple: boolean;
    }
  | { ok: false; status: number; message: string };

/**
 * Resolve the store for a vendor request. `stores.owner_id` is NOT unique, so
 * `.single()`/`.maybeSingle()` are wrong here (PGRST116 lockout / silent zeros).
 *
 * - zero rows  -> explicit 403
 * - one row    -> that store
 * - many rows  -> the OLDEST store deterministically, plus the full list so the
 *                 UI can offer a selector. Callers may pass an explicit storeId,
 *                 which is always re-checked against owner_id.
 */
export async function resolveVendorStore(
  client: SupabaseClient,
  userId: string,
  storeId?: string | null
): Promise<StoreResolution> {
  let query = client
    .from("stores")
    .select("id, name, status, deleted_at, created_at")
    .eq("owner_id", userId);
  if (storeId) query = query.eq("id", storeId);

  const { data, error } = await query;
  if (error) {
    return { ok: false, status: 500, message: "Unable to resolve your store." };
  }
  const raw = data ?? [];
  const stores = (Array.isArray(raw) ? raw : [raw])
    .filter((row) => !(row as Record<string, unknown>).deleted_at)
    .sort(
      (a, b) =>
        String((a as Record<string, unknown>).created_at ?? "").localeCompare(
          String((b as Record<string, unknown>).created_at ?? "")
        )
    )
    .slice(0, storeId ? 1 : 100) as Array<{
    id: string;
    name?: string | null;
    status?: string | null;
  }>;
  if (stores.length === 0) {
    return {
      ok: false,
      status: 403,
      message: storeId ? "Store not found for this account" : "No store found for this account",
    };
  }
  return { ok: true, store: stores[0], stores, multiple: stores.length > 1 };
}
