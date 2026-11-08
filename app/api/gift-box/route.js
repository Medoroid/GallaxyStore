import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const TABLE = "custom_print_requests";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OCCASIONS = new Set([
  "birthday",
  "wedding",
  "graduation",
  "anniversary",
  "holiday",
  "other",
]);

const REQUEST_SELECT = "id, request_number, status, created_at";
const NOTES_MARKER = "[GIFT BOX REQUEST]";

/**
 * Until the prepared (local-only) migration that adds 'gift_box' to the
 * product_type CHECK has been applied, the clean type is rejected by the
 * database. Cache that per process and fall back to 'other' + a clear notes
 * marker so the request still reaches the admin custom-prints queue instead of
 * failing for customers. Once the migration is applied the clean type is used
 * again automatically (cache resets on cold start).
 */
let giftBoxTypeSupported = null; // true | false | null (unknown)

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Resolve the caller from the Authorization header ONLY. Session cookies are
 * deliberately ignored here: this endpoint must never trust ambient cookie
 * state without an explicit bearer token from the client.
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
    const { data, error } = await client.auth.getUser(header.slice(7));
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimitAsync(`gift-box:${ip}`, {
      maxRequests: 5,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // AUTH FIRST (C3 ordering): no valid session -> 401, before any body or
    // field validation. The client page warns guests up front (A2/C4).
    const userId = await authenticatedUserId(request);
    if (!userId) {
      return Response.json(
        { success: false, message: "Sign in required to send a gift box request." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
    }

    const customerName = text(body.name, 120);
    const customerEmail = text(body.email, 254).toLowerCase();
    const occasion = text(body.occasion, 20);
    const details = text(body.message, 2000);
    const budgetRaw = body.budget;

    if (!customerName) {
      return Response.json({ success: false, message: "Your name is required" }, { status: 400 });
    }
    if (!EMAIL_RE.test(customerEmail)) {
      return Response.json(
        { success: false, message: "A valid email address is required" },
        { status: 400 }
      );
    }
    if (!OCCASIONS.has(occasion)) {
      return Response.json({ success: false, message: "Choose an occasion" }, { status: 400 });
    }
    if (!details) {
      return Response.json(
        { success: false, message: "Tell us what you want in the box" },
        { status: 400 }
      );
    }

    let budget = null;
    if (budgetRaw !== undefined && budgetRaw !== null && budgetRaw !== "") {
      budget = Number(budgetRaw);
      if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000) {
        return Response.json(
          { success: false, message: "Budget must be a positive amount" },
          { status: 400 }
        );
      }
    }

    const notes = [
      NOTES_MARKER,
      `Occasion: ${occasion}`,
      budget !== null ? `Budget: ${budget}` : null,
      `Details: ${details}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const db = getServiceRoleClient();
    const baseRow = {
      user_id: userId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: null,
      size: null,
      color: null,
      custom_text: null,
      notes,
      // design_path is NOT NULL on the current schema; gift box requests carry
      // no design file, so an empty path is stored (admin UI hides the link).
      design_path: "",
      status: "new",
    };

    let data = null;
    let error = null;

    if (giftBoxTypeSupported !== false) {
      ({ data, error } = await db
        .from(TABLE)
        .insert({ ...baseRow, product_type: "gift_box" })
        .select(REQUEST_SELECT)
        .single());

      if (!error) {
        giftBoxTypeSupported = true;
      } else if (error.code === "23514") {
        // product_type CHECK does not know 'gift_box' yet (migration pending).
        giftBoxTypeSupported = false;
        logger.warn(
          "[Gift Box] product_type 'gift_box' rejected — falling back until migration is applied",
          { errorCode: error.code }
        );
        data = null;
      } else {
        throw error;
      }
    }

    if (!data) {
      ({ data, error } = await db
        .from(TABLE)
        .insert({ ...baseRow, product_type: "other" })
        .select(REQUEST_SELECT)
        .single());
      if (error) throw error;
    }

    logger.withContext({
      operation: "gift-box.request.create",
      route: "/api/gift-box",
    }).info("Gift box request created", {
      requestId: data.id,
      requestNumber: data.request_number,
    });

    return Response.json(
      {
        success: true,
        request: data,
        message: "Your gift box request was received. We will review it and contact you shortly.",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Gift Box POST] failed", error);
    return handleApiError(error, "Gift Box POST", "Failed to submit the gift box request");
  }
}
