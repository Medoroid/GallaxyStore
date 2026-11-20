# Custom Print Studio — Remaining Work

> Companion to `docs/CUSTOM-PRINT-STUDIO-REPORT.md` and
> `docs/REALISTIC-MOCKUP-REPLACEMENT-REPORT.md`. Nothing below is a claim of completion.
> Updated 2026-11-17 after photorealistic mockup replacement and RTL/LTR verification.

## Done since the last revision (for traceability)
- Photorealistic mockup assets acquired from Pexels under a verified commercial licence, stored
  locally; inventory in `docs/MOCKUP-ASSET-LICENSES.md` (previous item 4).
- RTL/LTR layout reviewed and fixed: all Custom Print Studio copy now uses EN/AR i18n keys,
  Arabic product/colour names are used when locale is `ar`, `dir=rtl` verified on desktop and
  mobile, no horizontal overflow (previous item 9, review portion).

## Blocked on approval / external configuration

1. **Apply the local migration on an isolated Staging project** (never production):
   `supabase/migrations/20261116130000_custom_print_studio.sql`.
   Verify `mockup_templates` (incl. `photo_assets`), `shared_designs`,
   `design_versions.editor_state`, the two enum values, RLS policies and service-role grants.
   Keep the three old Creator Studio SQL files unapplied.
2. **Link each mockup template to a real catalog product + variant** via the admin page. Without a
   stocked variant the existing `checkout` RPC correctly refuses the order (no fake inventory).
3. **Configure a real fulfilment process** before claiming print products are manufacturable/shippable.

## Implementation backlog

4. Visual drag-to-draw mask editor (current editor uses validated JSON/numeric fields; masks may be
   entered as SVG paths).
5. Design version history UI (reuse previous versions for future orders).
6. Customer "withdraw sharing" action with business-rule checks (pending only, or admin-assisted).
7. Browser e2e of the full **checkout** path once Staging + product mapping exist:
   upload → edit → mockup → warnings → cart → order retains `preview_settings` → private vs shared.
   (`e2e/custom-print-studio.spec.ts` already covers the DB-free preview journey, EN copy, and
   mobile layout.)
8. Touch-device gesture verification on a real phone/tablet (current mobile check used a 390px
   viewport with pointer events; no physical touch hardware was available).
9. Optional: migrate `docs/CUSTOM-PRINTING-SCOPE-ASSESSMENT.md` proposals into the final naming once
   approved (old creator-specific files remain untouched pending explicit deletion approval).

## Standing rules

- Preserve all uncommitted work; never reset/discard user changes.
- No production writes, `db push`, migration repair, or deploy.
- No secrets or customer data in logs/output; no fake data to simulate success.
