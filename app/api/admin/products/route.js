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

const PRODUCT_LIST_SELECT = `id, store_id, brand_id, category_id, name, slug, short_description, description,
         status, visibility, is_featured, base_price, compare_at_price, currency,
         avg_rating, rating_count, view_count, published_at, created_at, updated_at,
         deleted_at, color, available_colors, available_sizes,
         categories(id, name, slug), brands(id, name, slug), stores(id, name),
         product_images(id, storage_path, alt_text, is_primary, sort_order),
         product_variants(id, sku, price, stock_quantity, is_default, is_active, deleted_at)`;

export async function GET(request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const searchParams = new URL(request.url).searchParams;
    const includeArchived = searchParams.get("include_archived") === "1";

    // Gift box product-picker filters — all optional and backward compatible:
    // with no params the response is identical to the original behaviour.
    //   q              → name/slug contains search
    //   category_id    → exact category match
    //   status         → draft | published | archived
    //   availability   → in_stock | out_of_stock (default variant stock)
    //   exclude_boxes  → 1 = hide products registered as gift boxes
    //                    (nesting is not allowed, so boxes are not selectable)
    //   limit          → positive integer cap applied after ordering
    const searchQuery = (searchParams.get("q") || "").trim().slice(0, 100);
    const normalisedSearch = searchQuery.replace(/[,()'\\%]/g, " ").trim();
    const categoryId = (searchParams.get("category_id") || "").trim();
    const statusFilter = (searchParams.get("status") || "").trim();
    const availability = (searchParams.get("availability") || "").trim();
    const excludeBoxes = searchParams.get("exclude_boxes") === "1";
    const limitRaw = Number.parseInt(searchParams.get("limit"), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : null;
    const allowedStatuses = new Set(["draft", "published", "archived"]);
    const statusParam =
      statusFilter && allowedStatuses.has(statusFilter) ? statusFilter : null;

    const buildProductsQuery = (selectCols) => {
      let query = db
        .from("products")
        .select(selectCols)
        .order("created_at", { ascending: false });
      if (!includeArchived) query = query.is("deleted_at", null);
      if (categoryId) query = query.eq("category_id", categoryId);
      if (statusParam) query = query.eq("status", statusParam);
      if (normalisedSearch) {
        query = query.or(
          `name.ilike.%${normalisedSearch}%,slug.ilike.%${normalisedSearch}%`
        );
      }
      return query;
    };

    // The first attempt always selects `available_sizes` so the editor can
    // round-trip sizes the moment migration 20261115120000 lands. Until that
    // SQL is applied the read fails with 42703, so retry once without the
    // column — the read-side twin of the write fallback below.
    const loadProducts = async () => {
      let result = await buildProductsQuery(PRODUCT_LIST_SELECT);
      if (isMissingSizesColumn(result.error)) {
        result = await buildProductsQuery(
          PRODUCT_LIST_SELECT.replace(/\s*available_sizes,/, "")
        );
      }
      return result;
    };

    const [productsResult, categories, brands, stores] = await Promise.all([
      loadProducts(),
      db.from("categories").select("id, name, slug").is("deleted_at", null).order("sort_order"),
      db.from("brands").select("id, name, slug").is("deleted_at", null).order("name"),
      db.from("stores").select("id, name").is("deleted_at", null).order("name"),
    ]);

    if (productsResult.error) throw productsResult.error;

    // Gift box picker post-filters (kept out of SQL so the base listing and
    // its available_sizes fallback stay untouched).
    let boxProductIds = null;
    if (excludeBoxes) {
      const { data: boxRows, error: boxError } = await db
        .from("gift_boxes")
        .select("product_id");
      if (!boxError) {
        boxProductIds = new Set((boxRows ?? []).map((row) => row.product_id));
      } else if (boxError.code !== "42P01" && boxError.code !== "PGRST202") {
        // 42P01 = gift box tables not created yet (migration pending) →
        // there are simply no boxes to exclude.
        throw boxError;
      } else {
        boxProductIds = new Set();
      }
    }

    let products = (productsResult.data ?? []).map((product) => {
      const variants = product.product_variants ?? [];
      const defaultVariant =
        variants.find((variant) => variant.is_default && variant.is_active && !variant.deleted_at) ??
        variants.find((variant) => variant.is_active && !variant.deleted_at) ??
        null;

      // Full active variant list for the gift box product picker
      // (additive field — default_variant keeps its original shape).
      const activeVariants = variants
        .filter((variant) => variant.is_active && !variant.deleted_at)
        .map((variant) => ({
          id: variant.id,
          sku: variant.sku ?? null,
          price: Number(variant.price),
          stock_quantity: Number(variant.stock_quantity ?? 0),
          is_default: Boolean(variant.is_default),
        }));

      const rest = { ...product };
      delete rest.product_variants;
      return { ...rest, default_variant: defaultVariant, variants: activeVariants };
    });

    if (excludeBoxes && boxProductIds?.size >= 0) {
      products = products.filter((product) => !boxProductIds.has(product.id));
    }

    if (availability === "in_stock" || availability === "out_of_stock") {
      products = products.filter((product) => {
        const stock = Number(product.default_variant?.stock_quantity ?? 0);
        return availability === "in_stock" ? stock > 0 : stock <= 0;
      });
    }

    if (limit) products = products.slice(0, limit);

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
