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

interface OrderEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  shipping: number;
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
    logger.info("Resend API key not configured, skipping email");
    return { success: true, skipped: true };
  }

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; background: #0a0018; color: #fff; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #12001f; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FF4FD8, #8A2BE2); padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">Order Confirmed!</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Thank you for your purchase</p>
        </div>
        
        <div style="padding: 30px;">
          <p style="color: #ccc;">Hi <strong>${data.customerName}</strong>,</p>
          <p style="color: #ccc;">Your order <strong style="color: #FF4FD8;">#${data.orderId.slice(0, 8)}</strong> has been confirmed.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #1a0030;">
                <th style="padding: 12px; text-align: left; color: #FF4FD8;">Product</th>
                <th style="padding: 12px; text-align: center; color: #FF4FD8;">Qty</th>
                <th style="padding: 12px; text-align: right; color: #FF4FD8;">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          
          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin: 8px 0;">
              <span style="color: #999;">Subtotal</span>
              <span>$${data.subtotal.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 8px 0;">
              <span style="color: #999;">Shipping</span>
              <span>${data.shipping === 0 ? "Free" : `$${data.shipping.toFixed(2)}`}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 8px 0; padding-top: 8px; border-top: 1px solid #333; font-size: 18px; font-weight: bold;">
              <span>Total</span>
              <span style="color: #FFD166;">$${data.total.toFixed(2)}</span>
            </div>
          </div>
          
          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px; color: #FF4FD8; font-size: 14px;">Shipping Address</h3>
            <p style="margin: 0; color: #ccc;">
              ${data.shippingAddress.full_name}<br>
              ${data.shippingAddress.address || data.shippingAddress.line1 || ""}<br>
              ${data.shippingAddress.city}, ${data.shippingAddress.country}
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Galaxy Store - Designed in the multiverse
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
      subject: `Order Confirmed #${data.orderId.slice(0, 8)} - Galaxy Store`,
      html,
    });

    if (error) {
      logger.error("Email send error", error);
      return { success: false, error };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Email send error", error);
    return { success: false, error };
  }
}

interface StatusUpdateData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  total: number;
}

export async function sendOrderStatusUpdate(data: StatusUpdateData) {
  if (!process.env.RESEND_API_KEY) {
    logger.info("Resend API key not configured, skipping email");
    return { success: true, skipped: true };
  }

  const statusMessages: Record<string, { title: string; message: string; color: string }> = {
    confirmed: { title: "Order Confirmed", message: "Your order has been confirmed and is being prepared.", color: "#3B82F6" },
    processing: { title: "Order Processing", message: "Your order is now being processed.", color: "#8B5CF6" },
    shipped: { title: "Order Shipped", message: "Your order has been shipped! Track your delivery.", color: "#06B6D4" },
    delivered: { title: "Order Delivered", message: "Your order has been delivered. Enjoy your purchase!", color: "#10B981" },
    cancelled: { title: "Order Cancelled", message: "Your order has been cancelled.", color: "#EF4444" },
  };

  const statusInfo = statusMessages[data.status] || statusMessages.confirmed;

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
          <h1 style="margin: 0; font-size: 24px; color: #fff;">${statusInfo.title}</h1>
        </div>
        
        <div style="padding: 30px;">
          <p style="color: #ccc;">Hi <strong>${data.customerName}</strong>,</p>
          <p style="color: #ccc;">${statusInfo.message}</p>
          
          <div style="background: #1a0030; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; color: #999;">Order #${data.orderId.slice(0, 8)}</p>
            <p style="margin: 10px 0 0; font-size: 24px; font-weight: bold; color: #FFD166;">$${data.total.toFixed(2)}</p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Galaxy Store - Designed in the multiverse
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
      subject: `${statusInfo.title} #${data.orderId.slice(0, 8)} - Galaxy Store`,
      html,
    });

    if (error) {
      logger.error("Email send error", error);
      return { success: false, error };
    }

    return { success: true, id: result?.id };
  } catch (error) {
    logger.error("Email send error", error);
    return { success: false, error };
  }
}
