# Design

## Routing Digest

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- digest_summary: The TUI is a second driving adapter built on the CLI's proven pattern: a `TuiDeps` contract (bound use-case thunks + line IO + an injected prompter + an injected TTY fact), a single sequential flow function `runTuiFlow` implementing repo → branch → harness → confirmation → progress → result with early returns for cancel/empty/error, a clack-backed prompter as the only file touching the ratified library, and dispatch in `src/main/cli.ts` by argv length (zero user args → TUI surface, anything else → commander unchanged). Library ratified: **`@clack/prompts`** (D2). Shared rendering resolved: **TUI owns its minimal renderer** — a driving-side shared folder is illegal under `adapters-isolated` as written.
- affected_areas_digest: NEW `tui/tui-deps.ts`, `tui/clack-prompter.ts`, `tui/tui-flow.ts`, `tui/render.ts`, `tui/__test__/*`; EDIT `tui/index.ts` (barrel), `main/container.ts` (shared graph + `createTuiDeps`), `main/cli.ts` (dispatch), `package.json` (one new dep), `CLAUDE.md` (D0 closeout).
- interfaces_digest: `TuiDeps { useCases, io, prompter, tty, loadContext, now, clonesDir }`; `TuiPrompter { select, confirm, spinner }` returning `PromptOutcome<T> = answer | cancel`; `createTui(deps) => { run(): Promise<number> }`; `TuiUseCases` adds `listBranches` and `listHarnessTypes` to the review quartet.

## Summary

- change_name: e6-f2-h1-tui-navigation
- objective: new-feature
- route: continue-lite
- design_status: ready-for-plan (both mandatory open items resolved below)

## Design Overview

The TUI repeats the move that made the CLI testable: **the adapter never sees an adapter, a port, a path, or `process`**. Everything arrives through `TuiDeps`, and the one genuinely new seam — interactive prompts — is abstracted behind a `TuiPrompter` interface the adapter defines and `src/main/` fulfils with a clack-backed implementation. Tests therefore inject a *scripted* prompter (a queue of pre-decided answers/cancels) and never need a TTY, keypress emulation, or the library at all (AC-12); the library is confined to one translation file, exactly as `commander` is confined to the CLI adapter.

The flow is one sequential async function, not an event machine: six steps, each returning early on cancel (exit 0), empty state (exit 0), or error (throw → one friendly line, exit 1). Sequential-with-early-return is sufficient because the spec forbids back-navigation (Non-Goals) and mid-run abort (D3) — there are no transitions a state machine would earn its complexity with.

Cancel handling maps clack's cancel-symbol convention into a typed `PromptOutcome` at the prompter boundary, so the flow tests pattern-match `{ kind: "cancel" }` instead of a library symbol. Every prompt sits **before** `runReview`; `resolveReviewRequest` (pure) and `loadContext` (read-only) run before the confirmation gate so the summary can show the effective engine, and cancelling after seeing the summary still has zero side effects (AC-4/AC-5).

Entry dispatch lives in `src/main/cli.ts` and is deliberately dumb: `process.argv.slice(2).length === 0` selects the TUI surface; anything else — `--help`, `-V`, every subcommand, every usage error — takes the existing `createCli` path byte-for-byte unchanged (AC-1). The TTY decision itself (AC-2) lives *inside* `tui.run()` reading the injected `deps.tty` fact, so it is asserted in-process; the untestable sliver in `main/cli.ts` shrinks to one argv-length comparison, the same triviality the entry script already carries. The TUI never enters commander, so `ReviewExitSignal`/`runProgram` are untouched; `tui.run()` returns its exit code and `main/cli.ts` assigns it to `process.exitCode` as today.

### Resolution 1 (risk-e6f2h1-001 / D2): TUI library — ratify `@clack/prompts`

| Criterion | `@clack/prompts` | `@inquirer/prompts` | `node:readline/promises` |
|---|---|---|---|
| Per-step cancel (AC-4) | Best: Ctrl+C/Esc resolve to a cancel *value* (`isCancel`) — no exception control flow, maps 1:1 to `PromptOutcome.cancel` | SIGINT **throws** `ExitPromptError`; Esc not standard; try/catch per prompt | Hand-rolled raw-mode keypress handling |
| Spinner (AC-6) | Built in | Not included — second dep (e.g. `ora`) | None — hand-rolled |
| Select menu | Built in | Built in | **Hand-rolled** arrow-key menu: real terminal code we would own, test, and debug |
| Testability (AC-12) | Neutral — our `TuiPrompter` seam hides any choice; clack additionally accepts injected input/output streams if a contract test is ever wanted | Neutral (same seam); stream injection also supported | Neutral seam, but the hand-rolled widgets themselves would need TTY-emulating tests |
| ESM + Node >= 22 | ESM-native, fits `"type": "module"` | Fine (dual) | Native |
| Weight / maintenance | Tiny (`@clack/core` + `picocolors` + `sisteransi`), actively maintained | Modular v7+ is reasonable but a larger tree, plus the spinner dep | Zero deps, maximal owned code |

**Ratified: `@clack/prompts`** — the only candidate covering select + cancel-as-value + spinner in one small, actively maintained, ESM-native package; it is also the setup doc §4 recommendation, now re-evaluated per its own rule. Native readline is rejected because building select menus and spinners is exactly the undifferentiated terminal plumbing a 44-story MVP should not own; inquirer is rejected on cancel-by-exception ergonomics plus the extra spinner dependency. **Version: pin exact, no `^`** (house precedent: dec-011 pins for tooling reasons; here the pin is because prompt libraries move fast pre-1.0). Documented knowledge puts the current line at **0.10–0.11.x**; this repo has no npm network access at design time, so the **executor confirms and records the exact latest 0.x version at install time**. `picocolors` is NOT added in this story: clack styles its own widgets, the minimal result step needs no colour, and [E6.F2.H2] (rich rendering) is where a colour dep would earn its place — one new runtime dependency, not two, narrows risk-e6f2h1-001.

### Resolution 2 (risk-e6f2h1-002): shared rendering — the TUI owns its minimal renderer

`.dependency-cruiser.cjs` `adapters-isolated` reads: from `^src/adapters/([^/]+)/([^/]+)/` to `^src/adapters/`, allowing only `^src/adapters/$1/$2/`. That forbids **all** cross-folder imports under `src/adapters/` — driving→driving included. A `src/adapters/driving/shared/` helper is therefore **illegal as the guard stands**: `cli/**` importing `driving/shared/**` violates the rule exactly as importing `tui/**` would. The legal options are (a) relax the guard for a shared driving folder, or (b) duplicate. **Chosen: (b) — the TUI owns its own minimal renderer** in `tui/render.ts`. The duplicated surface is honestly tiny and mostly *not* duplication: the CLI's `format-review.ts` emits a machine-parsable `key\tvalue` block and its H1/H2 boundary here is three human-facing lines (state, verdict-when-present, run directory) — a different rendering for a different medium, which H2 will rewrite anyway. The only true copy is the ~10-line reduce-any-throwable-to-one-line logic of `format-error.ts`, re-stated as `formatTuiErrorLine` with a comment naming the deliberate duplication. Editing a PRD §4.5 guard (B-level, structural) to save ten lines is disproportionate and weakens the extraction guarantee's simplest reading; revisit only if H2 materially grows the overlap.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driving/tui/tui-deps.ts` (NEW) | The contract: `TuiIo` (stdout/stderr line writers — same shape as `CliIo`, declared locally; adapters share only core types), `TuiTty { stdin, stdout: boolean }`, `PromptOutcome<T>`, `TuiSelectOption`, `TuiPrompter`, `TuiUseCases`, `TuiReviewContext { config: GlobalConfig; repos: RepoRegistry }`, `TuiDeps`. Type-only imports from core public indexes. | low |
| `src/adapters/driving/tui/clack-prompter.ts` (NEW) | `createClackPrompter(): TuiPrompter` — the ONLY file importing `@clack/prompts`. Maps `isCancel(x)` → `{ kind: "cancel" }`, answers → `{ kind: "answer", value }`, wraps `spinner()`. Thin declared-untested translation layer, like `processIo` in the container. | low |
| `src/adapters/driving/tui/tui-flow.ts` (NEW) | `createTui(deps): { run(): Promise<number> }`. `run` = TTY gate (AC-2, guidance + return 1) then `try { runTuiFlow } catch { stderr(formatTuiErrorLine(e)); return 1 }` (AC-9). Flow steps in §Interfaces. | med |
| `src/adapters/driving/tui/render.ts` (NEW) | `formatTuiErrorLine` (deliberate copy, see Resolution 2) + `formatTuiResult(state, verdict, runDir?)` → the three-line minimal result; `-` for absent runDir (persist-failure path). No markdown, no severities (AC-7). | low |
| `src/adapters/driving/tui/index.ts` (EDIT) | Replace `export {}` placeholder with the public barrel: `createTui`, `createClackPrompter`, and the `TuiDeps` family of types. | low |
| `src/main/container.ts` (EDIT) | Extract the existing body into an internal graph builder (paths → driven adapters → thunks → `loadContext`/`now`); `createCliDeps` becomes a projection of it, `createTuiDeps(options)` (NEW export) projects the TUI view: quartet + `listBranches` (git, configStore, `paths.clonesDir`) + `listHarnessTypes` (keys of `loadHarnesses({factory, user})`), plus `prompter: createClackPrompter()`, `tty` from `process.std{in,out}.isTTY === true`, io, `loadContext`, `now`, `clonesDir`. One process builds one surface's deps, so nothing is constructed twice. | med |
| `src/main/cli.ts` (EDIT) | Dispatch: `process.argv.slice(2).length === 0` → `createTui(createTuiDeps({...})).run()`; else the existing `createCli(...).run(process.argv)`. Exit code assignment unchanged. | low |
| `src/adapters/driving/tui/__test__/tui-test-doubles.ts` (NEW) | Capturing `TuiIo`; `createScriptedPrompter(script)` — a queue of `PromptOutcome`s that records every prompt (message + options) and throws on exhaustion; fake `TuiUseCases` defaulting to loud `notWired`; `createTuiTestDeps(overrides)` with `tty` defaulting to `{stdin:true, stdout:true}`. Mirrors `cli-test-doubles.ts`. | low |
| `src/adapters/driving/tui/__test__/` suites (NEW) | `flow.test.ts` (AC-1 launch/AC-3 happy path + invocation order, AC-5 gate, AC-6 deferred-runReview spinner), `cancel.test.ts` (AC-4 ×4 steps), `empty-states.test.ts` (AC-10 ×3), `errors.test.ts` (AC-9 per step + non-TTY AC-2), `result.test.ts` (AC-7 per terminal state, AC-8 persist-once + persist-failure). Adapters vitest project picks `src/adapters/**/__test__/**` up automatically. | low |
| `package.json` (EDIT) | Add `@clack/prompts` (exact pin, executor confirms version). | low |
| `CLAUDE.md` (EDIT, last pre-PR step) | D0/AC-14: fix stale "pre-implementation" section; document TUI adapter, bare-`sentinel` entry, new dep. Scheduled by plan as the explicit closeout stage. | low |

Untouched (confirmed): all of `src/core/**`, `src/adapters/driving/cli/**`, `src/adapters/driven/**`, `.dependency-cruiser.cjs`, `exit-code.ts`/`ReviewExitSignal`.

## Interfaces, Data, And State

- **`TuiPrompter`** — `select(input: { message: string; options: readonly TuiSelectOption[] }): Promise<PromptOutcome<string>>`; `confirm(input: { message: string }): Promise<PromptOutcome<boolean>>`; `spinner(): { start(text: string): void; stop(text?: string): void }`. `PromptOutcome<T> = { kind: "answer"; value: T } | { kind: "cancel" }` — cancel is a value, never an exception, so the flow's cancel branches are plain `if`s and AC-4's zero-side-effects claim is a visible early `return 0`.
- **`TuiUseCases`** — `listRepos`, `listBranches(request: ListBranchesRequest)`, `listHarnessTypes(): Promise<readonly string[]>`, `runReview`, `persistRun`. The harness thunk returns **names only** (the merged map's keys, the A3 seam): the TUI selects a type string for `resolveReviewRequest` and has no use for `ResolvedHarness` internals — narrower seam, less core surface in the adapter (spec left the thunk shape to design).
- **Flow (`runTuiFlow`)** — (1) intro line via `io.stdout`; (2) `listRepos` → empty: `repo add` guidance, return 0; select repo (cancel→0). (3) spinner around `listBranches({ alias })` — the fetch's visible activity indicator; empty: line naming the repo, return 0; select branch (cancel→0). (4) `listHarnessTypes` → empty: broken-installation hint, return 0; select harness (cancel→0). (5) `loadContext()` then `request = resolveReviewRequest({ repoAlias, targetRef, repos, config, clonesDir, flags: { harnessType } })` — pure, surfaces `UnknownEngineError`/config errors before anything runs; confirmation summary shows repo, branch, harness, `request.engineName` (AC-5); confirm (cancel/no→0). (6) `startedAtEpochMs = now()`; spinner + static text around the single awaited `runReview(request)` (AC-6). (7) `try { persisted = persistRun({ repoName: alias, startedAtEpochMs, request, result }) }` — exactly once (AC-8); on throw: render minimal result from `request`+`result` with `-` for runDir, `io.stderr` no-history diagnostic, return 1 (mirrors `review-command.ts` D13). (8) result lines via `formatTuiResult(record.state, record.verdict, runDir)`; return **0**.
- **Exit code of a completed run = 0 regardless of terminal state** (A-level, recorded): gate semantics (`resolveReviewExitCode`, `--changes-exit-code`) are the CLI's scripting contract; the non-TTY guard guarantees no script consumes the TUI's exit code, and importing or duplicating the CLI exit table would recreate risk-002 for a consumer that cannot exist. Non-zero TUI exits mean *failures*: thrown errors (1) and the non-TTY guard (1).
- **AC-2 in-process** — `run()` checks `deps.tty.stdin && deps.tty.stdout` before any prompt; false → one guidance line naming `sentinel review <repo> <branch> --type <harness>` and `--help`, return 1. Test asserts line, code, and that the scripted prompter recorded zero prompts.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| `@clack/prompts` behind an owned `TuiPrompter` seam | **Chosen** | Matrix above; the seam makes the library swappable and the tests library-free |
| `@inquirer/prompts` / native readline | Rejected | Cancel-by-exception + second spinner dep / hand-rolled select+spinner terminal code |
| TUI-owned minimal renderer (honest duplication) | **Chosen** | `adapters-isolated` forbids driving→driving imports as written; the overlap is ~10 lines + a medium-specific result block H2 rewrites anyway |
| `src/adapters/driving/shared/` + guard edit | Rejected | Illegal under the current rule; editing a PRD §4.5 guard for this overlap is disproportionate (would be B-level) |
| Hoist shared formatting into core | Rejected | Presentation in the extractable core is the wrong altitude; nothing domain about it |
| argv-length dispatch in `main/cli.ts` | **Chosen** | Every existing invocation carries args, so commander's surface is untouched by construction (AC-1); TTY logic stays in the testable adapter |
| commander default action launching the TUI | Rejected | Entangles the two driving adapters through main-injected callbacks and risks commander's no-command help/usage-error paths — exactly what AC-1 freezes |
| Sequential flow function | **Chosen** over a step state machine | No back-navigation (Non-Goals) and no mid-run abort (D3) leaves nothing for a machine to model |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Exact `@clack/prompts` version to pin | First TUI dep (risk-001) | executor install step | resolved-at-install: known 0.10–0.11.x line; no npm access at design time — executor records the exact version in the execution log |
| Completed-run exit code in the TUI | Surface contract | plan | resolved (A-level): 0, rationale in §Interfaces |
| Exact prompt/guidance wording | UX copy, bounded by spec's Expected Behavior table | executor | A-level at execution; tests assert substance (command names, state, runDir), not full strings |

## Approval Notes

- Both mandatory resolutions closed: **D2 ratified `@clack/prompts` (exact pin, one dep only — no picocolors)**; **risk-002 resolved as TUI-owned minimal rendering after verifying `adapters-isolated` forbids driving→driving imports** — no guard edit, no new top-level structure, so no B-level escalation is needed.
- Guards audit: TUI imports core public indexes + `@clack/prompts` only; no adapter→adapter import; all instantiation (`createClackPrompter`, driven adapters, TTY facts) in `src/main/` (AC-11); no cascade/persistence logic re-implemented (resolution and engine choice stay in `resolveReviewRequest`/container); five terminal states untouched.
- risk-e6f2h1-003 narrowed to closed: clack's cancel-as-value maps mechanically to the no-side-effects contract.
- Recommend `sddl-plan`; the plan must schedule the CLAUDE.md refresh as the explicit final pre-PR stage (D0/AC-14).

## Budget Notes

- Above the lite target deliberately, mirroring the spec: two ratifications with recorded justification plus a 14-AC mechanism map are this stage's entire mandate; tables carry the weight.
