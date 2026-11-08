# Database baseline and migration status

The live project has historical migrations that are not all present in this repository.
The release migrations under `supabase/migrations/2026102*` are the authoritative changes
for the current code, but disaster recovery should also keep a full schema snapshot.

## Current migration status

| Migration | Live status |
|---|---|
| `20261023_production_readiness.sql` | applied |
| `20261024_custom_print_requests.sql` | applied |
| `20261025_refund_hardening.sql` | applied |
| `20261026_admin_audit_log.sql` | applied |
| `20261028_payment_methods_external_wallet.sql` | **UNAPPLIED** |
| `20261029_order_payment_completion.sql` | **UNAPPLIED** |

Read-only inspection of the live project on 2026-10-24 confirmed:

- `public.payment_provider` values are `stripe`, `paymob`, `cod`, `wallet`,
  `vodafone_cash`; `external_wallet` is absent.
- `public.orders` has no `payment_method` column.
- `payments` and `payment_receipts` constraints/indexes match the assumptions used by
  `20261028` (including the provider/reference unique indexes).
- Older `pay_with_cod` / `mark_cod_collected` functions exist. They do not persist
  `orders.payment_method`; the older `mark_cod_collected` RPC itself only updates the
  payment, but the live `sync_order_payment_status()` trigger flips a pending order to
  `paid` when a succeeded payment reaches the order total. The hardened versions and all
  external-wallet RPCs are not live until `20261028` is applied.
- The live legacy `submit_vodafone_cash_receipt` does not check `orders.payment_method`,
  the exact owner/order path or conflicting new-method payments. `20261028` adds the
  `guard_vodafone_receipt_method` trigger; until it is applied, the legacy RPC is not
  protected at the database boundary.
- The live legacy Vodafone RPCs and `confirm_order_payment` still carry the default
  `PUBLIC` execute grant. `20261028` revokes `PUBLIC`/`anon` and restricts
  `confirm_order_payment` to `service_role`.
- `payments.amount > 0` makes a zero-amount COD/wallet payment impossible, so a fully
  discounted order cannot be settled by a payment row. `20261029` adds
  `complete_zero_total_order()` to mark such an order `paid` directly.
- The live `set_order_shipping_method()` has a default `PUBLIC` execute grant and its
  `v_owner <> auth.uid()` check is NULL (and therefore passes) for an anonymous caller.
  `20261029` rejects anonymous callers and revokes `PUBLIC`/`anon`.

> **Do not apply `20261028_payment_methods_external_wallet.sql` or
> `20261029_order_payment_completion.sql` without explicit approval.**
> They are reviewed migration files only. No live schema or data was changed by this work.

## Generate a snapshot

The Supabase CLI uses its bundled `pg_dump` through Docker, so Docker Desktop must be
running:

```bash
supabase db dump --linked --schema public -f supabase/schema-baseline.sql
```

Review the generated file before committing it. A schema-only dump contains no row data
and no secrets.

## Restore order for a new environment

1. Restore `supabase/schema-baseline.sql` into a fresh Postgres/Supabase project.
2. Apply the release migrations in timestamp order, including
   `20261028_payment_methods_external_wallet.sql` (which also installs the legacy
   Vodafone cross-method guard trigger and fixes the payment RPC EXECUTE grants) and
   `20261029_order_payment_completion.sql` (free-order completion + shipping-method
   anonymous-caller fix).
3. Seed reference data (categories, shipping methods, store settings) separately.
4. Configure the private `store_settings.external_wallet` row through the admin settings
   screen after the migration is applied.

## Current gap

Snapshot generation was attempted previously and failed because the local Docker daemon
was not available (`LegacyDockerRunError`). Run the command above on a machine with Docker
to close this gap.
