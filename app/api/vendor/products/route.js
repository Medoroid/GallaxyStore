import { createClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import {
  parseProductPayload,
  syncDefaultVariant,
  uuidOrNull,
} from "@/lib/product-admin";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

const PRODUCT_COLUMNS = `
  id, store_id, brand_id, category_id, name, slug, short_description, description,
  status, visibility, is_featured, base_price, compare_at_price, currency,
  avg_rating, rating_count, view_count, published_at, created_at, updated_at,
  deleted_at, color, available_colors,
  categories(id, name, slug), brands(id, name, slug),
  product_images(id, storage_path, alt_text, is_primary, sort_order),
  product_variants(id, price, stock_quantity, is_default, is_active, deleted_at)
`;

/**
 * Authenticate and resolve the single store owned by the caller. The store id
 * is never read from the request body, so a vendor cannot target another
 * store's products.
 */
async function authenticateVendor(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { error: "Authorization required", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const userClient = getSupabaseForUser(token);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(token);

  if (authError || !user) {
    return { error: "Invalid token", status: 401 };
  }

  const { data: store, error: storeError } = await userClient
    .from("stores")
    .select("id, name")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) {
    return { error: "No store found for this account", status: 403 };
  }

  return { user, store };
}

function defaultVariantFor(product) {
  const variants = product.product_variants ?? [];
  return (
    variants.find((variant) => variant.is_default && variant.is_active && !variant.deleted_at) ??
    variants.find((variant) => variant.is_active && !variant.deleted_at) ??
    null
  );
}

export async function GET(request) {
  try {
    const { allowed } = await checkRateLimitAsync(`vendor-products-get:${getClientIp(request)}`, {
      maxRequests: 60,
      failureMode: "fail_open",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const auth = await authenticateVendor(request);
    if (auth.error) {
      return Response.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const db = getServiceRoleClient();
    const [productsResult, categories, brands] = await Promise.all([
      db
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("store_id", auth.store.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      db
        .from("categories")
        .select("id, name, slug")
        .is("deleted_at", null)
        .order("sort_order"),
      db.from("brands").select("id, name, slug").is("deleted_at", null).order("name"),
    ]);

    if (productsResult.error) throw productsResult.error;

    const products = (productsResult.data ?? []).map((product) => {
      const rest = { ...product };
      const defaultVariant = defaultVariantFor(product);
      delete rest.product_variants;
      return { ...rest, default_variant: defaultVariant };
    });

    return Response.json({
      success: true,
      store: { id: auth.store.id, name: auth.store.name },
      products,
      lookups: {
        categories: categories.data ?? [],
        brands: brands.data ?? [],
      },
    });
  } catch (error) {
    return handleApiError(error, "Vendor Products GET", "Failed to fetch products");
  }
}

export async function POST(request) {
  try {
    const { allowed } = await checkRateLimitAsync(`vendor-products-write:${getClientIp(request)}`, {
      maxRequests: 30,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const auth = await authenticateVendor(request);
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

      // Ownership is checked against the session-derived store, not the body.
      const { data: existing, error: existingError } = await db
        .from("products")
        .select("id, store_id")
        .eq("id", productId)
        .eq("store_id", auth.store.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        return Response.json({ success: false, message: "Product not found" }, { status: 404 });
      }

      const { error } = await db
        .from("products")
        .update({
          deleted_at: new Date().toISOString(),
          status: "archived",
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId)
        .eq("store_id", auth.store.id);
      if (error) throw error;

      return Response.json({ success: true, product_id: productId });
    }

    if (action !== "create" && action !== "update") {
      return Response.json({ success: false, message: "Invalid action" }, { status: 400 });
    }

    const input = body?.product && typeof body.product === "object" ? body.product : body;

    // Images are intentionally not writable here. The dedicated image endpoint
    // validates MIME/size/ownership and manages primary/reorder/alt text; letting
    // this route replace rows would bypass those checks.
    if (input?.images !== undefined) {
      return Response.json(
        {
          success: false,
          message: "Manage product images with the image uploader, not the product form",
        },
        { status: 400 }
      );
    }

    if (action === "update") {
      if (!productId) {
        return Response.json({ success: false, message: "Invalid product id" }, { status: 400 });
      }

      const { data: existing, error: existingError } = await db
        .from("products")
        .select(
          `id, store_id, brand_id, category_id, name, slug, short_description, description,
           status, visibility, is_featured, base_price, compare_at_price, currency,
           color, available_colors, published_at`
        )
        .eq("id", productId)
        .eq("store_id", auth.store.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        return Response.json({ success: false, message: "Product not found" }, { status: 404 });
      }

      // Merge only the fields the caller actually sent. A partial update must
      // never reset the description, category, images or price.
      const provided = Object.fromEntries(
        Object.entries(input ?? {}).filter(([, value]) => value !== undefined)
      );
      const merged = { ...existing, ...provided };

      let payload;
      try {
        payload = parseProductPayload(merged, { storeId: auth.store.id });
      } catch (validationError) {
        return Response.json(
          { success: false, message: validationError.message },
          { status: 400 }
        );
      }

      // Re-publishing an unchanged product must not move its published date.
      if (payload.status === "published" && existing.published_at) {
        payload.published_at = existing.published_at;
      }

      const { data, error } = await db
        .from("products")
        .update(payload)
        .eq("id", productId)
        .eq("store_id", auth.store.id)
        .select("id")
        .single();
      if (error) throw error;

      await syncDefaultVariant(db, productId, payload, body?.stock_quantity ?? input?.stock_quantity);

      return Response.json({ success: true, product_id: data.id });
    }

    let payload;
    try {
      // The store is always the authenticated vendor's store.
      payload = parseProductPayload(input, { storeId: auth.store.id });
    } catch (validationError) {
      return Response.json(
        { success: false, message: validationError.message },
        { status: 400 }
      );
    }

    const { data, error } = await db
      .from("products")
      .insert(payload)
      .select("id")
      .single();

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
      await syncDefaultVariant(db, data.id, payload, body?.stock_quantity ?? input?.stock_quantity);
    } catch (variantError) {
      // Do not leave a product that cannot be added to a cart.
      await db.from("products").delete().eq("id", data.id);
      throw variantError;
    }

    return Response.json({ success: true, product_id: data.id }, { status: 201 });
  } catch (error) {
    logger.error("[Vendor Products POST] failed", error);
    return handleApiError(error, "Vendor Products POST", "Failed to save product");
  }
}
