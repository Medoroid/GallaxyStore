# Phase 2 — Authorization Matrix

**Status:** PREPARED (tests written); **NOT EXECUTED on Staging**. Local unit/integration security suites pass.

## Intended model (from evidence)
| Role source | Meaning |
|---|---|
| `profiles.role` | `customer` / `vendor` / `admin` (single value) |
| `admin_users` | independent explicit admin grant |
| `ADMIN_EMAILS` | bootstrap fallback only in fail-closed `verifyAdmin` |
| `owns_store()` | store ownership + DB-level admin bypass for store RLS |

## Matrix to verify on Staging (browser + server responses)
| Account | /admin | /vendor | Other vendor's data | Payout | Creator publish | Gift Box admin |
|---|---|---|---|---|---|---|
| Admin only | allow | shell only (no store) | no (API scopes by owner_id) | own store only | via admin review | allow |
| Vendor only | deny | allow | deny | own store | own designs | deny |
| Admin + Vendor | allow | allow | own store only | own store | own designs | allow |
| Customer | deny | deny | deny | deny | deny | deny |
| Unauthenticated | redirect /login | redirect /login | deny | deny | deny | deny |

## Local evidence
- `verifyAdmin` fail-closed; every `/api/admin/**` route calls it.
- Vendor APIs derive store from `auth.uid()`; no admin bypass in vendor APIs.
- `/api/cart` validates variant ownership; client price ignored.
- `lib/vendor-store.ts` handles 0/1/N stores deterministically.
- Unit suites: `proxy-authorization`, admin contracts, payout contracts, gift-box contracts, cart contracts — all pass (part of 1484).
- Local E2E: admin guest gating, open-redirect rejection, `?next=` preservation — pass.

## Blocked
- Real dual-role accounts, cross-vendor access attempts, and multi-store UI selection require a Staging project with seeded test accounts — **not executed**.

## Verdict
Server-side enforcement is implemented and locally tested; **Staging authorization matrix is not verified**. Do not claim it passed.
