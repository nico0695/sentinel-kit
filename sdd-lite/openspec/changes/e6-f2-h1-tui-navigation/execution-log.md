# Execution Log

- change_name: e6-f2-h1-tui-navigation
- executor: sddl-executor (batch 1: S1–S2 approved for this invocation)
- plan source: `plan.md` (Stage Plan table, authoritative)

## Stage Overview

| Stage Id | Goal (short) | Status |
|---|---|---|
| S1 | Pin + install `@clack/prompts` (exact, no `^`), record resolved version | done (version flag resolved: keep `1.7.0`, decision e6f2h1-D5) |
| S2 | Behavior-preserving refactor of `src/main/container.ts` | done |
| S3 | TUI contract + minimal renderer + test doubles | pending |
| S4 | `runTuiFlow`/`createTui` + five behavioral suites | pending |
| S5 | clack prompter, barrel, `createTuiDeps`, argv dispatch | pending |
| S6 | CLAUDE.md closeout (D0/AC-14) | pending |

## S1 — Pin + install `@clack/prompts`

- approval: `stage_approval` granted by the user for S1–S6 (handoff envelope, batch 1 covers S1–S2).
- preparation: `npm ci` restored the baseline toolchain (node_modules was absent in this environment). Succeeded.
- command: `npm install --save-exact @clack/prompts` — succeeded through the configured proxy (risk-e6f2h1-004 did not materialize).
- **resolved version: `1.7.0` (exact-pinned, no `^`)**.
- changed files:
  - `package.json` — adds `"@clack/prompts": "1.7.0"` to `dependencies` (only change).
  - `package-lock.json` — lockfile entries for `@clack/prompts` and its transitive deps.

### FLAG — resolved version outside the expected 0.10–0.11.x line (risk-e6f2h1-001)

design.md §Resolution 1 expected the current line at 0.10–0.11.x and delegated exact-version confirmation to install time. Registry facts gathered as decision evidence:

- `1.x` is now the **stable** line: ten stable releases `1.0.0 … 1.7.0`; `latest` resolves to `1.7.0`.
- The last `0.x` release is `0.11.0`.
- API surface check against the installed `1.7.0` (ESM import): `select`, `confirm`, `spinner`, `isCancel`, `intro`, `outro` are all exported functions — the design's cancel-as-value mechanism (`isCancel` → `PromptOutcome.cancel`) and the S3–S5 interface plan remain mechanically compatible as far as export presence shows. Behavioral API details (option shapes, spinner start/stop signatures) not yet exercised — that happens in S5.
- Options for the orchestrator: (a) keep `1.7.0` — actively maintained stable line, design rationale for the pin ("prompt libraries move fast pre-1.0") arguably *strengthens* the case for the 1.x stable line; (b) pin `0.11.0` to stay inside the design's stated expectation. Recommendation: (a), recorded as the executor's suggestion only — per the handoff, a major jump needs orchestrator eyes, so no stage past S1 was started.

### S1 quick checks

| Command | Outcome |
|---|---|
| `npm install --save-exact @clack/prompts` | success; resolved `1.7.0` |
| `npm run check` (biome + tsc + depcruise) | clean — no lint/type errors, no dependency violations (98 modules, 232 dependencies cruised) |
| `npm test` (full suite) | **39 files passed, 708 tests passed**, 0 failed |

Note on the baseline count: the handoff states 707 tests / 39 files; the suite at current HEAD (`7b4b17b`) runs **708/39 green** with a working tree containing only the two S1 files above, so the extra test predates this stage — the 707 figure in plan/handoff is one off versus HEAD, not a regression. New effective baseline to protect from S2 onward: **708 tests / 39 files**.

- blockers: none technical; stage held at the version flag per handoff ("do not proceed past a flag silently").
- git: no commits performed (orchestrator owns git operations); working tree carries `package.json` + `package-lock.json` modified.

### S1 flag resolution (post-invocation)

The version flag was resolved before S2 started: **keep `@clack/prompts` 1.7.0** (A-level decision `e6f2h1-D5` in `state.yaml` — the design's 0.10–0.11.x figure was a no-npm-access guess; 1.x is the maintained stable line and every export the mechanism needs is present). S1 is committed; the effective regression baseline from S2 onward is **708 tests / 39 files** (also recorded in D5).

## S2 — Behavior-preserving refactor of `src/main/container.ts`

- approval: `stage_approval` granted for S1–S6 (checkpoint `cp-stage-approval-s1-s6`); this invocation is scoped to S2 only per the orchestrator handoff.
- planned scope (plan.md S2): `src/main/container.ts` only — extract the internal wiring graph (paths → driven adapters → thunks → `loadContext`/`now`); `createCliDeps` becomes a projection. No TUI code, no new exports, `main/cli.ts` untouched.
- actual changed files: `src/main/container.ts` only. Two edits, body of the wiring logic moved verbatim:
  - NEW internal (non-exported) `interface WiringGraphOptions { env?, homeDir? }` — the subset of the surface options the graph consumes; `CliDepsOptions` is structurally assignable to it, so its public shape is untouched.
  - NEW internal (non-exported) `createWiringGraph(options)` — the former `createCliDeps` body, unchanged line for line (paths resolved once, driven adapters, `ensureHomeRoot`, `loadContext`, `now`, the `CliUseCases` thunks, all with their original comments). Returns `{ paths, git, configStore, harnesses, useCases, loadContext, now }`; `runStore`/`processRunner` stay closure-internal (consumed only by thunks). The adapters in the return are the S5 projection surface (`listBranches` needs `git`+`configStore`+`paths.clonesDir`; `listHarnessTypes` needs `harnesses`), per design §Affected Areas (container row).
  - `createCliDeps` is now a six-line projection: `graph.useCases`, `options.io ?? processIo` (io default unchanged and still surface-owned), `graph.loadContext`, `graph.now`, `options.version`, `graph.paths.clonesDir`. Construction order and semantics identical — one graph per call, `sentinelPaths()` still called exactly once (module doc-comment property 1 now held structurally by the single graph builder; the graph doc-comment says so).
- exports of the module after the stage: `CliDepsOptions`, `createCliDeps` — unchanged set (no `createTuiDeps` yet; that is S5 as planned).
- scope/drift/blast-radius: none. No contradiction with design/spec encountered.

### S2 quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npm run check` (biome + tsc + depcruise) | yes | clean — no lint/type errors; no dependency violations (98 modules, 232 dependencies cruised — counts identical to S1) |
| `npm test` (full suite) | yes — the stage's regression net | **39 files passed, 708 tests passed**, 0 failed — exactly the S1 baseline, zero behavioral diff |

- blockers: none.
- git: no commits performed (orchestrator owns git); working tree carries the `container.ts` edit plus this log update.
- QA handoff: recommend `sddl-qa-review` (stage mode) at the orchestrator's batch checkpoint per the approved batching (S1+S2 → commit → summary); the refactor is fully guarded by the untouched 708-test suite, so deferring QA to the batch boundary is low risk.

## Next Action

Batch 1 complete (S1 committed, S2 done in the working tree). Orchestrator: commit S2 per the approved batch protocol, then proceed to `stage_approval`-covered batch 2 (S3: TUI contract + minimal renderer + test doubles; S4: `runTuiFlow` + behavioral suites). The standing offer to amend the completed-run exit-0 decision remains open until S4/S5 land.
