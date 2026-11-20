import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { computeContentsValue, isPubliclyAccessible } from "@/lib/gift-box";
import { loadVariantOptionLabels } from "@/lib/gift-box-variant-options";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public Gift Box detail: the box product's contents with per-component
 * availability flags. A component that is intentionally hidden from standalone
 * browsing is returned with `publicly_accessible: false` (no link), so the UI
 * can show it inside the box without exposing an invalid URL.
 *
 * Degradation: unauthenticated/pending-migration states return
 * `is_gift_box: false` so product pages simply hide the section.
 */

const COMPONENT_SELECT = `id, gift_box_product_id, product_id, variant_id, quantity,
       display_order, is_active, note,
       products(id, name, slug, short_description, status, visibility, deleted_at,
                base_price, compare_at_price, currency),
       product_variants(id, sku, price, stock_quantity, reserved_quantity, is_active, deleted_at)`;

function isSchemaPending(error) {
  return Boolean(error) && ["42P01", "PGRST202", "PGRST205"].includes(error.code);
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return Response.json({ success: false, message: "Invalid gift box id" }, { status: 400 });
    }

    const db = getServiceRoleClient();

    const { data: product, error: productError } = await db
      .from("products")
      .select(`id, name, slug, short_description, description, base_price, compare_at_price,
               currency, status, visibility, published_at`)
      .eq("id", id)
      .eq("status", "published")
      .eq("visibility", "visible")
      .is("deleted_at", null)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) {
      return Response.json({ success: false, message: "Gift box not found" }, { status: 404 });
    }

    const { data: marker, error: markerError } = await db
      .from("gift_boxes")
      .select("product_id, created_at")
      .eq("product_id", id)
      .maybeSingle();
    if (markerError) {
      if (isSchemaPending(markerError)) {
        return Response.json({ success: true, is_gift_box: false, schema_pending: true });
      }
      throw markerError;
    }
    if (!marker) {
      return Response.json({ success: true, is_gift_box: false, contents: [] });
    }

    const [itemsResult, boxImagesResult] = await Promise.all([
      db
        .from("gift_box_items")
        .select(COMPONENT_SELECT)
        .eq("gift_box_product_id", id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      db
        .from("product_images")
        .select("storage_path, is_primary, sort_order")
        .eq("product_id", id)
        .order("sort_order", { ascending: true }),
    ]);
    if (itemsResult.error) {
      if (isSchemaPending(itemsResult.error)) {
        return Response.json({ success: true, is_gift_box: false, schema_pending: true });
      }
      throw itemsResult.error;
    }

    const items = itemsResult.data ?? [];

    // Component currency (used to detect mixed-currency boxes so savings are
    // never fabricated).
    const contentsCurrencyByProduct = new Map(
      items.map((item) => [item.product_id, item.products?.currency ?? product.currency])
    );

    const componentProductIds = [...new Set(items.map((item) => item.product_id))];
    const [componentImagesResult, optionLabels] = await Promise.all([
      componentProductIds.length
        ? db
            .from("product_images")
            .select("product_id, storage_path, is_primary, sort_order")
            .in("product_id", componentProductIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      loadVariantOptionLabels(db, items.map((item) => item.variant_id)),
    ]);
    if (componentImagesResult.error) {
      logger.warn(
        "[Gift Box detail] component images lookup failed",
        componentImagesResult.error.message
      );
    }

    const imageByProduct = new Map();
    for (const image of componentImagesResult.data ?? []) {
      const current = imageByProduct.get(image.product_id);
      if (!current || (image.is_primary && !current.is_primary)) {
        imageByProduct.set(image.product_id, image);
      }
    }

    const contents = items.map((item) => {
      const productMeta = item.products ?? null;
      const variant = item.product_variants ?? null;
      const variantAvailable = Boolean(variant && variant.is_active && !variant.deleted_at);
      const unitPrice = variantAvailable
        ? Number(variant.price)
        : Number(productMeta?.base_price ?? 0);

      const accessible = productMeta ? isPubliclyAccessible(productMeta) : false;
      const labels = item.variant_id ? optionLabels.get(item.variant_id) : null;
      const stock =
        variantAvailable && !productMeta?.deleted_at
          ? Math.max(
              Number(variant.stock_quantity ?? 0) - Number(variant.reserved_quantity ?? 0),
              0
            )
          : 0;

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        note: item.note,
        display_order: item.display_order,
        product: productMeta
          ? {
              id: productMeta.id,
              name: productMeta.name,
              slug: productMeta.slug,
              short_description: productMeta.short_description,
              status: productMeta.status,
              visibility: productMeta.visibility,
              publicly_accessible: accessible,
              href: accessible ? `/product-details/${productMeta.id}` : null,
            }
          : null,
        image: imageByProduct.get(item.product_id)?.storage_path ?? null,
        variant: variant
          ? {
              id: variant.id,
              sku: variant.sku,
              label: labels?.label ?? "",
              options: labels?.options ?? {},
            }
          : null,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        in_stock: stock > 0,
        stock,
      };
    });

    const boxImage =
      (boxImagesResult.data ?? []).find((image) => image.is_primary)?.storage_path ??
      (boxImagesResult.data ?? [])[0]?.storage_path ??
      null;

    const value = computeContentsValue(
      contents.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product?.name ?? "Item",
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency: contentsCurrencyByProduct.get(item.product_id) ?? product.currency,
        is_active: true,
      })),
      Number(product.base_price),
      product.currency
    );

    return Response.json({
      success: true,
      is_gift_box: true,
      box: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        base_price: Number(product.base_price),
        compare_at_price:
          product.compare_at_price == null ? null : Number(product.compare_at_price),
        currency: product.currency,
        image: boxImage,
      },
      contents,
      contents_value: value.contents_value,
      savings: value.savings,
    });
  } catch (error) {
    if (isSchemaPending(error)) {
      return Response.json({ success: true, is_gift_box: false, schema_pending: true });
    }
    logger.error("[Gift Box detail GET] failed", error);
    return handleApiError(error, "Gift Box detail GET", "Failed to fetch gift box");
  }
}
