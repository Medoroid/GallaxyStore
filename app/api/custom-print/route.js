import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const BUCKET = "custom-print-designs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PRODUCT_TYPES = new Set(["tshirt", "mug", "phonecase", "poster", "other"]);

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Returns the authenticated user's id, or null when the request carries no
 * (or an invalid/expired) Bearer token. Callers decide whether guests are
 * allowed — /api/custom-print requires sign-in and returns 401 first (C3).
 */
async function authenticatedUserId(request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    const { data } = await client.auth.getUser(header.slice(7));
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`custom-print:${ip}`, {
      maxRequests: 5,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // C3 — authentication is checked BEFORE any input validation so an
    // unauthenticated request always gets an honest 401 (never a misleading
    // 400 about missing fields the guest was never allowed to submit).
    const userId = await authenticatedUserId(request);
    if (!userId) {
      return Response.json(
        {
          success: false,
          code: "auth_required",
          message: "Please sign in to submit a custom print request.",
        },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { success: false, message: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return Response.json({ success: false, message: "Invalid form data" }, { status: 400 });
    }

    const customerName = text(form.get("customer_name"), 120);
    const customerEmail = text(form.get("customer_email"), 254).toLowerCase();
    const customerPhone = text(form.get("customer_phone"), 40) || null;
    const productType = text(form.get("product_type"), 20);
    const size = text(form.get("size"), 20) || null;
    const color = text(form.get("color"), 40) || null;
    const customText = text(form.get("custom_text"), 200) || null;
    const notes = text(form.get("notes"), 2000) || null;
    const design = form.get("design");

    if (!customerName) {
      return Response.json({ success: false, message: "Your name is required" }, { status: 400 });
    }
    if (!EMAIL_RE.test(customerEmail)) {
      return Response.json(
        { success: false, message: "A valid email address is required" },
        { status: 400 }
      );
    }
    if (!PRODUCT_TYPES.has(productType)) {
      return Response.json({ success: false, message: "Choose a product type" }, { status: 400 });
    }
    if (!design || typeof design !== "object" || !("arrayBuffer" in design)) {
      return Response.json(
        { success: false, message: "A design file is required" },
        { status: 400 }
      );
    }

    const mime = String(design.type || "").toLowerCase();
    const extension = MIME_EXTENSIONS[mime];
    if (!extension) {
      return Response.json(
        { success: false, message: "Design must be JPG, PNG, WebP, GIF, AVIF or PDF" },
        { status: 400 }
      );
    }
    if (design.size > MAX_FILE_BYTES) {
      return Response.json(
        { success: false, message: "Design file must be 10MB or smaller" },
        { status: 400 }
      );
    }

    const db = getServiceRoleClient();
    const designPath = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await design.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(designPath, buffer, { contentType: mime, upsert: false });

    if (uploadError) throw uploadError;

    const { data, error } = await db
      .from("custom_print_requests")
      .insert({
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        product_type: productType,
        size,
        color,
        custom_text: customText,
        notes,
        design_path: designPath,
        design_mime: mime,
        status: "new",
      })
      .select("id, request_number, status, created_at")
      .single();

    if (error) {
      // Do not leave an orphaned object if the row could not be created.
      await db.storage.from(BUCKET).remove([designPath]);
      throw error;
    }

    logger.info("[Custom Print] request created", {
      requestId: data.id,
      requestNumber: data.request_number,
      productType,
    });

    return Response.json(
      {
        success: true,
        request: data,
        message:
          "Your design request was received. We will review it and contact you with a quote.",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Custom Print POST] failed", error);
    return handleApiError(error, "Custom Print POST", "Failed to submit the design request");
  }
}
