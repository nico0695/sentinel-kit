# Execution Log

- change_name: e6-f2-h1-tui-navigation
- executor: sddl-executor (batch 1: S1–S2 approved for this invocation)
- plan source: `plan.md` (Stage Plan table, authoritative)

## Stage Overview

| Stage Id | Goal (short) | Status |
|---|---|---|
| S1 | Pin + install `@clack/prompts` (exact, no `^`), record resolved version | done (version flag resolved: keep `1.7.0`, decision e6f2h1-D5) |
| S2 | Behavior-preserving refactor of `src/main/container.ts` | done |
| S3 | TUI contract + minimal renderer + test doubles | done |
| S4 | `runTuiFlow`/`createTui` + five behavioral suites | done |
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

## S3 — TUI contract + minimal renderer + test doubles

- approval: `stage_approval` granted for S1–S6 (checkpoint `cp-stage-approval-s1-s6`); this invocation (batch 2) is scoped to S3 then S4.
- precondition check: working tree clean at start (S1/S2 committed), `main/container.ts` carries `createWiringGraph` as the batch-1 handoff describes, `tui/index.ts` still the `export {}` placeholder. No contradiction with plan/design/spec.
- planned scope (plan.md S3): three NEW files, nothing else. Actual changed files match exactly:
  - `src/adapters/driving/tui/tui-deps.ts` (NEW) — the contract: `TuiIo` (declared locally, `CliIo` shape — `adapters-isolated` forbids importing it), `TuiTty`, `PromptOutcome<T>` (cancel-as-value), `TuiSelectOption`, `TuiSpinner`, `TuiPrompter`, `TuiReviewContext`, `TuiUseCases` (quartet + `listBranches` + names-only `listHarnessTypes` per e6f2h1-A3), `TuiDeps { useCases, io, prompter, tty, loadContext, now, clonesDir }`. Type-only imports from core public indexes (`history`, `repos`, `run`).
  - `src/adapters/driving/tui/render.ts` (NEW) — `formatTuiErrorLine` (the design-sanctioned ~10-line deliberate copy of the CLI's `format-error.ts`, comment names the duplication and points at design §Resolution 2) and `formatTuiResult(state, verdict, runDir?)` — state line, verdict line only when present, run-directory line with `-` for the persist-failure path. No markdown, no severities (AC-7/H2 boundary).
  - `src/adapters/driving/tui/__test__/tui-test-doubles.ts` (NEW) — mirrors `cli-test-doubles.ts`: capturing `TuiIo`, `answer`/`cancel` script helpers, `createScriptedPrompter` (queue of `PromptOutcome`s, records every prompt with message+options and spinner start/stop events, throws on script exhaustion), loud `notWired` fake use cases, `createTuiTestDeps` with `tty` defaulting to `{stdin: true, stdout: true}` and an empty prompt script by default (so no-interaction tests prove it structurally).
- A-level notes: `TuiSpinner` named and exported as its own interface (component of `TuiPrompter`; the doubles and S4 tests reference it) — a naming addition inside the designed surface, not a new capability.
- `tui/index.ts` deliberately untouched: the public barrel is S5's scope.

### S3 quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npm run check` (biome + tsc + depcruise) | yes | clean — no lint/type errors; no dependency violations (100 modules, 236 dependencies cruised) |
| `npx vitest run --project adapters` | yes | **18 files passed, 359 tests passed** — unchanged (the doubles file is not a test file), still green |

- blockers: none.
- git: no commits performed (orchestrator owns git).

## S4 — `createTui`/`runTuiFlow` + five behavioral suites

- approval: `stage_approval` granted for S1–S6 (checkpoint `cp-stage-approval-s1-s6`); batch 2, second and last stage of this invocation.
- planned scope (plan.md S4): six NEW files. Actual changed files match exactly:
  - `src/adapters/driving/tui/tui-flow.ts` (NEW) — `createTui(deps): SentinelTui { run(): Promise<number> }`. `run` = TTY gate (AC-2: `!stdin || !stdout` → one `stderr` guidance line naming `sentinel review <repo> <branch> --type <harness>` and `--help`, return 1) then `try { runTuiFlow } catch { stderr(formatTuiErrorLine(e)); return 1 }` (AC-9). `runTuiFlow` (module-internal; the barrel is S5's call and design's barrel row lists `createTui` only) implements design §Interfaces steps 1–8: intro → repo (empty → `repo add` guidance, 0; cancel → 0) → branch (spinner around `listBranches`, stopped before rethrow on failure; empty → line naming the repo, 0; cancel → 0) → harness (names only; empty → broken-installation hint, 0; cancel → 0) → `loadContext` + pure `resolveReviewRequest` BEFORE the gate → summary showing repo/branch/harness/resolved engine (AC-5) → confirm (cancel or `false` → 0) → `now()` + spinner with static text around the single awaited `runReview` (AC-6, D3) → `persistRun` exactly once (AC-8) → `formatTuiResult` lines → **return 0 regardless of terminal state** (recorded A-level design decision, restated in the module doc-comment as property 4).
  - persist-failure path mirrors `review-command.ts` D13: outcome rendered from `request`+`result` with `-` runDir, no-history diagnostic on `stderr`, then the underlying failure via `formatTuiErrorLine` on `stderr`, return 1. A-level micro-decision (recorded): the design's step (7) lists only the diagnostic, but "mirrors review-command.ts D13" is the stated intent and the CLI renders the original failure after its diagnostic — the TUI does the same, as a rendered line instead of a rethrow (the flow returns codes, it has no `ReviewExitSignal` channel).
  - `src/adapters/driving/tui/__test__/flow.test.ts` (NEW) — AC-1 adapter side (injected tty true → flow launches, 3 selects + 1 confirm), AC-3 (use-case order `listRepos → listBranches → listHarnessTypes → loadContext → runReview → persistRun`, options offered, request composed through the CLI's cascade with `repoPath`/`baseRef`/`engineName` resolved), AC-5 (summary content; trace proves confirm strictly precedes `runReview`), AC-6 (fetch spinner before the branch menu; deferred `runReview` — indicator active with static text while pending, `persistRun` untouched until resolution).
  - `__test__/cancel.test.ts` (NEW) — AC-4 ×4 steps via `it.each` + confirm-answered-no + cancel-after-summary (AC-5): each exits 0, friendly line, recording `runReview`/`persistRun` fakes stay empty, `stderr` empty.
  - `__test__/empty-states.test.ts` (NEW) — AC-10 ×3: no repos (guidance to `sentinel repo add`, zero prompts — structural via the empty default script), no branches (line names the repo), no harnesses (broken-installation hint); all exit 0, zero side effects.
  - `__test__/errors.test.ts` (NEW) — AC-2 ×3 TTY combinations (guidance line, exit 1, zero prompts/spinners, resolves — never blocks) and AC-9 per step: `listRepos` (`ConfigReadError`), `listBranches` (`BranchListError`, spinner stopped), `listHarnessTypes` (`HarnessNotFoundError`), resolution before the gate (`RepoNotFoundError` from `resolveReviewRequest`, no confirm ever asked, `runReview` untouched), `runReview` failure (persists nothing, spinner stopped), non-Error throwable, multi-line collapse, and a no-stack-frames sweep over both streams.
  - `__test__/result.test.ts` (NEW) — AC-7 (`formatTuiResult` unit cases; the literal tail of `stdout` IS the minimal block per terminal state — no H2 rendering surface) and AC-8 (persist exactly once for `ok` + all four failed states, request/result identity and `now()`-sourced `startedAtEpochMs` in the persist request; persist-failure: outcome shown with `-` runDir, diagnostic + failure on `stderr`, exit 1, exactly one attempt). Completed+persisted exit-0 asserted for every terminal state.
- structural verification: `grep` over `src/adapters/driving/tui/` — no `@clack` import, no `driving/cli` import, no `commander`, no `process.*` access anywhere in adapter code or tests (doc-comment mentions only). Core reached exclusively through public indexes + the injected thunks; the only core *value* import in the adapter is `resolveReviewRequest` (design property 1).
- scope/drift/blast-radius: none. No contradiction with design/spec encountered.

### S4 mutation-verify (load-bearing behaviors)

| Mutation | Expected net | Result |
|---|---|---|
| Duplicate the `persistRun` call on the success path (breaks persist-once) | AC-8 suites | **8 tests red** (`result.test.ts` ×6, `flow.test.ts` ×2), reverted, suite green again |
| Confirmation gate ignores an answered `false` (`kind === "cancel"` only) | AC-4/AC-5 cancel suite | **1 test red** (`cancel.test.ts` "answering no at the confirmation is the same as cancelling"), reverted, suite green again |

### S4 quick checks

| Command | Planned by plan.md | Outcome |
|---|---|---|
| `npm run check` (biome + tsc + depcruise) | yes | clean — no lint/type errors; no dependency violations (101 modules, 239 dependencies cruised) |
| `npx vitest run --project adapters` | yes | **23 files passed, 400 tests passed** (18/359 before this batch) |
| `npm test` (full suite) | yes (batch-2 handoff requires the full gate at S4) | **44 files passed, 749 tests passed**, 0 failed — the 708/39 baseline intact plus 41 new TUI tests in 5 new files |

- blockers: none.
- git: no commits performed (orchestrator owns git); working tree carries the eight new S3+S4 files plus this log update.
- QA handoff: recommend `sddl-qa-review` (stage mode) at the orchestrator's batch checkpoint — S3+S4 added a whole adapter surface (the batch's blast radius is all-new files, but the flow semantics are the story's core contract and worth structured eyes before S5 wires the real prompter and dispatch).

## Next Action

Batch 2 complete (S3 + S4 done in the working tree, full gate green at 749/44). Orchestrator: commit per the approved batch protocol (optionally after stage-mode QA), then proceed to batch 3 (S5: clack prompter, barrel, `createTuiDeps`, argv dispatch + built non-TTY smoke). The standing offer to amend the completed-run exit-0 decision remains open until S5 lands; S4's tests assert it as designed (completed+persisted → 0).
