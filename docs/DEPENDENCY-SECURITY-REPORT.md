# Dependency & Security Report (D1)

**Date:** 2026-11-01
**Scope:** `npm audit` remediation for Galaxy Store, compared against the Phase Zero baseline (`docs/PRODUCTION-REMEDIATION-BASELINE.md`).
**Method:** `npm audit` (full) + `npm audit --omit=dev` (production tree) before/after analysis, `npm audit fix` **without** `--force`, full verification gate re-run.

---

## 1. Headline results

| Metric | Baseline (Phase Zero) | After A1 (`next@16.4.3`) | **After `npm audit fix` (now)** |
|---|---|---|---|
| Total vulnerabilities | 44 | 41 | **35** |
| Critical | 2 | 1 | **0** |
| High | 7 | 5 | **0** |
| Moderate | 32 | 32 | 32 |
| Low | 3 | 3 | 3 |
| **Production-tree vulnerabilities (`--omit=dev`)** | not yet isolated | not yet isolated | **0 ✅** |

- All **critical** and **high** advisories are fixed.
- Every remaining finding is in the **development toolchain only** (eslint / jest / ts-jest). Verified: **zero overlap** between the 35 remaining vulnerable package names and the runtime dependency list (`axios`, `next`, `react`, `stripe`, `@supabase/*`, `resend`, `zod`, …).
- `npm audit --omit=dev` → **`found 0 vulnerabilities`** (exit 0).

---

## 2. What was changed

| Change | File | Breaking? |
|---|---|---|
| `next` 16.2.9 → **16.4.3** (A1, same major/minor line) | `package.json`, `package-lock.json` | No — audit-confirmed in-range fix |
| `npm audit fix` (non-force) — lockfile-only updates | `package-lock.json` | No — semver-compatible updates only |

No `npm audit fix --force` was run (it only offers **major** changes, e.g. downgrading `jest` to 25.x or `eslint` to 4.x — those would break the toolchain).

### Runtime packages repaired by the fix

| Package | Vulnerable range | Installed now | Class |
|---|---|---|---|
| `axios` (direct dep) | 1.0.0 – 1.19.0 (12 advisories: prototype pollution, header injection, ReDoS, SSRF) | **1.21.0** | runtime ✅ |
| `follow-redirects` | 1.16.0 – 1.16.1 (credential stripping on redirect) | **1.16.2** | runtime ✅ |
| `handlebars` (transitive) | 3.0.0 – 4.7.9 (JS injection via templates) — was **critical** | no longer vulnerable | build/dev ✅ |
| `source-map-js` | 1.0.0 – 1.2.1 (event-loop DoS) | **1.2.2** | build tooling ✅ |
| `brace-expansion` | 2.0.0 – 2.1.6, 4.0.0 – 5.0.11 (CPU/stack DoS) | **1.1.21 / 5.0.12** | dev tooling ✅ |
| `zod` (transitive) | < 4.6.6 (memory exhaustion on oversized collections) | **4.6.7** | dev tooling ✅ |
| `next` (direct dep) | 9.3.4-canary – 16.4.0 (A1) | **16.4.3** | runtime ✅ |

---

## 3. Remaining 35 findings — all dev-only

**Unique advisories (3):**

1. `minimatch` — "potential denial of service via globparts amplification" *(moderate)*
2. `Glob` — "AbortSignal cancellation bypass allows post-timeime filesystem traversal" *(moderate)*
3. `deepmerge` — "mergeObject() allows prototype poisoning of returned objects" *(low)*

**Affected packages (35):** `eslint`, `eslint-config-next`, `eslint-plugin-{import,jsx-a11y,react}`, `@typescript-eslint/*`, `typescript-eslint`, `@tanstack/eslint-plugin-query`, `@eslint/*`, `jest`, `jest-*` (core/cli/config/runner/runtime/snapshot/reporters/transform/resolve-dependencies/circus), `@jest/*`, `babel-jest`, `babel-plugin-istanbul`, `ts-jest`, `minimatch`, `glob`, `test-exclude`, `deepmerge`.

**Why they are not fixed today:**

- npm only offers **`isSemVerMajor: true`** fixes for these (e.g. `jest → 25.1.0`, `eslint → 4.0.0` — downgrades/major jumps). Applying them would break `npm test` / `npm run lint`, i.e. a regression the master prompt forbids.
- They execute **only** during development, linting and testing — they are never bundled into the production Next.js output (verified by `--omit=dev` audit = 0) and never run on the server at runtime.

**Risk assessment:** **Low / accepted (dev-only).** Attack surface would require an attacker to already control files processed by the developer's local lint/test runs.

**Recommended follow-up (not blocking production):**

1. Align `eslint-config-next` (currently `16.2.9`) with `next@16.4.3` in a dedicated change, then re-run the lint gate (new rules may add warnings).
2. Re-run `npm audit` after each jest/eslint major release that ships patched `minimatch`/`glob`/`deepmerge`.
3. Re-run `npm audit --omit=dev` in CI as a hard gate — it must stay at **0**.

---

## 4. Verification gate (after all dependency changes)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ 0 errors / 22 warnings (= baseline) |
| `npm test` | ✅ **456/456 tests, 44 suites** |
| `npm run build` | ✅ exit 0 |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** |
| `npm audit` (full) | 35 dev-only (0 critical / 0 high) |

**No regressions** vs the Phase Zero baseline: same lint warning count, all tests pass, production build succeeds.

---

## 5. Status

**D1: FIXED (production tree)** — 44 → 35 total, **critical 2 → 0, high 7 → 0, production 0**. Residual 35 are dev-toolchain-only with no non-breaking fix available; documented and accepted with follow-up recommendations above.
