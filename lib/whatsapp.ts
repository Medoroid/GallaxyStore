import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

export const WHATSAPP_SETTING_KEY = "whatsapp";

export type WhatsAppSettings = {
  enabled: boolean;
  number: string;
  include_customer_phone: boolean;
};

export const EMPTY_WHATSAPP_SETTINGS: WhatsAppSettings = {
  enabled: false,
  number: "",
  include_customer_phone: true,
};

export function normalizeWhatsappSettings(value: unknown, strict = false): WhatsAppSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const enabled = raw.enabled === true;
  const number = String(raw.number ?? "").trim();
  const includeCustomerPhone = raw.include_customer_phone !== false;

  if (strict && enabled) {
    if (!/^\+?[1-9]\d{7,14}$/.test(number)) {
      throw new Error("WhatsApp number must be in international format, e.g. +201234567890");
    }
  }

  return { enabled, number, include_customer_phone: includeCustomerPhone };
}

export type WhatsAppOrderData = {
  orderId: string;
  orderNumber?: string;
  customerName: string;
  customerPhone?: string;
  currency?: string;
  items: Array<{ name: string; quantity: number; price: number; lineTotal?: number }>;
  subtotal: number;
  shipping: number;
  tax?: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
};

export type WhatsAppResult =
  | { status: "sent"; providerMessageId?: string }
  | { status: "skipped"; reason: "disabled" | "missing_recipient" }
  | { status: "blocked"; reason: "no_provider"; manualUrl?: string }
  | { status: "failed"; reason: string };

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

/** One canonical message used by both the API provider and the manual link. */
export function buildOrderMessage(data: WhatsAppOrderData): string {
  const currency = data.currency || "USD";
  const label = data.orderNumber || data.orderId.slice(0, 8);
  const lines = (data.items || []).map(
    (item) => `• ${item.name} × ${item.quantity} — ${formatMoney(Number(item.lineTotal ?? item.price * item.quantity), currency)}`
  );
  return [
    `🛒 New order #${label}`,
    "",
    ...lines,
    "",
    `Subtotal: ${formatMoney(data.subtotal, currency)}`,
    `Shipping: ${formatMoney(data.shipping, currency)}`,
    `Discount: ${formatMoney(data.discount || 0, currency)}`,
    `Tax: ${formatMoney(data.tax || 0, currency)}`,
    `Total: ${formatMoney(data.total, currency)}`,
    "",
    `Customer: ${data.customerName}`,
    data.customerPhone ? `Phone: ${data.customerPhone}` : "",
    data.paymentMethod ? `Payment: ${data.paymentMethod}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadSettings(): Promise<WhatsAppSettings> {
  // Environment recipient takes precedence; the admin setting is the fallback.
  const envNumber = String(process.env.WHATSAPP_RECIPIENT_NUMBER ?? "").trim();
  if (envNumber) {
    return {
      enabled: true,
      number: envNumber,
      include_customer_phone: true,
    };
  }
  try {
    const db = getServiceRoleClient();
    const { data } = await db
      .from("store_settings")
      .select("value")
      .eq("key", WHATSAPP_SETTING_KEY)
      .maybeSingle();
    const row = data as { value?: unknown } | null;
    return normalizeWhatsappSettings(row?.value);
  } catch {
    return EMPTY_WHATSAPP_SETTINGS;
  }
}

/**
 * Best-effort WhatsApp notification for a placed order.
 * Never throws; never claims delivery without a provider response.
 */
export async function sendOrderWhatsApp(data: WhatsAppOrderData): Promise<WhatsAppResult> {
  const settings = await loadSettings();
  if (!settings.enabled || !settings.number) {
    return { status: "skipped", reason: "disabled" };
  }

  const body = buildOrderMessage(data);
  const digits = settings.number.replace(/[^\d]/g, "");
  const manualUrl = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    logger.info("[WhatsApp] provider not configured; order notification blocked", {
      orderId: data.orderId,
      orderNumber: data.orderNumber,
    });
    return { status: "blocked", reason: "no_provider", manualUrl };
  }

  const version = process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0";
  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: digits,
          type: "text",
          text: { body, preview_url: false },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!response.ok) {
      logger.warn("[WhatsApp] provider rejected notification", {
        orderId: data.orderId,
        status: response.status,
      });
      return { status: "failed", reason: `provider_http_${response.status}` };
    }
    const payload = (await response.json()) as { messages?: Array<{ id?: string }> };
    logger.info("[WhatsApp] order notification sent", {
      orderId: data.orderId,
      orderNumber: data.orderNumber,
    });
    return { status: "sent", providerMessageId: payload.messages?.[0]?.id };
  } catch (error) {
    logger.warn("[WhatsApp] notification failed", {
      orderId: data.orderId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "failed", reason: "network_error" };
  }
}
