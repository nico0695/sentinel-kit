# Spec

## Routing Digest

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- input: proposal.md (approved), decisions e6h2-D1/D2/D3 (firm)
- spec_status: ready-for-design
- authored_by: orchestrator inline (sddl-spec worker was interrupted by a provider spend limit
  mid-stage before writing any artifact; the orchestrator wrote this spec directly with reduced
  fresh-context isolation, per the SDDL-ORCHESTRATOR "Fallback if Agent tool is unavailable"
  clause, grounding every domain fact in direct reads of `src/core/run/`).

## Purpose

Give `sentinel review <repo> <branch>` a documented, tested exit-code contract so a script or CI
job can branch on the outcome without a TTY. This is PRD use case 6 (scripting) and the seed of
gate mode. `[E6.F1.H1]` deliberately left the seam: `createCli(deps).run(argv)` returns `0` for
any completed invocation regardless of `result.state`, and the `review` command renders
`result.state` without interpreting it. This change is the first code that turns a run's terminal
state — and, when `ok`, its verdict — into a process exit code.

## Domain Grounding (verified, not assumed)

Read directly from `src/core/run/`:

- `TerminalState = "ok" | "ambiguous" | "engine-error" | "timeout" | "validation-failed"`
  (`terminal-state.ts`) — the five and only terminal states (PRD §4.6). No sixth may be added.
- `Verdict = "approve" | "request-changes" | "comment"` (`verdict.ts`).
- `RunReviewResult` (`run-review.ts:192`): `state: TerminalState` is always present; `verdict?:
  Verdict` is **present only when `state === "ok"`** (verdict.ts: "A verdict exists only when the
  run reached the `ok` state; `ambiguous` is precisely the absence of a single distinct one").

The exit code is therefore a **two-axis** function: it reads `state` always, and reads `verdict`
only in the `ok` branch. This is the load-bearing distinction the backlog phrasing
("ok/approve=0, request-changes≠0") collapses; the spec keeps the two axes explicit.

## Firm Decisions Encoded (from state.yaml)

- **e6h2-D1** — the exit-code table (below).
- **e6h2-D2** — the configurable request-changes code is set by a per-invocation flag
  `--changes-exit-code <n>`, default 1; no config-schema key.
- **e6h2-D3** — `--json` / structured machine-readable output is deferred out of this story.

## Scope Boundary

### In scope

- A pure exit-code mapping in the CLI driving adapter: `(TerminalState, Verdict?, changesExitCode)
  → number`.
- The `--changes-exit-code <n>` flag on the `review` command.
- Documentation of the exit codes in the `review` command's `--help`.
- Tests asserting each terminal state, and each verdict within `ok`, maps to its documented code,
  and that the command is usable with no controlling TTY.

### Out of scope (non-goals)

- A sixth terminal state, or folding `Verdict` into the `TerminalState` union — forbidden by PRD §4.
- `--json` or any structured machine-readable output (e6h2-D3).
- A config-schema key for the changes code — `GlobalConfigSchema` is not touched (e6h2-D2).
- Full gate-mode policy (thresholds, per-harness gating, distinct codes per failure state) beyond
  the one configurable code.
- The internal mechanism by which the completed-run exit code reaches `run()`'s return value —
  that is `sddl-design`'s decision (risk-e6h2-002). This spec fixes the observable contract only.
- TUI, result markdown rendering, standalone user docs (`[E6.F2.x]`, `[E7.F2.H1]`).

## The Exit-Code Table (e6h2-D1)

`C` = the resolved changes-exit-code (default 1, from `--changes-exit-code`).

| Terminal state | Verdict | Exit code | Meaning |
|---|---|---|---|
| `ok` | `approve` | 0 | review passed |
| `ok` | `comment` | 0 | comments only, non-blocking — passed |
| `ok` | `request-changes` | `C` (default 1) | the gate: changes requested |
| `ambiguous` | — (none) | 2 | no single distinct verdict could be parsed |
| `engine-error` | — (none) | 2 | the engine failed |
| `timeout` | — (none) | 2 | the engine exceeded its budget |
| `validation-failed` | — (none) | 2 | pre-flight validation rejected the request |

Semantics the table encodes: `0` = the review ran and does not block; `C` = the review ran and
blocks (a script distinguishes "changes requested" from a pass, and from a tool failure); `2` =
the tool could not produce a trustworthy verdict. `0` and `2` are fixed; only the request-changes
row is configurable.

## Acceptance Criteria

**AC-1 — `ok`/`approve` and `ok`/`comment` exit 0.** A completed review with `state: "ok"` and
verdict `approve` or `comment` resolves exit code 0. Tested per verdict.

**AC-2 — `ok`/`request-changes` exits the configured code, default 1.** With no
`--changes-exit-code` flag, exit code is 1. Tested.

**AC-3 — every non-`ok` terminal state exits 2.** `ambiguous`, `engine-error`, `timeout` and
`validation-failed` each resolve exit code 2. Tested per state. No non-`ok` state reads `verdict`.

**AC-4 — `--changes-exit-code <n>` overrides the request-changes code.** A valid `<n>` replaces
the default 1 for the `ok`/`request-changes` row only; it changes no other row (AC-1 and AC-3
codes are unaffected by the flag). Tested with at least one non-default value.

**AC-5 — `--changes-exit-code 0` is a valid soft gate.** `0` is accepted and makes
`ok`/`request-changes` exit 0. Tested.

**AC-6 — `--changes-exit-code` validates its argument.** The value must be an integer in the
range 0–255 (the POSIX exit-status range). A non-integer, negative, or out-of-range value is
rejected as a `commander` usage error — a message on `stderr` and a non-zero exit — before any
review work starts, consistent with how `--timeout` is already parsed (`parseTimeoutMs` in
`review-command.ts`). The review is not run. Tested for at least a non-numeric and an
out-of-range value.

**AC-7 — the mapping is a pure, isolated function.** The terminal-state→code mapping is a pure
function in the CLI adapter (`src/adapters/driving/cli/`), reading only `result.state`,
`result.verdict`, and the resolved changes code. It imports no core internals beyond the exported
`TerminalState`/`Verdict` types, pushes no logic into core, and introduces no new domain state.
The design owns where the function lives and how its result reaches `run()`.

**AC-8 — usable without a TTY (verified, not asserted).** The `review` command produces its exit
code and all output through the injected `CliIo`, with no dependency on `process.stdout.isTTY` or
a controlling terminal. A test drives a completed review through the CLI with captured IO and
asserts both the rendered output and the resolved exit code, demonstrating no TTY is required.

**AC-9 — backward compatibility preserved.** `--version`, `--help`, `commander` usage errors
(unknown command/option, missing argument), and the H1 persistence-failure path keep their
current exit codes. Specifically:
- `--version` / `--help` still exit 0.
- Usage errors still exit with `commander`'s non-zero code.
- The H1 persistence-failure path (`persistRun` throws → render outcome on stdout, diagnostic on
  stderr, rethrow) still resolves a non-zero exit. **When a review completes and its persistence
  fails, the operational failure dominates: the invocation exits via the catch-all (exit 1), not
  via the terminal-state table** — a run whose record could not be written is not a trustworthy
  gate result. Tested: a `request-changes` review whose `persistRun` throws exits 1 (the
  persistence-failure path), not `C`.

**AC-10 — exit codes are documented in `--help`.** The `review` command's `--help` output states
the exit-code contract: 0 = approved or comment-only; the configurable code (default 1) =
changes requested; 2 = the review could not complete (ambiguous / engine-error / timeout /
validation-failed). This is the in-product documentation surface until `[E7.F2.H1]` writes
user-facing docs; full user docs remain out of scope.

## Expected Behavior (illustrative)

```
# approved review
$ sentinel review myrepo feature-x ; echo $?
... verdict: approve ...
0

# changes requested (default gate)
$ sentinel review myrepo feature-x ; echo $?
... verdict: request-changes ...
1

# changes requested, soft gate
$ sentinel review myrepo feature-x --changes-exit-code 0 ; echo $?
... verdict: request-changes ...
0

# changes requested, custom code for a CI job
$ sentinel review myrepo feature-x --changes-exit-code 20 ; echo $?
20

# engine timed out
$ sentinel review myrepo feature-x ; echo $?
... state: timeout ...
2

# invalid flag value — rejected before the review runs
$ sentinel review myrepo feature-x --changes-exit-code 999 ; echo $?
error: option '--changes-exit-code <n>' argument '999' is invalid. expected an integer 0-255
2   # commander usage-error exit code
```

## Open Items For Design

- **risk-e6h2-002 (medium)** — the signalling mechanism. `createCli(deps).run(argv)` returns `0`
  for any completed invocation, and a `commander` action callback cannot return a value to
  `run()`. Design must choose how the completed-run exit code reaches `run()`'s return without
  leaking domain logic into the command: candidates are a typed "review outcome" carrier the
  action throws and `runProgram`'s catch translates, a mutable exit-code channel on `deps`, or a
  small result object the action records. Design decides and justifies against the architecture
  guards. The **observable** contract (this spec's table and ACs) does not depend on the choice.
- Where the pure mapping function lives (a `render/` sibling, a dedicated module) and its exact
  signature — an A-level design detail.
- The precise `--help` wording for AC-10 — an A-level detail bounded by AC-10.

## Traceability

| Backlog acceptance (#37) | Covered by |
|---|---|
| Exit codes documented and tested per terminal state | AC-1..AC-5, AC-10; the table |
| Usable from a script without a TTY | AC-8 |
| Firm decision e6h2-D1 (table) | AC-1, AC-2, AC-3, the table |
| Firm decision e6h2-D2 (flag-only, default 1) | AC-2, AC-4, AC-5, AC-6 |
| Firm decision e6h2-D3 (defer --json) | Non-goals |
