# Design

## Routing Digest

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- digest_summary: 3-job `ci.yml` (check/test/build, actions @v7, npm ci per job, contents:read, 10-min caps, PR-only cancel concurrency) + exact pins vitest 4.1.10 / tsup 8.5.1 (registry-verified) + root `tsup.config.ts` (esm, node22, native shebang, no dts) + `--version` via JSON import attribute (bundle-inlined by esbuild, path-safe in dev and dist modes; requires `resolveJsonModule` in tsconfig — recorded AC-09 amendment).
- affected_areas_digest: NEW .github/workflows/ci.yml, tsup.config.ts; MOD package.json, package-lock.json, src/main/cli.ts, biome.json, tsconfig.json (one flag, AC-09 amendment dec-009). .gitignore untouched (dist/ already ignored, verified).
- interfaces_digest: npm scripts stay the CI interface (jobs run them verbatim); `node dist/cli.js --version` prints package.json `version`, exit 0; every other invocation stays no-op exit 0.

## Summary

- change_name: e0-f1-h3-ci-pipeline
- objective: new-feature
- route: continue-lite
- design_status: complete — all spec-owned mechanics pinned with verification evidence; two recorded amendments (concurrency vs spec non-goal, tsconfig in diff bound) flagged for QA

## Design Overview

### 1. `.github/workflows/ci.yml` (exact contents)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      matrix:
        node: [22, 24]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: node dist/cli.js --version
```

Rationale (dec-008):

- **Action versions**: `actions/checkout@v7` (latest release v7.0.1, verified 2026-08-01 via github.com/actions/checkout/releases/latest) and `actions/setup-node@v7` (latest v7.0.0, same method). Major-tag pinning, not SHA: both are GitHub first-party actions, the moving major tag receives security patches automatically, and SHA pins would go stale with Dependabot explicitly out of scope this story (spec Out Of Scope).
- **`npm ci` per job**: jobs run on isolated runners; sharing `node_modules` via artifacts is slower and fragile. setup-node's `cache: npm` (keyed on package-lock.json) makes repeat installs cheap. Jobs invoke npm scripts verbatim (AC-01 command-level equivalence for AC-06).
- **Concurrency**: cancels superseded runs per ref for `pull_request` only; push-to-main runs are never cancelled so every main commit keeps a full audit run. NOTE: this amends the spec non-goal "no concurrency groups" — pinned per explicit orchestrator handoff instruction ("decide and justify"); recorded as part of dec-008 and flagged in Approval Notes for QA visibility.
- **`permissions: contents: read`**: least privilege; no job writes to the repo or uses tokens.
- **`timeout-minutes: 10`**: defensive cap; each job currently completes in well under 3 minutes, 10 leaves headroom without letting a hung runner burn 6 h (GitHub default).
- Triggers exactly per AC-02: `pull_request` unfiltered (fires on the stacked PR whose base is the H2 branch) + `push` to `main`.

### 2. Dependency versions (dec-007, registry-verified 2026-08-01)

| Package | Pin | Evidence |
|---|---|---|
| vitest | `4.1.10` | `npm view vitest version` → 4.1.10 (published 2026-07-06). `engines.node: ^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` — covers matrix 22/24. Peer `@types/node ^20 \|\| ^22 \|\| >=24` — repo has 22.20.1. `vite` is a **direct** dependency (`^6 \|\| ^7 \|\| ^8`, resolves to vite 8.2.0, engines `^20.19.0 \|\| >=22.12.0` — fine on CI's latest 22.x/24.x); install is self-contained, only `vitest` lands in package.json. `--passWithNoTests` exists in vitest 4. TS 5.9.3 irrelevant at runtime (vitest transpiles via vite/esbuild). |
| tsup | `8.5.1` | `npm view tsup version` → 8.5.1 (published 2025-11-12). `engines.node: >=18`. Peer `typescript >=4.5.0` **optional** — 5.9.3 satisfies. Bundles via esbuild ^0.27 (supports `with { type: "json" }` import attributes and hashbang preservation). |

Install command (executor): `npm i -D -E vitest@4.1.10 tsup@8.5.1` (exact pins, dec-006).

### 3. `package.json` edits

- `scripts.test`: `"vitest run --passWithNoTests"` (exact final string, dec-002).
- `devDependencies` += `"tsup": "8.5.1"`, `"vitest": "4.1.10"` (alphabetical order preserved by npm).
- `package-lock.json` regenerated by the install only.

### 4. `tsup.config.ts` (exact contents, dec-010)

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/main/cli.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: false,
});
```

- `entry` as object pins the output name `dist/cli.js`, matching `bin.sentinel`/`bin.snt`.
- `dts: false`: a bin is executed, never imported — type declarations have no consumer (justification pinned; revisit only if core extraction publishes a library entry, different story).
- **Shebang**: native `#!/usr/bin/env node` first line in `src/main/cli.ts`, no tsup `banner`. esbuild preserves the entry hashbang and tsup marks the output executable when a shebang is detected; keeping it in source also makes the file directly executable and avoids banner/hashbang duplication. Executor validates `head -1 dist/cli.js` = `#!/usr/bin/env node`; bounded fallback if not preserved: move to `banner: { js: "#!/usr/bin/env node" }` and drop the source line (risk-006).

### 5. `src/main/cli.ts` (exact contents, dec-009)

```ts
#!/usr/bin/env node
/**
 * Composition root: future CLI entrypoint — the only place adapters are
 * instantiated (PRD §4.2). Real wiring lands in E6.F1.x; this file only
 * implements the minimal `--version` contract of [E0.F1.H3]: print the
 * package version and exit 0. Any other invocation is a deliberate
 * no-op exiting 0.
 */
import pkg from "../../package.json" with { type: "json" };

if (process.argv.includes("--version")) {
  console.log(pkg.version);
}
```

Mechanism choice — **static JSON import with import attribute** — evaluated against all five gates:

| Gate | Result |
|---|---|
| `npm run dev` (node 22 strip-types) | `with { type: "json" }` supported; JSON modules stable since Node 22.12 (local node v22.22.2, CI installs latest 22.x/24.x). Relative path `../../package.json` resolves from `src/main/` → repo root. |
| tsup bundle | esbuild **inlines** the JSON at build time (built-in json loader) — dist/cli.js has zero runtime path dependence; the one-level-vs-two-levels trap disappears entirely. This is why `createRequire(import.meta.url)("../../package.json")` was rejected: esbuild leaves `require` paths untouched, and from `dist/cli.js` that path escapes the repo root. |
| tsc NodeNext strict + verbatimModuleSyntax | Requires `"resolveJsonModule": true` added to tsconfig (TS2732 otherwise) — see below. Default import only (Node JSON modules expose no named exports; TS NodeNext enforces this). Value import survives verbatimModuleSyntax. |
| biome 2.5.6 | Parses shebang + import attributes; `noConsole` is not in the recommended preset — `console.log` to stdout is fine (and correct for a CLI). |
| depcruise | `src/main` → `package.json` matches no forbidden rule (rules 1–4 fire only from core/adapters; rule 5 restricts imports *into* main). Guard-clean, AC-10 holds. |

**AC-09 amendment (dec-009)**: `tsconfig.json` gains one line, `"resolveJsonModule": true`, extending the diff bound. Justification: it is the single flag that makes the only path-safe-in-both-modes mechanism typecheck; it is additive (enables JSON imports, changes nothing existing). Alternatives that avoid the tsconfig edit (fs walk-up with dual path candidates, build-time `define` with a dev fallback) are strictly uglier and more fragile. Flagged for QA.

### 6. `biome.json` and tsconfig treatment

- `files.includes` += `"tsup.config.ts"` (dec-003). **No entry for `.github/**`**: biome 2.5.6 has no YAML support, and `files.includes` is an allowlist — ci.yml simply sits outside biome's file set; adding it would be noise, not coverage.
- `tsconfig.json` `include` stays `["src"]` → `tsup.config.ts` is deliberately **outside** tsc's program; `tsc --noEmit` stays green regardless of tsup's types, biome lints the file's style, and tsup itself surfaces config errors at `npm run build` (bundle-require executes it). package.json imported from `src/main/cli.ts` is pulled into the tsc program automatically and typechecks as a JSON module (noEmit — no rootDir concern).

### 7. .gitignore / dist

Verified: `/home/user/sentinel-kit/.gitignore` line 5 already ignores `dist/` (written in H1). No change needed; dist stays untracked.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `.github/workflows/ci.yml` | NEW — exact YAML above | low |
| `package.json` | test script string; +vitest 4.1.10, +tsup 8.5.1 | low |
| `package-lock.json` | regenerated by exact-pin install | low |
| `tsup.config.ts` | NEW — exact contents above | low |
| `src/main/cli.ts` | replace no-op body with shebang + JSON import + `--version` branch (doc comment updated, E6.F1.x note kept) | low |
| `biome.json` | `files.includes` += `tsup.config.ts` | low |
| `tsconfig.json` | += `"resolveJsonModule": true` (AC-09 amendment, dec-009) | low |

## Interfaces, Data, And State

- CI ↔ repo interface is the npm scripts, unchanged in shape: `check`/`test`/`build` run verbatim in jobs (AC-01, AC-06a).
- Bin contract: `node dist/cli.js --version` → stdout `0.0.0` (current package.json version) + exit 0; any other argv → silent exit 0. Single source of truth: the inlined package.json (no literal to drift).
- No state, storage, or core/adapters modules touched (AC-09/AC-10).

## Validation Matrix (executor evidence chain, AC-06 + per-AC)

Local, at branch tip, before PR:

| Step | Command | Expect |
|---|---|---|
| Red demo (AC-06c, uncommitted) | `echo 'import "node:fs";' >> src/core/shared/index.ts && npm run check; git checkout -- src/core/shared/index.ts` | check exits non-zero at depcruise (`core-no-io-libs`); revert; `npm run check` green again. Never committed. |
| AC-04/AC-08 | `npm test` | exit 0, "no test files" tolerated by `--passWithNoTests` |
| AC-08 | `npm run check` | exit 0 (biome incl. tsup.config.ts + cli.ts, tsc incl. JSON import, depcruise) |
| AC-05 | `npm run build && node dist/cli.js --version` | dist/cli.js emitted; prints exactly `node -p "require('./package.json').version"`; exit 0 |
| Shebang (risk-006) | `head -1 dist/cli.js` | `#!/usr/bin/env node` |
| Dev mode intact | `npm run dev` and `node --experimental-strip-types src/main/cli.ts --version` | exit 0; second prints version |
| AC-09 | `git diff --stat b7f5e98` | only the 7 files in Affected Areas |
| AC-07 (post-push) | GitHub checks tab on the stacked PR | check, test (22, 24), build all green |

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| SHA-pinned actions vs major tags | major tags `@v7` | first-party actions; SHA pins go stale without Dependabot (out of scope) |
| `createRequire` / fs-readFile / build-time `define` vs JSON import attribute | JSON import attribute | only mechanism immune to the dev-vs-bundle path depth difference (esbuild inlines); others fail in dist or need dual-path hacks |
| tsup banner vs native shebang | native shebang in source | one source of truth, direct-execution friendly; banner kept as bounded fallback |
| Expand tsconfig include to cover tsup.config.ts | keep `include: ["src"]` | avoids a second tsconfig change; build itself exercises the config |
| Concurrency: omit (spec non-goal) vs include | include, PR-cancel-only | orchestrator handoff explicitly re-opened it; 4 lines, reversible, saves minutes; amendment recorded and QA-visible |

## Open Technical Questions

None blocking plan. Two recorded amendments (concurrency non-goal, tsconfig in AC-09 bound) are decisions, not questions — QA validates against spec + these recorded amendments.

## Approval Notes

- Phase checkpoint implicitly approved per ckp-001 auto mode (recorded as ckp-003 in state.yaml).
- Deviations flagged for QA and the PR description: (1) concurrency block amends spec non-goal per orchestrator handoff (dec-008); (2) `tsconfig.json` +`resolveJsonModule` extends the AC-09 diff bound (dec-009). Both A-level, additive, reversible.
- Hand-off duty unchanged (risk-004): E0.F2.x removes `--passWithNoTests` with the real projects config.

## Budget Notes

- Above the 400–600 word target: the handoff mandate requires exact file contents (ci.yml, tsup.config.ts, cli.ts) and registry verification evidence inline; tables keep it scannable and plan can lift the Affected Areas + Validation Matrix verbatim.
