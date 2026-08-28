# Spec

## Routing Digest

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- digest_summary: Fill `src/adapters/driving/tui/` with the guided flow repo → branch (fetch) → harness → confirmation → progress → minimal result, launched by bare `sentinel` on a TTY (D1), pre-run cancel only (D3), library-agnostic until design ratifies the dep (D2), driving existing core use cases only, wired exclusively in `src/main/`.
- scope_digest: IN — TUI adapter + `TuiDeps` seam, entry dispatch in `src/main/`, non-TTY guidance path, empty-state handling, exactly-once persistence, tests without a real TTY, CLAUDE.md refresh as mandatory closeout (D0). OUT — rich result rendering ([E6.F2.H2]), `sentinel open` ([E6.F2.H3]), mid-run abort, new core use cases, CLI behavior changes.
- acceptance_digest: 14 ACs — entry/TTY behavior (AC-1/2), full flow (AC-3), per-step cancel with no side effects (AC-4/5), honest progress (AC-6), minimal result at the H1/H2 boundary (AC-7), exactly-once persistence (AC-8), no stack traces (AC-9), empty states (AC-10), hexagonal guards (AC-11), testability without TTY (AC-12), quality gate (AC-13), CLAUDE.md closeout (AC-14).

## Summary

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- spec_status: formalized, pending checkpoint

Formalizes story **[E6.F2.H1] — TUI navigation flow** (issue #38, backlog E6.F2, PRD §3.1-G). Firm decisions from the proposal checkpoint are encoded, not reopened: **e6f2h1-D0** (CLAUDE.md refresh is the mandatory last step before the PR), **e6f2h1-D1** (bare `sentinel` on a TTY launches the TUI; non-TTY prints guidance), **e6f2h1-D2** (TUI library ratified at design time — this spec is library-agnostic), **e6f2h1-D3** (cancel is pre-run only).

## Scope Boundary

### In Scope

- `src/adapters/driving/tui/`: the guided navigation flow — repo select → branch select (after fetch) → harness select → confirmation summary → progress → minimal result — replacing the `export {}` placeholder.
- A `TuiDeps` injection contract analogous to `CliDeps` (`src/adapters/driving/cli/cli-deps.ts`): bound use-case thunks, line-oriented IO, prompt/interaction seam, clock, `loadContext`, `clonesDir`, and an injected TTY fact — so the adapter never touches `process` and tests need no real TTY.
- Entry dispatch in `src/main/` only: bare `sentinel` on an interactive TTY launches the TUI; everything else reaches the commander CLI unchanged. The TUI and CLI adapters never import each other.
- Binding `listBranches` and harness enumeration (via core `loadHarnesses` over the existing factory+user `HarnessLoader` pair — see resolution A3) in the composition root; extending/reusing `createCliDeps`'s graph is design's call.
- Review execution mirroring the CLI path semantics: `resolveReviewRequest` → `runReview` → `persistRun` (exactly once per completed run) → minimal result.
- Error presentation: typed core errors and unexpected exceptions rendered as friendly one-liners, never raw stack traces.
- Empty-state handling for no repos, no branches, no harnesses.
- The first TUI runtime dependency — added here but **chosen in design** (D2).
- Tests under `src/adapters/driving/tui/__test__/` (adapters vitest project), doubles-based, following the `cli-test-doubles.ts` pattern.
- CLAUDE.md update as the final step before the PR (D0): fix the stale "Current state: pre-implementation" section and document this story's additions (TUI adapter, entry behavior, new dependency).

### Out Of Scope

- Rich result rendering — markdown rendering, highlighted sections/severities, run-path emphasis ([E6.F2.H2]). See the H1/H2 boundary under Expected Behavior.
- `sentinel open` ([E6.F2.H3], optional).
- Mid-run abort (D3): no interactive cancel once the confirmed run starts; the engine timeout bounds the run. No `AbortSignal` widening of `runReview`.
- New core modules, new core use cases, or changes to the five terminal states.
- Any CLI behavior change: `--help`, `--version`, `repo add|list`, `review`, `runs list|show` are untouched (only the no-args/no-TTY dispatch is new surface).

### Non-Goals

- Back-navigation between steps (returning from branch select to repo select). Forward flow + cancel only; revisiting a choice means cancel and relaunch.
- Persisting TUI preferences or "last used" defaults.
- Windows-specific TTY handling beyond what standard Node `isTTY` provides.

## H1/H2 Result Boundary

This story's result step is **minimal and honest**: after the run completes it shows the terminal state (`ok | ambiguous | engine-error | timeout | validation-failed`), the verdict when one exists, and the persisted run directory path. It does NOT render the review markdown, severities, or highlighted sections — that is [E6.F2.H2]'s entire scope. Whether the minimal display reuses a hoisted formatting helper or a deliberate minimal TUI-own rendering is a design decision (adapters must not import each other — risk-e6f2h1-002).

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `sentinel` (no args) on an interactive TTY | TUI flow launches: repo select → branch select → harness select → confirmation → progress → result, without leaving the TUI | D1; PRD §3.1-G; replaces commander's print-help-on-no-command default |
| `sentinel` (no args), stdin or stdout not a TTY | No hang, no crash, no prompt: one friendly guidance line pointing to `sentinel review` (and `--help`), exit code 1 | D1 + resolution A1 |
| `sentinel --help` / `--version` / any subcommand, TTY or not | Identical behavior to today | D1; CLI regression suite stays green |
| Repo step | Lists registered repos via `listRepos`; selecting one advances to branch step | Core `repos` use case |
| Branch step | Fetches then lists branches via `listBranches` (which fronts `GitPort.fetch` + `branches`); a visible activity indicator covers the fetch | `src/core/repos/list-branches.ts` |
| Harness step | Lists available harnesses (factory + user merged) via core `loadHarnesses`; selecting one advances | Resolution A3 |
| Confirmation step | Summary of what will happen — repo, branch, harness, engine (resolved via the same `resolveReviewRequest` cascade as the CLI) — with explicit confirm/cancel | Backlog: "summary of what will happen" |
| Cancel at any prompt (repo, branch, harness, confirmation), incl. the prompt layer's cancel gesture (Esc/Ctrl+C as surfaced by the chosen library) | Friendly cancel line, exit code 0, zero side effects: no worktree created, no engine invoked, no run persisted | D3 |
| Progress step | Single activity indicator (spinner or equivalent) with static phase text while the one awaited `runReview` call runs; no fabricated staged progress; no cancel offered | Resolution A2; D3 |
| Result step (any terminal state) | Terminal state + verdict (when present) + run directory path; flow ends cleanly inside the TUI | H1/H2 boundary above |
| Completed run, any terminal state | `persistRun` called exactly once | Mirrors CLI D1/AC-6 contract (`review-command.ts`) |
| `persistRun` throws | Outcome still shown, friendly diagnostic that no history was written, non-zero exit | Mirrors CLI D13 behavior |
| Typed core error at any step (`RepoNotFoundError`, `BranchListError`, `HarnessError` family, `UnknownEngineError`, config errors...) | One friendly message line, no stack trace, non-zero exit code | Backlog acceptance; CLI catch-all precedent |
| Unexpected exception | Same: friendly one-liner, no stack, non-zero exit | |
| No repos registered | Friendly guidance pointing to `sentinel repo add <alias> <url>`, clean end, exit 0, no side effects | Resolution A4 |
| Repo has zero branches after fetch | Friendly explanatory line naming the repo, clean end, exit 0 | Resolution A4 |
| No harnesses found (factory + user both empty) | Friendly explanatory line (broken/incomplete installation hint), clean end, exit 0 | Resolution A4 |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Bare `sentinel` on an interactive TTY (stdin and stdout both TTYs) launches the TUI flow; `--help`, `--version`, and every existing subcommand behave exactly as before | TUI dispatch test with injected TTY fact = true; full existing CLI suite unchanged and green | must |
| AC-2 | Bare `sentinel` when stdin or stdout is not a TTY prints one guidance line pointing to `sentinel review`, exits with code 1, and never blocks waiting for input | Test with injected TTY fact = false: asserts the line, the code, and that no prompt seam was invoked | must |
| AC-3 | The complete flow repo → branch (with fetch) → harness → confirmation → progress → result runs to completion without leaving the TUI, driving only core use cases (`listRepos`, `listBranches`, `loadHarnesses`, `resolveReviewRequest`, `runReview`, `persistRun`) | Happy-path test with scripted prompt seam + fake use cases; assert invocation order | must |
| AC-4 | Every navigation prompt (repo, branch, harness, confirmation) is cancelable; cancel yields a friendly line, exit code 0, and zero side effects — no worktree, no engine call, no persisted run | One test per step: cancel at that step, assert exit 0 and that `runReview`/`persistRun` were never called | must |
| AC-5 | The confirmation step shows repo, branch, harness, and resolved engine before anything runs; nothing executes without explicit confirmation | Test asserts summary content and that `runReview` is only called after confirm | must |
| AC-6 | The progress step shows an activity indicator with static phase text during the single awaited `runReview` call and does not offer cancel or claim staged progress the core cannot report | Test with a deferred fake `runReview`: indicator active while pending, resolves to result step | must |
| AC-7 | The result step shows exactly: terminal state, verdict when present, and the persisted run directory — no markdown rendering, no severity highlighting (that is [E6.F2.H2]) | Result test per terminal state; review diff confirms no H2 rendering surface | must |
| AC-8 | `persistRun` is called exactly once per completed run whatever the terminal state; if it throws, the outcome is still shown, a friendly no-history diagnostic is emitted, and the exit code is non-zero | Tests: each terminal state persists once; persist-failure test asserts outcome + diagnostic + non-zero exit | must |
| AC-9 | No raw stack trace ever reaches the TUI output: typed core errors and unexpected exceptions render as one friendly message line with a non-zero exit code | Error-injection tests per step; assert output contains no `at ` frames / `error.stack` content | must |
| AC-10 | Empty states are defined and friendly: no repos → guidance to `sentinel repo add`, exit 0; no branches → explanatory line, exit 0; no harnesses → explanatory line, exit 0; all with zero side effects | Three tests with empty fake results | must |
| AC-11 | Hexagonal guards hold: the TUI contains zero domain logic (use cases are the only core API), imports no other adapter and no driven port implementation, and all instantiation/wiring lives in `src/main/` | `npm run check` (depcruise) green; code review confirms no resolution/cascade/persistence logic re-implemented in the TUI | must |
| AC-12 | The TUI is testable without a real TTY: all interaction flows through the injected `TuiDeps` seam (prompt seam, IO, clock, TTY fact), tests live under `src/adapters/driving/tui/__test__/` in the adapters vitest project | `npx vitest run --project adapters` green in a non-TTY CI shell | must |
| AC-13 | Quality gate: `npm run check` and `npm test` pass locally; the pre-existing baseline (707 tests / 39 files) stays green alongside the new TUI tests | Full gate run before the PR | must |
| AC-14 | CLAUDE.md is updated as the final step before opening the PR: the stale "Current state: pre-implementation" section reflects repo reality, and this story's changes (TUI adapter, bare-`sentinel` entry behavior, new runtime dependency) are documented | Diff includes CLAUDE.md; plan schedules it as the explicit closeout stage (D0) | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| risk-e6f2h1-001 (medium, open) | First TUI runtime dependency is unratified; a poor choice affects testability (prompt seam), cancel gesture handling, and bundle weight | Design must compare at least `@clack/prompts` vs `@inquirer/prompts` vs native readline and ratify with justification (D2) |
| risk-e6f2h1-002 (medium, open) | Shared CLI/TUI rendering or error formatting cannot be imported across adapters (`adapters-isolated` guard) | Design decides: duplicate minimal formatting deliberately, or hoist a shared driving-side helper (location choice may be B-level if it adds top-level structure) |
| risk-e6f2h1-003 (medium, narrowed) | Progress/cancel semantics — now bounded by D3 (pre-run cancel only) and A2 (spinner + static text); residual risk is only that the chosen library's cancel gesture must map cleanly to the no-side-effects contract | AC-4/AC-6 make it testable |
| Entry dispatch (new, low) | Bare-`sentinel` dispatch must not disturb commander's help/version/usage-error paths | AC-1's regression requirement covers it; mechanism (pre-parse branch in `src/main/` vs commander default action) is design detail |

## Open Questions And Decisions

### Resolved in this spec (A-level, recorded for the audit history)

| Id | Resolution | Rationale |
|---|---|---|
| e6f2h1-A1 | Non-TTY detail: "interactive" requires stdin AND stdout to be TTYs; otherwise one guidance line pointing to `sentinel review` / `--help`, exit code 1, no prompt ever started. The TTY fact is injected via `TuiDeps` (owned by `src/main/`), never read from `process` inside the adapter | Non-zero exit makes a misconfigured script fail loudly instead of silently doing nothing; injection keeps AC-2 assertable in-process |
| e6f2h1-A2 | Progress shape: a single activity indicator (spinner or equivalent) with static phase text for the one awaited `runReview` call; no staged progress | `runReview` reports nothing mid-flight; anything richer would be fabricated |
| e6f2h1-A3 | Harness enumeration source: the core `loadHarnesses` use case over the existing factory+user `HarnessLoader` pair already wired in `main/container.ts` — the merged map's keys are the selectable harness types | Only real seam that exists; config has no harness list; no new core surface needed. Its `HarnessError`/`SkillNotFoundError` failures fall under AC-9. Exact thunk shape (full map vs names) is design detail |
| e6f2h1-A4 | Empty states: no repos / no branches / no harnesses each end the session with one friendly explanatory line (with actionable guidance where one exists), exit code 0, zero side effects | Informational dead-ends in an interactive surface are not errors; only failures exit non-zero |

### Remaining for design

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| TUI library ratification (D2) | First interactive dependency; drives the prompt seam shape and cancel gesture mapping | implementation | open — design compares and ratifies |
| Shared rendering/error-format placement (risk-e6f2h1-002) | Adapters cannot import each other; affects where the minimal result/error formatting lives | implementation | open — design decides (escalate to B if new top-level structure) |
| Entry dispatch mechanism | Pre-parse TTY branch in `src/main/cli.ts` vs commander integration; must keep AC-1's regression guarantee | implementation | open — design detail, behavior fixed by AC-1/AC-2 |
| Exact `TuiDeps` shape and reuse of `createCliDeps`'s graph | Avoid duplicating the bound use-case wiring in the container | implementation | open — design detail |

## Approval Notes

- Firm user decisions e6f2h1-D0 through D3 are encoded above and were not reopened.
- Four A-level questions left open by the proposal are resolved here (A1–A4) and must be recorded in state/history by the orchestrator with authorship `claude`.
- No new B-level questions emerged; the only potential escalation is the shared-helper location under risk-e6f2h1-002, flagged for design.
- Next stage: `sddl-design` (library ratification, dispatch mechanism, `TuiDeps` shape, rendering placement).

## Budget Notes

- Above the lite word target deliberately: 14 ACs cover three backlog acceptance bullets, four firm decisions, four A-level resolutions, and the H1/H2 boundary — the tables are the contract QA validates against.
