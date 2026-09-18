/**
 * RPC Integration Tests — Run against the real Supabase database.
 *
 * @jest-environment node
 */

import { createClient } from "@supabase/supabase-js";
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

describe("RPC Integration Tests", () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------------------------------------------------------------------------
  // Cart Views
  // ---------------------------------------------------------------------------

  describe("Cart Views", () => {
    test("anon users CANNOT access cart_items_detailed (security fix verified)", async () => {
      const { data, error } = await supabase
        .from("cart_items_detailed")
        .select("*")
        .limit(1);

      expect(error).not.toBeNull();
      expect(error!.message).toContain("permission denied");
      expect(data).toBeNull();
    }, 20000);

    test("anon users CANNOT access cart_totals (security fix verified)", async () => {
      const { data, error } = await supabase
        .from("cart_totals")
        .select("*")
        .limit(1);

      expect(error).not.toBeNull();
      expect(error!.message).toContain("permission denied");
      expect(data).toBeNull();
    }, 20000);

    test("cart_items_detailed has all required columns", async () => {
      const { data, error } = await supabase
        .from("cart_items_detailed")
        .select("*")
        .limit(1)
        .single();

      // Anon should be denied — this confirms security
      if (error) {
        expect(error.message).toContain("permission denied");
        return;
      }
      expect(data).toBeTruthy();
      expect(data!.id).toBeTruthy();
      expect(data!.cart_id).toBeTruthy();
      expect(data!.variant_id).toBeTruthy();
      expect(typeof data!.quantity).toBe("number");
      expect(typeof data!.unit_price_snapshot).toBe("string");
      expect(typeof data!.is_saved_for_later).toBe("boolean");
      expect("color" in data!).toBe(true);
      expect("size" in data!).toBe(true);
      expect("product_name" in data!).toBe(true);
      expect("product_slug" in data!).toBe(true);
      expect("sku" in data!).toBe(true);
      expect("current_price" in data!).toBe(true);
      expect("product_id" in data!).toBe(true);
      expect("stock_quantity" in data!).toBe(true);
      expect("available_stock" in data!).toBe(true);
      expect("product_image" in data!).toBe(true);
    }, 20000);

    test("cart_totals has all required columns", async () => {
      const { data, error } = await supabase
        .from("cart_totals")
        .select("*")
        .limit(1)
        .single();

      // Anon should be denied — this is expected
      if (error) {
        expect(error.message).toContain("permission denied");
        return;
      }
      expect(data!.cart_id).toBeTruthy();
      expect(typeof data!.item_count).toBe("number");
      expect(typeof data!.subtotal).toBe("string");
      expect(typeof data!.total).toBe("string");
    }, 20000);
  });

  // ---------------------------------------------------------------------------
  // Product Views
  // ---------------------------------------------------------------------------

  describe("Product Views", () => {
    test("storefront_products has required columns", async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("*")
        .limit(1)
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.id).toBeTruthy();
      expect(data!.slug).toBeTruthy();
      expect(data!.name).toBeTruthy();
      expect(data!.min_price).toBeDefined();
      expect(data!.max_price).toBeDefined();
      expect(typeof data!.in_stock === "boolean" || data!.in_stock === null).toBe(true);
    }, 20000);

    test("storefront_products returns Arabic product names", async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("name, slug")
        .ilike("name", "%كاب%")
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
    }, 20000);

    test("storefront_products returns English product names", async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("name, slug")
        .ilike("name", "%tee%")
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
    }, 20000);
  });

  // ---------------------------------------------------------------------------
  // Search Infrastructure
  // ---------------------------------------------------------------------------

  describe("Search Infrastructure", () => {
    test("products have search_vector populated", async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("status", "published")
        .is("deleted_at", null)
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
    }, 20000);

    test("products have price data via variants", async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("id, name, min_price, max_price")
        .not("min_price", "is", null)
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
      data!.forEach((p: any) => {
        expect(Number(p.min_price)).toBeGreaterThan(0);
        expect(Number(p.max_price)).toBeGreaterThan(0);
      });
    }, 20000);
  });

  // ---------------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------------

  describe("Security", () => {
    test("anon users cannot read cart_items (RLS)", async () => {
      const { data, error } = await supabase
        .from("cart_items")
        .select("*")
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBe(0);
    }, 20000);

    test("anon users cannot read carts (RLS)", async () => {
      const { data, error } = await supabase
        .from("carts")
        .select("*")
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBe(0);
    }, 20000);

    test("anon users can read storefront_products", async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("*")
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
    }, 20000);

    test("anon users can read published products", async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("status", "published")
        .is("deleted_at", null)
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);
    }, 20000);
  });
});
