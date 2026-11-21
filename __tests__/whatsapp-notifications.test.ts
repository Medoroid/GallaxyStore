/**
 * @jest-environment node
 *
 * WhatsApp order notification contracts:
 *   - never claims delivery without a provider response
 *   - honours the admin target number / env override
 *   - message contains trusted order data
 */
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ from: mockFrom }),
}));

import {
  WHATSAPP_SETTING_KEY,
  buildOrderMessage,
  normalizeWhatsappSettings,
  sendOrderWhatsApp,
} from "@/lib/whatsapp";

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "ORD-42",
  customerName: "Test Customer",
  customerPhone: "+201000000000",
  currency: "EGP",
  items: [{ name: "Galaxy Tee", quantity: 2, price: 100, lineTotal: 200 }],
  subtotal: 200,
  shipping: 20,
  discount: 0,
  tax: 0,
  total: 220,
  paymentMethod: "cod",
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WHATSAPP_CLOUD_API_TOKEN;
  delete process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_RECIPIENT_NUMBER;
  mockMaybeSingle.mockResolvedValue({ data: null });
  global.fetch = jest.fn() as never;
});

describe("WhatsApp order notifications", () => {
  it("is blocked without a provider and never claims sent", async () => {
    process.env.WHATSAPP_RECIPIENT_NUMBER = "+201234567890";
    const result = await sendOrderWhatsApp(order);
    expect(result.status).toBe("blocked");
    expect((result as { reason: string }).reason).toBe("no_provider");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends through WhatsApp Cloud API when configured", async () => {
    process.env.WHATSAPP_RECIPIENT_NUMBER = "+201234567890";
    process.env.WHATSAPP_CLOUD_API_TOKEN = "test-token";
    process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = "phone-id";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.1" }] }),
    });

    const result = await sendOrderWhatsApp(order);
    expect(result.status).toBe("sent");
    expect((result as { providerMessageId?: string }).providerMessageId).toBe("wamid.1");
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.to).toBe("201234567890");
    expect(body.text.body).toContain("ORD-42");
    expect(body.text.body).toContain("220");
  });

  it("reports provider failures honestly", async () => {
    process.env.WHATSAPP_RECIPIENT_NUMBER = "+201234567890";
    process.env.WHATSAPP_CLOUD_API_TOKEN = "test-token";
    process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = "phone-id";
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400 });
    const result = await sendOrderWhatsApp(order);
    expect(result.status).toBe("failed");
  });

  it("reads the private admin setting when no env recipient is set", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { value: { enabled: true, number: "+201111111111", include_customer_phone: true } },
    });
    const result = await sendOrderWhatsApp(order);
    expect(mockFrom).toHaveBeenCalledWith("store_settings");
    expect(result.status).toBe("blocked");
  });

  it("validates the admin number strictly", () => {
    expect(() => normalizeWhatsappSettings({ enabled: true, number: "abc" }, true)).toThrow();
    expect(normalizeWhatsappSettings({ enabled: true, number: "+201234567890" }, true).number).toBe(
      "+201234567890"
    );
    expect(WHATSAPP_SETTING_KEY).toBe("whatsapp");
  });

  it("builds a message from trusted order data", () => {
    const message = buildOrderMessage(order);
    expect(message).toContain("Galaxy Tee");
    expect(message).toContain("ORD-42");
    expect(message).toContain("Test Customer");
  });
});
