import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * ⚠️ ملاحظة معمارية مهمة:
 * جداول carts و cart_items في هذا المشروع محمية بـ Row Level Security
 * وتحتوي فقط على SELECT policies (owner_id = auth.uid()).
 * لا توجد أي INSERT / UPDATE / DELETE policies على هذين الجدولين،
 * لذلك أي محاولة كتابة مباشرة (.insert() / .update() / .delete()) من عميل
 * "authenticated" سترفضها قاعدة البيانات فورًا (RLS violation) وتتسبب في 500.
 *
 * كل عمليات الكتابة على السلة يجب أن تمر حصرًا عبر دوال RPC التالية
 * (المعرّفة كـ SECURITY DEFINER، وبالتالي تتجاوز RLS بأمان لأنها منطق موثوق):
 *   - get_or_create_cart(p_session_token)
 *   - add_to_cart(p_variant_id, p_quantity, p_customization_id, p_session_token)
 *   - update_cart_item_quantity(p_cart_item_id, p_quantity, p_session_token)
 *   - remove_cart_item(p_cart_item_id, p_session_token)
 *   - merge_guest_cart(p_session_token)
 *
 * بما أن كل الطلبات هنا تأتي من مستخدم مسجّل دخول (authenticated عبر JWT)،
 * فإننا نمرر دائمًا p_session_token: null — الدوال تعتمد على auth.uid() داخليًا.
 */

// ---------------------------------------------------------------------------
// عميل Supabase
// ---------------------------------------------------------------------------

function getAuthenticatedClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function authenticateUser(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return {
      error: Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  // عميل anon مؤقت فقط للتحقق من صلاحية التوكن
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return {
      error: Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      ),
    };
  }

  const client = getAuthenticatedClient(token);
  return { client, user };
}

// ---------------------------------------------------------------------------
// دوال مساعدة تعتمد كليًا على RPC / SELECT المسموح بها فقط
// ---------------------------------------------------------------------------

async function getOrCreateCartId(client) {
  const { data, error } = await client.rpc("get_or_create_cart", {
    p_session_token: null,
  });
  if (error) {
    throw new Error(`get_or_create_cart failed: ${error.message}`);
  }
  return data; // uuid السلة
}

async function fetchCartItemIds(client, cartId) {
  // SELECT مسموح به بالسياسة cart_items_select_owner_or_admin
  const { data, error } = await client
    .from("cart_items")
    .select("id")
    .eq("cart_id", cartId);

  if (error) {
    throw new Error(`Failed to list cart items: ${error.message}`);
  }
  return (data || []).map((row) => row.id);
}

async function clearCart(client, cartId) {
  const itemIds = await fetchCartItemIds(client, cartId);

  for (const itemId of itemIds) {
    const { error } = await client.rpc("remove_cart_item", {
      p_cart_item_id: itemId,
      p_session_token: null,
    });
    if (error) {
      throw new Error(`remove_cart_item failed for ${itemId}: ${error.message}`);
    }
  }
}

/**
 * محاولة إيجاد variant_id من product_id + color + size.
 * ملاحظة: اللون والمقاس في هذا المشروع غير مخزّنين كأعمدة مباشرة على
 * product_variants، بل عبر نظام سمات عام:
 *   product_variant_options (variant_id, attribute_value_id)
 *     -> product_attribute_values (id, value, attribute_id)
 *       -> product_attributes (id, name)
 * لذلك لا يمكن عمل .eq("color", color) مباشرة على product_variants (العمود غير موجود أصلاً).
 * الأفضل دائمًا: يرسل الفرونت إند variant_id مباشرة (يُختار من صفحة المنتج)
 * وتُستخدم هذه الدالة فقط كخطة بديلة (fallback).
 */
async function resolveVariantId(client, productId, color, size) {
  if (!productId) throw new Error("Product ID is required");

  // لا يوجد لون/مقاس محدد => أول متغيّر نشط (الافتراضي أولاً)
  if (!color && !size) {
    const { data, error } = await client
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new Error(`No active variant found for product ${productId}`);
    }
    return data.id;
  }

  const wanted = [color, size].filter(Boolean);

  // 1) إيجاد معرّفات قيم السمات (Color/Size) المطابقة للنص المطلوب
  const { data: values, error: valuesError } = await client
    .from("product_attribute_values")
    .select("id, value")
    .in("value", wanted);

  if (valuesError) {
    throw new Error(`Failed to resolve attribute values: ${valuesError.message}`);
  }
  if (!values || values.length < wanted.length) {
    throw new Error(
      `Variant not found for product ${productId} (color=${color || "-"}, size=${size || "-"})`
    );
  }
  const valueIds = values.map((v) => v.id);

  // 2) إيجاد المتغيّر (variant) اللي مرتبط بكل قيم السمات المطلوبة معًا
  const { data: variants, error: variantsError } = await client
    .from("product_variants")
    .select("id, product_variant_options!inner(attribute_value_id)")
    .eq("product_id", productId)
    .eq("is_active", true)
    .in("product_variant_options.attribute_value_id", valueIds);

  if (variantsError) {
    throw new Error(`Failed to resolve variant: ${variantsError.message}`);
  }

  const match = (variants || []).find((v) => {
    const linkedIds = new Set(
      (v.product_variant_options || []).map((o) => o.attribute_value_id)
    );
    return valueIds.every((id) => linkedIds.has(id));
  });

  if (!match) {
    throw new Error(
      `Variant not found for product ${productId} (color=${color || "-"}, size=${size || "-"})`
    );
  }
  return match.id;
}

// ---------------------------------------------------------------------------
// GET /api/cart  -> جلب محتوى السلة الحالي
// ---------------------------------------------------------------------------

export async function GET(request) {
  try {
    const auth = await authenticateUser(request);
    if (auth.error) return auth.error;
    const { client } = auth;

    const cartId = await getOrCreateCartId(client);

    // القراءة تتم من الـ Views الجاهزة (مسموح بها للمالك فقط عبر RLS الموروثة من الجداول الأساسية)
    const [itemsResult, totalsResult] = await Promise.all([
      client
        .from("cart_items_detailed")
        .select("*")
        .eq("cart_id", cartId)
        .order("added_at", { ascending: true }),
      client.from("cart_totals").select("*").eq("cart_id", cartId).maybeSingle(),
    ]);

    if (itemsResult.error) {
      throw new Error(`Failed to fetch cart items: ${itemsResult.error.message}`);
    }
    if (totalsResult.error) {
      throw new Error(`Failed to fetch cart totals: ${totalsResult.error.message}`);
    }

    return Response.json({
      success: true,
      cart_id: cartId,
      items: itemsResult.data || [],
      totals:
        totalsResult.data || {
          cart_id: cartId,
          subtotal: 0,
          discount_amount: 0,
          total: 0,
          item_count: 0,
          total_quantity: 0,
        },
    });
  } catch (error) {
    logger.error("[Cart GET Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch cart" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/cart  -> مزامنة السلة (استبدال كامل للمحتوى الحالي)
// Body: { items: [{ variant_id?, product_id?, color?, size?, quantity?, customization_id? }, ...] }
// ---------------------------------------------------------------------------

export async function POST(request) {
  try {
    const auth = await authenticateUser(request);
    if (auth.error) return auth.error;
    const { client } = auth;

    const body = await request.json();
    const { action } = body || {};

    // Handle apply_coupon action
    if (action === "apply_coupon") {
      const { cart_id, code } = body;
      if (!cart_id || !code) {
        return Response.json(
          { success: false, message: "cart_id and code are required" },
          { status: 400 }
        );
      }
      const { data, error } = await client.rpc("apply_coupon", {
        p_cart_id: cart_id,
        p_code: code,
        p_session_token: null,
      });
      if (error) {
        return Response.json(
          { success: false, message: error.message },
          { status: 400 }
        );
      }
      return Response.json({ success: true, discount_amount: data });
    }

    // Handle remove_coupon action
    if (action === "remove_coupon") {
      const { cart_id } = body;
      if (!cart_id) {
        return Response.json(
          { success: false, message: "cart_id is required" },
          { status: 400 }
        );
      }
      const { error } = await client.rpc("remove_coupon", {
        p_cart_id: cart_id,
        p_session_token: null,
      });
      if (error) {
        return Response.json(
          { success: false, message: error.message },
          { status: 400 }
        );
      }
      return Response.json({ success: true, message: "Coupon removed" });
    }

    // Default: sync cart items
    const items = body?.items;

    if (!Array.isArray(items)) {
      return Response.json(
        { success: false, message: "Items must be an array" },
        { status: 400 }
      );
    }

    const cartId = await getOrCreateCartId(client);

    // تفريغ السلة الحالية أولاً عبر RPC (وليس delete مباشر)
    await clearCart(client, cartId);

    const failedItems = [];

    for (const item of items) {
      try {
        let variantId = item.variant_id || null;

        if (!variantId && item.product_id) {
          variantId = await resolveVariantId(client, item.product_id, item.color, item.size);
        }

        if (!variantId) {
          failedItems.push({ item, reason: "No variant_id or product_id provided" });
          continue;
        }

        const { error } = await client.rpc("add_to_cart", {
          p_variant_id: variantId,
          p_quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
          p_customization_id: item.customization_id || null,
          p_session_token: null,
        });

        if (error) {
          failedItems.push({ item, reason: error.message });
        }
      } catch (err) {
        failedItems.push({ item, reason: err.message });
      }
    }

    if (failedItems.length > 0) {
      logger.error("[Cart POST] Some items failed to sync:", failedItems);
    }

    return Response.json({
      success: true,
      message: failedItems.length > 0 ? "Cart synced with some errors" : "Cart synced",
      cart_id: cartId,
      failed_items: failedItems,
    });
  } catch (error) {
    logger.error("[Cart POST Error]", error);
    return Response.json(
      { success: false, message: "Failed to sync cart" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cart  -> تفريغ السلة بالكامل
// ---------------------------------------------------------------------------

export async function DELETE(request) {
  try {
    const auth = await authenticateUser(request);
    if (auth.error) return auth.error;
    const { client } = auth;

    const cartId = await getOrCreateCartId(client);
    await clearCart(client, cartId);

    return Response.json({ success: true, message: "Cart cleared", cart_id: cartId });
  } catch (error) {
    logger.error("[Cart DELETE Error]", error);
    return Response.json(
      { success: false, message: "Failed to clear cart" },
      { status: 500 }
    );
  }
}