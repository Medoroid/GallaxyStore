/**
 * @jest-environment node
 *
 * Static contract for 20261029_order_payment_completion.sql.
 *
 * The migration cannot be executed by the unit test run, so these assertions
 * keep the reviewed invariants from silently regressing:
 *   - zero-total orders complete as paid (never as a 0-amount payment row)
 *   - the completion RPC is owner-checked and idempotent
 *   - set_order_shipping_method rejects anonymous callers
 *   - both functions drop the default PUBLIC EXECUTE grant
 */

import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261029_order_payment_completion.sql"
);

const sql = readFileSync(MIGRATION, "utf8");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

describe("order payment completion migration contract", () => {
  test("is additive and does not delete historical rows", () => {
    expect(sql).not.toMatch(/drop\s+table\s+public\.(orders|payments|payment_receipts)/i);
    expect(sql).not.toMatch(/truncate\s+/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(orders|payments|payment_receipts)/i);
  });

  test("defines complete_zero_total_order as a security definer", () => {
    expect(flat).toContain("create or replace function public.complete_zero_total_order(p_order_id uuid)");
    expect(flat).toMatch(/security definer/);
  });

  test("complete_zero_total_order requires auth, ownership and an exact zero total", () => {
    expect(flat).toContain("if v_uid is null then");
    expect(flat).toContain("v_order.user_id is distinct from v_uid");
    expect(flat).toContain("v_order.status <> 'pending'");
    // Guard rail: never release a positive, negative or null-total order.
    expect(flat).toContain("if v_order.total is distinct from 0 then");
    expect(flat).not.toContain("coalesce(v_order.total, 0) > 0");
  });

  test("never inserts a payment or duplicates the status-history trigger row", () => {
    expect(flat).not.toMatch(/insert\s+into\s+public\.payments/);
    expect(flat).not.toMatch(/insert\s+into\s+public\.order_status_history/);
  });

  test("set_order_shipping_method rejects anonymous, non-owner and non-pending orders", () => {
    expect(flat).toContain("create or replace function public.set_order_shipping_method");
    expect(flat).toContain("if auth.uid() is null then");
    expect(flat).toContain("v_order.user_id is distinct from auth.uid()");
    expect(flat).toContain("for update");
    expect(flat).toContain("if v_order.status <> 'pending' then");
  });

  test("fails early when the live shipping-options baseline is missing", () => {
    expect(flat).toContain(
      "to_regprocedure('public.get_shipping_options(text, numeric, integer)') is null"
    );
    expect(flat).toContain("dependency missing: public.get_shipping_options");
  });

  test("set_order_shipping_method binds the method to the charged fee", () => {
    expect(flat).toContain("from public.get_shipping_options(");
    expect(flat).toContain("v_option.method_id = p_shipping_method_id");
    expect(flat).toContain("v_option.fee is null");
    expect(flat).toContain("round(v_option.fee, 2) is distinct from");
    expect(flat).toContain("round(coalesce(v_order.shipping_fee, 0), 2)");
    expect(flat).toContain("if not v_found then");
  });

  test("removes the default PUBLIC EXECUTE grant from both functions", () => {
    for (const signature of [
      "public.complete_zero_total_order(uuid)",
      "public.set_order_shipping_method(uuid, uuid)",
    ]) {
      expect(flat).toContain(`revoke execute on function ${signature} from public, anon;`);
      expect(flat).toContain(
        `grant execute on function ${signature} to authenticated, service_role;`
      );
    }
  });
});
