# Known Limitations (honest, not hidden)

1. **No staging environment.** `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` are absent, so all database integration, authenticated E2E, and post-migration verification are `BLOCKED`. Integration tests intentionally refuse to run rather than write to production.
2. **Migrations unapplied.** The linked database lacks `products.available_sizes`, theme/site-content/creator tables, custom-print studio schema, gift-box schema and the admin performance view fix. The storefront retries without the missing column, but admin product pages fail until the bundle is applied.
3. **Payment confirmation RPC.** `confirm_order_payment` remains callable by `anon` until the prepared revoke is applied. No application code calls it, but external callers can.
4. **Double restock.** `cancel_order` currently doubles stock on cancellation; the corrective SQL is local only, so the live defect remains until applied on staging/production with approval.
5. **Vendor views.** 19 `vendor_*` views use definer rights. They are guarded by `owns_store(auth.uid())` (directly or via `vendor_order_items`) and not granted to anon, but the Supabase advisor ERROR remains until a dedicated view rewrite is tested.
6. **Payouts.** Method persistence and admin decision UI are implemented, but the migration is unapplied; "approved" creates only a ledger row. No provider integration exists and `mark_vendor_payout_paid` must not be exposed as proof of money movement.
7. **Payee bank details.** No account/PII field exists by design; adding one needs a security/retention decision first.
8. **Card payments.** Stripe and Paymob webhooks are deliberately disabled stubs (no signature verification because they have no effect). Do not enable them without credentials, test mode, and signature checks.
9. **E2E.** Read-only guest suite: 6 passed / 7 failed. Failures are caused by the pending schema (first products query 400 before fallback) and by WIP UI copy; `custom-print-studio.spec.ts` (which uploads) was excluded to avoid production writes.
10. **Lint.** Final unified run: 0 errors / 46 pre-existing hook warnings.
11. **Dependencies.** `npm audit` reports 44 high + 9 moderate advisories, all in dev/test tooling (Jest 30, jest-environment-jsdom, ts-jest, eslint-config-next); 0 high/critical in runtime packages. No major upgrade was performed.
12. **Performance / indexes.** Four duplicate index pairs were identified but not dropped; needs query-plan review.
13. **Audit log.** `recordAdminAudit` is best-effort and outside decision transactions; it is not a proof-of-every-decision ledger.
14. **Notifications.** Vendor payout notification trigger functions exist but no triggers are installed, so those notifications will not fire.
15. **Fulfilment.** Custom Print Studio has no production/fulfilment integration; orders record customization snapshots only.
