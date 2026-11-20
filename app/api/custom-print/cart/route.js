import { requireUser, isMissingRelation, migrationRequiredResponse } from "@/lib/creator/api";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIGRATION_FILE = "supabase/migrations/20261116130000_custom_print_studio.sql";

function bad(message, field) {
  return Response.json({ success: false, message, ...(field ? { field } : {}) }, { status: 400 });
}

/** Validate every client value; ownership/price/approval are never trusted. */
function parseBody(body) {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const designId = String(body.design_id ?? "");
  if (!UUID_RE.test(designId)) return { error: "A valid design is required.", field: "design_id" };

  const templateKey = String(body.template_key ?? "");
  if (!/^[a-z0-9_]{2,40}$/.test(templateKey)) return { error: "Invalid product.", field: "template_key" };

  const quantity = Number(body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { error: "Quantity must be between 1 and 99.", field: "quantity" };
  }

  const t = body.transform;
  if (!t || typeof t !== "object") return { error: "Missing artwork placement.", field: "transform" };
  const numbers = ["cx", "cy", "width", "height", "rotation"].map((key) => Number(t[key]));
  if (!numbers.every((n) => Number.isFinite(n)) || numbers[2] <= 0 || numbers[3] <= 0) {
    return { error: "Invalid artwork placement.", field: "transform" };
  }

  const shareOptIn = body.share_opt_in === true;
  return {
    value: {
      designId,
      templateKey,
      viewKey: String(body.view_key ?? "").slice(0, 40),
      colorKey: String(body.color_key ?? "").slice(0, 40),
      sizeKey: String(body.size_key ?? "").slice(0, 40),
      quantity,
      transform: {
        cx: numbers[0], cy: numbers[1], width: numbers[2], height: numbers[3], rotation: numbers[4],
      },
      shareOptIn,
    },
  };
}

/**
 * POST /api/custom-print/cart
 *
 * Reuses the LIVE cart/checkout: creates a customer-owned `product_customizations`
 * row (preview_settings holds the immutable artwork + print configuration) and
 * passes its id to the existing `add_to_cart` RPC. The `checkout` RPC already
 * copies customization_id into order_items and stamps order_item_id, so the
 * artwork configuration survives into the order with NO new cart/order columns.
 */
export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimitAsync(`custom-print-cart:${ip}`, {
    maxRequests: 30,
    failureMode: "fail_open",
  });
  if (!allowed) {
    return Response.json({ success: false, message: "Too many requests. Please try again." }, { status: 429 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseBody(await request.json().catch(() => null));
    if (parsed.error) return bad(parsed.error, parsed.field);
    const input = parsed.value;

    // Ownership is verified with the CALLER's JWT — never a client-supplied id.
    const { data: design, error: designError } = await auth.client
      .from("user_designs")
      .select("id, title, owner_id")
      .eq("id", input.designId)
      .is("deleted_at", null)
      .maybeSingle();
    if (designError) throw designError;
    if (!design || design.owner_id !== auth.user.id) {
      return Response.json({ success: false, message: "Design not found." }, { status: 404 });
    }

    const admin = getServiceRoleClient();

    // Template → real catalog product/variant mapping is admin-managed.
    const { data: template, error: templateError } = await admin
      .from("mockup_templates")
      .select("id, template_key, store_product_id, store_variant_id, is_active")
      .eq("template_key", input.templateKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (isMissingRelation(templateError)) {
      return migrationRequiredResponse("custom-print.cart", MIGRATION_FILE);
    }
    if (templateError) throw templateError;
    if (!template || !template.is_active || !template.store_variant_id) {
      return Response.json(
        {
          success: false,
          code: "PRINT_PRODUCT_UNAVAILABLE",
          message: "This product is not configured for custom printing yet. Please contact support.",
        },
        { status: 409 }
      );
    }

    const printConfig = {
      source: "custom_print",
      design_id: design.id,
      artwork_version: "current",
      template_key: input.templateKey,
      mockup_template_id: template.id,
      product_id: template.store_product_id,
      view: input.viewKey,
      color: input.colorKey,
      size: input.sizeKey,
      transform: input.transform,
      printable_area_in: { widthIn: 12, heightIn: 12 },
      generated_preview: null,
      print_validation: { checked_client_side: true, never_crop: true, never_distort: true },
      share_opt_in: input.shareOptIn,
      created_for_order: new Date().toISOString(),
    };

    const { data: customization, error: customizationError } = await admin
      .from("product_customizations")
      .insert({
        owner_id: auth.user.id,
        product_id: template.store_product_id,
        variant_id: template.store_variant_id,
        name: `Custom ${input.templateKey.replace(/_/g, " ")} — ${String(design.title ?? "Design").slice(0, 80)}`,
        preview_settings: printConfig,
        status: "draft",
      })
      .select("id")
      .single();
    if (customizationError) throw customizationError;

    // add_to_cart re-prices from the variant and enforces owns_customization().
    const { error: cartError } = await auth.client.rpc("add_to_cart", {
      p_variant_id: template.store_variant_id,
      p_quantity: input.quantity,
      p_customization_id: customization.id,
      p_session_token: null,
    });
    if (cartError) throw cartError;

    let shared = null;
    if (input.shareOptIn) {
      // OPT-IN ONLY — private designs are never copied to the public table.
      const { data: row, error: shareError } = await admin
        .from("shared_designs")
        .insert({
          design_id: design.id,
          owner_id: auth.user.id,
          author_display_name: String(auth.user.email ?? "Galaxy customer").slice(0, 60),
          title: String(design.title ?? "Custom design").slice(0, 120),
          status: "pending_review",
          submitted_at: new Date().toISOString(),
        })
        .select("id, status")
        .maybeSingle();
      if (isMissingRelation(shareError)) {
        return migrationRequiredResponse("custom-print.share", MIGRATION_FILE);
      }
      if (shareError) throw shareError;
      shared = row;
    }

    return Response.json({
      success: true,
      customization_id: customization.id,
      shared_design: shared,
      message: "Customized product added to your cart.",
    });
  } catch (error) {
    return handleApiError(error, "Custom print cart", "Could not add the customized product to your cart.");
  }
}
