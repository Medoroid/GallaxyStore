/**
 * @jest-environment node
 *
 * Static guards for the 20261030 payment/order-status migrations.
 *
 * These files cannot be executed by the unit test run, so keep the reviewed
 * invariants visible:
 *   - a different succeeded reference cannot double-settle an order
 *   - the COD status function has a trigger on a fresh database
 */

import { readFileSync } from "fs";
import { join } from "path";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

describe("confirm_order_payment partial-index migration", () => {
  const sql = migration("20261030_confirm_order_payment_partial_index.sql");
  const flat = sql.replace(/\s+/g, " ").toLowerCase();

  test("keeps the matching partial-index predicate in ON CONFLICT", () => {
    expect(flat).toContain("on conflict (provider, provider_payment_id)");
    expect(flat).toContain("where provider_payment_id is not null");
  });

  test("rejects a different succeeded payment on the same order", () => {
    expect(flat).toContain("and status = 'succeeded'");
    expect(flat).toContain("provider = v_provider");
    expect(flat).toContain("provider_payment_id = p_provider_payment_id");
    expect(flat).toContain("already paid by another payment");
  });

  test("rejects a null, zero or negative amount before the mismatch check", () => {
    expect(flat).toContain("if p_amount is null or p_amount <= 0 then");
    expect(flat).toContain("a valid payment amount is required");
  });
});

describe("order status COD transition migration", () => {
  const sql = migration("20261030_order_status_cod_transitions.sql");
  const flat = sql.replace(/\s+/g, " ").toLowerCase();

  test("allows the COD fulfilment transitions", () => {
    expect(flat).toContain("when 'pending' then new.status in ('paid', 'processing', 'cancelled')");
    expect(flat).toContain(
      "when 'paid' then new.status in ('processing', 'shipped', 'cancelled', 'refunded')"
    );
    expect(flat).toContain(
      "when 'processing' then new.status in ('printing', 'shipped', 'cancelled', 'refunded', 'partially_refunded')"
    );
  });

  test("creates the trigger only when no trigger already calls the function", () => {
    expect(flat).toContain("from pg_trigger t");
    expect(flat).toContain("t.tgenabled <> 'd'");
    expect(flat).toContain("p.pronamespace = 'public'::regnamespace");
    expect(flat).toContain("p.proname = 'validate_order_status_transition'");
    expect(flat).toContain("create trigger trg_validate_order_status_transition");
    expect(flat).toContain("before update of status on public.orders");
  });
});

describe("product images bucket migration", () => {
  const sql = migration("20261030_product_images_bucket.sql");
  const flat = sql.replace(/\s+/g, " ").toLowerCase();

  test("fails early when the owns_product baseline is missing", () => {
    expect(flat).toContain("to_regprocedure('public.owns_product(uuid)') is null");
    expect(flat).toContain("dependency missing: public.owns_product(uuid)");
  });
});
