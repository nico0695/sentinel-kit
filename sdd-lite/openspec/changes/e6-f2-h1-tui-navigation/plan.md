# Plan

## Execution Digest

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- digest_summary: Six sequential stages implement design.md verbatim: pin+install `@clack/prompts` (S1), behavior-preserving container graph refactor guarded by the full 707-test baseline (S2), TUI contract + minimal renderer + test doubles (S3), `runTuiFlow`/`createTui` with the five behavioral suites discharging AC-2..AC-10/AC-12 (S4), wiring — clack prompter, barrel, `createTuiDeps`, argv-length dispatch in `main/cli.ts` — validated by the full gate plus a built non-TTY smoke (S5), and the mandatory CLAUDE.md refresh as the last pre-PR stage (S6, D0/AC-14). Every stage touches code and requires `stage_approval`.
- stage_plan_digest: S1 dep pin → S2 container refactor → S3 TUI types/render/doubles → S4 flow + suites → S5 wiring + full gate → S6 CLAUDE.md closeout.
- validation_digest: `npm run check` every stage; `npx vitest run --project adapters` for S3–S4; full `npm test` (baseline 707 tests / 39 files green) at S1, S2, S5, S6; built smoke of `--help` parity and the non-TTY guard at S5.

## Summary

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true (pending `stage_approval` per stage)
- plan_status: ready-for-executor

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Install `@clack/prompts` with an **exact pin** (no `^`); confirm and record the resolved version in `execution-log.md` (closes risk-e6f2h1-001) | — | `package.json`, `package-lock.json` | `npm install --save-exact @clack/prompts`; record pinned version; `npm run check` clean; full `npm test` baseline 707/39 green | yes | stage_approval | pending |
| S2 | Behavior-preserving refactor of `main/container.ts`: extract the internal graph (paths → driven adapters → thunks → `loadContext`/`now`); `createCliDeps` becomes a projection. **No TUI code yet** — regressions are caught by the existing suite early | S1 (nominal; see Sequencing) | `src/main/container.ts` only | `npm run check`; full `npm test` — all 707 existing tests green, zero behavioral diff expected | yes | stage_approval | pending |
| S3 | TUI contract and minimal renderer: `tui-deps.ts` (`TuiDeps`, `TuiPrompter`, `PromptOutcome`, `TuiUseCases`, `TuiIo`, `TuiTty`, `TuiSelectOption`, `TuiReviewContext`), `render.ts` (`formatTuiErrorLine` — deliberate ~10-line copy, commented; `formatTuiResult`), scripted test doubles (`createScriptedPrompter`, capturing IO, `notWired` fakes, `createTuiTestDeps`) | S2 | `src/adapters/driving/tui/tui-deps.ts` (NEW), `tui/render.ts` (NEW), `tui/__test__/tui-test-doubles.ts` (NEW) | `npm run check` (types compile; depcruise: type-only imports from core public indexes, no adapter/port-impl imports); `npx vitest run --project adapters` still green | yes | stage_approval | pending |
| S4 | Flow implementation + behavioral suites: `tui-flow.ts` (`createTui` → TTY gate → `runTuiFlow` steps 1–8 per design §Interfaces, catch-all one-liner exit 1, completed+persisted run exit 0, persistRun-once + persist-failure mirroring `review-command.ts` D13) and the five suites `flow.test.ts`, `cancel.test.ts`, `empty-states.test.ts`, `errors.test.ts`, `result.test.ts` | S3 | `src/adapters/driving/tui/tui-flow.ts` (NEW), `tui/__test__/{flow,cancel,empty-states,errors,result}.test.ts` (NEW) | `npx vitest run --project adapters` — new suites green, no real TTY; `npm run check` clean | yes | stage_approval | pending |
| S5 | Wiring and dispatch: `clack-prompter.ts` (ONLY file importing `@clack/prompts`; `isCancel` → `{kind:"cancel"}`), public barrel in `tui/index.ts`, `createTuiDeps` projection in `main/container.ts` (adds `listBranches`, names-only `listHarnessTypes`, prompter, TTY facts), argv-length dispatch in `main/cli.ts` (`process.argv.slice(2).length === 0` → TUI; else commander byte-identical) | S1, S4 | `src/adapters/driving/tui/clack-prompter.ts` (NEW), `tui/index.ts` (EDIT), `src/main/container.ts` (EDIT), `src/main/cli.ts` (EDIT) | `npm run check` (depcruise: clack confined, instantiation only in `src/main/`); **full `npm test`** — CLI regression suite proves AC-1; built smoke: `npm run build`, then `node dist/cli.js --help` / `-V` byte-identical, and `node dist/cli.js` with piped stdin prints one guidance line and exits 1 (real non-TTY guard). Discharges AC-13 first pass | yes | stage_approval | pending |
| S6 | **Mandatory closeout (D0/AC-14), last stage before the PR**: rewrite the stale "Current state: pre-implementation" section of CLAUDE.md to repo reality (toolchain installed, `src/` tree, working CLI, epics E0–E6.F1 landed, commands real) AND document this story: TUI adapter, bare-`sentinel` TTY entry + non-TTY guard, `@clack/prompts` exact-pinned runtime dep, E6.F2 status | S5 | `CLAUDE.md` only | Consistency read against `README.md`, `docs/architecture.md`, `docs/setup-tecnico-sentinel.md` — no stale or contradicted claim survives; English only; `npm run check` + full `npm test` re-confirmed green (final AC-13 evidence) | yes | stage_approval | pending |

## Validation Strategy

- **Every stage**: `npm run check` (biome + tsc + depcruise) — the architecture guards (AC-11) are validated continuously, not once.
- **S2, S5, S6**: full `npm test` — S2 because the container refactor is the highest-regression-risk edit to existing code (existing 707 tests are the net); S5 because the dispatch edit is the only touch on the entry path and the untouched CLI suite is AC-1's proof; S6 as the final AC-13 gate.
- **S3–S4**: targeted `npx vitest run --project adapters` keeps the loop fast; the doubles guarantee no test needs a TTY (AC-12).
- **S5 smoke**: build + run the real binary for the two behaviors unit tests cannot fully own — commander parity and the genuine non-TTY exit-1 guard.
- **AC coverage map**: AC-1 → S5 (+S4 launch path with injected `tty: true`); AC-2..AC-10, AC-12 → S4 (contract from S3); AC-11 → every `check` run + S5 review; AC-13 → S5, re-confirmed S6; AC-14 → S6.

## Dependencies And Sequencing

- Hard chain: S2 → S3 → S4 → S5 → S6; S5 additionally needs S1 (the dep) and S6 must be last (D0).
- Theoretical parallelism (recorded, not exercised): S1 is independent of S2–S4 and only truly gates S5; execution stays strictly sequential — one approved stage per `sddl-executor` invocation.
- Risk-order honesty: the two edits to existing code (`container.ts` S2, `cli.ts` S5) are each pinned to a full-suite run at the moment they land; all-new TUI files sit between them where they cannot break the baseline.

## Planner Stop Note

- Not applicable: objective is `new-feature`, route `continue-lite` — plan feeds `sddl-executor` next.

## Approval Notes

- All six stages touch code (S6 touches CLAUDE.md, a repo-persisted instruction file): each requires explicit `stage_approval` before execution, regardless of `execution_mode: interactive` pacing.
- Standing user offer from the design checkpoint remains visible: the completed-run exit-0 decision may be amended before `stage_approval` of S4/S5.
- The plan excludes PR opening, commits policy, and git workflow — the orchestrator owns session operations; S6 is "last stage before the orchestrator opens the PR", not a PR stage.
- Executor stop rules apply unchanged: contradiction with design/spec, scope drift, or blast-radius expansion → stop, do not improvise.

## Budget Notes

- At the upper lite bound: six code-touching stages, a per-stage validation contract, and a 14-AC coverage map are the minimum the executor needs to run without reinterpretation.

## Fix Round 1

Appended after the 4R review (`review-ledger.md`, fix round 1 of 2). Source findings: **R1-001 (CRITICAL, open)** and **R1-002 (info, same root)**. S1–S6 above are unchanged and remain the record of the executed plan.

### Defect being fixed (from the ledger, verified against sources)

Clack's `spinner().start()` calls `block()` from `@clack/core`, which (a) registers a stdin `keypress` listener whose cancel branch (Ctrl+C `\x03` / Escape — raw mode means no SIGINT is generated) is a bare `process.exit(0)`, and (b) registers five process listeners (`SIGINT`, `SIGTERM`, `exit`, `uncaughtExceptionMonitor`, `unhandledRejection`) whose SIGINT/SIGTERM path only renders "Canceled" and returns. While a spinner is active (branch fetch, or the up-to-10-minute engine run) this orphans the execa engine child, skips `runReview`'s in-process worktree cleanup and `persistRun`, and reports success (R1-001); it also swallows the first externally delivered SIGINT/SIGTERM (R1-002). Clack's `select`/`confirm` are NOT affected — their cancel path resolves to the cancel symbol, which `clack-prompter.ts` already maps to `{ kind: "cancel" }`.

### Mechanism (evaluated against the sources; consistent with design §Interfaces — the `TuiSpinner` seam absorbs the swap)

Replace the clack spinner inside `clack-prompter.ts` with an **owned minimal spinner** fulfilling the existing `TuiSpinner` contract (`start(text)` / `stop(text?)`): a `setInterval`-driven frame loop that writes `\r` + clear-line + frame + text to an injected output sink, and on `stop` clears the line, writes the final text as a plain line, and clears the interval. It never touches stdin (no raw mode, no keypress listeners — Ctrl+C generates a real SIGINT again) and registers **zero** process listeners (no SIGINT/SIGTERM/exit handlers — default signal disposition terminates the foreground process group, engine child included, restoring CLI-parity Ctrl+C semantics: exit 130, no false success). This is the minimal correct in-adapter mechanism: `tui-flow.ts`, `tui-deps.ts`, and the `TuiSpinner` interface are untouched; clack stays confined to `clack-prompter.ts` for the unaffected `select`/`confirm`; the design's "cancel is a value" contract is not involved (spinners never cancel). Alternatives rejected: patching clack's behavior from outside (fragile, still raw-mode), or moving mid-run cancel handling into the flow (out of scope — D3 forbids mid-run abort; the fix restores signal semantics, it does not add features.)

Injection detail: `createClackPrompter` gains an optional `spinnerOutput` sink (shape `{ write(chunk: string): void; isTTY?: boolean }`) defaulting to `process.stdout` — the same default clack itself used, so `src/main/container.ts` needs no edit; tests inject a capturing sink. The file's doc comment is updated: the spinner is now owned and tested (the "declared-untested translation layer" claim shrinks to the clack `select`/`confirm` mapping).

### Stage S7

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S7 | Fix R1-001 (and structurally resolve R1-002): replace the clack spinner with the owned minimal spinner in `clack-prompter.ts` per the mechanism above; add a no-TTY regression suite that is red on the pre-fix code | S5 (fixes code S5 landed) | `src/adapters/driving/tui/clack-prompter.ts` (EDIT — drop the `spinner` import from `@clack/prompts`, add the owned spinner + optional `spinnerOutput` param, refresh doc comment), `src/adapters/driving/tui/__test__/spinner.test.ts` (NEW) | `npm run check` clean; **full `npm test`** — baseline 749/44 green plus the new spinner tests; **mutation-verify**: temporarily restoring the clack `spinner()` call (or removing the fix) turns the new listener-count assertions red, then revert — recorded in `execution-log.md` | yes | stage_approval — **granted by the user at the `review_gate`** (recorded here; the executor still confirms scope before running) | pending |

### Regression tests (`spinner.test.ts` — adapters project, no TTY, per house `__test__/*.test.ts` convention)

1. **No process signal/lifecycle listeners** (the pre-fix-red proof): capture `process.listenerCount()` for `SIGINT`, `SIGTERM`, `exit`, `uncaughtExceptionMonitor`, `unhandledRejection` before `createClackPrompter().spinner().start(...)`; assert all five are unchanged while the spinner runs and after `stop()`. Pre-fix, clack registers all five unconditionally — red without the fix even in a non-TTY test process.
2. **No stdin involvement**: assert `process.stdin.listenerCount("keypress")` (and `"data"`) unchanged across start/stop. Pre-fix, `block()` registers a `keypress` listener regardless of TTY — also red pre-fix. (A `setRawMode` spy is deliberately NOT the proof: `block()` guards it with `isTTY`, so it would be green pre-fix in CI.)
3. **Rendering contract**: with an injected capturing sink — frames are written after `start`, `stop("done")` writes the final text, and nothing is written after `stop` (interval cleared; no timer leak).

### Finding dispositions

- **R1-001** → fixed by S7: no raw mode and no keypress handler means Ctrl+C is a real terminal SIGINT again, killing the foreground process group (parent + engine child, exit 130) exactly like the CLI path; no `process.exit(0)`, no orphaned engine, no false success.
- **R1-002** → resolved structurally by the same fix: the owned spinner registers no SIGINT/SIGTERM handlers, so the first externally delivered termination signal takes the default disposition and terminates the process instead of being swallowed. Recorded as a conscious disposition, not a separate stage.

### Validation strategy (S7)

- `npm run check` — biome + tsc + depcruise (clack-confinement and instantiation guards must stay green with the reduced clack import).
- Full `npm test` — 749/44 baseline intact plus the new `spinner.test.ts` assertions green.
- Mutation-verify (executed and logged, then reverted): re-introducing clack's `spinner()` in the prompter makes tests 1–2 red, proving the suite guards the fix.
- After S7: scoped re-review of the fix delta per the ledger's fix-round protocol (orchestrator-owned, not a plan stage).
