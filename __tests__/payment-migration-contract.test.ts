/**
 * @jest-environment node
 *
 * Static contract for 20261028_payment_methods_external_wallet.sql.
 *
 * The migration cannot be executed by the unit test run (it must be applied to
 * a disposable Supabase project), so these assertions keep the reviewed
 * invariants from silently regressing:
 *   - additive, data-preserving schema change
 *   - every payment RPC removes the default PUBLIC EXECUTE grant
 *   - legacy Vodafone receipts are bound to the real order owner/path
 *   - COD/external settlement is idempotent and never double-settles
 */

import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261028_payment_methods_external_wallet.sql"
);

const sql = readFileSync(MIGRATION, "utf8");
const flat = sql.replace(/\s+/g, " ");

describe("payment methods migration contract", () => {
  test("does not drop or delete historical payment data", () => {
    expect(sql).not.toMatch(/drop\s+table\s+public\.(orders|payments|payment_receipts)/i);
    expect(sql).not.toMatch(/truncate\s+/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(orders|payments|payment_receipts)/i);
  });

  test("adds external_wallet and backfills pending orders.payment_method", () => {
    expect(sql).toMatch(/add value if not exists 'external_wallet'/i);
    expect(sql).toMatch(/add column if not exists payment_method/i);
    expect(sql).toMatch(/p\.status in \('succeeded', 'pending', 'processing'\)/i);
    expect(sql).toMatch(/orders_payment_method_check/i);
  });

  test("removes the default PUBLIC EXECUTE grant from every payment RPC", () => {
    const signatures = [
      "public.pay_with_cod(uuid)",
      "public.initiate_external_wallet_payment(uuid)",
      "public.submit_external_wallet_receipt(uuid, text, text, text)",
      "public.verify_external_wallet_payment(uuid, boolean, text)",
      "public.mark_cod_collected(uuid)",
      "public.submit_vodafone_cash_receipt(uuid, text, text, text)",
      "public.verify_vodafone_cash_payment(uuid, boolean, text)",
    ];

    for (const signature of signatures) {
      expect(flat).toContain(
        `revoke execute on function ${signature} from public, anon;`
      );
      expect(flat).toContain(
        `grant execute on function ${signature} to authenticated, service_role;`
      );
    }
  });

  test("keeps confirm_order_payment service-role only", () => {
    expect(flat).toMatch(
      /revoke execute on function public\.confirm_order_payment\(\s*uuid, text, text, numeric, jsonb, text\s*\) from public, anon, authenticated;/
    );
    expect(flat).toMatch(
      /grant execute on function public\.confirm_order_payment\(\s*uuid, text, text, numeric, jsonb, text\s*\) to service_role;/
    );
  });

  test("legacy Vodafone receipts are bound to the real owner and order path", () => {
    expect(flat).toContain("v_payment_provider <> 'vodafone_cash'");
    expect(flat).toContain("new.user_id <> v_order_user_id");
    expect(flat).toContain("new.receipt_url not like");
    expect(flat).toContain("position('..' in new.receipt_url) > 0");
    expect(flat).toContain("position(chr(92) in new.receipt_url) > 0");
    expect(flat).toContain("before insert on public.payment_receipts");
  });

  test("COD collection locks the order before the payment and blocks double settlement", () => {
    const orderLock = flat.indexOf("where id = v_payment.order_id for update");
    const paymentLock = flat.indexOf("where id = p_payment_id for update");

    expect(orderLock).toBeGreaterThan(-1);
    expect(paymentLock).toBeGreaterThan(orderLock);
    expect(flat).toContain(
      "This order is already paid by another payment"
    );
  });

  test("external approval refuses to settle an already-paid order", () => {
    expect(flat).toContain("if p_approve is true and exists");
    expect(flat).toMatch(
      /This order is already paid by another payment/
    );
  });

  test("the new settlement RPCs are SECURITY DEFINER with a fixed search_path", () => {
    for (const name of [
      "pay_with_cod",
      "initiate_external_wallet_payment",
      "submit_external_wallet_receipt",
      "verify_external_wallet_payment",
      "mark_cod_collected",
      "guard_vodafone_receipt_method",
    ]) {
      expect(sql).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
    expect((sql.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((sql.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});