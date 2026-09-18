/**
 * GATE 5 — Security Negative Tests
 *
 * Tests that verify security boundaries hold:
 * - Cross-user cart isolation
 * - Invalid/malformed IDs
 * - SQL injection via RPC parameters
 * - Edge cases (null, empty strings, special characters)
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

let userA: SupabaseClient;
let userB: SupabaseClient;
let anonClient: SupabaseClient;
let userAId: string;
let userBId: string;
let cartAId: string;
let variantId: string;

const PW_A = "SecTestUserA!2026";
const PW_B = "SecTestUserB!2026";

beforeAll(async () => {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  anonClient = anon;
  const emailA = `seca-${Date.now()}@test.example.com`;
  const emailB = `secb-${Date.now()}@test.example.com`;

  // Create user A
  const { data: sA, error: eA } = await anon.auth.signUp({ email: emailA, password: PW_A });
  if (eA) throw new Error(`Failed to create user A: ${eA.message}`);
  userAId = sA.user!.id;

  // Create user B
  const { data: sB, error: eB } = await anon.auth.signUp({ email: emailB, password: PW_B });
  if (eB) throw new Error(`Failed to create user B: ${eB.message}`);
  userBId = sB.user!.id;

  // Create authenticated clients
  userA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await userA.auth.signInWithPassword({ email: emailA, password: PW_A });

  userB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await userB.auth.signInWithPassword({ email: emailB, password: PW_B });

  // Create cart for user A
  const { data: cartId } = await userA.rpc("get_or_create_cart", { p_session_token: null });
  cartAId = cartId;

  // Get a real variant
  const { data: vars } = await anon
    .from("product_variants")
    .select("id")
    .eq("is_active", true)
    .gt("stock_quantity", 0)
    .limit(1)
    .single();
  variantId = vars!.id;

  // Add an item to user A's cart
  await userA.rpc("add_to_cart", {
    p_variant_id: variantId,
    p_quantity: 1,
    p_customization_id: null,
    p_session_token: null,
  });
});

afterAll(async () => {
  // Cleanup user A's items
  const { data: items } = await userA
    .from("cart_items_detailed")
    .select("id");
  if (items) {
    for (const item of items) {
      try {
        await userA.rpc("remove_cart_item" as any, {
          p_cart_item_id: item.id,
          p_session_token: null,
        });
      } catch {}
    }
  }
  await userA?.auth.signOut();
  await userB?.auth.signOut();
});

describe("Security: Cross-User Isolation", () => {
  it("user B cannot read user A's cart_items_detailed via view", async () => {
    const { data, error } = await userB
      .from("cart_items_detailed")
      .select("*")
      .eq("cart_id", cartAId);

    // Should return empty (RLS blocks) or permission denied
    if (error) {
      expect(error.message).toContain("permission denied");
    } else {
      expect(data.length).toBe(0);
    }
  });

  it("user B cannot update user A's cart items via RPC", async () => {
    // Get user A's cart items
    const { data: items } = await userA
      .from("cart_items_detailed")
      .select("id")
      .limit(1)
      .single();

    if (!items) return; // skip if no items

    const { data, error } = await userB.rpc("update_cart_item_quantity", {
      p_cart_item_id: items.id,
      p_quantity: 999,
      p_session_token: null,
    });

    // Should error (can't access another user's item)
    expect(error).not.toBeNull();
  });

  it("user B cannot remove user A's cart items via RPC", async () => {
    const { data: items } = await userA
      .from("cart_items_detailed")
      .select("id")
      .limit(1)
      .single();

    if (!items) return;

    const { data, error } = await userB.rpc("remove_cart_item", {
      p_cart_item_id: items.id,
      p_session_token: null,
    });

    // Should return false or null (can't access another user's item)
    expect(data === false || data === null).toBe(true);
  });
});

describe("Security: Anon Cannot Access Cart Views", () => {
  it("anon gets permission denied on cart_items_detailed", async () => {
    const testAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await testAnon
      .from("cart_items_detailed")
      .select("*")
      .limit(1);

    // Should get permission denied error, OR null data with no results
    if (error) {
      expect(error.message).toContain("permission denied");
    } else {
      // If no error, data should be empty (RLS blocks rows)
      expect(data).toEqual([]);
    }
  });

  it("anon gets permission denied on cart_totals", async () => {
    const testAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await testAnon
      .from("cart_totals")
      .select("*")
      .limit(1);

    if (error) {
      expect(error.message).toContain("permission denied");
    } else {
      expect(data).toEqual([]);
    }
  });
});

describe("Security: Invalid Input Handling", () => {
  it("add_to_cart with nil UUID returns null", async () => {
    const { data, error } = await userA.rpc("add_to_cart", {
      p_variant_id: "00000000-0000-0000-0000-000000000000",
      p_quantity: 1,
      p_customization_id: null,
      p_session_token: null,
    });
    expect(error).not.toBeNull();
  });

  it("add_to_cart with negative quantity returns error", async () => {
    const { data, error } = await userA.rpc("add_to_cart", {
      p_variant_id: variantId,
      p_quantity: -5,
      p_customization_id: null,
      p_session_token: null,
    });
    expect(error).not.toBeNull();
  });

  it("update_cart_item_quantity with zero deletes the item", async () => {
    const { data: items } = await userA
      .from("cart_items_detailed")
      .select("id")
      .limit(1)
      .single();
    if (!items) return;

    const { data, error } = await userA.rpc("update_cart_item_quantity", {
      p_cart_item_id: items.id,
      p_quantity: 0,
      p_session_token: null,
    });
    expect(error).toBeNull();
    // Supabase returns all-null record for RETURN NULL with composite type
    expect(data).toBeTruthy();
    expect(data.id).toBeNull();
  });
});

describe("Security: SQL Injection Attempts", () => {
  it("search_products handles SQL injection in query", async () => {
    const { data, error } = await anonClient.rpc("search_products", {
      p_query: "'; DROP TABLE products; --",
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
    // Products table should still exist
    const { data: check } = await anonClient.from("products").select("id").limit(1);
    expect(check).toBeTruthy();
  });

  it("log_search handles SQL injection in query", async () => {
    const { error } = await anonClient.rpc("log_search", {
      p_query: "'; DROP TABLE search_logs; --",
      p_result_count: 0,
      p_session_token: "inject-test",
      p_clicked_product_id: null,
    });
    expect(error).toBeNull();
  });

  it("get_search_suggestions handles SQL injection in prefix", async () => {
    const { data, error } = await anonClient.rpc("get_search_suggestions", {
      p_prefix: "' OR 1=1 --",
      p_limit: 5,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("add_to_cart handles SQL injection in session token", async () => {
    const { data, error } = await userA.rpc("add_to_cart", {
      p_variant_id: variantId,
      p_quantity: 1,
      p_customization_id: null,
      p_session_token: "'; DROP TABLE carts; --",
    });
    // Should succeed or error safely, NOT drop tables
    const { data: check } = await anonClient.from("carts").select("id").limit(1);
    expect(check).toBeTruthy();
  });
});

describe("Security: Edge Cases", () => {
  it("search_products handles empty string query", async () => {
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

  it("search_products handles very long query", async () => {
    const longQuery = "a".repeat(1000);
    const { data, error } = await anonClient.rpc("search_products", {
      p_query: longQuery,
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

  it("search_products handles special characters", async () => {
    const { data, error } = await anonClient.rpc("search_products", {
      p_query: "!@#$%^&*()_+-=[]{}|;':\",./<>?",
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

  it("get_search_suggestions handles empty prefix", async () => {
    const { data, error } = await anonClient.rpc("get_search_suggestions", {
      p_prefix: "",
      p_limit: 5,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("get_search_facets handles empty query", async () => {
    const { data, error } = await anonClient.rpc("get_search_facets", {
      p_query: "",
      p_category_id: null,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});
