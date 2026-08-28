# QA Report

## Closeout Digest

- change_name: e6-f1-h2-review-exit-codes — `[E6.F1.H2]` (issue #37), review exit codes
- mode: `final`
- verdict: **pass**
- reviewed_commit: `25542bb` on `claude/validar-estado-proyecto-rcvz8c` (clean tree)
- gate: `npm run check` green (biome 145 files, tsc clean, depcruise 98 modules / 232 deps, no violations); `npm test` **705 passed / 39 files** (baseline 681/38, +1 file, +24 net tests) — matches the expected post-change numbers.
- lifecycle: change marked `completed`. Ready for the orchestrator to open the PR (`Closes #37`).
- findings: 1 low (empty/whitespace `--changes-exit-code` coerces to soft-gate 0). Non-blocking; violates no AC.

Independent final QA of the full implemented change against `spec.md`'s 10 ACs, `design.md`, `plan.md`, and the architecture guards. This review re-derived the load-bearing facts from source (`src/core/run/`) rather than trusting the execution log, with extra scrutiny on the three flagged areas (AC-9 ordering under risk-e6h2-004, the empty-string validator edge, and the two-axis table).

## Acceptance Criteria Verification

| AC | Requirement | Evidence | Verdict |
|---|---|---|---|
| AC-1 | `ok`/`approve` and `ok`/`comment` → 0 | `exit-code.test` "returns 0 for ok/approve", "…ok/comment"; `review.test` it.each(approve,comment) → 0 (L432-446) | CONFIRMED |
| AC-2 | `ok`/`request-changes` → default 1 | `exit-code.test` L31-33; `review.test` "exits the default code 1…" (L448-458) | CONFIRMED |
| AC-3 | every non-`ok` state → 2 (per state) | `exit-code.test` it.each(4 states)→2 with two changes-codes; `review.test` it.each(ambiguous, engine-error, timeout, validation-failed)→2 (L460-476). No non-`ok` branch reads verdict. | CONFIRMED row-by-row |
| AC-4 | `--changes-exit-code <n>` overrides only that row | `exit-code.test` custom 20 + "leaves passing/failing rows unaffected"; `review.test` L479-509 (request-changes→20; approve stays 0) | CONFIRMED |
| AC-5 | `--changes-exit-code 0` soft gate | `exit-code.test` L49-51; `review.test` L511-527 (request-changes→0) | CONFIRMED |
| AC-6 | validates argument (integer 0–255, reject before run) | `review.test` non-numeric "soon" (L254-270) + it.each(`-1`,`256`,`1.5`,`300`) (L272-288): each `code !== 0`, nothing persisted, nothing on stdout. `256` rejected, `-1` rejected, `1.5` non-integer rejected. | CONFIRMED |
| AC-7 | pure, isolated mapping, core-type-only import | `exit-code.ts` imports `type { TerminalState, Verdict }` from `core/run/index.js` only; depcruise green; no domain logic, no sixth state | CONFIRMED |
| AC-8 | usable without a TTY | `review.test` "resolves the exit code and full output through the injected io alone" (L530-548) — driven through `createCli` + capturing IO doubles, asserts both output and returned code; no `process`/`isTTY` reference | CONFIRMED |
| AC-9 | backward compat + persistence dominates | `--version`/`--help` exit 0 (`help.test`), usage errors keep commander codes; `review.test` "exits 1, not the changes code, when a request-changes run fails to persist" under `--changes-exit-code 20` → 1 (L551-572) | CONFIRMED |
| AC-10 | exit codes documented in `--help` | `EXIT_CODE_HELP` via `.addHelpText("after", …)`; `help.test` asserts "Exit codes:", `/0\s+the review passed/`, `--changes-exit-code`, `/1\s+changes requested/`, `/2\s+the review could not complete/` (L65-79) | CONFIRMED |

## Extra-Scrutiny Findings (as directed)

**risk-e6h2-004 — AC-9 persistence-dominates ordering (independently re-derived).** In `review-command.ts` the `throw new ReviewExitSignal(...)` (L235) sits on the success path *after* the `persistRun` try-block (L189-220). On a persist failure the catch renders the unpersisted outcome, writes the stderr diagnostic, and `throw error` (L219) — the original error, which reaches `runProgram`'s catch-all (`create-cli.ts` L142) and returns 1. The signal throw is never reached in that case. So a `request-changes` run whose `persistRun` throws exits 1, never `C`. The test at `review.test` L551-572 proves the exit-1 dominance under a custom code of 20. **Ordering is correct.** The two-axis table was re-derived from source: `RunReviewResult.verdict?` is present only on `ok` (`run-review.ts:196`), `TerminalState` has exactly five members (`terminal-state.ts`), `Verdict` is `approve|request-changes|comment` (`verdict.ts`) — the code (`state !== "ok" → 2; else verdict === "request-changes" ? C : 0`) matches exactly.

**ReviewExitSignal is not a domain error.** `create-cli.ts` catches `instanceof ReviewExitSignal` (L127) and returns `error.code` *before* the `CommanderError` branch and before the `io.stderr(formatErrorLine(error))` catch-all — it never reaches `formatErrorLine`. It extends `Error` only to satisfy Biome's throw-only-`Error` rule and mirror `CommanderError`. CONFIRMED.

**Architecture guards.** `exit-code.ts` imports only exported core **types**; no core→adapter, no adapter→adapter, no wiring outside `main/`; no logic pushed to core; five terminal states only. `git show --stat` confirms only the 6 approved source/test files changed — `cli-deps.ts`, `main/container.ts`, and the repos `GlobalConfigSchema` are untouched (e6h2-D2 flag-only, e6h2-D3 no `--json`). Verified by `npm run check` (depcruise, no violations).

## Findings

| # | Severity | Finding |
|---|---|---|
| F1 | low | `parseChangesExitCode` accepts an empty or whitespace-only argument as a silent soft-gate 0. `Number("") === 0` and `Number(" ") === 0` both pass the `Number.isInteger(v) && 0 ≤ v ≤ 255` guard, so `sentinel review repo branch --changes-exit-code ""` (e.g. an unset shell variable: `--changes-exit-code "$UNSET"`) turns a `request-changes` result into exit 0 instead of erroring — the least-safe direction for a gate (block→pass), in exactly the scripting use case this story serves. Same `Number()` quirks also accept `0x10`→16 and `1e2`→100 (both harmless — valid in-range integers). This is a deliberate divergence from `parseTimeoutMs` (which rejects `""`/`0` because `0` is not a valid timeout), documented by the executor; `parseTimeoutMs` shares the same coercion quirks, so this is consistent with the existing codebase pattern. **Non-blocking:** it violates no AC — AC-6 requires only non-numeric and out-of-range rejection, and AC-5 requires `0` to be accepted. A one-line guard (`if (raw.trim() === "") throw new InvalidArgumentError(...)`) would close the footgun without touching AC-5. Recommend as a follow-up nit, not a fix that gates this change. |

No medium or high findings. No architecture-guard violation. No failing gate.

## Validation Evidence

- `npm run check` → biome (145 files, no fixes), `tsc --noEmit` clean, depcruise (98 modules, 232 deps, no violations). All five guards hold.
- `npm test` → 705 passed / 39 files, 0 failures, 0 skips.
- `git show --stat 25542bb` → 6 source/test files + 2 sdd-lite artifacts; no config/wiring/core change.
- Behavioral probe of the validator coercion confirms F1 (`""`, `" "` → 0 accepted).

## Verdict And Next Action

**pass.** All 10 ACs are met with real, non-vacuous assertions; the AC-9 ordering and two-axis table are correct under independent re-derivation; the architecture guards hold; the gate is green at the expected 705/39. The single finding (F1) is a low-severity latent robustness nit that violates no acceptance criterion and does not weaken closeout confidence.

The change is marked `completed`. Next: the orchestrator opens one PR for this story (`[E6.F1.H2] review exit codes`, `Closes #37`) — the orchestrator owns all git/PR side effects; QA does not open it. F1 may be logged as a future hardening nit for `parseChangesExitCode` (and, if desired, `parseTimeoutMs`).
