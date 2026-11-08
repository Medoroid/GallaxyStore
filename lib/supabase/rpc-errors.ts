/**
 * Supabase/PostgREST error helpers.
 *
 * A deployment can legitimately run the application before a migration has
 * been applied. Money routes must detect that state explicitly instead of
 * treating it as a generic 500 or, worse, creating an order with no usable
 * payment path.
 */

type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
} | null | undefined;

export function isMissingRpcError(error: SupabaseErrorLike) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return (
    code === "PGRST202" ||
    code === "42883" ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}

export function isMissingColumnError(error: SupabaseErrorLike) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
}
