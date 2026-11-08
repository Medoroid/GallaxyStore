import { Resend } from "resend";
import { logger } from "./logger";

let resendInstance: Resend | null = null;

function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "Galaxy Store <onboarding@resend.dev>";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || "USD"}`;
  }
}

interface OrderEmailData {
  orderId: string;
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  currency?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    lineTotal?: number;
  }>;
  subtotal: number;
  shipping: number;
  tax?: number;
  discount?: number;
  total: number;
  shippingAddress: {
    full_name: string;
    address?: string;
    line1?: string;
    city: string;
    country: string;
  };
}

export async function sendOrderConfirmation(data: OrderEmailData) {
  if (!process.env.RESEND_API_KEY) {
    // Honest result: nothing was sent. The order itself still succeeded.
    logger.info("Resend API key not configured; order confirmation email skipped");
    return { success: false, skipped: true, reason: "not_configured" as const };
  }

  if (!data.customerEmail) {
    return { success: false, skipped: true, reason: "missing_email" as const };
  }

  const currency = data.currency || "USD";
  const orderLabel = data.orderNumber || data.orderId.slice(0, 8);

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${escapeHtml(item.name)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${Number(item.quantity || 0)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${escapeHtml(money(item.lineTotal ?? item.price * item.quantity, currency))}</td>
      </tr>
    `
    )
    .join("");

  const summaryRow = (label: string, value: string, strong = false) => `
    <div style="display: flex; justify-content: space-between; margin: 8px 0;${strong ? " padding-top: 8px; border-top: 1px solid #333; font-size: 18px; font-weight: bold;" : ""}">
      <span style="color: #999;">${escapeHtml(label)}</span>
      <span>${escapeHtml(value)}</span>
    </div>`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order ${escapeHtml(orderLabel)}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background: #0a0018; color: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #12001f; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FF4FD8, #8A2BE2); padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">Order Received</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Thank you for your purchase</p>
        </div>

        <div style="padding: 30px;">
          <p style="color: #ccc;">Hi <strong>${escapeHtml(data.customerName)}</strong>,</p>
          <p style="color: #ccc;">We received order <strong style="color: #FF4FD8;">#${escapeHtml(orderLabel)}</strong>. This email is a record of the order; it is not a payment confirmation.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #1a0030;">
                <th style="padding: 12px; text-align: left; color: #FF4FD8;">Product</th>
                <th style="padding: 12px; text-align: center; color: #FF4FD8;">Qty</th>
                <th style="padding: 12px; text-align: right; color: #FF4FD8;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            ${summaryRow("Subtotal", money(data.subtotal, currency))}
            ${summaryRow("Shipping", data.shipping === 0 ? "Free" : money(data.shipping, currency))}
            ${Number(data.tax || 0) > 0 ? summaryRow("Tax", money(Number(data.tax), currency)) : ""}
            ${Number(data.discount || 0) > 0 ? summaryRow("Discount", `-${money(Number(data.discount), currency)}`) : ""}
            ${summaryRow("Total", money(data.total, currency), true)}
          </div>

          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px; color: #FF4FD8; font-size: 14px;">Shipping Address</h3>
            <p style="margin: 0; color: #ccc;">
              ${escapeHtml(data.shippingAddress.full_name)}<br>
              ${escapeHtml(data.shippingAddress.address || data.shippingAddress.line1 || "")}<br>
              ${escapeHtml(data.shippingAddress.city)}, ${escapeHtml(data.shippingAddress.country)}
            </p>
          </div>

          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Gallaxy Store - Designed in the multiverse
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResend();
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Order #${orderLabel} received - Gallaxy Store`,
      html,
    });

    if (error) {
      logger.error("Email send error", { message: error.message });
      return { success: false, error };
    }

    logger.info("Order confirmation email accepted by provider", {
      orderId: data.orderId,
      emailId: result?.id,
    });
    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Email send error", error);
    return { success: false, error };
  }
}

interface StatusUpdateData {
  orderId: string;
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  status: string;
  total: number;
  currency?: string;
}

export async function sendOrderStatusUpdate(data: StatusUpdateData) {
  if (!process.env.RESEND_API_KEY) {
    logger.info("Resend API key not configured; status email skipped");
    return { success: false, skipped: true, reason: "not_configured" as const };
  }

  const statusMessages: Record<string, { title: string; message: string; color: string }> = {
    paid: { title: "Payment Confirmed", message: "Your payment was verified and your order is being prepared.", color: "#10B981" },
    confirmed: { title: "Order Confirmed", message: "Your order has been confirmed and is being prepared.", color: "#3B82F6" },
    processing: { title: "Order Processing", message: "Your order is now being processed.", color: "#8B5CF6" },
    printing: { title: "Order Printing", message: "Your custom items are being printed.", color: "#8B5CF6" },
    shipped: { title: "Order Shipped", message: "Your order has been shipped! Track your delivery.", color: "#06B6D4" },
    delivered: { title: "Order Delivered", message: "Your order has been delivered. Enjoy your purchase!", color: "#10B981" },
    cancelled: { title: "Order Cancelled", message: "Your order has been cancelled.", color: "#EF4444" },
    refunded: { title: "Order Refunded", message: "Your order has been refunded.", color: "#F59E0B" },
  };

  const statusInfo = statusMessages[data.status] || statusMessages.confirmed;
  const orderLabel = data.orderNumber || data.orderId.slice(0, 8);
  const currency = data.currency || "USD";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; background: #0a0018; color: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #12001f; border-radius: 16px; overflow: hidden;">
        <div style="background: ${statusInfo.color}; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">${escapeHtml(statusInfo.title)}</h1>
        </div>

        <div style="padding: 30px;">
          <p style="color: #ccc;">Hi <strong>${escapeHtml(data.customerName)}</strong>,</p>
          <p style="color: #ccc;">${escapeHtml(statusInfo.message)}</p>

          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; color: #999;">Order #${escapeHtml(orderLabel)}</p>
            <p style="margin: 10px 0 0; font-size: 24px; font-weight: bold; color: #FFD166;">${escapeHtml(money(data.total, currency))}</p>
          </div>

          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Gallaxy Store - Designed in the multiverse
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResend();
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `${statusInfo.title} #${orderLabel} - Gallaxy Store`,
      html,
    });

    if (error) {
      logger.error("Status email send error", { message: error.message });
      return { success: false, error };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Status email send error", error);
    return { success: false, error };
  }
}

export interface ContactMessageData {
  /** Destination inbox — the admin-configured `support_email` setting. */
  to: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

/**
 * B4 — delivers a contact-form message to the configured support inbox.
 * The visitor's address goes in `reply_to` so the store owner can answer
 * directly. Returns an honest result; never throws.
 */
export async function sendContactMessage(data: ContactMessageData) {
  if (!process.env.RESEND_API_KEY) {
    logger.info("Resend API key not configured; contact email skipped");
    return { success: false, skipped: true, reason: "not_configured" as const };
  }

  if (!data.to) {
    return { success: false, skipped: true, reason: "missing_recipient" as const };
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; background: #0a0018; color: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #12001f; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FF4FD8, #8A2BE2); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; color: #fff;">New contact message</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 4px; color: #999; font-size: 13px;">From</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(data.name)}</strong> &lt;${escapeHtml(data.email)}&gt;</p>
          <p style="margin: 0 0 4px; color: #999; font-size: 13px;">Subject</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(data.subject)}</strong></p>
          <p style="margin: 0 0 4px; color: #999; font-size: 13px;">Message</p>
          <p style="margin: 0; white-space: pre-line; color: #ccc;">${escapeHtml(data.message)}</p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; padding: 0 20px 20px; margin: 0;">
          Reply directly to this email to answer the customer.
        </p>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResend();
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      replyTo: data.email,
      subject: `[Contact] ${data.subject} — ${data.name}`,
      html,
    });

    if (error) {
      logger.error("Contact email send error", { message: error.message });
      return { success: false, error };
    }

    logger.info("Contact message accepted by provider", {
      emailId: result?.id,
      subjectLength: data.subject.length,
      messageLength: data.message.length,
    });
    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Contact email send error", error);
    return { success: false, error };
  }
}

interface CustomPrintUpdateData {
  requestNumber: string;
  customerName: string;
  customerEmail: string;
  status: string;
  quotedAmount?: number | null;
  currency?: string;
  adminNotes?: string | null;
}

const CUSTOM_PRINT_STATUS: Record<string, string> = {
  reviewing: "Your artwork is being reviewed by our print team.",
  quoted: "We have prepared a quote for your custom print request.",
  accepted: "Your quote was accepted. We will start production shortly.",
  completed: "Your custom print request is complete.",
  cancelled: "Your custom print request was cancelled. Contact us if this is unexpected.",
};

export async function sendCustomPrintUpdate(data: CustomPrintUpdateData) {
  if (!process.env.RESEND_API_KEY) {
    logger.info("Resend API key not configured; custom print email skipped");
    return { success: false, skipped: true, reason: "not_configured" as const };
  }

  if (!data.customerEmail) {
    return { success: false, skipped: true, reason: "missing_email" as const };
  }

  const message = CUSTOM_PRINT_STATUS[data.status];
  if (!message) return { success: false, skipped: true, reason: "no_message" as const };

  const currency = data.currency || "USD";
  const quote =
    data.status === "quoted" && data.quotedAmount != null
      ? `<div style="background:#1a0030;border-radius:12px;padding:20px;margin:20px 0;">
           <p style="margin:0;color:#999;">Quote</p>
           <p style="margin:10px 0 0;font-size:24px;font-weight:bold;color:#FFD166;">${escapeHtml(money(Number(data.quotedAmount), currency))}</p>
         </div>`
      : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; background: #0a0018; color: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #12001f; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FF4FD8, #8A2BE2); padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">Custom Print Update</h1>
        </div>
        <div style="padding: 30px;">
          <p style="color: #ccc;">Hi <strong>${escapeHtml(data.customerName)}</strong>,</p>
          <p style="color: #ccc;">${escapeHtml(message)}</p>
          <p style="color: #999; font-size: 13px;">Request: <strong style="color:#FF4FD8;">${escapeHtml(data.requestNumber)}</strong></p>
          ${quote}
          ${data.adminNotes ? `<p style="color:#ccc;white-space:pre-line;">${escapeHtml(data.adminNotes)}</p>` : ""}
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Gallaxy Store - Designed in the multiverse
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const resend = getResend();
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Custom print ${data.requestNumber} - Gallaxy Store`,
      html,
    });

    if (error) {
      logger.error("Custom print email error", { message: error.message });
      return { success: false, error };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Custom print email error", error);
    return { success: false, error };
  }
}
