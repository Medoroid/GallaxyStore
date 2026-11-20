# Dependency Security Inventory

Generated 2026-11-18 from `npm audit --json` on the current lockfile.
Runtime dependencies (`npm audit --omit=dev`) report **0 vulnerabilities**; all entries below are development/test tooling.

Totals: **44 high**, **9 moderate**, 0 critical.

| Package | Severity | Direct | Installed range | Fix available | Advisory | Vector / reachability |
|---|---|---|---|---|---|---|
| @jest/console | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via jest-message-util, jest-util | nodes: 1; effects: @jest/test-result |
| @jest/core | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/console, @jest/reporters, @jest/test-result, @jest/transform, jest-changed-files, jest-config, jest-haste-map, jest-message-util, jest-resolve, jest-resolve-dependencies, jest-runner, jest-runtime, jest-snapshot, jest-util, jest-watcher | nodes: 1; effects: jest, jest-cli |
| @jest/environment | high | no | >=29.1.0 | jest-environment-jsdom@29.7.0 (major: true) | transitive via @jest/fake-timers, jest-mock | nodes: 6; effects: @jest/globals, jest-environment-jsdom |
| @jest/environment-jsdom-abstract | high | no | * | jest-environment-jsdom@29.7.0 (major: true) | transitive via @jest/environment, @jest/fake-timers, jest-mock, jest-util | nodes: 1; effects: jest-environment-jsdom |
| @jest/expect | high | no | 30.0.0-alpha.1 - 30.0.0-beta.2 || >=30.3.0 | true | transitive via expect, jest-snapshot | nodes: 1; effects: — |
| @jest/fake-timers | high | no | >=27.0.0-next.0 | jest-environment-jsdom@29.7.0 (major: true) | transitive via jest-message-util, jest-mock, jest-util | nodes: 6; effects: @jest/environment, @jest/environment-jsdom-abstract, jest-environment-node |
| @jest/globals | high | yes | >=29.1.0 | @jest/globals@29.0.3 (major: true) | transitive via @jest/environment, @jest/expect, jest-mock | nodes: 1; effects: — |
| @jest/reporters | high | no | >=27.0.0-next.0 | true | transitive via @jest/console, @jest/test-result, @jest/transform, glob, jest-message-util, jest-util, jest-worker | nodes: 1; effects: — |
| @jest/test-result | high | no | 30.0.0-alpha.1 - 30.0.0-beta.2 || >=30.3.0 | jest@30.2.0 (major: true) | transitive via @jest/console | nodes: 1; effects: @jest/test-sequencer, jest-watcher |
| @jest/test-sequencer | high | no | 30.0.0-alpha.1 - 30.0.0-beta.2 || >=30.3.0 | jest@30.2.0 (major: true) | transitive via @jest/test-result, jest-haste-map | nodes: 1; effects: jest-config |
| @jest/transform | high | no | >=27.0.0-next.0 | ts-jest@26.5.6 (major: true) | transitive via babel-plugin-istanbul, jest-haste-map, jest-util | nodes: 1; effects: babel-jest, ts-jest |
| @next/eslint-plugin-next | high | no | >=14.3.0-canary.0 | eslint-config-next@14.2.35 (major: true) | transitive via fast-glob | nodes: 1; effects: eslint-config-next |
| @parcel/watcher | high | no | >=2.5.4 | true | transitive via picomatch | nodes: 1; effects: — |
| @typescript-eslint/eslint-plugin | moderate | no | 6.16.0 - 8.72.2 | true | transitive via @typescript-eslint/type-utils, @typescript-eslint/utils | nodes: 1; effects: — |
| @typescript-eslint/parser | moderate | no | 6.16.0 - 8.72.2 | true | transitive via @typescript-eslint/typescript-estree | nodes: 1; effects: typescript-eslint |
| @typescript-eslint/type-utils | moderate | no | 6.16.0 - 8.72.2 | true | transitive via @typescript-eslint/typescript-estree, @typescript-eslint/utils | nodes: 1; effects: @typescript-eslint/eslint-plugin |
| @typescript-eslint/typescript-estree | high | no | >=6.16.0 | true | transitive via minimatch, tinyglobby | nodes: 1; effects: @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils, typescript-eslint |
| @typescript-eslint/utils | moderate | no | 6.16.0 - 8.72.2 | true | transitive via @typescript-eslint/typescript-estree | nodes: 1; effects: typescript-eslint |
| anymatch | high | no | >=3.0.0 | jest@30.2.0 (major: true) | transitive via picomatch | nodes: 1; effects: jest-haste-map |
| babel-jest | high | no | >=27.0.0-next.0 | ts-jest@26.5.6 (major: true) | transitive via @jest/transform, babel-plugin-istanbul | nodes: 1; effects: ts-jest |
| babel-plugin-istanbul | moderate | no | >=8.0.0 | ts-jest@26.5.6 (major: true) | transitive via test-exclude | nodes: 1; effects: @jest/transform, babel-jest |
| eslint-config-next | high | yes | >=14.3.0-canary.0 | eslint-config-next@14.2.35 (major: true) | transitive via @next/eslint-plugin-next | nodes: 1; effects: — |
| eslint-import-resolver-typescript | high | no | >=3.8.0 | true | transitive via tinyglobby | nodes: 1; effects: — |
| expect | high | no | >=28.0.1 | true | transitive via jest-message-util, jest-mock, jest-util | nodes: 1; effects: @jest/expect |
| fast-glob | high | no | >=3.0.0 | eslint-config-next@14.2.35 (major: true) | transitive via micromatch | nodes: 1; effects: @next/eslint-plugin-next |
| fdir | high | no | >=5.2.1 | jest@30.2.0 (major: true) | transitive via picomatch | nodes: 2; effects: jest-haste-map |
| glob | moderate | no | 9.0.0 - 14.0.1 | jest@30.2.0 (major: true) | Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal ([https://github.com/advisories/GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)) | nodes: 2; effects: @jest/reporters, jest-config, jest-runtime |
| jest | high | yes | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/core, jest-cli | nodes: 1; effects: — |
| jest-changed-files | high | no | >=29.6.3 | jest@30.2.0 (major: true) | transitive via jest-util | nodes: 1; effects: @jest/core |
| jest-circus | high | no | >=27.0.0-next.0 | true | transitive via @jest/environment, @jest/expect, @jest/test-result, jest-each, jest-message-util, jest-runtime, jest-snapshot, jest-util | nodes: 1; effects: — |
| jest-cli | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/core, @jest/test-result, jest-config, jest-util | nodes: 1; effects: jest |
| jest-config | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/test-sequencer, babel-jest, glob, jest-circus, jest-environment-node, jest-resolve, jest-runner, jest-util | nodes: 1; effects: @jest/core, jest-cli |
| jest-each | high | no | >=27.0.0-next.0 | true | transitive via jest-util | nodes: 1; effects: — |
| jest-environment-jsdom | high | yes | >=30.0.0-alpha.1 | jest-environment-jsdom@29.7.0 (major: true) | transitive via @jest/environment, @jest/environment-jsdom-abstract | nodes: 1; effects: — |
| jest-environment-node | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/environment, @jest/fake-timers, jest-mock, jest-util | nodes: 1; effects: jest-runner |
| jest-haste-map | high | no | >=25.0.0 | jest@30.2.0 (major: true) | transitive via @parcel/watcher, anymatch, fdir, jest-util, jest-worker, picomatch | nodes: 1; effects: @jest/core, @jest/test-sequencer, @jest/transform, jest-resolve, jest-runner, jest-runtime |
| jest-message-util | high | no | >=30.3.0 | jest@30.2.0 (major: true) | transitive via jest-util, picomatch | nodes: 1; effects: @jest/console, @jest/core, @jest/fake-timers, @jest/reporters, expect, jest-circus, jest-runner, jest-runtime, jest-snapshot |
| jest-mock | high | no | >=29.1.0 | jest@30.2.0 (major: true) | transitive via jest-util | nodes: 7; effects: @jest/environment, @jest/fake-timers, @jest/globals, expect, jest-environment-node, jest-runtime |
| jest-resolve | high | no | >=27.0.0-next.0 | true | transitive via jest-haste-map, jest-util | nodes: 1; effects: — |
| jest-resolve-dependencies | high | no | 30.0.0-alpha.1 - 30.0.0-beta.2 || >=30.3.0 | true | transitive via jest-snapshot | nodes: 1; effects: — |
| jest-runner | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/console, @jest/environment, @jest/test-result, @jest/transform, jest-environment-node, jest-haste-map, jest-message-util, jest-resolve, jest-runtime, jest-util, jest-watcher, jest-worker | nodes: 1; effects: jest-config |
| jest-runtime | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/environment, @jest/fake-timers, @jest/globals, @jest/test-result, @jest/transform, glob, jest-haste-map, jest-message-util, jest-mock, jest-resolve, jest-snapshot, jest-util | nodes: 1; effects: jest-circus, jest-runner |
| jest-snapshot | high | no | >=27.0.0-next.0 | true | transitive via @jest/transform, expect, jest-message-util, jest-util | nodes: 1; effects: jest-resolve-dependencies |
| jest-util | high | no | >=27.0.0-next.0 | ts-jest@26.5.6 (major: true) | transitive via picomatch | nodes: 1; effects: @jest/console, @jest/core, @jest/environment-jsdom-abstract, @jest/fake-timers, @jest/reporters, @jest/transform, expect, jest-changed-files, jest-circus, jest-cli, jest-config, jest-each, jest-environment-node, jest-haste-map, jest-message-util, jest-mock, jest-resolve, jest-runner, jest-runtime, jest-snapshot, jest-watcher, jest-worker, ts-jest |
| jest-watcher | high | no | >=27.0.0-next.0 | jest@30.2.0 (major: true) | transitive via @jest/test-result, jest-util | nodes: 1; effects: jest-runner |
| jest-worker | high | no | >=29.1.2 | jest@30.2.0 (major: true) | transitive via jest-util | nodes: 1; effects: @jest/reporters, jest-haste-map, jest-runner |
| micromatch | high | no | >=4.0.0 | eslint-config-next@14.2.35 (major: true) | transitive via picomatch | nodes: 1; effects: fast-glob |
| minimatch | moderate | no | 7.0.0 - 11.0.0 | jest@30.2.0 (major: true) | minimatch has potential denial of service via globparts amplification ([https://github.com/advisories/GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) | nodes: 4; effects: @typescript-eslint/typescript-estree, glob, test-exclude |
| picomatch | high | no | * | ts-jest@26.5.6 (major: true) | picomatch vulnerable to ReDoS through single-branch repeated extglobs ([https://github.com/advisories/GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)) | nodes: 6; effects: @parcel/watcher, anymatch, fdir, jest-haste-map, jest-message-util, jest-util, micromatch, tinyglobby |
| test-exclude | moderate | no | >=7.0.0 | ts-jest@26.5.6 (major: true) | transitive via glob, minimatch | nodes: 1; effects: babel-plugin-istanbul |
| tinyglobby | high | no | * | true | transitive via fdir, picomatch | nodes: 1; effects: @typescript-eslint/typescript-estree, eslint-import-resolver-typescript |
| ts-jest | high | yes | >=27.0.0-alpha.0 | ts-jest@26.5.6 (major: true) | transitive via @jest/transform, babel-jest, jest-util | nodes: 1; effects: — |
| typescript-eslint | moderate | no | <=8.72.2 | true | transitive via @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils | nodes: 1; effects: — |

## Notes

- `npm audit fix` (non-force) was attempted earlier and made totals worse; the lockfile was restored and `npm ci` re-run.
- Remaining advisories are in Jest 30 / jest-environment-jsdom / ts-jest / eslint-config-next dev chains. Remediation paths require major downgrades or major upgrades and are assessed individually in `docs/DEPENDENCY-REMEDIATION-REPORT.md`.
- No production runtime package has an unresolved advisory.
