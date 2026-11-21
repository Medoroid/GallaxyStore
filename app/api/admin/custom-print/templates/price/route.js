import { verifyAdmin } from "../../../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { handleApiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

/**
 * PATCH — set the selling price of a Custom Print Studio product.
 *
 * The studio's cart prices from the linked `product_variants` row, so the
 * variant price is the source of truth. The linked product's base price and
 * currency are kept in sync for storefront display; existing orders are not
 * modified.
 */
export async function PATCH(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return bad(auth.error, auth.status);

    const body = await request.json().catch(() => null);
    const templateId = String(body?.template_id ?? "");
    if (!UUID_RE.test(templateId)) return bad("A valid template id is required.");

    const price = Number(body?.price);
    if (!Number.isFinite(price) || price < 0) return bad("Enter a valid, non-negative price.");

    const currency = String(body?.currency ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return bad("Enter a valid 3-letter currency code.");

    const amount = Number(price.toFixed(2));
    const db = getServiceRoleClient();

    const { data: template, error: templateError } = await db
      .from("mockup_templates")
      .select("id, template_key, store_product_id, store_variant_id")
      .eq("id", templateId)
      .is("deleted_at", null)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) return bad("Template not found.", 404);
    if (!template.store_variant_id) {
      return bad("This template is not linked to a sellable catalog product.");
    }

    const { data: variant, error: variantError } = await db
      .from("product_variants")
      .update({ price: amount, updated_at: new Date().toISOString() })
      .eq("id", template.store_variant_id)
      .select("id, product_id, sku, price")
      .maybeSingle();
    if (variantError) throw variantError;
    if (!variant) return bad("The linked catalog variant no longer exists.", 404);

    const productId = template.store_product_id || variant.product_id;
    if (productId) {
      const { error: productError } = await db
        .from("products")
        .update({ base_price: amount, currency, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (productError) {
        // The variant price is already saved — don't turn a successful price
        // change into an error just because the display mirror failed.
        logger.warn("[Custom Print Price] product price sync failed:", productError.message);
      }
    }

    await db.from("admin_audit_log").insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email ?? null,
      action: "custom_print_price_changed",
      entity_type: "mockup_template",
      entity_id: template.id,
      details: {
        template_key: template.template_key,
        variant_id: template.store_variant_id,
        price: amount,
        currency,
      },
    });

    return Response.json({
      success: true,
      template_id: template.id,
      variant_id: template.store_variant_id,
      price: amount,
      currency,
      sku: variant.sku ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Admin custom print price PATCH", "Could not update the price.");
  }
}
