# Phase 1.1 — E2E Results

**Config:** `playwright.local.config.ts` (Local Supabase API 127.0.0.1:54121, app ports 3000/3100). Original production read-only `playwright.config.ts` untouched.

| Suite / test | Result |
|---|---|
| `core.spec.ts` — homepage renders real catalog, no console/pageerror/5xx | ✅ |
| `core.spec.ts` — product detail by id + add to cart | ✅ |
| `core.spec.ts` — gift-box links use UUIDs | ✅ |
| `core.spec.ts` — login/register render | ✅ |
| `core.spec.ts` — read APIs 200 / payment-methods 401 | ✅ |
| `core.spec.ts` — admin guest gating no loop | ✅ |
| `auth-checkout.spec.ts` — real signup → signin → cart → checkout | ✅ |
| `phase1-1.spec.ts` — published template catalog from DB | ✅ |
| `phase1-1.spec.ts` — protected route preserves `?next=` | ✅ |
| `phase1-1.spec.ts` — open-redirect `next` rejected | ✅ |
| `phase1-1.spec.ts` — product detail captures variant_id, no client price | ✅ |

**Total: 11 / 11 passed.**

Other suites: `npx tsc --noEmit` ✅ · `npm run build` ✅ · `npm test` 97 suites / **1484** tests ✅ · `npm run test:integration` 7 suites / **126** tests ✅.

## Not executed (honest limitations)
- Staging E2E (no Staging environment).
- Live Google OAuth (no external credentials/callback registration).
- Full admin-UI Gift Box creation and Creator publish E2E (backend integration suites cover the flows).
- Multi-store UI selector E2E (helper + API contract covered by unit tests).
- Real Stripe/Paymob webhooks (card payments intentionally disabled; webhook routes tested with integration disabled).

No test was skipped while being reported as passed.
