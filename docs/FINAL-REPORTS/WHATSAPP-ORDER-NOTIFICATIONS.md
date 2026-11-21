# WhatsApp Order Notifications

**Date:** 2026-11-21 · Deployed to Staging. **Delivery is BLOCKED until external credentials are supplied.**

## Implemented
- Hook in `app/api/orders/route.js` after the confirmation email: every **placed order** (COD, wallet, zero-total) calls `sendOrderWhatsApp()` with the persisted order row + items. Best-effort and isolated — a notification failure never changes the 201 response or order state.
- `lib/whatsapp.ts`: builds one canonical message (order number, items, subtotal/shipping/discount/tax/total + currency, customer, payment method), loads the private target number from `store_settings` (or `WHATSAPP_RECIPIENT_NUMBER` env override), and sends via WhatsApp Cloud API when configured. Honest results: `sent | skipped | blocked | failed`. Never claims delivery without a provider response.
- Admin Settings → **WhatsApp order notifications**: enable toggle + international-format receiving number. Stored as private `whatsapp` setting (`is_public=false`, verified).
- Env names added (no values): `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_API_VERSION`, `WHATSAPP_RECIPIENT_NUMBER` in `.env.example` and `.env.staging.example`.

## Verified
- `tsc` pass · unit **1491/1491** (including 6 new WhatsApp tests) · Staging E2E **13/13**.
- Admin settings PATCH accepts the `whatsapp` key: **200**; GET returns it; DB row `is_public=false`.
- Deployed to `gallaxy-store-staging`; homepage/APIs 200.

## BLOCKED — exact owner action (do not paste secrets in chat)
1. In Meta for Developers → WhatsApp → API Setup, obtain a temporary/system-user access token and the **Phone number ID**.
2. Set them as **server-side** environment variables in Vercel (`gallaxy-store-staging`) and in your local shell if testing locally:
   - `WHATSAPP_CLOUD_API_TOKEN=<token>`
   - `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID=<phone-number-id>`
   - optional `WHATSAPP_CLOUD_API_VERSION=v21.0`
3. In `/admin/settings` enable WhatsApp and enter the receiving number in international format (e.g. `+201234567890`), or set `WHATSAPP_RECIPIENT_NUMBER`.
4. For production-like delivery, the recipient must be an approved WhatsApp template recipient or within the 24-hour window; otherwise Meta may reject text messages — the adapter records `failed` honestly.

## What happens until then
Orders are created normally. The notification result is `blocked: no_provider` and is logged with the order id only (no phone numbers or tokens in logs). No `wa.me` link is presented as proof of delivery.
