# Proposal

## Routing Digest

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- digest_summary: Second story of E6 (issue #37). Give `sentinel review <repo> <branch>` a documented, tested exit-code contract so it is usable from a script without a TTY — the "gate mode" seed of PRD use case 6. H1 (#36, merged PR #73) deliberately left this seam: `createCli.run()` returns `0` for any completed invocation regardless of `result.state`, and the `review` command renders `result.state` without interpreting it. This story is the first code that turns a run's terminal state (and, when `ok`, its verdict) into a process exit code.
- feasibility_signal: high mechanically — the seam is small, explicit, already documented in code, and every domain value it reads (`TerminalState`, `Verdict`) exists and is stable. Overall medium: three design tensions are open (how state × verdict maps to codes, whether `--json` is in scope, and the mechanism a completed-but-non-approving run uses to signal non-zero through commander), and one of them touches public UX and config.
- scope_sketch_digest: IN = an exit-code mapping in the CLI adapter (terminal state → code, and within `ok`, verdict → code), a configurable non-zero "changes requested" code, documented + tested per terminal state, no-TTY confirmation. OUT = a new domain terminal state (forbidden by PRD §4), full gate-mode policy/config surface beyond the one code, TUI, user docs (`[E7.F2.H1]`).

## Summary

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (four open questions, three material)
- exploration_performed: true

## Problem And Desired Outcome

After `[E6.F1.H1]`, `sentinel review` runs end to end but every completed invocation exits `0` — `createCli.run()` returns `0` on success regardless of `result.state`, and the `review` command's header comment states plainly that "nothing reads `result.state` to decide an exit code (AC-12) … the terminal-state → exit-code mapping is `[E6.F1.H2]`'s (#37)". So a CI job or shell script cannot tell an approved review from one that requested changes, errored, or timed out. That is the whole point of PRD use case 6 (scripting) and the seed of gate mode.

Desired outcome: `sentinel review` returns a documented, tested exit code that a script can branch on without a TTY — approval succeeds (`0`), changes-requested fails with a configurable non-zero code, and engine-error / timeout / validation-failed fail with a non-zero code. The mapping must be honest about the domain: the exit code is a function of the run's `TerminalState` and, only when that state is `ok`, of the parsed `Verdict`.

## Initial Scope Sketch

### Likely In Scope

- **An exit-code mapping in the CLI adapter** — a pure function from `(TerminalState, Verdict?)` to a process exit code, owned by the driving CLI (the mapping is an adapter concern; the states and verdict are core domain values). The five terminal states are `ok | ambiguous | engine-error | timeout | validation-failed` (PRD §4); `Verdict` is `approve | request-changes | comment`, and it exists only inside an `ok` result.
- **A configurable "changes requested" exit code** — the backlog's "request-changes≠0 configurable". Whether "configurable" is a flag, a config key, or both is an open question.
- **The signalling mechanism** — the plumbing by which the `review` command, whose commander action callback cannot easily return a value, makes `createCli.run()` resolve a non-zero code for a completed-but-non-approving run.
- **Documentation and tests of the exit codes per terminal state** — the story's first acceptance criterion; tests assert each state/verdict maps to its documented code.
- **No-TTY usability confirmation** — verify (not assert) that nothing in the review path assumes a TTY; the CLI already routes all output through the injected `CliIo`, so this is likely already true and needs a test, not new code.

### Likely Out Of Scope

- Inventing a sixth terminal state or moving the verdict into the terminal-state union — forbidden by the PRD §4 domain contract.
- Full gate-mode policy (threshold rules, per-harness gating, machine-readable gate reports) beyond the one configurable code — this story is the *seed*, not the feature.
- Changing what H1 already ships for the persistence-failure path (render outcome, stderr diagnostic, rethrow → exit 1); H2 must stay consistent with it, not redesign it.
- TUI (`[E6.F2.H1]`), result markdown rendering (`[E6.F2.H2]`), user docs (`[E7.F2.H1]`).

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Seam is explicit and small | `createCli.run()` and `review-command.ts` both document the exact boundary H2 fills; no core change required. | high |
| Domain values are stable | `TerminalState` (5 values) and `Verdict` (3 values) are exported from `core/run` and the `review` command already receives `result.state` / `result.verdict`. | high |
| No new dependency | The mapping is pure adapter logic; no new runtime dep expected. | high |
| Design tensions open | State × verdict mapping, `--json` scope, and the commander signalling mechanism each have real alternatives with trade-offs. | medium |
| No-TTY claim unverified | Output flows through injected `CliIo`; the review path appears TTY-free, but this is an assertion to test, not a proven fact. | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Exit-code table: how the 5 terminal states map to codes, and within `ok` how `approve`→0 vs `request-changes`→non-zero; what the default non-zero is; whether `comment` is a pass. | This is the story's central contract and its first acceptance criterion; it must resolve the state-vs-verdict two-axis tension precisely. | open (spec/design) |
| Is "configurable" a flag (`--fail-on`/`--changes-exit-code`), a config key, or both? | Affects public CLI surface and config schema — a B-level UX decision. | open (spec/design) |
| Is `--json` (machine-readable output) in scope for H2 or deferred again? H1 explicitly deferred it here. | Scripting use case may want structured output; scope call affects the story's size. | open (spec) |
| Signalling mechanism: typed gate signal caught by `createCli`, a mutable exit-code channel on `deps`, or another route — given the commander action callback can't return a value. | Determines the adapter's internal shape and must not leak domain logic into the command (PRD §4). | open (design) |

## Approval Notes

- Route `continue-lite` is appropriate: bounded change extending one existing command plus a pure mapping; no new core module, no new domain state.
- The proposal deliberately does **not** pick the exit-code numbers, the config mechanism, or the signalling approach — those are the spec's and design's to resolve. Spec must treat the state × verdict two-axis mapping as the load-bearing decision and must not collapse it into a single "verdict" axis as the backlog phrasing loosely does.
- No prior artifacts exist for this change; this is its first stage.

## Budget Notes

- Lightweight idea consolidation before formal spec; picks no design.
