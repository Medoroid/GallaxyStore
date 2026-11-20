import { verifyAdmin } from "../_lib/verifyAdmin";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import {
  isMissingSizesColumn,
  omitAvailableSizes,
  parseProductPayload,
  reapplyProductAttributes,
  syncDefaultVariant,
  uuidOrNull,
} from "@/lib/product-admin";
import {
  computeContentsValue,
  MAX_COMPONENT_QUANTITY,
  validateCompositionInput,
} from "@/lib/gift-box";
import { loadVariantOptionLabels } from "@/lib/gift-box-variant-options";

/**
 * Admin Gift Box API — the box itself is a normal `products` row (existing
 * architecture, existing product lifecycle) plus a `gift_boxes` marker row.
 * Composition lives in `gift_box_items`.
 *
 * All writes use the service-role client (same pattern as /api/admin/products);
 * RLS on the new tables is read-only for anon/authenticated.
 */

const BOX_SELECT = `id, store_id, brand_id, category_id, name, slug, short_description, description,
       status, visibility, is_featured, base_price, compare_at_price, currency,
       avg_rating, rating_count, published_at, created_at, updated_at, deleted_at,
       color, available_colors, available_sizes,
       categories(id, name, slug), brands(id, name, slug), stores(id, name),
       product_variants(id, sku, price, stock_quantity, reserved_quantity, is_default, is_active, deleted_at)`;

const ITEM_SELECT = `id, gift_box_product_id, product_id, variant_id, quantity, display_order,
       note, is_active, created_at, updated_at,
       products(id, name, slug, status, visibility, deleted_at, base_price, compare_at_price, currency),
       product_variants(id, sku, price, stock_quantity, reserved_quantity, is_active, deleted_at)`;

/** A missing gift_* relation means the local migration has not been applied. */
function isSchemaPending(error) {
  return Boolean(error) && (error.code === "42P01" || error.code === "PGRST202");
}

function schemaPendingResponse(operation) {
  return Response.json(
    {
      success: false,
      code: "GIFT_BOX_SCHEMA_PENDING",
      message:
        "Gift box tables are not created yet. Apply supabase/migrations/20261117140000_gift_box_bundles.sql first.",
    },
    { status: 503 }
  );
}

function badRequest(message) {
  return Response.json({ success: false, message }, { status: 400 });
}

async function loadBoxProductIds(db) {
  const { data, error } = await db.from("gift_boxes").select("product_id");
  if (error) throw error;
  return (data ?? []).map((row) => row.product_id);
}

async function loadProductsByIds(db, ids) {
  if (ids.length === 0) return [];
  const build = (selectCols) =>
    db.from("products").select(selectCols).in("id", ids).order("created_at", { ascending: false });

  let result = await build(BOX_SELECT);
  if (isMissingSizesColumn(result.error)) {
    result = await build(BOX_SELECT.replace(/\s*available_sizes,/, ""));
  }
  if (result.error) throw result.error;
  return result.data ?? [];
}

/** Resolve the component variant: explicit → default → any active variant. */
async function resolveComponentVariant(db, productId, variantId) {
  if (variantId) {
    const { data, error } = await db
      .from("product_variants")
      .select("id, product_id, is_active, deleted_at")
      .eq("id", variantId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.product_id !== productId) {
      return { error: "The selected variant does not belong to this product" };
    }
    if (!data.is_active || data.deleted_at) {
      return { error: "The selected variant is not available" };
    }
    return { variantId: data.id };
  }

  const { data: variants, error } = await db
    .from("product_variants")
    .select("id, is_default, is_active, deleted_at")
    .eq("product_id", productId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const usable = (variants ?? []).find((v) => v.is_active && !v.deleted_at);
  if (!usable) {
    return { error: "This product has no active variant — add stock/variants first" };
  }
  return { variantId: usable.id };
}

async function loadBoxItems(db, boxProductId) {
  const { data, error } = await db
    .from("gift_box_items")
    .select(ITEM_SELECT)
    .eq("gift_box_product_id", boxProductId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function enrichItem(item) {
  const product = item.products ?? null;
  const variant = item.product_variants ?? null;
  const stock =
    variant && !variant.deleted_at && variant.is_active
      ? Number(variant.stock_quantity ?? 0)
      : null;
  const reserved =
    variant && !variant.deleted_at && variant.is_active
      ? Number(variant.reserved_quantity ?? 0)
      : 0;
  const unitPrice = variant && !variant.deleted_at ? Number(variant.price) : Number(product?.base_price ?? 0);

  return {
    id: item.id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    display_order: item.display_order,
    note: item.note,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
    product: product
      ? {
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          visibility: product.visibility,
          deleted_at: product.deleted_at,
          currency: product.currency,
          publicly_accessible:
            product.status === "published" &&
            product.visibility === "visible" &&
            !product.deleted_at,
        }
      : null,
    variant: variant
      ? {
          id: variant.id,
          sku: variant.sku,
          price: Number(variant.price),
          is_active: variant.is_active,
          deleted_at: variant.deleted_at,
        }
      : null,
    stock: stock === null ? null : Math.max(stock - reserved, 0),
    unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    available:
      stock !== null &&
      variant.is_active &&
      !variant.deleted_at &&
      product?.deleted_at == null,
  };
}

// -----------------------------------------------------------------------------
// GET — every gift box with its complete contents (admin preview source)
// -----------------------------------------------------------------------------
export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const includeArchived =
      new URL(request.url).searchParams.get("include_archived") === "1";

    const { data: markerRows, error: markerError } = await db
      .from("gift_boxes")
      .select("product_id, created_at");
    if (markerError) {
      if (isSchemaPending(markerError)) return schemaPendingResponse("GET");
      throw markerError;
    }

    const boxIds = (markerRows ?? []).map((row) => row.product_id);
    const markerByProduct = new Map(
      (markerRows ?? []).map((row) => [row.product_id, row.created_at])
    );

    const [products, itemsResult, categories, brands, stores] = await Promise.all([
      loadProductsByIds(db, boxIds),
      boxIds.length
        ? db
            .from("gift_box_items")
            .select(ITEM_SELECT)
            .in("gift_box_product_id", boxIds)
            .order("display_order", { ascending: true })
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      db.from("categories").select("id, name, slug").is("deleted_at", null).order("sort_order"),
      db.from("brands").select("id, name, slug").is("deleted_at", null).order("name"),
      db.from("stores").select("id, name").is("deleted_at", null).order("name"),
    ]);

    if (itemsResult.error) {
      if (isSchemaPending(itemsResult.error)) return schemaPendingResponse("GET");
      throw itemsResult.error;
    }

    const imageProductIds = [
      ...products.map((p) => p.id),
      ...(itemsResult.data ?? []).map((row) => row.product_id),
    ];
    const images = imageProductIds.length
      ? await db
          .from("product_images")
          .select("id, product_id, storage_path, alt_text, is_primary, sort_order")
          .in("product_id", [...new Set(imageProductIds)])
          .order("sort_order", { ascending: true })
      : { data: [], error: null };
    if (images.error) {
      logger.warn("[Admin Gift Boxes GET] images lookup failed", images.error.message);
    }

    const imagesByProduct = new Map();
    for (const image of images.data ?? []) {
      const list = imagesByProduct.get(image.product_id) ?? [];
      list.push(image);
      imagesByProduct.set(image.product_id, list);
    }

    const itemsByBox = new Map();
    for (const row of itemsResult.data ?? []) {
      const list = itemsByBox.get(row.gift_box_product_id) ?? [];
      list.push(enrichItem(row));
      itemsByBox.set(row.gift_box_product_id, list);
    }

    // Variant option labels (Size / Color) for the composition preview.
    let optionLabels = new Map();
    try {
      optionLabels = await loadVariantOptionLabels(
        db,
        (itemsResult.data ?? []).map((row) => row.variant_id)
      );
    } catch (labelsError) {
      logger.warn(
        "[Admin Gift Boxes GET] option labels lookup failed",
        labelsError.message
      );
    }

    const visibleProducts = products.filter(
      (product) => includeArchived || (!product.deleted_at && product.status !== "archived")
    );

    const boxes = visibleProducts.map((product) => {
      const variants = product.product_variants ?? [];
      const defaultVariant =
        variants.find((v) => v.is_default && v.is_active && !v.deleted_at) ??
        variants.find((v) => v.is_active && !v.deleted_at) ??
        null;
      delete product.product_variants;

      const contents = (itemsByBox.get(product.id) ?? []).map((item) => {
        const labels = item.variant_id ? optionLabels.get(item.variant_id) : null;
        return {
          ...item,
          variant: item.variant
            ? {
                ...item.variant,
                label: labels?.label ?? "",
                options: labels?.options ?? {},
              }
            : null,
          image:
            (imagesByProduct.get(item.product_id) ?? []).find((img) => img.is_primary)
              ?.storage_path ??
            (imagesByProduct.get(item.product_id) ?? [])[0]?.storage_path ??
            null,
        };
      });

      const value = computeContentsValue(
        contents.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product?.name ?? "Item",
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: item.variant ? product.currency : (item.product?.currency ?? product.currency),
          is_active: item.is_active,
        })),
        Number(product.base_price),
        product.currency
      );

      return {
        ...product,
        is_gift_box: true,
        registered_at: markerByProduct.get(product.id) ?? null,
        default_variant: defaultVariant,
        contents,
        contents_value: value.contents_value,
        savings: value.savings,
        image:
          (imagesByProduct.get(product.id) ?? []).find((img) => img.is_primary)
            ?.storage_path ??
          (imagesByProduct.get(product.id) ?? [])[0]?.storage_path ??
          null,
        images: (imagesByProduct.get(product.id) ?? []).map((img) => ({
          id: img.id,
          storage_path: img.storage_path,
          is_primary: Boolean(img.is_primary),
          sort_order: img.sort_order,
        })),
      };
    });

    return Response.json({
      success: true,
      boxes,
      lookups: {
        categories: categories.data ?? [],
        brands: brands.data ?? [],
        stores: stores.data ?? [],
      },
    });
  } catch (error) {
    if (isSchemaPending(error)) return schemaPendingResponse("GET");
    logger.error("[Admin Gift Boxes GET] failed", error);
    return handleApiError(error, "Admin Gift Boxes GET", "Failed to fetch gift boxes");
  }
}

// -----------------------------------------------------------------------------
// POST — box lifecycle + composition mutations
// -----------------------------------------------------------------------------
export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (!action) return badRequest("Missing action");

    // ----------------------------------------------------------------- box ----
    if (action === "create_box" || action === "update_box") {
      const productId = action === "update_box" ? uuidOrNull(body?.product_id) : null;
      if (action === "update_box" && !productId) return badRequest("Invalid product id");

      let payload;
      try {
        payload = parseProductPayload(body?.product || body);
      } catch (validationError) {
        return badRequest(validationError.message);
      }

      if (action === "create_box") {
        let { data, error } = await db
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (error && isMissingSizesColumn(error)) {
          ({ data, error } = await db
            .from("products")
            .insert(omitAvailableSizes(payload))
            .select("id")
            .single());
        }
        if (error) {
          if (error.code === "23505") {
            return Response.json(
              { success: false, message: "A product with this slug already exists" },
              { status: 409 }
            );
          }
          throw error;
        }

        try {
          await syncDefaultVariant(db, data.id, payload, body?.stock_quantity);
          await reapplyProductAttributes(db, data.id, payload);
        } catch (variantError) {
          await db.from("products").delete().eq("id", data.id);
          throw variantError;
        }

        const { error: markerError } = await db
          .from("gift_boxes")
          .insert({ product_id: data.id });
        if (markerError) {
          // Never leave an unregistered box product behind.
          await db.from("products").delete().eq("id", data.id);
          if (markerError.code === "P0001") {
            return badRequest(markerError.message);
          }
          throw markerError;
        }

        logger.withContext({ operation: "admin.giftbox.create" }).info("Gift box created", {
          productId: data.id,
        });
        return Response.json({ success: true, product_id: data.id }, { status: 201 });
      }

      // update_box -----------------------------------------------------------
      const { data: existing, error: existingError } = await db
        .from("products")
        .select("id, published_at, deleted_at")
        .eq("id", productId)
        .maybeSingle();
      if (existingError) throw existingError;

      const { data: boxRow, error: boxError } = await db
        .from("gift_boxes")
        .select("product_id")
        .eq("product_id", productId)
        .maybeSingle();
      if (boxError && isSchemaPending(boxError)) return schemaPendingResponse(action);
      if (boxError) throw boxError;
      if (!existing || !boxRow) {
        return Response.json({ success: false, message: "Gift box not found" }, { status: 404 });
      }

      if (payload.status === "published" && existing.published_at) {
        payload.published_at = existing.published_at;
      }

      let { data, error } = await db
        .from("products")
        .update(payload)
        .eq("id", productId)
        .select("id")
        .single();
      if (error && isMissingSizesColumn(error)) {
        ({ data, error } = await db
          .from("products")
          .update(omitAvailableSizes(payload))
          .eq("id", productId)
          .select("id")
          .single());
      }
      if (error) throw error;

      await syncDefaultVariant(db, productId, payload, body?.stock_quantity);
      await reapplyProductAttributes(db, productId, payload);

      return Response.json({ success: true, product_id: data.id });
    }

    // ----------------------------------------------------------- items ----
    if (action === "add_item" || action === "update_item") {
      const boxProductId = uuidOrNull(
        body?.gift_box_product_id ?? (action === "update_item" ? null : null)
      );

      if (action === "add_item") {
        if (!boxProductId) return badRequest("Invalid gift box id");

        const { data: boxRow, error: boxError } = await db
          .from("gift_boxes")
          .select("product_id")
          .eq("product_id", boxProductId)
          .maybeSingle();
        if (boxError && isSchemaPending(boxError)) return schemaPendingResponse(action);
        if (boxError) throw boxError;
        if (!boxRow) {
          return Response.json({ success: false, message: "Gift box not found" }, { status: 404 });
        }

        const targetProductId = uuidOrNull(body?.product_id);
        if (!targetProductId) return badRequest("product_id is required");

        const { data: targetProduct, error: targetError } = await db
          .from("products")
          .select("id, deleted_at")
          .eq("id", targetProductId)
          .maybeSingle();
        if (targetError) throw targetError;
        if (!targetProduct || targetProduct.deleted_at) {
          return Response.json(
            { success: false, message: "Product not found" },
            { status: 404 }
          );
        }

        const existingItems = await loadBoxItems(db, boxProductId);

        const boxIds = await loadBoxProductIds(db);
        const validation = validateCompositionInput(
          boxProductId,
          {
            product_id: targetProductId,
            variant_id: body?.variant_id,
            quantity: body?.quantity ?? 1,
            note: body?.note,
            display_order: body?.display_order,
          },
          existingItems.map((item) => ({ product_id: item.product_id, variant_id: item.variant_id })),
          { boxProductIds: new Set(boxIds.filter((id) => id !== boxProductId)) }
        );
        if (!validation.ok) return badRequest(validation.message);

        const variant = await resolveComponentVariant(db, targetProductId, body?.variant_id);
        if (variant.error) return badRequest(variant.error);

        const quantity = Number(body?.quantity ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COMPONENT_QUANTITY) {
          return badRequest(`Quantity must be between 1 and ${MAX_COMPONENT_QUANTITY}`);
        }

        const nextOrder =
          body?.display_order !== undefined && body?.display_order !== null
            ? Number(body.display_order)
            : (existingItems.at(-1)?.display_order ?? -1) + 1;

        const { data: created, error: insertError } = await db
          .from("gift_box_items")
          .insert({
            gift_box_product_id: boxProductId,
            product_id: targetProductId,
            variant_id: variant.variantId,
            quantity,
            display_order: Number.isInteger(nextOrder) && nextOrder >= 0 ? nextOrder : 0,
            note: body?.note ? String(body.note).slice(0, 500) : null,
            is_active: body?.is_active === false ? false : true,
          })
          .select(ITEM_SELECT)
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            return Response.json(
              { success: false, message: "This product and variant are already in the gift box" },
              { status: 409 }
            );
          }
          if (insertError.code === "P0001") return badRequest(insertError.message);
          throw insertError;
        }

        return Response.json({ success: true, item: enrichItem(created) }, { status: 201 });
      }

      // update_item ----------------------------------------------------------
      const itemId = uuidOrNull(body?.item_id);
      if (!itemId) return badRequest("Invalid item id");

      const { data: current, error: currentError } = await db
        .from("gift_box_items")
        .select(ITEM_SELECT)
        .eq("id", itemId)
        .maybeSingle();
      if (currentError && isSchemaPending(currentError)) return schemaPendingResponse(action);
      if (currentError) throw currentError;
      if (!current) {
        return Response.json({ success: false, message: "Gift box item not found" }, { status: 404 });
      }

      const patch = {};
      if (body?.quantity !== undefined) {
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COMPONENT_QUANTITY) {
          return badRequest(`Quantity must be between 1 and ${MAX_COMPONENT_QUANTITY}`);
        }
        patch.quantity = quantity;
      }
      if (body?.note !== undefined) {
        if (body.note != null && String(body.note).length > 500) {
          return badRequest("Note must be at most 500 characters");
        }
        patch.note = body.note ? String(body.note) : null;
      }
      if (body?.display_order !== undefined) {
        const order = Number(body.display_order);
        if (!Number.isInteger(order) || order < 0) {
          return badRequest("display_order must be a non-negative integer");
        }
        patch.display_order = order;
      }
      if (body?.is_active !== undefined) {
        patch.is_active = Boolean(body.is_active);
      }

      if (body?.variant_id !== undefined && body?.variant_id !== current.variant_id) {
        const variant = await resolveComponentVariant(
          db,
          current.product_id,
          body?.variant_id
        );
        if (variant.error) return badRequest(variant.error);

        const siblings = await loadBoxItems(db, current.gift_box_product_id);
        const duplicate = siblings.some(
          (item) =>
            item.id !== current.id &&
            item.product_id === current.product_id &&
            item.variant_id === variant.variantId
        );
        if (duplicate) {
          return Response.json(
            { success: false, message: "This product and variant are already in the gift box" },
            { status: 409 }
          );
        }
        patch.variant_id = variant.variantId;
      }

      if (Object.keys(patch).length === 0) {
        return Response.json({ success: true, item: enrichItem(current) });
      }

      const { data: updated, error: updateError } = await db
        .from("gift_box_items")
        .update(patch)
        .eq("id", itemId)
        .select(ITEM_SELECT)
        .single();
      if (updateError) {
        if (updateError.code === "23505") {
          return Response.json(
            { success: false, message: "This product and variant are already in the gift box" },
            { status: 409 }
          );
        }
        if (updateError.code === "P0001") return badRequest(updateError.message);
        throw updateError;
      }

      return Response.json({ success: true, item: enrichItem(updated) });
    }

    if (action === "remove_item") {
      const itemId = uuidOrNull(body?.item_id);
      if (!itemId) return badRequest("Invalid item id");

      // Relationship-only delete: this touches gift_box_items exclusively —
      // the underlying catalog product is never deleted or modified.
      const { data, error } = await db
        .from("gift_box_items")
        .delete()
        .eq("id", itemId)
        .select("id");
      if (error && isSchemaPending(error)) return schemaPendingResponse(action);
      if (error) throw error;

      if (!data?.length) {
        return Response.json({ success: false, message: "Gift box item not found" }, { status: 404 });
      }
      return Response.json({ success: true, removed_id: itemId });
    }

    if (action === "reorder_items") {
      const boxProductId = uuidOrNull(body?.gift_box_product_id);
      const itemIds = Array.isArray(body?.item_ids)
        ? body.item_ids.map((id) => uuidOrNull(id)).filter(Boolean)
        : [];
      if (!boxProductId || itemIds.length === 0) {
        return badRequest("gift_box_product_id and item_ids are required");
      }

      const currentItems = await loadBoxItems(db, boxProductId);
      const currentIds = new Set(currentItems.map((item) => item.id));
      if (
        itemIds.length !== currentItems.length ||
        itemIds.some((id) => !currentIds.has(id))
      ) {
        return badRequest("item_ids must list exactly the current items of this gift box");
      }

      for (let index = 0; index < itemIds.length; index += 1) {
        const { error } = await db
          .from("gift_box_items")
          .update({ display_order: index })
          .eq("id", itemIds[index]);
        if (error) throw error;
      }

      const refreshed = await loadBoxItems(db, boxProductId);
      return Response.json({
        success: true,
        items: refreshed.map(enrichItem),
      });
    }

    return badRequest("Invalid action");
  } catch (error) {
    if (isSchemaPending(error)) return schemaPendingResponse("POST");
    logger.error("[Admin Gift Boxes POST] failed", error);
    return handleApiError(error, "Admin Gift Boxes POST", "Failed to update gift box");
  }
}
