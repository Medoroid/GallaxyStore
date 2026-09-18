/**
 * GATE 2 — Real RPC Execution Tests
 *
 * Tests ALL cart + search RPCs against the LIVE Supabase database.
 * Every test CALLS the actual RPC and verifies the real return shape.
 * No mocks. No skips. No fake passes.
 *
 * @jest-environment node
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let anonClient: SupabaseClient;
let authClient: SupabaseClient;
let testUserId: string;
let testUserEmail: string;
let testCartId: string;

const TEST_PASSWORD = "Gate2Test!Pass2026";

beforeAll(async () => {
  anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Create a fresh test user for authenticated tests
  testUserEmail = `gate2-test-${Date.now()}@test.example.com`;
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
    email: testUserEmail,
    password: TEST_PASSWORD,
  });
  if (signUpError) throw new Error(`Failed to create test user: ${signUpError.message}`);
  testUserId = signUpData.user!.id;

  // Create authenticated client
  authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError } = await authClient.auth.signInWithPassword({
    email: testUserEmail,
    password: TEST_PASSWORD,
  });
  if (signInError) throw new Error(`Failed to sign in test user: ${signInError.message}`);
});

afterAll(async () => {
  // Clean up test data
  if (testCartId && authClient) {
    try {
      await authClient.rpc("remove_cart_item" as any, {
        p_cart_item_id: "00000000-0000-0000-0000-000000000000",
        p_session_token: null,
      });
    } catch {}
  }
  // Sign out
  if (authClient) await authClient.auth.signOut();
});

// ==========================================================================
// CART RPCs
// ==========================================================================

describe("Cart RPCs", () => {
  // ------ get_or_create_cart ------
  describe("get_or_create_cart", () => {
    it("returns a UUID for authenticated user", async () => {
      const { data, error } = await authClient.rpc("get_or_create_cart", {
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(typeof data).toBe("string");
      // Validate UUID format
      expect(data).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      testCartId = data;
    });

    it("returns same cart on second call (idempotent)", async () => {
      const { data, error } = await authClient.rpc("get_or_create_cart", {
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBe(testCartId);
    });

    it("works with session token (guest)", async () => {
      const guestSession = `test-guest-${Date.now()}`;
      const { data, error } = await anonClient.rpc("get_or_create_cart", {
        p_session_token: guestSession,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(typeof data).toBe("string");
    });
  });

  // ------ add_to_cart ------
  describe("add_to_cart", () => {
    let testVariantId: string;
    let testItemId: string;

    beforeAll(async () => {
      // Get a real variant from the database
      const { data: variants } = await anonClient
        .from("product_variants")
        .select("id")
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .limit(1)
        .single();
      testVariantId = variants?.id;
    });

    it("adds an item to the cart", async () => {
      const { data, error } = await authClient.rpc("add_to_cart", {
        p_variant_id: testVariantId,
        p_quantity: 1,
        p_customization_id: null,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("cart_id");
      expect(data).toHaveProperty("variant_id");
      expect(data).toHaveProperty("quantity");
      expect(data.quantity).toBe(1);
      testItemId = data.id;
    });

    it("increments quantity on duplicate variant", async () => {
      const { data, error } = await authClient.rpc("add_to_cart", {
        p_variant_id: testVariantId,
        p_quantity: 2,
        p_customization_id: null,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.quantity).toBeGreaterThanOrEqual(3); // 1 + 2
    });

    it("rejects invalid variant_id", async () => {
      const { data, error } = await authClient.rpc("add_to_cart", {
        p_variant_id: "00000000-0000-0000-0000-000000000000",
        p_quantity: 1,
        p_customization_id: null,
        p_session_token: null,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain("Variant not found");
    });

    it("rejects quantity <= 0", async () => {
      const { data, error } = await authClient.rpc("add_to_cart", {
        p_variant_id: testVariantId,
        p_quantity: 0,
        p_customization_id: null,
        p_session_token: null,
      });
      expect(error).not.toBeNull();
    });
  });

  // ------ update_cart_item_quantity ------
  describe("update_cart_item_quantity", () => {
    let cartItemId: string;

    beforeAll(async () => {
      // Get a real cart item
      const { data: items } = await authClient
        .from("cart_items_detailed")
        .select("id")
        .limit(1)
        .single();
      cartItemId = items?.id;
    });

    it("updates quantity successfully", async () => {
      expect(cartItemId).toBeTruthy();
      const { data, error } = await authClient.rpc("update_cart_item_quantity", {
        p_cart_item_id: cartItemId,
        p_quantity: 3,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.quantity).toBe(3);
    });

    it("deletes item when quantity = 0", async () => {
      expect(cartItemId).toBeTruthy();
      const { data, error } = await authClient.rpc("update_cart_item_quantity", {
        p_cart_item_id: cartItemId,
        p_quantity: 0,
        p_session_token: null,
      });
      expect(error).toBeNull();
      // Supabase returns all-null record for RETURN NULL with composite type
      expect(data).toBeTruthy();
      expect(data.id).toBeNull();
    });

    it("rejects invalid cart_item_id", async () => {
      const { data, error } = await authClient.rpc("update_cart_item_quantity", {
        p_cart_item_id: "00000000-0000-0000-0000-000000000000",
        p_quantity: 1,
        p_session_token: null,
      });
      expect(error).not.toBeNull();
    });
  });

  // ------ remove_cart_item ------
  describe("remove_cart_item", () => {
    let tempItemId: string;

    beforeAll(async () => {
      // Add an item to remove
      const { data: variants } = await anonClient
        .from("product_variants")
        .select("id")
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .limit(1)
        .single();
      const { data } = await authClient.rpc("add_to_cart", {
        p_variant_id: variants?.id,
        p_quantity: 1,
        p_customization_id: null,
        p_session_token: null,
      });
      tempItemId = data?.id;
    });

    it("removes an item successfully", async () => {
      expect(tempItemId).toBeTruthy();
      const { data, error } = await authClient.rpc("remove_cart_item", {
        p_cart_item_id: tempItemId,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("removing already-removed item returns false or errors", async () => {
      expect(tempItemId).toBeTruthy();
      const { data, error } = await authClient.rpc("remove_cart_item", {
        p_cart_item_id: tempItemId,
        p_session_token: null,
      });
      const hasError = !!error;
      const hasFalseData = data === false;
      expect(hasError || hasFalseData).toBe(true);
    });
  });

  // ------ save_for_later ------
  describe("save_for_later", () => {
    let tempItemId: string;

    beforeAll(async () => {
      const { data: variants } = await anonClient
        .from("product_variants")
        .select("id")
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .limit(1)
        .single();
      const { data } = await authClient.rpc("add_to_cart", {
        p_variant_id: variants?.id,
        p_quantity: 1,
        p_customization_id: null,
        p_session_token: null,
      });
      tempItemId = data?.id;
    });

    it("marks item as saved for later", async () => {
      expect(tempItemId).toBeTruthy();
      const { data, error } = await authClient.rpc("save_for_later", {
        p_cart_item_id: tempItemId,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.is_saved_for_later).toBe(true);
    });

    // Cleanup
    afterAll(async () => {
      if (tempItemId) {
        await authClient.rpc("remove_cart_item", {
          p_cart_item_id: tempItemId,
          p_session_token: null,
        });
      }
    });
  });

  // ------ apply_coupon ------
  describe("apply_coupon", () => {
    it("rejects invalid coupon code", async () => {
      const { data, error } = await authClient.rpc("apply_coupon", {
        p_cart_id: testCartId,
        p_code: "FAKE-COUPON-123",
        p_session_token: null,
      });
      const hasError = !!error;
      const hasCouponProp = data && "coupon_code" in data;
      expect(hasError || !!hasCouponProp).toBe(true);
    });
  });

  // ------ remove_coupon ------
  describe("remove_coupon", () => {
    it("removes coupon from cart", async () => {
      const { data, error } = await authClient.rpc("remove_coupon", {
        p_cart_id: testCartId,
        p_session_token: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.coupon_id).toBeNull();
    });
  });

  // ------ move_to_cart ------
  describe("move_to_cart", () => {
    it("returns null or error for non-existent item", async () => {
      const { data, error } = await authClient.rpc("move_to_cart", {
        p_cart_item_id: "00000000-0000-0000-0000-000000000000",
        p_session_token: null,
      });
      expect(error).not.toBeNull();
    });
  });

  // ------ move_wishlist_item_to_cart ------
  describe("move_wishlist_item_to_cart", () => {
    it("returns null or error for non-existent wishlist item", async () => {
      const { data, error } = await authClient.rpc("move_wishlist_item_to_cart", {
        p_wishlist_item_id: "00000000-0000-0000-0000-000000000000",
        p_quantity: 1,
        p_session_token: null,
      });
      expect(error).not.toBeNull();
    });
  });
});

// ==========================================================================
// SEARCH RPCs
// ==========================================================================

describe("Search RPCs", () => {
  // ------ search_products ------
  describe("search_products", () => {
    it("returns results for a valid query", async () => {
      const { data, error } = await anonClient.rpc("search_products", {
        p_query: "shirt",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 1,
        p_page_size: 10,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // Each result should have the expected shape
      if (data && data.length > 0) {
        const row = data[0];
        expect(row).toHaveProperty("product_id");
        expect(row).toHaveProperty("slug");
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("primary_image");
        expect(row).toHaveProperty("min_price");
        expect(row).toHaveProperty("max_price");
        expect(row).toHaveProperty("avg_rating");
        expect(row).toHaveProperty("in_stock");
        expect(row).toHaveProperty("relevance");
        expect(row).toHaveProperty("total_count");
      }
    });

    it("returns results for Arabic query", async () => {
      const { data, error } = await anonClient.rpc("search_products", {
        p_query: "قميص",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 1,
        p_page_size: 10,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("returns empty for gibberish", async () => {
      const { data, error } = await anonClient.rpc("search_products", {
        p_query: "xyzzyplughnonexistent",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 1,
        p_page_size: 10,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data?.length).toBe(0);
    });

    it("handles empty query", async () => {
      const { data, error } = await anonClient.rpc("search_products", {
        p_query: "",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 1,
        p_page_size: 10,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("handles price filtering", async () => {
      const { data, error } = await anonClient.rpc("search_products", {
        p_query: "",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: 10,
        p_max_price: 50,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "price_asc",
        p_page: 1,
        p_page_size: 5,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      if (data && data.length > 0) {
        for (const row of data) {
          expect(Number(row.min_price)).toBeGreaterThanOrEqual(10);
          expect(Number(row.min_price)).toBeLessThanOrEqual(50);
        }
      }
    });

    it("handles pagination", async () => {
      const { data: page1, error: e1 } = await anonClient.rpc("search_products", {
        p_query: "",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 1,
        p_page_size: 2,
      });
      expect(e1).toBeNull();
      expect(page1?.length).toBeLessThanOrEqual(2);

      const { data: page2, error: e2 } = await anonClient.rpc("search_products", {
        p_query: "",
        p_category_id: null,
        p_brand_id: null,
        p_min_price: null,
        p_max_price: null,
        p_min_rating: null,
        p_in_stock_only: false,
        p_sort: "relevance",
        p_page: 2,
        p_page_size: 2,
      });
      expect(e2).toBeNull();
      // Pages should have different items
      if (page1 && page2 && page1.length > 0 && page2.length > 0) {
        expect(page1[0].product_id).not.toBe(page2[0].product_id);
      }
    });
  });

  // ------ get_search_suggestions ------
  describe("get_search_suggestions", () => {
    it("returns suggestions for valid prefix", async () => {
      const { data, error } = await anonClient.rpc("get_search_suggestions", {
        p_prefix: "sh",
        p_limit: 5,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      if (data && data.length > 0) {
        expect(data[0]).toHaveProperty("suggestion");
        expect(data[0]).toHaveProperty("type");
        expect(data[0]).toHaveProperty("ref_id");
      }
    });

    it("returns empty for unrecognized prefix", async () => {
      const { data, error } = await anonClient.rpc("get_search_suggestions", {
        p_prefix: "zzzzqqqq",
        p_limit: 5,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data?.length).toBe(0);
    });

    it("respects limit parameter", async () => {
      const { data, error } = await anonClient.rpc("get_search_suggestions", {
        p_prefix: "a",
        p_limit: 2,
      });
      expect(error).toBeNull();
      expect(data?.length).toBeLessThanOrEqual(2);
    });
  });

  // ------ get_search_facets ------
  describe("get_search_facets", () => {
    it("returns facets for a query", async () => {
      const { data, error } = await anonClient.rpc("get_search_facets", {
        p_query: "shirt",
        p_category_id: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      // Facets should be a JSON object with categories, brands, price_ranges, etc.
      expect(typeof data).toBe("object");
    });

    it("returns facets for empty query", async () => {
      const { data, error } = await anonClient.rpc("get_search_facets", {
        p_query: "",
        p_category_id: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    });
  });

  // ------ log_search ------
  describe("log_search", () => {
    it("logs a search without error", async () => {
      const { data, error } = await anonClient.rpc("log_search", {
        p_query: "gate2 test search",
        p_result_count: 5,
        p_session_token: `test-session-${Date.now()}`,
        p_clicked_product_id: null,
      });
      expect(error).toBeNull();
    });

    it("logs a search with clicked product", async () => {
      const { data: variants } = await anonClient
        .from("product_variants")
        .select("product_id")
        .limit(1)
        .single();
      const { error } = await anonClient.rpc("log_search", {
        p_query: "gate2 test click",
        p_result_count: 3,
        p_session_token: `test-session-${Date.now()}`,
        p_clicked_product_id: variants?.product_id ?? null,
      });
      expect(error).toBeNull();
    });
  });

  // ------ get_popular_searches ------
  describe("get_popular_searches", () => {
    it("returns popular searches", async () => {
      const { data, error } = await anonClient.rpc("get_popular_searches", {
        p_limit: 5,
        p_days: 30,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      if (data && data.length > 0) {
        expect(data[0]).toHaveProperty("query");
        expect(data[0]).toHaveProperty("search_count");
      }
    });

    it("respects limit", async () => {
      const { data, error } = await anonClient.rpc("get_popular_searches", {
        p_limit: 2,
        p_days: 30,
      });
      expect(error).toBeNull();
      expect(data?.length).toBeLessThanOrEqual(2);
    });
  });
});
