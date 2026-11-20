import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { computeContentsValue } from "@/lib/gift-box";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * Public Gift Boxes listing — the box is a normal published `products` row;
 * `gift_boxes` is only the "is a box" marker. Gating follows the storefront
 * read rule: published + visible + not soft-deleted.
 *
 * When the local gift box migration has not been applied yet, responds with
 * `boxes: []` and `schema_pending: true` so the storefront degrades cleanly.
 */

const BOX_PRODUCT_SELECT = `id, name, slug, short_description, base_price, compare_at_price,
       currency, status, visibility, published_at, created_at`;

const PUBLIC_ITEM_SELECT = `id, gift_box_product_id, product_id, variant_id, quantity,
       display_order, is_active, note,
       products(id, name, slug, status, visibility, deleted_at, base_price, compare_at_price, currency),
       product_variants(id, sku, price, stock_quantity, reserved_quantity, is_active, deleted_at)`;

function isSchemaPending(error) {
  // PostgREST reports a table missing from the schema cache with PGRST205;
  // 42P01/PGRST202 are the direct SQL/function equivalents. All mean the local
  // gift-box migration has not been applied yet.
  return Boolean(error) && ["42P01", "PGRST202", "PGRST205"].includes(error.code);
}

export async function GET() {
  try {
    const db = getServiceRoleClient();

    const { data: markers, error: markerError } = await db
      .from("gift_boxes")
      .select("product_id, created_at");
    if (markerError) {
      if (isSchemaPending(markerError)) {
        return Response.json({ success: true, boxes: [], schema_pending: true });
      }
      throw markerError;
    }

    const boxIds = (markers ?? []).map((row) => row.product_id);
    if (boxIds.length === 0) {
      return Response.json({ success: true, boxes: [] });
    }

    const [productsResult, itemsResult, imagesResult] = await Promise.all([
      db
        .from("products")
        .select(BOX_PRODUCT_SELECT)
        .in("id", boxIds)
        .eq("status", "published")
        .eq("visibility", "visible")
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false }),
      db
        .from("gift_box_items")
        .select(PUBLIC_ITEM_SELECT)
        .in("gift_box_product_id", boxIds)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      db
        .from("product_images")
        .select("product_id, storage_path, alt_text, is_primary, sort_order")
        .in("product_id", boxIds)
        .order("sort_order", { ascending: true }),
    ]);

    if (productsResult.error) {
      if (isSchemaPending(productsResult.error)) {
        return Response.json({ success: true, boxes: [], schema_pending: true });
      }
      throw productsResult.error;
    }
    if (itemsResult.error) throw itemsResult.error;
    if (imagesResult.error) {
      logger.warn(
        "[Gift Boxes GET] images lookup failed",
        imagesResult.error.message
      );
    }

    const itemsByBox = new Map();
    for (const item of itemsResult.data ?? []) {
      const list = itemsByBox.get(item.gift_box_product_id) ?? [];
      list.push(item);
      itemsByBox.set(item.gift_box_product_id, list);
    }

    const imageByProduct = new Map();
    for (const image of imagesResult.data ?? []) {
      const current = imageByProduct.get(image.product_id);
      if (!current || (image.is_primary && !current.is_primary)) {
        imageByProduct.set(image.product_id, image);
      }
    }

    const boxes = (productsResult.data ?? []).map((product) => {
      const items = itemsByBox.get(product.id) ?? [];

      const lines = items.map((item) => {
        const variant = item.product_variants ?? null;
        const productMeta = item.products ?? null;
        const variantAvailable = Boolean(variant && variant.is_active && !variant.deleted_at);
        const unitPrice = variantAvailable
          ? Number(variant.price)
          : Number(productMeta?.base_price ?? 0);
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: productMeta?.name ?? "Item",
          quantity: item.quantity,
          unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
          currency: productMeta?.currency ?? product.currency,
          is_active: item.is_active,
        };
      });

      const value = computeContentsValue(lines, Number(product.base_price), product.currency);
      const image = imageByProduct.get(product.id) ?? null;

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        short_description: product.short_description,
        base_price: Number(product.base_price),
        compare_at_price: product.compare_at_price == null ? null : Number(product.compare_at_price),
        currency: product.currency,
        published_at: product.published_at,
        image: image?.storage_path ?? null,
        item_count: items.length,
        contents_value: value.contents_value,
        savings: value.savings,
      };
    });

    return Response.json({ success: true, boxes });
  } catch (error) {
    if (isSchemaPending(error)) {
      return Response.json({ success: true, boxes: [], schema_pending: true });
    }
    logger.error("[Gift Boxes GET] failed", error);
    return handleApiError(error, "Gift Boxes GET", "Failed to fetch gift boxes");
  }
}
