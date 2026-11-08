import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  EXTERNAL_WALLET_SETTING_KEY,
  normalizeExternalWalletSettings,
} from "@/lib/payment-settings";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(key, value) {
  switch (key) {
    case "store_name":
      if (typeof value !== "string" || !value.trim() || value.length > 100) {
        throw new Error("Store name must be 1-100 characters");
      }
      return value.trim();
    case "support_email":
      if (typeof value !== "string" || !EMAIL_RE.test(value.trim())) {
        throw new Error("Support email is invalid");
      }
      return value.trim().toLowerCase();
    case "support_phone":
    case "address":
    case "announcement":
      if (typeof value !== "string" || value.length > 500) {
        throw new Error("Value is too long");
      }
      return value.trim();
    case "currency": {
      const currency = String(value || "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code");
      return currency;
    }
    case "free_shipping_threshold":
    case "default_shipping_fee": {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new Error("Value must be zero or greater");
      return number;
    }
    case "instagram_url":
    case "facebook_url":
    case "twitter_url": {
      const text = String(value || "").trim();
      if (!text) return "";
      let url;
      try {
        url = new URL(text);
      } catch {
        throw new Error("Must be a valid URL");
      }
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Must be an http(s) URL");
      return url.toString();
    }
    case EXTERNAL_WALLET_SETTING_KEY:
      return normalizeExternalWalletSettings(value, true);
    default:
      throw new Error(`Unknown setting: ${key}`);
  }
}

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const { data, error } = await db
      .from("store_settings")
      .select("key, value, is_public, updated_at")
      .order("key");

    if (error) throw error;

    const settings = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    return Response.json({ success: true, settings, rows: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Admin Settings GET", "Failed to load settings");
  }
}

export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const settings = body?.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return Response.json({ success: false, message: "settings object is required" }, { status: 400 });
    }

    const rows = [];
    try {
      for (const [key, raw] of Object.entries(settings)) {
        rows.push({
          key,
          value: validate(key, raw),
          is_public: [
            "store_name",
            "support_email",
            "support_phone",
            "currency",
            "free_shipping_threshold",
            "default_shipping_fee",
            "announcement",
            "address",
            "instagram_url",
            "facebook_url",
            "twitter_url",
          ].includes(key),
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (validationError) {
      return Response.json({ success: false, message: validationError.message }, { status: 400 });
    }

    if (rows.length === 0) {
      return Response.json({ success: false, message: "No settings provided" }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const { error } = await db.from("store_settings").upsert(rows, { onConflict: "key" });
    if (error) throw error;

    logger.info("[Admin Settings] updated", { keys: rows.map((row) => row.key), by: auth.user.id });
    return Response.json({ success: true, updated: rows.length });
  } catch (error) {
    return handleApiError(error, "Admin Settings PATCH", "Failed to save settings");
  }
}
