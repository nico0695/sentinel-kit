# Spec

## Routing Digest

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- digest_summary: Scaffold PRD §4.2 tree + `harnesses/`/`skills/`/`fixtures/`, package.json `@nico0695/sentinel` (ESM, node>=22, bin `sentinel`+`snt`, §5.1 scripts with `check` = biome+tsc), strict tsconfig (§5.2), Biome config, honest per-module `index.ts` placeholders, replace 8 docs placeholder occurrences.
- scope_digest: in = structure, configs, placeholders, docs replacement, green `check`; out = depcruise (H2), CI (H3), vitest/tsup configs, `.changeset/`, runtime deps, ports/domain types, npm reservation (user-side).
- acceptance_digest: AC-01..AC-09 below; gate = `npm run check` exits 0 with `check` = `biome check . && tsc --noEmit`.

## Summary

- change_name: e0-f1-h1-scaffold
- objective: new-feature
- route: continue-lite
- spec_status: ready-for-design

## Scope Boundary

### In Scope

- Directory tree exactly per PRD §4.2: `src/core/{repos,workspace,review,run,history,shared}`, `src/adapters/driving/{cli,tui}`, `src/adapters/driven/{engines,git,exec,storage}`, `src/main/`; plus package-root `harnesses/`, `skills/`, `fixtures/` (setup §5.5).
- One minimal, semantically honest TypeScript entry per core module (`index.ts`), per adapter leaf, and `src/main/cli.ts` — module doc comment + `export {}` or a minimal named export; no invented domain logic (decision D2).
- `package.json`: name `@nico0695/sentinel` (S01-D1), `"type": "module"`, `engines.node >=22`, `bin` `sentinel` + `snt` → `./dist/cli.js`, `files: ["dist", "harnesses", "skills"]`, scripts `dev`/`build`/`test` verbatim per setup §5.1 and `check` = `biome check . && tsc --noEmit` (decision D1). Committed `package-lock.json`.
- devDependencies only: `@biomejs/biome`, `typescript`, `@types/node` if needed (decision D3). Zero runtime dependencies.
- Strict tsconfig per setup §5.2: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module`/`moduleResolution: NodeNext`, `target: ES2023`, `isolatedModules`, `verbatimModuleSyntax`; no path aliases.
- Biome config file; `npm run check` green locally.
- Docs: replace all 8 placeholder occurrences — `@<scope>` at backlog L43/L379, setup L34/L35/L76/L153, PRD L279, and `@<your-scope>` at setup L38 — with `@nico0695/sentinel` (or `@nico0695` where the text refers to the scope alone), preserving sentence meaning (decision D4). No other doc rewording.

### Out Of Scope

- dependency-cruiser config and `depcruise` in `check` (E0.F1.H2); CI workflows (E0.F1.H3).
- vitest/tsup config files; `.changeset/` (release tooling, later story).
- Ports, domain types, use cases, any `<module>/ports` content (E0.F2.x onward).
- npm registry reservation of `@nico0695/sentinel` — external, done by the user (issue #2 AC3).

### Non-Goals

- `npm run build` / `npm test` runnable — scripts are declared per §5.1 but tsup/vitest are not installed; failing with "command not found" is expected behavior, not a defect (decision D3).
- README or any prose docs beyond the placeholder replacement.
- Automated architecture-guard enforcement — guards hold by construction of the placeholders until H2.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `npm install` on Node 22 | Succeeds; installs devDeps only | risk-001 (low) |
| `npm run check` | Runs biome then tsc over real placeholder inputs; exits 0 | Gate for the story and the PR |
| `npm run dev` | Executes `src/main/cli.ts` via `--experimental-strip-types`; exits 0 | cli.ts exists as the main placeholder |
| `npm run build` / `npm test` | Fail (tsup/vitest not installed) | Expected; becomes runnable in E0.F1.H3 / E0.F2.x |
| `grep -r "@<scope>\|@<your-scope>" docs/` | Zero matches | 8 replacements, 3 files |
| Inspect placeholders | No cross-module imports, no adapter/main imports from core, no I/O libs | PRD §4 guards hold by construction |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-01 | All PRD §4.2 directories plus `harnesses/`, `skills/`, `fixtures/` exist and are tracked in git | `git ls-files` | P1 |
| AC-02 | package.json fields exact: name, type module, engines >=22, bin sentinel+snt, files, §5.1 scripts | `npm pkg get` | P1 |
| AC-03 | `check` script is exactly `biome check . && tsc --noEmit` and `npm run check` exits 0 | run it | P1 |
| AC-04 | tsconfig contains every §5.2 flag listed in scope | read tsconfig | P1 |
| AC-05 | No `@<scope>`/`@<your-scope>` remains under `docs/`; diff touches only those lines | grep + `git diff docs/` | P1 |
| AC-06 | Placeholders are honest: doc comment + `export {}`/minimal export, no domain logic, no guard-violating imports | read files | P1 |
| AC-07 | Zero runtime deps; devDeps limited to biome/typescript(/@types/node) | package.json | P2 |
| AC-08 | `npm run dev` exits 0 | run it | P2 |
| AC-09 | PR titled `[E0.F1.H1] ...` referencing `Closes #2`, opened only after AC-03 passes locally | PR body | P1 |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| risk-001: toolchain never installed together here | Low | Standard biome+tsc pairing; surfaces at `npm install` |
| Biome defaults may flag config/docs files | Low | Scope biome config to project files; adjust config, not code semantics |
| `check` deviates from §5.1 verbatim (no `depcruise src`) | Accepted | Documented deviation D1; H2 appends depcruise |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| D1: `check` = `biome check . && tsc --noEmit` for H1 | Matches issue #2 AC; depcruise unconfigured would fail | design | resolved (A, orchestrator) |
| D2: real `index.ts` placeholders, not `.gitkeep` | tsc needs genuine inputs; structure visible in git | design | resolved (A, orchestrator) |
| D3: declare §5.1 scripts, install only H1 devDeps | Manifest matches setup doc; build/test land with their stories | design | resolved (A, orchestrator) |
| D4: replace both `@<scope>` and `@<your-scope>` with `@nico0695/sentinel` (or `@nico0695` for scope-alone) | Single naming source of truth in docs | execution | resolved (A, orchestrator) |
| Correction: 8 occurrences, not 7 | Proposal digest missed `@<your-scope>` at setup L38; live grep confirms 8 across 3 files | execution | resolved (A, spec — repo evidence) |

No open questions remain; all decisions are A-level and recorded above.

## Approval Notes

- Checkpoint skipped as implicitly approved: ckp-001/dec-001 pre-approved the whole change in auto mode. Deviations from this spec still escalate per the A/B/C protocol.

## Budget Notes

- Kept within lite budget; downstream stages can rely on the AC table without rereading docs.
