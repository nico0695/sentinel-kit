# Execution Log

## Stage Overview

| Stage Id | Goal | Touches Code | Status | Entry |
|---|---|---|---|---|
| S1 | Local tool enablement: pins, scripts, configs, `--version` | yes | done | 2026-08-01 S1 |
| S2 | CI workflow + red-proof evidence + diff bound | yes | done | 2026-08-01 S2 |

## 2026-08-01 — S1: local tool enablement

- Approval: implicitly satisfied by ckp-001 (auto mode, whole-change kickoff pre-approval), recorded at stage start per plan.md Approval Notes and handoff instruction.
- Executor: sddl-executor (stage-scoped invocation, S1 only).

### Baseline note (not a deviation)

plan.md S1/S2 reference diff-bound baseline b7f5e98 (H2 tip at plan time). Orchestrator-verified before this stage: PR #48 review fixes were merged into this branch (commit 69eb284, "segment-anchored guard regexes" in `.dependency-cruiser.cjs`), branch tip at stage start = 2e00906, and the effective H2 tip / diff-bound baseline is now **5057e41**. S2's AC-09 diff bound must be computed against 5057e41, not b7f5e98. Recorded as a note per orchestrator handoff; no plan contradiction (risk-002 anticipated exactly this).

### Entry preconditions (verified)

- Branch `claude/e0-f1-h3-ci-pipeline-2gliny` at 2e00906; `git status --porcelain` empty.
- Baseline `npm run check` green (orchestrator-verified just before handoff: biome 17 files, tsc clean, depcruise 13 modules / 0 dependencies).
- All planning artifacts present (proposal, spec, design, plan, state.yaml); no prior execution-log.md.

### Steps executed (design §§2-6, byte-exact)

1. `npm install --save-dev --save-exact vitest@4.1.10 tsup@8.5.1` — exit 0. Resolved versions verified against the pins: node_modules/vitest 4.1.10, node_modules/tsup 8.5.1; package.json devDependencies show exact pins `"tsup": "8.5.1"`, `"vitest": "4.1.10"` (alphabetical order preserved). No version drift — dec-007 STOP trigger not fired.
2. `package.json` `scripts.test` → `"vitest run --passWithNoTests"` (design §3, dec-002).
3. Created `tsup.config.ts` byte-exact from design §4 (dec-010).
4. `biome.json` `files.includes` += `"tsup.config.ts"` (design §6, dec-003). No `.github/**` entry, per design.
5. `tsconfig.json` compilerOptions += `"resolveJsonModule": true` (design §5, dec-009 amendment).
6. Replaced `src/main/cli.ts` byte-exact from design §5: shebang + doc comment + `import pkg from "../../package.json" with { type: "json" }` + `--version` branch (dec-009).

### Validation battery (plan.md S1 table — all green)

| Command | Expected | Actual |
|---|---|---|
| `npm run check` | exit 0 | exit 0 — biome 18 files clean (incl. tsup.config.ts + cli.ts), tsc clean (JSON import typechecks), depcruise "no dependency violations found (14 modules, 1 dependencies cruised)" — the 1 dependency is src/main/cli.ts → package.json, guard-clean (AC-10) |
| `npm test` | exit 0 with zero test files (AC-04) | exit 0 — vitest 4.1.10: "No test files found, exiting with code 0" (`--passWithNoTests`) |
| `npm run build` | emits dist/cli.js (AC-05) | exit 0 — tsup 8.5.1, ESM dist/cli.js 785 B, output chmod +x (-rwxr-xr-x) |
| `node dist/cli.js --version` | prints package version, exit 0 (AC-05) | printed `0.0.0`, exit 0; equals `node -p "require('./package.json').version"` → `0.0.0` |
| `head -1 dist/cli.js` | `#!/usr/bin/env node` (risk-006) | `#!/usr/bin/env node` — native shebang preserved by esbuild; banner fallback NOT needed |
| `npm run dev` | exit 0 | exit 0 |
| `node --experimental-strip-types src/main/cli.ts --version` | prints version, exit 0 | printed `0.0.0`, exit 0 — dev mode intact |
| `git status --porcelain` | no dist/ entries | dist/ absent (ignored/untracked); only intended files listed below |

### Changed files (uncommitted, per handoff — orchestrator owns git mechanics)

`git status --short` at stage end:

```
 M biome.json
 M package-lock.json
 M package.json
 M src/main/cli.ts
 M tsconfig.json
?? tsup.config.ts
```

Exactly the S1 slice of design's Affected Areas (all 7 minus `.github/workflows/ci.yml`, which is S2). No blast-radius expansion.

### Deviations

None. Baseline-commit note above is informational (orchestrator-supplied, anticipated by risk-002).

### Quick-check summary

Planned = plan.md S1 validation table; run = all 8 rows; skipped = none. All exit 0.

### QA handoff

Stage touched code but is fully covered by the executed validation battery and stays inside the approved scope; per plan sequencing (S1 → S2 strict, S2 re-validates check/test/build at its final gate), stage-level QA is deferred — recommended next step is executing S2, with `sddl-qa-review` (final mode) after S2 per the change flow.

### Next action

Execute stage S2 (ci.yml byte-exact from design §1 + AC-06c red demo + AC-09 diff bound vs effective baseline 5057e41) in a separate executor invocation.

## 2026-08-01 — S2: ci.yml + red-proof + diff bound

- Approval: implicitly satisfied by ckp-001 (auto mode, whole-change kickoff pre-approval), recorded at stage start per plan.md Approval Notes and handoff instruction.
- Executor: sddl-executor (stage-scoped invocation, S2 only).

### Entry preconditions (verified)

- S1 committed at e34d8eb; branch `claude/e0-f1-h3-ci-pipeline-2gliny`; `git status --short` empty at stage start.
- `npm run check` exit 0 (biome 18 files clean, tsc clean, depcruise "no dependency violations found (14 modules, 1 dependencies cruised)").
- Effective AC-09 diff-bound baseline: 5057e41 (merged H2 tip, per orchestrator-verified S1 baseline note) — supersedes plan's b7f5e98.

### Step 1 — ci.yml creation

Created `.github/workflows/ci.yml` byte-exact from design §1 (dec-008). Verified mechanically: extracted the design §1 yaml fence and ran `diff` against the created file — exit 0, identical.

### Step 2 — structural checklist (dec-011, no local YAML linter)

| Check | Result |
|---|---|
| Exactly 3 jobs: check, test, build (AC-01) | pass |
| Jobs run `npm run check` / `npm test` / `npm run build` verbatim (AC-01, AC-06a); build job adds `node dist/cli.js --version` smoke | pass |
| `on:` = unfiltered `pull_request` + `push` to `main` (AC-02) | pass |
| node-version 22 on check/build; matrix `[22, 24]` with `node-version: ${{ matrix.node }}` on test (AC-03) | pass |
| `permissions: contents: read` | pass |
| `concurrency` group `${{ github.workflow }}-${{ github.ref }}`, cancel-in-progress only for `pull_request` | pass |
| `timeout-minutes: 10` on all 3 jobs | pass |
| `actions/checkout@v7` + `actions/setup-node@v7` with `cache: npm`; `npm ci` per job | pass |

Authoritative proof remains the post-push real run (AC-07, risk-008) — orchestrator-owned.

### Step 3 — red demo (AC-06c, local + uncommitted only)

Attempt 1 (plan's literal command):

```
$ echo 'import "node:fs";' >> src/core/shared/index.ts
$ npm run check   # exit 1
```

Check turned red but short-circuited at the **biome** step (`lint/complexity/noUselessEmptyExport` on the pre-existing `export {};` + `assist/source/organizeImports`), never reaching depcruise. The plan's evidence contract requires the failure AT the depcruise step naming the rule → recorded as dev-001 below; reverted (`git checkout -- src/core/shared/index.ts`) and re-injected with a biome-clean variant (same file, same forbidden import; `export {};` removed since the import makes it useless):

```
$ cat src/core/shared/index.ts   # temporary injected content
/**
 * Core module: shared — domain errors, common types (PRD §4.2).
 * Filled incrementally as domain modules land, starting E0.F2.x.
 * No public API yet.
 */
import "node:fs";

$ npm run check
> @nico0695/sentinel@0.0.0 check
> biome check . && tsc --noEmit && depcruise src

Checked 18 files in 12ms. No fixes applied.

  error core-no-io-libs: src/core/shared/index.ts → fs

x 1 dependency violations (1 errors, 0 warnings). 15 modules, 2 dependencies cruised.
# exit 1
```

Red at depcruise, naming `core-no-io-libs` — the guard evidence chain holds (biome and tsc pass; the architecture guard is what turns the pipeline red). Revert and re-green:

```
$ git checkout -- src/core/shared/index.ts
$ npm run check   # exit 0 — "no dependency violations found (14 modules, 1 dependencies cruised)"
$ git status --porcelain
?? .github/
```

No residue beyond the intended ci.yml. The forbidden import was never staged or committed.

### Step 4 — final gate (all green)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (biome 18 files, tsc, depcruise 14 modules / 1 dependency, 0 violations) |
| `npm test` | exit 0 (vitest 4.1.10, `--passWithNoTests`, zero test files) |
| `npm run build` | exit 0 — ESM dist/cli.js 785 B |
| `node dist/cli.js --version` | prints `0.0.0`, exit 0 |
| `npm run dev` | exit 0 |

### Step 5 — diff bound (AC-09, baseline 5057e41)

`git diff --stat 5057e41` (tracked changes = committed S1) lists exactly: `biome.json`, `package-lock.json`, `package.json`, `src/main/cli.ts`, `tsconfig.json`, `tsup.config.ts`, plus the 6 sdd-lite change artifacts under `sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/`. Untracked (`git status --porcelain`): only `?? .github/`, whose sole file is `.github/workflows/ci.yml` (verified with `find .github -type f`). Note: untracked files never appear in `git diff --stat`, so ci.yml is evidenced by the porcelain listing; no `git add -N` was used (would be a git side effect). Union = exactly the 7 Affected Areas files + sdd-lite artifacts. Nothing under `src/core/` or `src/adapters/` modified. STOP trigger not fired.

### Changed files (this stage, uncommitted per handoff — orchestrator owns git)

`git status --short` at stage end:

```
 M sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/execution-log.md
 M sdd-lite/openspec/changes/e0-f1-h3-ci-pipeline/state.yaml
?? .github/
```

(`.github/` = `workflows/ci.yml` only. The two sdd-lite artifact updates are this stage's own recording.)

### Deviations

- dev-001 (A-level, claude): the plan's literal red-demo injection (`echo 'import "node:fs";' >> src/core/shared/index.ts`) failed `npm run check` at the biome step (useless-empty-export + import-ordering on the appended line), short-circuiting before depcruise. Adjusted the temporary injected content to a biome-clean variant (same file, same forbidden `node:fs` import, `export {};` dropped in the throwaway content) so the pipeline reached depcruise and failed there naming `core-no-io-libs`, as the plan's evidence contract requires. Same demo intent, same blast radius (one temporary uncommitted edit, fully reverted); the first attempt is preserved above as supplementary evidence that biome also rejects the sloppy variant.

### Quick-check summary

Planned = plan.md S2 steps 2-5; run = all (structural checklist 8/8 pass, red demo red-then-green, final gate 5/5 green, diff bound exact). Skipped = none. AC-07 (post-push run) intentionally out of stage scope per plan.

### QA handoff

Both plan stages (S1, S2) are now done; the change has reached its implementation endpoint. Recommended next stage: `sddl-qa-review` (final mode), then orchestrator post-plan mechanics (commit ci.yml + artifacts, push, stacked PR with `Closes #4` surfacing dec-008/dec-009 amendments and the risk-004 `--passWithNoTests` removal duty, AC-07 watch, history entry).

### Next action

Hand back to orchestrator: run `sddl-qa-review` in final mode over the full change, then execute post-plan git/PR mechanics.
