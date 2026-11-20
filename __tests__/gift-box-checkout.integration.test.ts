/**
 * GIFT BOXES — live-DB invariants (integration)
 *
 * Runs ONLY via `npm run test:integration` (jest.integration.config.ts enforces
 * a dedicated test project). Every case self-skips while the gift box
 * migration (20261117140000_gift_box_bundles.sql) is not applied, so this file
 * is safe to keep in the tree before the approval lands.
 *
 * What unit tests cannot cover — the database itself enforcing:
 *   1. the advisory RPC rejects component_qty × box_qty beyond availability
 *      (the cart-side guard, no locks, stock − reserved semantics)
 *   2. the expression unique index rejects duplicate product/variant pairs,
 *      including the NULL-variant normalisation
 *   3. nesting is blocked in BOTH directions + self-reference (DB triggers)
 *   4. lifecycle: variant DELETE keeps the membership (SET NULL), product
 *      DELETE cascades the relationship only (never the other way around)
 *   5. RLS: anon can read published boxes but can NEVER write
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const stamp = Date.now();

let db: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;
/** False while the migration is missing (or no service key is available). */
let schemaReady = false;
let reason = "unknown";

// Seeded fixture ids (partial seeding must still clean up).
let boxProduct: string | null = null;
let boxVariant: string | null = null;
let compProduct: string | null = null;
let compVariant: string | null = null;
let secondBoxProduct: string | null = null;
let secondCompProduct: string | null = null;
let secondCompVariant: string | null = null;
let nullVariantItemId: string | null = null;

beforeAll(async () => {
  if (!SUPABASE_URL || !ANON_KEY) {
    reason = "missing Supabase env";
    return;
  }
  anon = createClient(SUPABASE_URL, ANON_KEY);
  if (!SERVICE_KEY) {
    reason = "SUPABASE_SERVICE_ROLE_KEY not available";
    return;
  }
  db = createClient(SUPABASE_URL, SERVICE_KEY);

  const probe = await db.from("gift_boxes").select("product_id").limit(1);
  if (probe.error && probe.error.code === "42P01") {
    reason = "gift box migration not applied yet";
    return;
  }

  // ---- seed: one component product + one box product, component inside box
  const { data: comp, error: compErr } = await db
    .from("products")
    .insert({ name: `IT Component ${stamp}`, slug: `it-component-${stamp}`, base_price: 10 })
    .select("id")
    .single();
  if (compErr) throw new Error(`seed component product failed: ${compErr.message}`);
  compProduct = comp.id;

  const { data: compVar, error: compVarErr } = await db
    .from("product_variants")
    .insert({
      product_id: compProduct,
      sku: `IT-COMP-${stamp}`,
      price: 10,
      stock_quantity: 3, // deliberately tight: box qty 2 × item qty 2 = 4 > 3
    })
    .select("id")
    .single();
  if (compVarErr) throw new Error(`seed component variant failed: ${compVarErr.message}`);
  compVariant = compVar.id;

  const { data: box, error: boxErr } = await db
    .from("products")
    .insert({ name: `IT Box ${stamp}`, slug: `it-box-${stamp}`, base_price: 20 })
    .select("id")
    .single();
  if (boxErr) throw new Error(`seed box product failed: ${boxErr.message}`);
  boxProduct = box.id;

  const { data: boxVar, error: boxVarErr } = await db
    .from("product_variants")
    .insert({
      product_id: boxProduct,
      sku: `IT-BOX-${stamp}`,
      price: 20,
      stock_quantity: 50,
    })
    .select("id")
    .single();
  if (boxVarErr) throw new Error(`seed box variant failed: ${boxVarErr.message}`);
  boxVariant = boxVar.id;

  const { error: markerErr } = await db
    .from("gift_boxes")
    .insert({ product_id: boxProduct });
  if (markerErr) throw new Error(`seed gift_boxes marker failed: ${markerErr.message}`);

  const { error: itemErr } = await db.from("gift_box_items").insert({
    gift_box_product_id: boxProduct,
    product_id: compProduct,
    variant_id: compVariant,
    quantity: 2,
    is_active: true,
  });
  if (itemErr) throw new Error(`seed gift_box_items failed: ${itemErr.message}`);

  schemaReady = true;
});

afterAll(async () => {
  if (!db) return;
  try {
    // Order matters: relationships first, catalog rows last.
    await db.from("gift_box_items").delete().in(
      "gift_box_product_id",
      [boxProduct, secondBoxProduct].filter(Boolean) as string[]
    );
    await db.from("gift_boxes").delete().in(
      "product_id",
      [boxProduct, secondBoxProduct].filter(Boolean) as string[]
    );
    await db.from("product_variants").delete().in(
      "product_id",
      [boxProduct, compProduct, secondBoxProduct, secondCompProduct].filter(Boolean) as string[]
    );
    await db.from("products").delete().in(
      "id",
      [boxProduct, compProduct, secondBoxProduct, secondCompProduct].filter(Boolean) as string[]
    );
  } catch {
    // best-effort cleanup
  }
});

/** Runtime skip guard: while the migration is pending, nothing can be verified. */
function skipIfNotReady(): boolean {
  if (schemaReady) return false;
  // eslint-disable-next-line no-console
  console.warn(`  ⚠ skipped (gift boxes schema not ready — ${reason})`);
  return true;
}

describe("gift boxes — live database invariants", () => {
  it("1. advisory RPC accepts sufficient stock and rejects component_qty × box_qty overflow", async () => {
    if (skipIfNotReady() || !db) return;

    // box qty 1 → needs 2 × 1 = 2 ≤ 3 available → passes.
    const ok = await db.rpc("gift_box_assert_components_available", {
      p_box_variant_id: boxVariant,
      p_box_quantity: 1,
    });
    expect(ok.error).toBeNull();

    // box qty 2 → needs 2 × 2 = 4 > 3 available → blocked with a clear message.
    const blocked = await db.rpc("gift_box_assert_components_available", {
      p_box_variant_id: boxVariant,
      p_box_quantity: 2,
    });
    expect(blocked.error).not.toBeNull();
    expect(blocked.error?.message).toMatch(/Insufficient stock for gift box content/);

    // Non-box variant lines are ignored (never blocks regular products).
    const notABox = await db.rpc("gift_box_assert_components_available", {
      p_box_variant_id: compVariant,
      p_box_quantity: 99,
    });
    expect(notABox.error).toBeNull();
  });

  it("2. duplicate product/variant pairs are rejected by the unique index — NULLs included", async () => {
    if (skipIfNotReady() || !db) return;

    const duplicate = await db.from("gift_box_items").insert({
      gift_box_product_id: boxProduct,
      product_id: compProduct,
      variant_id: compVariant,
      quantity: 1,
    });
    expect(duplicate.error).not.toBeNull();
    expect(duplicate.error?.code).toBe("23505");

    // NULL variant → normalised by the expression index → second attempt also 23505.
    const firstNull = await db
      .from("gift_box_items")
      .insert({
        gift_box_product_id: boxProduct,
        product_id: compProduct,
        variant_id: null,
        quantity: 1,
      })
      .select("id")
      .single();
    expect(firstNull.error).toBeNull();
    nullVariantItemId = firstNull.data?.id ?? null;

    const secondNull = await db.from("gift_box_items").insert({
      gift_box_product_id: boxProduct,
      product_id: compProduct,
      variant_id: null,
      quantity: 1,
    });
    expect(secondNull.error).not.toBeNull();
    expect(secondNull.error?.code).toBe("23505");
  });

  it("3. nesting triggers block: component→box registration, box-as-component, self-reference", async () => {
    if (skipIfNotReady() || !db) return;

    // (a) a product that is already a component cannot become a gift box.
    const registerComponent = await db
      .from("gift_boxes")
      .insert({ product_id: compProduct });
    expect(registerComponent.error).not.toBeNull();
    expect(registerComponent.error?.message).toMatch(/already a component of another gift box/);

    // (b) a registered box cannot become a component of another box.
    const { data: secondBox, error: secondBoxErr } = await db
      .from("products")
      .insert({ name: `IT Box 2 ${stamp}`, slug: `it-box2-${stamp}`, base_price: 15 })
      .select("id")
      .single();
    expect(secondBoxErr).toBeNull();
    secondBoxProduct = secondBox?.id ?? null;

    const { error: secondMarkerErr } = await db
      .from("gift_boxes")
      .insert({ product_id: secondBoxProduct });
    expect(secondMarkerErr).toBeNull();

    const nestBox = await db.from("gift_box_items").insert({
      gift_box_product_id: secondBoxProduct,
      product_id: boxProduct, // box inside a box → forbidden
      quantity: 1,
    });
    expect(nestBox.error).not.toBeNull();
    expect(nestBox.error?.message).toMatch(/nested inside other gift boxes/);

    // (c) a box can never contain itself.
    const self = await db.from("gift_box_items").insert({
      gift_box_product_id: boxProduct,
      product_id: boxProduct,
      quantity: 1,
    });
    expect(self.error).not.toBeNull();
    expect(self.error?.message).toMatch(/cannot contain itself/);
  });

  it("4. lifecycle: variant delete keeps membership (SET NULL); product delete cascades it away", async () => {
    if (skipIfNotReady() || !db) return;

    // Seed a second component with its own variant.
    const { data: comp2 } = await db
      .from("products")
      .insert({ name: `IT Component 2 ${stamp}`, slug: `it-component2-${stamp}`, base_price: 5 })
      .select("id")
      .single();
    secondCompProduct = comp2?.id ?? null;
    const { data: comp2Var } = await db
      .from("product_variants")
      .insert({
        product_id: secondCompProduct,
        sku: `IT-COMP2-${stamp}`,
        price: 5,
        stock_quantity: 10,
      })
      .select("id")
      .single();
    secondCompVariant = comp2Var?.id ?? null;

    const { error: addErr } = await db.from("gift_box_items").insert({
      gift_box_product_id: boxProduct,
      product_id: secondCompProduct,
      variant_id: secondCompVariant,
      quantity: 1,
    });
    expect(addErr).toBeNull();

    // Physical variant delete → membership survives with variant_id = null.
    const { error: variantDeleteErr } = await db
      .from("product_variants")
      .delete()
      .eq("id", secondCompVariant);
    expect(variantDeleteErr).toBeNull();

    const { data: keptRow } = await db
      .from("gift_box_items")
      .select("id, variant_id")
      .eq("product_id", secondCompProduct)
      .maybeSingle();
    expect(keptRow).not.toBeNull();
    expect(keptRow?.variant_id).toBeNull();

    // Physical product delete → only the relationship row disappears.
    const { error: productDeleteErr } = await db
      .from("products")
      .delete()
      .eq("id", secondCompProduct);
    expect(productDeleteErr).toBeNull();

    const { data: goneRow } = await db
      .from("gift_box_items")
      .select("id")
      .eq("product_id", secondCompProduct);
    expect(goneRow ?? []).toHaveLength(0);

    // The BOX product itself is untouched — removing components never deletes.
    const { data: boxStillThere } = await db
      .from("products")
      .select("id")
      .eq("id", boxProduct)
      .maybeSingle();
    expect(boxStillThere).not.toBeNull();
  });

  it("5. RLS: anon reads published boxes but can never write", async () => {
    if (skipIfNotReady() || !db || !anon) return;

    // Publish the seeded box so the public SELECT policy applies to it.
    const { error: publishErr } = await db
      .from("products")
      .update({ status: "published", visibility: "visible" })
      .eq("id", boxProduct);
    expect(publishErr).toBeNull();

    // anon reads… (reads of published rows succeed)
    const readBoxes = await anon.from("gift_boxes").select("product_id");
    expect(readBoxes.error).toBeNull();

    const readItems = await anon
      .from("gift_box_items")
      .select("id, gift_box_product_id");
    expect(readItems.error).toBeNull();

    // …but anon writes are denied by RLS on every new table.
    const writeBox = await anon.from("gift_boxes").insert({ product_id: boxProduct });
    expect(writeBox.error).not.toBeNull();

    const writeItem = await anon.from("gift_box_items").insert({
      gift_box_product_id: boxProduct,
      product_id: compProduct,
      quantity: 1,
    });
    expect(writeItem.error).not.toBeNull();

    // The order snapshot table: anon has no matching policy → empty read, no leak.
    const readSnapshot = await anon
      .from("order_item_gift_box_contents")
      .select("id")
      .limit(1);
    expect(readSnapshot.error).toBeNull();
    expect(readSnapshot.data ?? []).toHaveLength(0);
  });

  it("6. cleanup invariant: seeded NULL-variant membership row is removable (relationship-only delete)", async () => {
    if (skipIfNotReady() || !db || !nullVariantItemId) return;

    const { error } = await db
      .from("gift_box_items")
      .delete()
      .eq("id", nullVariantItemId);
    expect(error).toBeNull();

    const { data } = await db
      .from("gift_box_items")
      .select("id")
      .eq("id", nullVariantItemId);
    expect(data ?? []).toHaveLength(0);

    // Still no catalog deletion happened anywhere.
    const { data: compRow } = await db
      .from("products")
      .select("id")
      .eq("id", compProduct)
      .maybeSingle();
    expect(compRow).not.toBeNull();
  });
});
