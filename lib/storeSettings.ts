import { getPublicServerClient } from "@/lib/supabase/public-server";
import { logger } from "@/lib/logger";

/**
 * B4 — public store settings.
 *
 * `store_settings` is the single admin-editable source of truth for the
 * storefront identity (name, contact channels, announcement, currency). The
 * table is readable by anon only for rows with is_public = true (RLS), so
 * this helper is safe in Server Components and public APIs.
 *
 * Missing settings are returned as null — pages must hide the related element
 * instead of inventing placeholder values.
 */
export type PublicStoreSettings = {
  store_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  address: string | null;
  announcement: string | null;
  currency: string | null;
  free_shipping_threshold: number | null;
  default_shipping_fee: number | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
};

export const EMPTY_PUBLIC_SETTINGS: PublicStoreSettings = {
  store_name: null,
  support_email: null,
  support_phone: null,
  address: null,
  announcement: null,
  currency: null,
  free_shipping_threshold: null,
  default_shipping_fee: null,
  instagram_url: null,
  facebook_url: null,
  twitter_url: null,
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/**
 * Pure mapping from store_settings rows to the public settings shape.
 * Exported for unit tests. Unknown keys are ignored; invalid values become
 * null rather than leaking bad data into the UI.
 */
export function normalizePublicSettings(
  rows: Array<{ key: string; value: unknown }> | null | undefined
): PublicStoreSettings {
  const settings: PublicStoreSettings = { ...EMPTY_PUBLIC_SETTINGS };
  for (const row of rows ?? []) {
    switch (row.key) {
      case "store_name":
      case "support_email":
      case "support_phone":
      case "address":
      case "announcement":
      case "instagram_url":
      case "facebook_url":
      case "twitter_url":
        settings[row.key] = asTrimmedString(row.value);
        break;
      case "currency": {
        const code = asTrimmedString(row.value)?.toUpperCase() ?? null;
        settings.currency = code && /^[A-Z]{3}$/.test(code) ? code : null;
        break;
      }
      case "free_shipping_threshold":
      case "default_shipping_fee":
        settings[row.key] = asNonNegativeNumber(row.value);
        break;
      default:
        // Unknown keys (e.g. private settings) never reach the storefront.
        break;
    }
  }
  return settings;
}

/**
 * Reads the public settings with the anon key (RLS applies). Never throws:
 * a read failure degrades to "no settings" so pages hide unset elements.
 */
export async function getPublicStoreSettings(): Promise<PublicStoreSettings> {
  try {
    const supabase = getPublicServerClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("key, value")
      .eq("is_public", true);

    if (error) throw error;
    return normalizePublicSettings(
      (data ?? []) as Array<{ key: string; value: unknown }>
    );
  } catch (error) {
    logger.warn("Failed to load public store settings; storefront hides unset details", {
      errorCode: "STORE_SETTINGS_READ_FAILED",
      message: error instanceof Error ? error.message : "unknown error",
    });
    return { ...EMPTY_PUBLIC_SETTINGS };
  }
}
