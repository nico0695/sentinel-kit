# Design

## Routing Digest

- change_name: e0-f1-h2-guards
- objective: new-feature — story [E0.F1.H2], issue #3, milestone E0
- route: continue-lite (approved, ckp-001)
- digest_summary: Pin `dependency-cruiser@18.1.0` (exact), add the verbatim `.dependency-cruiser.cjs` below (5 rules, semantics verified against the v18.1.0 published source), set `check` to the §5.1 chain, add the config to biome's allowlist, and hand the executor 5 minimal one-line violation fixtures with a direct `npx depcruise src` attribution protocol.
- affected_areas_digest: `.dependency-cruiser.cjs` (new), `package.json`, `package-lock.json`, `biome.json`; temporary-only touches in 4 `src/` placeholder files + 1 temp file.
- interfaces_digest: no runtime interfaces; the "interface" is the check gate contract (exit 0 clean / non-zero naming the rule on violation).

## Summary

- change_name: e0-f1-h2-guards
- objective: new-feature
- route: continue-lite
- design_status: complete

## Design Overview

### Version pin (dec-007, A-level, claude)

- **`dependency-cruiser@18.1.0`** — npm `latest` as of 2026-08-01 (`npm view`: version 18.1.0; dist-tags latest=18.1.0). Exact pin, no `^`/`~`, matching H1's convention (biome 2.5.6, typescript 7.0.2, @types/node 22.20.1).
- Engines fit: dc declares `node ^22||^24||>=26`; repo requires `>=22` and CI (E0.F1.H3) targets 22/24. Compatible. (dc excludes odd Node 23/25 — irrelevant to our matrix.)
- No companion binary or flags needed: **since v13, `depcruise src` auto-discovers `.dependency-cruiser.cjs`** with no `--config` (README v18.1.0: "not necessary from dependency-cruiser v13 and later"). This satisfies AC-03's flagless requirement; executor still confirms at runtime.
- dc has no TypeScript peerDependency; it picks up the locally installed `typescript` for parsing/resolution. See risk-005 (TS 7 API compatibility, executor-verified).
- Install command: `npm install --save-dev --save-exact dependency-cruiser@18.1.0` (updates `package-lock.json`, AC-02).

### Verified semantics the config relies on (v18.1.0 source, not guesses)

| Fact | Evidence (published tarball / docs) |
|---|---|
| `$1` group substitution from `from.path` captures into `to.path`/`to.pathNot` | rules-reference "group matching"; `extractGroups` + `replaceGroupPlaceholders` in `src/validate/match-dependency-rule.mjs` |
| Node builtins keep their **literal specifier** as the reported path (`fs`, `node:fs`) and get dependencyType `core` | `src/extract/resolve/resolve-cjs.mjs` (builtin → no resolution, name kept); rules-reference dependencyTypes table (`core`: "fs", "node:test") |
| npm packages are reported as the **resolved path** `node_modules/<pkg>/...`; unresolvable specifiers keep the bare name with type `unknown` | `resolve-cjs.mjs` (`relative(baseDir, resolve(...))` vs `couldNotResolve` fallback) — hence the double `pathNot` for zod |
| `to.dependencyTypes` matches on **intersection** (OR within the array), AND-ed with `path`/`pathNot` | `matchesToDependencyTypes` in `src/validate/matchers.mjs` |
| `.js` specifiers between `.ts` files resolve NodeNext-style (`./x.js` → `./x.ts`) natively | `src/extract/resolve/index.mjs` fallback map `[".js", [".ts",".tsx",".d.ts"]]` — no `enhancedResolveOptions.extensionAlias` needed (key doesn't exist in dc options) |
| `tsConfig` option key is `options.tsConfig.fileName` | options-reference §tsConfig |

### `.dependency-cruiser.cjs` — exact content (core of this design)

```js
/**
 * Architecture guards — the 5 MANDATORY rules of PRD §4.5, executable.
 * Runs as the last step of `npm run check` (`depcruise src` — flagless:
 * dependency-cruiser >= 13 auto-discovers this file).
 *
 * While these rules hold, `src/core` stays extractable as a standalone
 * package (PRD §4.5 extraction guarantee).
 */
module.exports = {
  forbidden: [
    {
      // PRD §4.5 rule 1: the core never imports adapters or the
      // composition root.
      name: "core-no-adapters",
      severity: "error",
      from: { path: "^src/core" },
      to: { path: "^src/(adapters|main)" },
    },
    {
      // PRD §4.5 rule 2 (+ dec-002): the core imports no I/O or runtime
      // libraries. WHITELIST: `zod` is the ONLY npm package allowed in
      // core; ALL Node builtins are banned, in both bare ("fs") and
      // prefixed ("node:fs") forms. Relaxing this is a deliberate,
      // reviewed edit of this rule (protocol B).
      // `pathNot` lists both the bare specifier ("zod", how dc reports
      // it while the package is not installed) and the resolved path
      // ("node_modules/zod/...", how dc reports it once installed).
      name: "core-no-io-libs",
      severity: "error",
      from: { path: "^src/core" },
      to: {
        dependencyTypes: [
          "core",
          "deprecated",
          "npm",
          "npm-bundled",
          "npm-dev",
          "npm-no-pkg",
          "npm-optional",
          "npm-peer",
          "npm-unknown",
          "undetermined",
          "unknown",
        ],
        pathNot: ["^zod(/|$)", "^node_modules/zod(/|$)"],
      },
    },
    {
      // PRD §4.5 rule 3: core modules depend on each other only through
      // the other module's public index. "$1" is the importing module's
      // own folder (group matching): imports inside the same module are
      // free; only cross-module non-index imports are violations.
      name: "core-modules-via-index",
      severity: "error",
      from: { path: "^src/core/([^/]+)/" },
      to: {
        path: "^src/core/[^/]+/",
        pathNot: ["^src/core/$1/", "^src/core/[^/]+/index\\.ts$"],
      },
    },
    {
      // PRD §4.5 rule 4: adapters never import other adapters — sharing
      // happens only via core port types. "$1/$2" is the importing
      // adapter's own direction/name folder (group matching).
      name: "adapters-isolated",
      severity: "error",
      from: { path: "^src/adapters/([^/]+)/([^/]+)/" },
      to: {
        path: "^src/adapters/",
        pathNot: ["^src/adapters/$1/$2/"],
      },
    },
    {
      // PRD §4.5 rule 5: wiring lives only in src/main — nothing outside
      // the composition root imports from it.
      name: "wiring-only-in-main",
      severity: "error",
      from: { pathNot: "^src/main" },
      to: { path: "^src/main" },
    },
  ],
  options: {
    // Resolve with the project's TS settings (NodeNext) so imports
    // between .ts files (".js" specifiers included) actually resolve.
    tsConfig: { fileName: "tsconfig.json" },
    // Also record type-only / pre-compilation imports: an
    // `import type` from a forbidden area is still forbidden coupling
    // (dec-008). Bonus: faster cruising.
    tsPreCompilationDeps: true,
    // Report external packages as dependencies, do not cruise into them.
    doNotFollow: { path: "node_modules" },
  },
};
```

Notes on deliberate choices inside the config:

- **dec-008 (A, claude)**: `tsPreCompilationDeps: true` — with `verbatimModuleSyntax`, type-only imports are explicit and would vanish post-compile; the guards must still see them (an `import type` of an adapter class inside core is architectural coupling). Also required so today's/future `export {}`-style TS is cruised cheaply.
- **dec-009 (A, claude)**: `core-no-io-libs` implemented as a dependencyTypes ban list (all builtins via `core`, every npm flavor, plus `unknown`/`undetermined`/`deprecated` so uninstalled or typo'd externals cannot slip through) with the zod exemption expressed in both reported-path forms. Side effect (accepted): a typo'd relative import in core reports as `unknown` and trips this rule — harmless, since tsc fails on it anyway.
- Rule 3 exempts only a module's top-level `index.ts` (`^src/core/[^/]+/index\.ts$`); nested `sub/index.ts` files are not public API. Files directly under `src/core/` (none exist) are outside rule 3's `from`, by PRD intent (rule governs modules).

### biome interaction (implements dec-005 — decided in spec, AC-13)

`.dependency-cruiser.cjs` is **added** to `biome.json` `files.includes` (spec already decided; the handoff's keep-out option is superseded by AC-13). The config above is pre-written in biome style (2-space indent, double quotes, trailing commas, ≤80 cols); if `biome check .` still flags formatting, the executor runs `npx biome check --write .dependency-cruiser.cjs` and re-checks — content-neutral. Executor must verify biome actually scans the dotfile (explicit allowlist entry should suffice; see risk-006).

### package.json edits (exact)

- `"check": "biome check . && tsc --noEmit && depcruise src"` (AC-01, verbatim setup §5.1)
- devDependencies gains: `"dependency-cruiser": "18.1.0"` (AC-02; written by the `--save-exact` install, which also updates `package-lock.json`)

### Red-proof fixtures and attribution protocol (dec-010, A, claude)

Per spec risk-004 (pinned in handoff): every red proof runs **`npx depcruise src` directly** to isolate attribution — output must name exactly the target rule; exit code is non-zero (dc exits with the error count). Additionally, one of the proofs (AC-06 is the cheapest) also runs full `npm run check` red to show the chain wires the failure through. All fixtures are one-line side-effect imports appended to existing placeholders — they pass biome (plain import statement) and tsc (resolvable targets, no unused-name issues with side-effect form). Cycle per rule: apply → red → revert → `npx depcruise src` green.

| AC | Rule | Temporary edit (exact line) | File | Cleanup |
|---|---|---|---|---|
| AC-05 | core-no-adapters | `import "../../adapters/driven/engines/index.js";` | `src/core/run/index.ts` | remove line |
| AC-06 | core-no-io-libs | `import "node:fs";` (proves builtins + `node:` form, dec-002) | `src/core/run/index.ts` | remove line |
| AC-07 | core-modules-via-index | 1) create `src/core/shared/internal.ts` containing the placeholder shape (comment + `export {};`) 2) `import "../shared/internal.js";` in `src/core/review/index.ts` → red. Negative control: change it to `import "../shared/index.js";` → `npx depcruise src` exit 0 | `src/core/review/index.ts` + temp file | remove line, delete temp file |
| AC-08 | adapters-isolated | `import "../../driven/git/index.js";` | `src/adapters/driving/cli/index.ts` | remove line |
| AC-09 | wiring-only-in-main | `import "../../../main/cli.js";` (from an adapter so ONLY rule 5 fires — a core source would also trip rule 1) | `src/adapters/driving/cli/index.ts` | remove line |

Each fixture trips exactly one rule (verified against the rule matrix above: local deps don't match rule 2's dependencyTypes; adapter→main doesn't match rules 1–4; core→adapters doesn't match rule 5's `to` etc.). Close with AC-11: `git status --porcelain` shows only the four intended files; final `npm run check` green. AC-12 (no `npm test` possible) is recorded by executor in execution-log.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `.dependency-cruiser.cjs` | New file, verbatim content above | low (proven red per rule) |
| `package.json` | `check` script + pinned devDep | low |
| `package-lock.json` | Regenerated by install | low |
| `biome.json` | `files.includes` += `".dependency-cruiser.cjs"` | low (risk-006) |
| `src/core/run/index.ts`, `src/core/review/index.ts`, `src/adapters/driving/cli/index.ts`, temp `src/core/shared/internal.ts` | Temporary violation fixtures only — fully reverted | low (AC-11 gate) |

## Interfaces, Data, And State

- No runtime interfaces, data, or state. The delivered contract is the check gate: `npm run check` exit 0 on a compliant tree; non-zero with the violated rule named in depcruise's eslint-like output otherwise. Config is declarative and versioned; future rule relaxations are visible diffs (protocol B).

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| §5.3 sketch regexes verbatim (`(?!\1)` backrefs, `pathNot: "^(zod)$"`) | Rejected | dc uses `$1` group substitution, not in-regex backrefs; zod is reported as `node_modules/zod/...` once installed — sketch would be silently permissive (risk-001, now closed by verified semantics + red proofs) |
| Rule 2 via `pathNot: ["^src/", "…zod…"]` inverse-whitelist | Rejected | Over-broad (would misfire on aliased/local edge cases); dependencyTypes list maps 1:1 to spec behavior "npm except zod, or any builtin" |
| `tsPreCompilationDeps: false` (default) | Rejected (dec-008) | Type-only imports across boundaries would be invisible to the guards |
| Keep `.dependency-cruiser.cjs` out of biome | Rejected | Spec dec-005/AC-13 already decided inclusion; gate config should pass the gate |
| Pin 18.1.0 vs older 16.x line | 18.1.0 | Current stable `latest`; engines match Node >=22; no known blockers; exact pin keeps it reproducible |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| risk-005 (low-med): does dc 18.1.0 drive typescript **7.0.2**'s compiler API for TS parsing/tsconfig reading? TS 7 is the native-compiler line; dc has no declared peer range | If the TS integration fails, TS files may fall back to the acorn parser or tsconfig may not load, weakening resolution | executor step 1 (first `npx depcruise src` + AC-05 red proof make it observable immediately; fixtures are acorn-parseable side-effect imports, so failure mode is visible, not silent) | executor-verify |
| risk-006 (low): biome scanning of a dotfile explicitly listed in `files.includes` | AC-13 requires `biome check .` to cover the config | executor (run `npx biome check .dependency-cruiser.cjs`; a "no files processed" style error means the allowlist entry needs adjusting) | executor-verify |
| Flagless auto-discovery on the real install | AC-03 | executor (documented for v13+; confirm output cites the 5 rules) | executor-verify |

No question blocks planning: each has a deterministic executor verification and a bounded fallback (formatting rewrite for risk-006; for risk-005 a STOP-and-report per protocol C if TS 7 turns out unsupported, since the alternative — downgrading typescript — touches H1 scope).

## Approval Notes

- Whole-change pre-approval ckp-001 (auto mode) covers this stage; checkpoint skipped, advancement to `sddl-plan` implicitly approved.
- New A-level decisions this stage: dec-007 (pin 18.1.0), dec-008 (`tsPreCompilationDeps: true`), dec-009 (rule-2 dependencyTypes ban list + dual-form zod exemption), dec-010 (red-proof attribution protocol: direct `npx depcruise src` per rule + one full-chain red). All recorded in state.yaml.
- risk-001 (medium) is materially reduced: rule semantics were validated against the published v18.1.0 source (validator, resolver) rather than docs alone; final confirmation remains the executor's five red proofs.

## Budget Notes

- Above the lite word target because the verbatim config and the verified-semantics table ARE the deliverable of this stage (handoff item 2); prose elsewhere kept minimal.
