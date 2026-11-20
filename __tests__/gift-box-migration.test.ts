/**
 * @jest-environment node
 *
 * Static contract for supabase/migrations/20261117140000_gift_box_bundles.sql
 * (local-only — never applied by the test run). These assertions keep the
 * reviewed invariants from silently regressing:
 *   - additive migration: no drops/truncates/deletes of existing tables
 *   - correct FK directions (box/product CASCADE, variant SET NULL, and the
 *     order snapshot deliberately has NO catalog FK)
 *   - duplicate guard via the expression unique index (NULL variant included)
 *   - RLS + read policies on all three tables, write stays service-role only
 *   - cart RPCs run the ADVISORY component check (no locks)
 *   - checkout() locks in ascending order, decrements components
 *     (component_qty × box_qty) and freezes the snapshot in one transaction
 *   - component restock happens ONLY in the cancellation trigger
 *   - nesting is blocked in both directions by DB triggers
 */

import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261117140000_gift_box_bundles.sql"
);

const sql = readFileSync(MIGRATION, "utf8");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

describe("gift box migration — safety (additive only)", () => {
  it("creates exactly the three new tables", () => {
    expect(flat).toContain("create table if not exists public.gift_boxes (");
    expect(flat).toContain("create table if not exists public.gift_box_items (");
    expect(flat).toContain("create table if not exists public.order_item_gift_box_contents (");
  });

  it("never drops, truncates or deletes existing data", () => {
    expect(sql).not.toMatch(/drop\s+table\s+if\s+exists\s+public\.(products|product_variants|orders|order_items)/i);
    expect(sql).not.toMatch(/truncate\s+/i);
    // NB: `delete from public.cart_items` inside the redefined cart RPCs is
    // pre-existing live behaviour (zero-qty line removal, checkout cleanup).
    expect(sql).not.toMatch(/delete\s+from\s+public\.(products|product_variants|orders|order_items)/i);
    expect(sql).not.toMatch(/alter\s+column\s+.*\s+set\s+default/i); // no repointing existing defaults
  });

  it("documents its reversal path", () => {
    expect(sql).toMatch(/--\s+REVERSAL:/i);
  });
});

describe("gift box migration — schema & relationships", () => {
  it("gift_boxes is a 1:1 product marker with CASCADE to products", () => {
    expect(flat).toContain("gift_box_product_id uuid");
    expect(flat).toContain(
      "product_id uuid primary key references public.products (id) on delete cascade"
    );
  });

  it("gift_box_items: box CASCADE, product CASCADE, variant SET NULL", () => {
    expect(flat).toContain(
      "gift_box_product_id uuid not null references public.gift_boxes (product_id) on delete cascade"
    );
    expect(flat).toContain(
      "product_id uuid not null references public.products (id) on delete cascade"
    );
    expect(flat).toContain(
      "variant_id uuid references public.product_variants (id) on delete set null"
    );
  });

  it("order snapshot cascades from order_items only — no FK to the catalog", () => {
    expect(flat).toContain(
      "order_item_id uuid not null references public.order_items (id) on delete cascade"
    );
    // product_id/variant_id exist as plain snapshot columns, never as FKs.
    expect(flat).not.toMatch(
      /order_item_gift_box_contents[\s\S]{0,400}references\s+public\.products/i
    );
    expect(flat).not.toMatch(
      /order_item_gift_box_contents[\s\S]{0,400}references\s+public\.product_variants/i
    );
    expect(flat).toContain("product_id uuid,");
    expect(flat).toContain("variant_id uuid,");
  });

  it("bounds component quantity (1..1000), display_order and note length in CHECKs", () => {
    expect(flat).toContain("check (quantity > 0 and quantity <= 1000)");
    expect(flat).toContain("check (display_order >= 0)");
    expect(flat).toContain("check (note is null or char_length(note) <= 500)");
  });

  it("blocks duplicate product/variant pairs per box, including NULL variants", () => {
    expect(flat).toContain("create unique index if not exists gift_box_items_box_product_variant_unique");
    expect(flat).toContain("coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)");
  });
});

describe("gift box migration — guards & security", () => {
  it("blocks nesting in both directions via DB triggers", () => {
    expect(flat).toContain("create trigger guard_gift_box_item_rules");
    expect(flat).toContain("create trigger guard_gift_box_registration");
    expect(flat).toContain(
      "raise exception 'this product is already a component of another gift box and cannot become a gift box itself'"
    );
    expect(flat).toContain("cannot contain itself"); // self-reference message in the items guard
  });

  it("enables RLS on all three tables", () => {
    expect(flat).toContain("alter table public.gift_boxes enable row level security;");
    expect(flat).toContain("alter table public.gift_box_items enable row level security;");
    expect(flat).toContain(
      "alter table public.order_item_gift_box_contents enable row level security;"
    );
  });

  it("exposes read-only SELECT policies (writes stay service-role only)", () => {
    expect(flat).toContain('create policy "gift_boxes_select_public_or_admin"');
    expect(flat).toContain('create policy "gift_box_items_select_public_or_admin"');
    expect(flat).toContain('create policy "order_item_gift_box_contents_select_owner_or_admin"');
    // No anon/authenticated INSERT/UPDATE/DELETE policies on any new table.
    expect(sql).not.toMatch(
      /create policy "[^"]*"\s+on\s+(gift_boxes|gift_box_items|order_item_gift_box_contents)\s+for\s+(insert|update|delete)/i
    );
    expect(flat).toContain("grant select on public.gift_boxes, public.gift_box_items,");
    expect(flat).toContain("grant all on public.gift_boxes, public.gift_box_items,");
  });

  it("restrains the availability RPC's default PUBLIC execute grant", () => {
    expect(flat).toContain(
      "revoke execute on function public.gift_box_assert_components_available(uuid, integer)"
    );
    expect(flat).toContain(
      "grant execute on function public.gift_box_assert_components_available(uuid, integer)"
    );
  });
});

describe("gift box migration — inventory semantics", () => {
  it("the cart-side availability check is advisory (no row locks) and uses stock − reserved", () => {
    const start = flat.indexOf("create or replace function public.gift_box_assert_components_available");
    const body = flat.slice(start, flat.indexOf("create or replace function public.add_to_cart"));
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("pv.stock_quantity - pv.reserved_quantity");
    expect(body).not.toContain("for update");
    expect(body).toContain("gbi.quantity * p_box_quantity as required_qty");
  });

  it("wires the advisory check into add_to_cart, update_cart_item_quantity and merge_guest_cart", () => {
    const names = [
      "public.add_to_cart",
      "public.update_cart_item_quantity",
      "public.merge_guest_cart",
    ];
    for (const name of names) {
      const start = flat.indexOf(`create or replace function ${name}`);
      expect(start).toBeGreaterThan(0);
      // scope to this function body (up to the next function definition)
      const next = flat.indexOf("create or replace function", start + 10);
      const body = flat.slice(start, next === -1 ? flat.length : next);
      expect(body).toContain("gift_box_assert_components_available(");
    }
  });

  it("checkout(): one ascending FOR UPDATE pass over the union of line + component variants", () => {
    const start = flat.indexOf("create or replace function public.checkout(");
    const body = flat.slice(start);
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("order by");
    expect(body).toContain("for update");
    // the lock pass must cover component variants joined from gift_box_items
    expect(body).toContain("join public.gift_box_items gbi");
  });

  it("checkout(): decrements component stock by component_qty × box_qty", () => {
    const start = flat.indexOf("create or replace function public.checkout(");
    const body = flat.slice(start, flat.indexOf("create or replace function", start + 10));
    expect(body).toContain(
      "set stock_quantity = stock_quantity - (gbi.quantity * v_item.quantity)"
    );
    // …and the aggregate pre-check mirrors the same multiplication.
    expect(body).toContain("sum(gbi.quantity * ci.quantity) as required_qty");
  });

  it("checkout(): freezes the composition into order_item_gift_box_contents in the same transaction", () => {
    const start = flat.indexOf("create or replace function public.checkout(");
    const body = flat.slice(start, flat.indexOf("create or replace function", start + 10));
    expect(body).toContain("insert into public.order_item_gift_box_contents");
    expect(body).toContain("gbi.quantity");
  });

  it("component restock exists ONLY in restock_on_order_cancel (single lifecycle path)", () => {
    const triggerStart = flat.indexOf("create or replace function public.restock_on_order_cancel");
    expect(triggerStart).toBeGreaterThan(0);
    const triggerBody = flat.slice(triggerStart);
    expect(triggerBody).toContain("sum(gbi.quantity * oi.quantity) as required_qty");
    expect(triggerBody).toContain("set stock_quantity = stock_quantity +");

    // Every component-restock UPDATE in the file lives after the trigger body —
    // i.e. no earlier function (add_to_cart / checkout / cancel_order) restocks
    // components a second time.
    const componentRestock = flat.indexOf("sum(gbi.quantity * oi.quantity)");
    expect(componentRestock).toBeGreaterThan(triggerStart);
  });
});
