import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { getPublicStoreSettings } from "@/lib/storeSettings";
import { sendContactMessage } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * B4 — public contact form delivery.
 *
 * The old contact form "submitted" locally with a fake success state and
 * never sent anything. This endpoint performs a real delivery to the
 * admin-configured `support_email` via the existing Resend integration and
 * only reports success after the provider accepts the message.
 *
 * If the store owner has not configured a support email (or RESEND_API_KEY),
 * the request fails with an honest 503 — never a simulated success.
 */
export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`contact:${ip}`, {
      maxRequests: 5,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many messages. Please try again in a minute." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { success: false, message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || name.length > 100) {
      return Response.json(
        { success: false, message: "Name is required (1-100 characters)" },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return Response.json(
        { success: false, message: "A valid email address is required" },
        { status: 400 }
      );
    }
    if (!subject || subject.length > 200) {
      return Response.json(
        { success: false, message: "Subject is required (1-200 characters)" },
        { status: 400 }
      );
    }
    if (!message || message.length > 5000) {
      return Response.json(
        { success: false, message: "Message is required (1-5000 characters)" },
        { status: 400 }
      );
    }

    const settings = await getPublicStoreSettings();
    const to = settings.support_email;
    if (!to) {
      return Response.json(
        {
          success: false,
          message:
            "Contact delivery is not configured yet — no support email is set. Please contact the store through another channel.",
        },
        { status: 503 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return Response.json(
        {
          success: false,
          message: "Email delivery is not configured on this deployment.",
        },
        { status: 503 }
      );
    }

    const result = await sendContactMessage({ to, name, email, subject, message });
    if (!result.success) {
      logger.error("Contact message delivery failed", {
        route: "/api/contact",
        operation: "contact.send",
        errorCode: "CONTACT_DELIVERY_FAILED",
      });
      return Response.json(
        { success: false, message: "We could not deliver your message. Please try again later." },
        { status: 502 }
      );
    }

    // Lengths only — never the visitor's name, email or message body (PII).
    logger.info("Contact message delivered", {
      route: "/api/contact",
      operation: "contact.send",
      nameLength: name.length,
      subjectLength: subject.length,
      messageLength: message.length,
    });

    return Response.json({
      success: true,
      message: "Thanks — your message has been sent. We'll get back to you soon.",
    });
  } catch (error) {
    return handleApiError(error, "Contact POST", "Failed to send your message");
  }
}
