# WhatsApp Order Messages — Click to Chat

**Date:** 2026-11-21 · Deployed to Staging · **No WhatsApp API, token, webhook, or subscription is used.**

## How it works

1. Customer presses **Place Order**. The browser synchronously opens a blank tab during the click
   (so pop-up blockers cannot stop it later).
2. `POST /api/orders` creates and persists the order exactly as before.
3. Only after a successful 201, the server builds an Arabic message from the **persisted order row**
   (`orders`, `order_items`, `shipping_address_snapshot`) and returns:
   - `whatsapp_url` — `https://wa.me/<digits>?text=<encodeURIComponent(message)>`
   - `whatsapp_notice` — a user-facing explanation when no recipient is configured or the link
     cannot be built.
4. The blank tab is directed to that URL. If the browser blocked it, the success screen always
   shows the button **«إرسال تفاصيل الطلب على واتساب»** with the same URL.
5. The customer presses **Send** inside WhatsApp. Opening the chat is **not** delivery.

The order is never re-created by opening WhatsApp or returning from it. If order creation fails,
the blank tab is closed and no WhatsApp URL is opened.

## Message contents

Store name, order number, order date/time, customer name and phone, delivery address, each product
with quantity/unit price/line total, subtotal, shipping, discount, tax, final total, payment method,
and order notes. Arabic text is UTF-8 and URL-encoded; the message uses Arabic labels and EGP (or
the order currency).

## Settings

`/admin/settings` → **WhatsApp order messages**:

- Enable toggle.
- Receiving number in international format, **digits only** (e.g. `201234567890`). A leading `+`
  and spaces are stripped and validated before saving.
- Stored privately as the `whatsapp` setting (`is_public=false`); never shown on the storefront.
- Optional server-only override: `WHATSAPP_RECIPIENT_NUMBER` (digits only).

No `WHATSAPP_CLOUD_API_*` variables exist anymore; they were removed from the env templates and
code.

## Verified on Staging

- `tsc` pass · unit **1490/1490** (98 suites, including 5 click-to-chat tests) · integration
  **126/126** · build pass.
- Real COD orders placed on `https://gallaxy-store-staging.vercel.app` (ORD-2026-000009/10):
  response contained `whatsapp_url` for `wa.me/201234567890`; decoded message contained the order
  number, customer, address, product line, quantity, subtotal, shipping, discount, tax, final total,
  payment method and notes.
- Browser test with pop-up allowed: WhatsApp tab opened, fallback button visible, order count
  increased by exactly **1**.
- Browser test with `window.open` blocked: no tab opened, fallback button visible with the same
  message, order count increased by exactly **1**.
- Arabic text and the 🛍️ emoji render correctly in the prepared message.

## Honest limitations

- The customer must press **Send** inside WhatsApp; this feature cannot confirm delivery.
- Live wallet and zero-total orders were **not** exercised on Staging (wallet transfer is disabled
  there). The link is built for any successful order, and payment logic is unchanged.
- Mobile viewport was not separately exercised; the flow relies on standard `wa.me` behavior, which
  opens the WhatsApp app on mobile and WhatsApp Web/Desktop on computers.
- If no recipient is configured, the order still succeeds and the customer sees a clear notice
  instead of a link.

## Production

Not touched. All work and verification are on Staging only.
