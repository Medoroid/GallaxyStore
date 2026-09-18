import { supabase } from "./supabaseClient";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CartItemDetailed = {
  id: string;
  cart_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  sku: string;
  variant_id: string;
  quantity: number;
  unit_price_snapshot: number;
  current_price: number;
  price_changed_since_added: boolean;
  line_total: number;
  stock_quantity: number;
  reserved_quantity: number;
  available_stock: number;
  is_saved_for_later: boolean;
  customization_id: string | null;
  customization_name: string | null;
  customization_preview_url: string | null;
  color: string | null;
  size: string | null;
  reserved_until: string | null;
  added_at: string;
};

export type CartTotals = {
  cart_id: string;
  owner_id: string | null;
  status: string;
  currency: string;
  coupon_id: string | null;
  coupon_code: string | null;
  discount_amount: number;
  subtotal: number;
  total: number;
  item_count: number;
  total_quantity: number;
  saved_for_later_count: number;
};

export type CartData = {
  items: CartItemDetailed[];
  totals: CartTotals | null;
  alerts: CartAlert[];
};

export type CartAlert = {
  type: "price_changed" | "low_stock";
  item_id: string;
  product_name: string;
  message: string;
};

const SESSION_TOKEN_KEY = "cart_session_token";

// ─── Error Translation ───────────────────────────────────────────────────────

const ERROR_MAP: Record<string, string> = {
  "Quantity must be positive": "الكمية يجب أن تكون أكبر من صفر",
  "Variant not found or inactive":
    "المنتج غير متوفر أو لم يعد نشطاً",
  "You do not own this customization":
    "لا تملك هذا التخصيص",
  "A session token is required for guest carts":
    "يجب تسجيل الدخول أو استخدام سلة الضيوف",
  "Invalid cart item": "عنصر السلة غير صالح",
  "Cart item not found": "عنصر السلة غير موجود",
  "Item is already in cart": "المنتج موجود بالفعل في السلة",
  "Not enough stock": "المخزون غير كافٍ",
  "Cannot modify a saved-for-later item directly": "لا يمكن تعديل العنصر المحفوظ - انقله أولاً إلى السلة",
};

function translateError(raw: string): string {
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (raw.includes(key)) return value;
  }
  return raw || "حدث خطأ غير متوقع";
}

// ─── Guest Session Token ─────────────────────────────────────────────────────

export function getOrCreateGuestSessionToken(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(SESSION_TOKEN_KEY);
  if (existing) return existing;

  const token = crypto.randomUUID();
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  return token;
}

export function clearGuestSessionToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getGuestSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

// ─── Auth Detection ──────────────────────────────────────────────────────────

async function isUserAuthenticated(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session?.user;
}

async function resolveSessionToken(): Promise<string | null> {
  const authenticated = await isUserAuthenticated();
  if (authenticated) return null;
  return getOrCreateGuestSessionToken();
}

// ─── RPC Helpers ─────────────────────────────────────────────────────────────

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, params as never);
  if (error) throw new Error(translateError(error.message));
  return data as T;
}

// ─── Cart Actions ────────────────────────────────────────────────────────────

export async function addToCart(params: {
  variant_id: string;
  quantity: number;
  customization_id?: string | null;
}): Promise<CartItemDetailed> {
  const sessionToken = await resolveSessionToken();

  return rpc<CartItemDetailed>("add_to_cart", {
    p_variant_id: params.variant_id,
    p_quantity: params.quantity,
    p_customization_id: params.customization_id ?? null,
    p_session_token: sessionToken,
  });
}

export async function updateCartItemQuantity(params: {
  cart_item_id: string;
  quantity: number;
}): Promise<CartItemDetailed> {
  const sessionToken = await resolveSessionToken();

  return rpc<CartItemDetailed>("update_cart_item_quantity", {
    p_cart_item_id: params.cart_item_id,
    p_quantity: params.quantity,
    p_session_token: sessionToken,
  });
}

export async function removeCartItem(cart_item_id: string): Promise<boolean> {
  const sessionToken = await resolveSessionToken();

  return rpc<boolean>("remove_cart_item", {
    p_cart_item_id: cart_item_id,
    p_session_token: sessionToken,
  });
}

export async function moveToCart(cart_item_id: string): Promise<CartItemDetailed> {
  const sessionToken = await resolveSessionToken();

  return rpc<CartItemDetailed>("move_to_cart", {
    p_cart_item_id: cart_item_id,
    p_session_token: sessionToken,
  });
}

export async function moveWishlistItemToCart(params: {
  wishlist_item_id: string;
  quantity?: number;
}): Promise<CartItemDetailed> {
  const sessionToken = await resolveSessionToken();

  return rpc<CartItemDetailed>("move_wishlist_item_to_cart", {
    p_wishlist_item_id: params.wishlist_item_id,
    p_quantity: params.quantity ?? 1,
    p_session_token: sessionToken,
  });
}

// ─── Merge Guest Cart (on login) ─────────────────────────────────────────────

export async function onLoginSuccess(): Promise<string | null> {
  const guestToken = getGuestSessionToken();
  if (!guestToken) return null;

  const { data, error } = await supabase.rpc("merge_guest_cart" as never, {
    p_session_token: guestToken,
  } as never);

  if (!error) {
    clearGuestSessionToken();
  }

  return (data as string) ?? null;
}

// ─── Read Cart Data ──────────────────────────────────────────────────────────

function buildAlerts(items: CartItemDetailed[]): CartAlert[] {
  const alerts: CartAlert[] = [];

  for (const item of items) {
    if (item.price_changed_since_added) {
      alerts.push({
        type: "price_changed",
        item_id: item.id,
        product_name: item.product_name,
        message: `سعر "${item.product_name}" تغير منذ إضافته إلى السلة`,
      });
    }

    const available = item.available_stock ?? item.stock_quantity - item.reserved_quantity;
    if (available < item.quantity) {
      alerts.push({
        type: "low_stock",
        item_id: item.id,
        product_name: item.product_name,
        message: available <= 0
          ? `"${item.product_name}" غير متوفر حالياً`
          : `متوفر فقط ${available} قطعة من "${item.product_name}"`,
      });
    }
  }

  return alerts;
}

export async function getCart(cart_id: string): Promise<CartData> {
  const [itemsRes, totalsRes] = await Promise.all([
    supabase
      .from("cart_items_detailed")
      .select("*")
      .eq("cart_id", cart_id),
    supabase
      .from("cart_totals")
      .select("*")
      .eq("cart_id", cart_id)
      .single(),
  ]);

  if (itemsRes.error) throw new Error(translateError(itemsRes.error.message));
  if (totalsRes.error && totalsRes.error.code !== "PGRST116") {
    throw new Error(translateError(totalsRes.error.message));
  }

  const items = (itemsRes.data ?? []) as CartItemDetailed[];
  const totals = (totalsRes.data ?? null) as CartTotals | null;
  const alerts = buildAlerts(items);

  return { items, totals, alerts };
}
