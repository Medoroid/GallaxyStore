# Dependency Remediation Report — 2026-11-18

## Baseline (fresh, after `npm ci`)
- `npm audit --json`: **44 high**, 9 moderate, 0 critical (53 total).
- `npm audit --omit=dev --json`: **0 vulnerabilities** in production runtime dependencies.
- Node/npm from environment; lockfile restored from HEAD and reinstalled cleanly (previous `npm audit fix` attempt had made counts worse and was reverted).

## Distinct advisories (all dev/test tooling)

| Package | Advisory | Severity | Installed | Vulnerable range | Latest available | Fix possible safely? |
|---|---|---|---|---|---|---|
| `picomatch` | GHSA-fc5q-39xc-vjpf (ReDoS via repeated extglobs) | high | 2.3.2 / 4.0.4 / 4.0.7 | `<=4.0.7` | **4.0.7** | **No** — the latest published version is still inside the vulnerable range; no upstream fix exists. |
| `glob` | GHSA-3g3m-2fjr-6pw4 (AbortSignal bypass / traversal) | moderate | 13.0.6 | `>=9.0.0 <=14.0.1` | 14.0.6 | Only via major upgrade (`13 → 14`) inside Jest 30's transitive chain; not applied without compatibility evidence. |
| `minimatch` | GHSA-g3hv-75wg-m249 (DoS via globparts amplification) | moderate | 10.2.6 (3.1.5 unaffected) | `>=7.0.0 <11.0.1` | 11.0.9 | Only via major upgrade (`10 → 11`) used by Jest/`@typescript-eslint`; not applied blindly. |

The 44 "high" package entries are transitive nodes whose only path to a high advisory is `picomatch`. `npm ls picomatch --all` shows parents: `jest-message-util`, `@parcel/watcher`, `fdir`/`tinyglobby` (eslint chain), `micromatch`/`fast-glob` (eslint chain), `anymatch`.

## Actions taken
1. Fresh `npm ci` after stopping file-locking dev servers — lockfile reinstalls from scratch successfully (`CI_EXIT=0`).
2. Generated full per-package inventory: `docs/DEPENDENCY-SECURITY-INVENTORY.md` (53 entries with advisory URLs, ranges, fix availability and node counts).
3. Evaluated `npm audit fix` (non-force) earlier: totals changed 44 high/9 moderate → 50 high/4 moderate (worse). Reverted via `git checkout HEAD -- package-lock.json` + `npm ci`.
4. Verified `npm view picomatch version` → `4.0.7`, i.e. upstream has no patched release; overriding to a non-existent version is not an option.

## Result
- **Fixed:** 0 advisories (no safe upstream fix exists for the high-severity root cause; the two moderate fixes require major transitive upgrades).
- **Remaining:** 44 high + 9 moderate, all **dev/test only**; runtime dependency audit is clean.
- **Dev-only reachability:** these packages process glob patterns at lint/test/build time. They do not run in the production app; no user-supplied input reaches them in the deployed runtime. CI runners and developer machines are the exposure surface.

## Accepted risk & follow-up
- ACCEPTED_RISK for this release: no production exposure; blocking the launch on an upstream ReDoS fix that does not exist is not justified.
- Follow-up when upstream releases `picomatch > 4.0.7`: add a scoped npm override for the dev chains only (`fdir`, `tinyglobby`, `jest-message-util`, `@parcel/watcher`, `micromatch`), then re-run `npm ci`, `npm audit`, `npx tsc`, `npm run lint`, `npm test`, `npm run build`.
- If CI ever lints/tests attacker-controlled patterns, isolate that job (network/filesystem limits) until upstream fixes land.
