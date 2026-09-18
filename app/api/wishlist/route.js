import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Fetch user's wishlist
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    // Get or create default wishlist
    const { data: wishlist, error: wishlistError } = await SupabaseClient
      .from("wishlists")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_default", true)
      .single();

    if (wishlistError || !wishlist) {
      return Response.json({ success: true, items: [] });
    }

    // Fetch wishlist items with variant and product details
    const { data: items, error } = await SupabaseClient
      .from("wishlist_items")
      .select(`
        id,
        variant_id,
        added_at,
        note,
        product_variants:variant_id (
          id,
          sku,
          product_id,
          products:product_id (
            id,
            name,
            base_price,
            slug,
            product_images (
              storage_path,
              is_primary,
              sort_order
            )
          )
        )
      `)
      .eq("wishlist_id", wishlist.id)
      .order("added_at", { ascending: false });

    if (error) throw error;

    const enrichedItems = (items || []).map((item) => {
      const variant = item.product_variants;
      const product = variant?.products;
      const images = product?.product_images || [];
      const primaryImage = images.find((img) => img.is_primary) || images[0];

      return {
        id: item.id,
        variant_id: item.variant_id,
        product_id: product?.id || null,
        product_name: product?.name || "Unknown Product",
        product_price: product?.base_price || 0,
        product_slug: product?.slug || "",
        product_image: primaryImage?.storage_path || null,
        added_at: item.added_at,
        note: item.note,
      };
    });

    return Response.json({ success: true, items: enrichedItems });
  } catch (error) {
    return handleApiError(error, "Wishlist GET", "Failed to fetch wishlist");
  }
}

// POST - Add or remove item from wishlist (toggle)
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { product_id, variant_id } = await request.json();

    if (!product_id && !variant_id) {
      return Response.json(
        { success: false, message: "product_id or variant_id is required" },
        { status: 400 }
      );
    }

    // Get or create default wishlist
    let { data: wishlist } = await SupabaseClient
      .from("wishlists")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_default", true)
      .single();

    if (!wishlist) {
      const { data: newWishlist, error: createError } = await SupabaseClient
        .from("wishlists")
        .insert({
          owner_id: user.id,
          name: "My Wishlist",
          slug: "my-wishlist",
          visibility: "private",
          share_token: crypto.randomUUID(),
          is_default: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;
      wishlist = newWishlist;
    }

    // Determine variant_id
    let targetVariantId = variant_id;

    if (!targetVariantId && product_id) {
      // Get first variant for the product
      const { data: variant } = await SupabaseClient
        .from("product_variants")
        .select("id")
        .eq("product_id", product_id)
        .limit(1)
        .single();

      targetVariantId = variant?.id;
    }

    if (!targetVariantId) {
      return Response.json(
        { success: false, message: "Could not find a valid variant for this product" },
        { status: 400 }
      );
    }

    // Check if already in wishlist
    const { data: existing } = await SupabaseClient
      .from("wishlist_items")
      .select("id")
      .eq("wishlist_id", wishlist.id)
      .eq("variant_id", targetVariantId)
      .single();

    if (existing) {
      // Remove from wishlist (toggle)
      const { error: deleteError } = await SupabaseClient
        .from("wishlist_items")
        .delete()
        .eq("id", existing.id);

      if (deleteError) throw deleteError;

      return Response.json({ success: true, action: "removed" });
    }

    // Add to wishlist
    const { error: insertError } = await SupabaseClient
      .from("wishlist_items")
      .insert({
        wishlist_id: wishlist.id,
        variant_id: targetVariantId,
      });

    if (insertError) throw insertError;

    return Response.json({ success: true, action: "added" }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Wishlist POST", "Failed to update wishlist");
  }
}

// DELETE - Remove item from wishlist
export async function DELETE(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const item_id = searchParams.get("item_id");
    const variant_id = searchParams.get("variant_id");

    if (!item_id && !variant_id) {
      return Response.json(
        { success: false, message: "item_id or variant_id is required" },
        { status: 400 }
      );
    }

    // Get default wishlist
    const { data: wishlist } = await SupabaseClient
      .from("wishlists")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_default", true)
      .single();

    if (!wishlist) {
      return Response.json({ success: true });
    }

    let query = SupabaseClient
      .from("wishlist_items")
      .delete()
      .eq("wishlist_id", wishlist.id);

    if (item_id) {
      query = query.eq("id", item_id);
    } else if (variant_id) {
      query = query.eq("variant_id", variant_id);
    }

    const { error } = await query;

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Wishlist DELETE", "Failed to remove from wishlist");
  }
}
