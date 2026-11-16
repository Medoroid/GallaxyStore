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

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const includeArchived =
      new URL(request.url).searchParams.get("include_archived") === "1";
    let productsQuery = db
      .from("products")
      .select(
        `id, store_id, brand_id, category_id, name, slug, short_description, description,
         status, visibility, is_featured, base_price, compare_at_price, currency,
         avg_rating, rating_count, view_count, published_at, created_at, updated_at,
         deleted_at, color, available_colors, available_sizes,
         categories(id, name, slug), brands(id, name, slug), stores(id, name),
         product_images(id, storage_path, alt_text, is_primary, sort_order),
         product_variants(id, price, stock_quantity, is_default, is_active, deleted_at)`
      )
      .order("created_at", { ascending: false });
    if (!includeArchived) {
      productsQuery = productsQuery.is("deleted_at", null);
    }

    const [productsResult, categories, brands, stores] = await Promise.all([
      productsQuery,
      db.from("categories").select("id, name, slug").is("deleted_at", null).order("sort_order"),
      db.from("brands").select("id, name, slug").is("deleted_at", null).order("name"),
      db.from("stores").select("id, name").is("deleted_at", null).order("name"),
    ]);

    if (productsResult.error) throw productsResult.error;

    const products = (productsResult.data ?? []).map((product) => {
      const variants = product.product_variants ?? [];
      const defaultVariant =
        variants.find((variant) => variant.is_default && variant.is_active && !variant.deleted_at) ??
        variants.find((variant) => variant.is_active && !variant.deleted_at) ??
        null;

      const rest = { ...product };
      delete rest.product_variants;
      return { ...rest, default_variant: defaultVariant };
    });

    return Response.json({
      success: true,
      products,
      lookups: {
        categories: categories.data ?? [],
        brands: brands.data ?? [],
        stores: stores.data ?? [],
      },
    });
  } catch (error) {
    return handleApiError(error, "Admin Products GET", "Failed to fetch products");
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "create");
    const productId = uuidOrNull(body?.product_id);

    if (action === "archive") {
      if (!productId) {
        return Response.json({ success: false, message: "Invalid product id" }, { status: 400 });
      }
      const { error } = await db
        .from("products")
        .update({
          deleted_at: new Date().toISOString(),
          status: "archived",
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);
      if (error) throw error;
      return Response.json({ success: true });
    }

    // Archive is a soft delete; restoring puts the product back as a draft so
    // it is never re-published by accident.
    if (action === "restore") {
      if (!productId) {
        return Response.json({ success: false, message: "Invalid product id" }, { status: 400 });
      }
      const { error } = await db
        .from("products")
        .update({
          deleted_at: null,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);
      if (error) throw error;
      return Response.json({ success: true });
    }

    if (action !== "create" && action !== "update") {
      return Response.json({ success: false, message: "Invalid action" }, { status: 400 });
    }

    let payload;
    try {
      payload = parseProductPayload(body?.product || body);
    } catch (validationError) {
      return Response.json(
        { success: false, message: validationError.message },
        { status: 400 }
      );
    }

    if (action === "update") {
      if (!productId) {
        return Response.json({ success: false, message: "Invalid product id" }, { status: 400 });
      }

      const { data: existing, error: existingError } = await db
        .from("products")
        .select("id, published_at")
        .eq("id", productId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        return Response.json({ success: false, message: "Product not found" }, { status: 404 });
      }

      // parseProductPayload always stamps published_at; re-saving an already
      // published product must not move its publish date (the vendor route
      // does the same).
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
      // Do not leave a product that cannot be added to a cart.
      await db.from("products").delete().eq("id", data.id);
      throw variantError;
    }

    return Response.json({ success: true, product_id: data.id }, { status: 201 });
  } catch (error) {
    logger.error("[Admin Products POST] failed", error);
    return handleApiError(error, "Admin Products POST", "Failed to save product");
  }
}
