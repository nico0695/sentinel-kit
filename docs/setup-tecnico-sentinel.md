# Technical setup — `sentinel`

> Stack decisions, libraries, configuration, and pipelines to bootstrap the repo. Complements the PRD (the architecture in §4 is assumed).
> **Status: validated as a set of recommendations** — each choice is the agreed-upon default, not an obligation: it is re-evaluated at the time of implementing the corresponding piece if better information surfaces. Changing a choice only requires respecting the PRD's ports/guards.

---

## 1. Language: TypeScript (decided, with analysis)

| | TypeScript/Node | Rust | Go |
|---|---|---|---|
| Nature of sentinel | I/O-bound orchestrator: spawns processes (git, AI engines) and waits minutes for a response | Same — language performance is irrelevant here | Same |
| Real advantage | Development speed, your expertise, same ecosystem as the engines (Node CLIs) and the rest of your projects | Single binary without runtime, startup ~5 ms | Single binary, simplicity |
| Cost | Requires runtime (mitigable, see §3) | Learning curve + much slower development speed; TUI/yaml/schema ecosystem more laborious | Less expressive for domain modeling |

**Verdict**: sentinel's bottleneck is always the AI engine (minutes per review) — Rust would optimize the ~80 ms that don't matter and make more expensive everything that does matter (iterating fast on domain, harnesses, adapters). Rust/Go would only win on distribution, and that is solved by another route (§3). **Strict TypeScript on Node.**

## 2. Runtime: Node LTS, runtime-agnostic code

| | Node (≥22, target 24 LTS) | Bun | Deno |
|---|---|---|---|
| Stability | The reference; predictable LTS | Very good but with historical edge cases precisely in `child_process`/TTY — **sentinel's core is spawning CLIs**, it's the area where you want the least risk | Good |
| TS | Native (type stripping) for dev; build for distribution | Native | Native |
| Single binary | Possible via SEA (immature) | `bun build --compile` (~90-100 MB, works well) | `deno compile` |
| Ecosystem | Full (execa, clack, etc.) | Compatible with nuances | Friction with some packages |

**Decision**: **Node ≥22 (target 24 LTS) as the official runtime**. Code rule: do not use proprietary APIs of any runtime (`Bun.*`, `Deno.*`) — everything through standard Node APIs. Benefit: Bun remains available **as a compilation channel** (single binary for VPS without Node) without committing to it as a runtime. It is the reversible option.

## 3. Distribution

**Main channel (MVP): npm.**

```bash
npm i -g @nico0695/sentinel     # installation
npx @nico0695/sentinel          # one-off usage
```

**Naming on npm (verified against the registry)**: `sentinel` and `sentinel-cli` are **taken**; `sentinelcli` is free. Recommendation: **scoped package `@nico0695/sentinel`** (always available) with `bin: sentinel`.

⚠️ **Known binary collision**: HashiCorp Sentinel (policy-as-code) installs a `sentinel` binary. Users with HashiCorp tooling would have a PATH conflict. Options: (a) keep `sentinel` and document it (uncommon collision in your target audience), (b) short alternative binary like `snt` in addition to `sentinel`. Recommendation: (a) + alias `snt` as a second binary — costs one line in package.json.

**Future channels** (not MVP, in order of value):
1. **Single binary via GitHub Releases** (`bun build --compile` over the same code) — installs on VPS without Node. Enabled by the runtime-agnostic rule.
2. **Homebrew tap** — minimal friction on macOS/Linux.
3. **Docker image** — for the stage 3 daemon (`docker run` with config volume).

**Publishing**: npm with `--provenance` (OIDC from GitHub Actions — supply chain verifiability, no static tokens).

## 4. Library stack

General criterion: minimal runtime dependencies (each dep is maintenance and supply chain surface); dev-deps with more freedom.

| Area | Choice | Alternatives | Why |
|---|---|---|---|
| Command parsing | **commander** | citty, yargs, oclif | Stable, zero magic, known API. oclif discarded: heavy framework with its own plugin system — sentinel's plugin system is domain-level (adapters), not from the CLI framework |
| Prompts/menus | **@clack/prompts** | inquirer, ink | Lightweight, modern aesthetic, covers all of MVP area G. ink is reserved for the stage 2 chat if it appears |
| Processes | **execa** | raw child_process, zx | Timeout, capture, signals, and cross-platform solved; foundation for engines, git wrapper, and validations |
| Config schemas | **zod** | valibot | Validation + inferred types for config.yaml/repos.yaml/skills.yaml; user-readable errors |
| YAML | **yaml** (eemeli) | js-yaml | Maintained, preserves comments (useful if the tool edits config) |
| Terminal colors/style | **picocolors** | chalk | Minimal and sufficient |
| Terminal md rendering | ⚪ **marked + marked-terminal** | plain text | Optional MVP: the result is already readable md |
| Testing | **vitest** | node:test, jest | Fast, native TS, `projects` to separate unit/contract/e2e |
| Lint + format | **Biome** | ESLint + Prettier | Single tool, very fast, minimal config. Doesn't cover architecture guards → next row |
| Architecture guards | **dependency-cruiser** | eslint-plugin-boundaries | Independent of the linter, declarative versioned rules, fails CI with clear report. Implements the 5 rules from PRD §4.5 |
| Build | **tsup** | tsdown, esbuild direct, tsc | ESM bundle of the bin in one step; shebang and externals resolved |
| Versioning/release | **changesets** | release-please, semantic-release | Manual semver control with decent changelogs; minimal weight for a single dev |

Total runtime dependencies: **7** (commander, clack, execa, zod, yaml, picocolors, ±marked). Everything else is dev.

## 5. Initial repo configuration

### 5.1 package.json (essential)

```jsonc
{
  "name": "@nico0695/sentinel",
  "type": "module",
  "engines": { "node": ">=22" },
  "bin": { "sentinel": "./dist/cli.js", "snt": "./dist/cli.js" },
  "files": ["dist", "harnesses", "skills"],   // factory harnesses ship in the package
  "scripts": {
    "dev": "tsup --silent && node dist/cli.js",   // NodeNext `.js` specifiers rule out --experimental-strip-types
    "build": "tsup",
    "check": "biome check . && tsc --noEmit && depcruise src",
    "test": "vitest run"
  }
}
```

### 5.2 tsconfig (strict base)

`strict: true` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module/moduleResolution: NodeNext`, `target: ES2023`, `isolatedModules`, `verbatimModuleSyntax`. No exotic path aliases: relative imports + package.json subpath imports if needed (`#core/*`) — maintains compatibility with all toolings.

### 5.3 Guards (dependency-cruiser) — PRD §4.5 executable

```js
// .dependency-cruiser.cjs — rules mirroring the 5 from the PRD
module.exports = { forbidden: [
  { name: "core-no-adapters",  severity: "error",
    from: { path: "^src/core" },  to: { path: "^src/(adapters|main)" } },
  { name: "core-no-io-libs",   severity: "error",
    from: { path: "^src/core" },
    to: { dependencyTypes: ["npm"], pathNot: "^(zod)$" } },        // whitelist: only pure libs
  { name: "core-modules-via-index", severity: "error",
    from: { path: "^src/core/([^/]+)/" },
    to:   { path: "^src/core/(?!\\1)([^/]+)/(?!index)" } },
  { name: "adapters-isolated", severity: "error",
    from: { path: "^src/adapters/([^/]+)/([^/]+)" },
    to:   { path: "^src/adapters/(?!\\1/\\2)" } },
  { name: "wiring-only-in-main", severity: "error",
    from: { pathNot: "^src/main" }, to: { path: "^src/main" } }
]};
```

### 5.4 Testing (vitest projects)

- `core` → unit, in-memory fakes of ports, no I/O.
- `adapters` → contract: shared suite per port (`ReviewEngine.contract.ts` runs against claude-code, opencode, and the fake); mocked binaries with real output fixtures captured in the spike.
- `e2e` → smoke of the full flow with FakeEngine and temporary git repo.

### 5.5 Structure

As per PRD §4.2 exactly, plus: factory `harnesses/` and `skills/` at the package root, `fixtures/` with real engine outputs (feeds the contract tests), `.changeset/`.

## 6. Pipelines (GitHub Actions)

### ci.yml — on every PR and push to main

```
jobs:
  check:   npm ci → biome check → tsc --noEmit → depcruise src   # lint + types + guards
  test:    matrix node [22, 24] → vitest run
  build:   tsup → bin smoke (sentinel --version)
```

Guards in CI **from commit 1** — it is the extraction guarantee for the core and the future daemon (PRD §4.5/§7).

### release.yml — on merge to main

```
changesets/action:
  - no pending changesets → no-op
  - with changesets → version PR; on merge:
      npm publish --provenance (OIDC, no tokens) → tag → GitHub Release
```

### Optional from the start
- `pr-title` lint (conventional commits) if you want clean automatic changelogs.
- Dependabot/Renovate for the 7 runtime deps (small surface, low noise).

## 7. Bootstrap checklist

1. Create `sentinel` repo + npm scope; reserve `@nico0695/sentinel`.
2. Scaffold: structure per PRD §4.2 + configs from §5 of this doc.
3. CI with the 3 jobs and guards active (even if `core/` is nearly empty).
4. `FakeEngine` + `ReviewEngine` port + first contract test — unblocks all core development in parallel.
5. Engine spike (PRD §6.2) capturing real output fixtures → feed the contract tests.
6. Real engine adapters → first end-to-end review → dogfooding.
