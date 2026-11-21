import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const WHATSAPP_SETTING_KEY = "whatsapp";

export type WhatsAppSettings = {
  enabled: boolean;
  /** Digits only, international format without '+' or spaces. */
  number: string;
};

export const EMPTY_WHATSAPP_SETTINGS: WhatsAppSettings = {
  enabled: false,
  number: "",
};

export function normalizeWhatsappSettings(value: unknown, strict = false): WhatsAppSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const enabled = raw.enabled === true;
  const number = String(raw.number ?? "")
    .replace(/[^\d]/g, "")
    .trim();

  if (strict && enabled && !/^[1-9]\d{7,14}$/.test(number)) {
    throw new Error("رقم واتساب يجب أن يكون بالصيغة الدولية بدون + أو مسافات، مثال: 201234567890");
  }

  return { enabled, number };
}

export type WhatsAppOrderData = {
  orderId: string;
  orderNumber?: string;
  storeName?: string;
  orderDate?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: {
    full_name?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
  };
  currency?: string;
  items: Array<{ name: string; quantity: number; price: number; lineTotal?: number }>;
  subtotal: number;
  shipping: number;
  tax?: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
  customerNote?: string;
};

export type WhatsAppLinkResult =
  | { status: "ready"; url: string }
  | { status: "skipped"; reason: "disabled" | "missing_recipient" };

function money(value: number, currency: string) {
  try {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(Number(value || 0))} ${currency}`;
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

/** Arabic, UTF-8 message built only from trusted persisted order data. */
export function buildOrderMessage(data: WhatsAppOrderData): string {
  const currency = data.currency || "EGP";
  const orderLabel = data.orderNumber || data.orderId.slice(0, 8);
  const date = data.orderDate
    ? new Date(data.orderDate).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const address = data.shippingAddress || {};
  const addressText = [address.address, address.city, address.country].filter(Boolean).join("، ") || "—";

  const items = (data.items || [])
    .map(
      (item, index) =>
        `${index + 1}. ${item.name}\n   الكمية: ${item.quantity} | السعر: ${money(item.price, currency)} | الإجمالي: ${money(Number(item.lineTotal ?? item.price * item.quantity), currency)}`
    )
    .join("\n");

  return [
    `🛍️ ${data.storeName || "Gallaxy Store"} — تفاصيل طلب جديد`,
    "",
    `رقم الطلب: ${orderLabel}`,
    `التاريخ: ${date}`,
    "",
    `اسم العميل: ${data.customerName || "—"}` + `\nرقم الهاتف: ${data.customerPhone || address.phone || "—"}`,
    `عنوان التوصيل: ${addressText}`,
    "",
    "📦 المنتجات:",
    items || "—",
    "",
    `المجموع الفرعي: ${money(data.subtotal, currency)}`,
    `الشحن: ${money(data.shipping, currency)}`,
    `الخصم: ${money(data.discount || 0, currency)}`,
    `الضرائب: ${money(data.tax || 0, currency)}`,
    `الإجمالي النهائي: ${money(data.total, currency)}`,
    "",
    `طريقة الدفع: ${data.paymentMethod || "—"}`,
    data.customerNote ? `ملاحظات الطلب: ${data.customerNote}` : "",
    "",
    "يرجى تأكيد استلام الطلب.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadRecipient(): Promise<WhatsAppSettings> {
  const envNumber = String(process.env.WHATSAPP_RECIPIENT_NUMBER ?? "")
    .replace(/[^\d]/g, "")
    .trim();
  if (envNumber) return { enabled: true, number: envNumber };

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
 * WhatsApp Click-to-Chat link only. No API, token, webhook or subscription.
 * Opening the link prepares the message — the customer still presses Send.
 */
export async function buildWhatsAppUrl(
  data: WhatsAppOrderData
): Promise<WhatsAppLinkResult> {
  const settings = await loadRecipient();
  if (!settings.enabled || !settings.number) {
    return { status: "skipped", reason: "disabled" };
  }
  const message = buildOrderMessage(data);
  return {
    status: "ready",
    url: `https://wa.me/${settings.number}?text=${encodeURIComponent(message)}`,
  };
}
