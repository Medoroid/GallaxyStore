/**
 * @jest-environment node
 *
 * WhatsApp Click-to-Chat contracts (no API, no token, no webhook):
 *   - link is built only from trusted persisted order data
 *   - Arabic text is encoded correctly in the wa.me URL
 *   - missing recipient is skipped, never faked
 */
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockFrom }),
}));

import {
  WHATSAPP_SETTING_KEY,
  buildOrderMessage,
  buildWhatsAppUrl,
  normalizeWhatsappSettings,
} from "@/lib/whatsapp";

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "ORD-42",
  storeName: "Gallaxy Store",
  orderDate: "2026-11-21T10:30:00Z",
  customerName: "أحمد محمد",
  customerPhone: "+201234567890",
  shippingAddress: { address: "شارع النيل", city: "القاهرة", country: "مصر" },
  currency: "EGP",
  items: [{ name: "تيشيرت جالاكسي", quantity: 2, price: 100, lineTotal: 200 }],
  subtotal: 200,
  shipping: 20,
  discount: 10,
  tax: 0,
  total: 210,
  paymentMethod: "الدفع عند الاستلام",
  customerNote: "يرجى الاتصال قبل التوصيل",
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WHATSAPP_RECIPIENT_NUMBER;
  mockMaybeSingle.mockResolvedValue({ data: null });
});

describe("WhatsApp Click-to-Chat", () => {
  it("builds a wa.me URL with encoded Arabic message and digits-only recipient", async () => {
    process.env.WHATSAPP_RECIPIENT_NUMBER = "+201 234 567 890";
    const result = await buildWhatsAppUrl(order);
    expect(result.status).toBe("ready");
    const url = (result as { url: string }).url;
    expect(url.startsWith("https://wa.me/201234567890?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("Gallaxy Store");
    expect(text).toContain("ORD-42");
    expect(text).toContain("أحمد محمد");
    expect(text).toContain("شارع النيل");
    expect(text).toContain("تيشيرت جالاكسي");
    expect(text).toContain("210");
    expect(text).toContain("الدفع عند الاستلام");
    expect(text).toContain("يرجى الاتصال قبل التوصيل");
  });

  it("skips when no recipient is configured", async () => {
    const result = await buildWhatsAppUrl(order);
    expect(result).toEqual({ status: "skipped", reason: "disabled" });
  });

  it("loads the private admin setting without any env override", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { value: { enabled: true, number: "+201111111111" } },
    });
    const result = await buildWhatsAppUrl(order);
    expect(mockFrom).toHaveBeenCalledWith("store_settings");
    expect((result as { url: string }).url).toContain("wa.me/201111111111");
  });

  it("strips + and spaces from the stored number", () => {
    expect(normalizeWhatsappSettings({ enabled: true, number: "+201 234 567 890" }).number).toBe(
      "201234567890"
    );
    expect(() => normalizeWhatsappSettings({ enabled: true, number: "abc" }, true)).toThrow();
    expect(WHATSAPP_SETTING_KEY).toBe("whatsapp");
  });

  it("includes every required order field in the message", () => {
    const message = buildOrderMessage(order);
    for (const field of [
      "رقم الطلب", "التاريخ", "اسم العميل", "رقم الهاتف", "عنوان التوصيل",
      "المنتجات", "الكمية", "السعر", "المجموع الفرعي", "الشحن", "الخصم",
      "الضرائب", "الإجمالي النهائي", "طريقة الدفع", "ملاحظات الطلب",
    ]) {
      expect(message).toContain(field);
    }
  });
});
