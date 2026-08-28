# Design

## Routing Digest

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- digest_summary: One new pure module (`exit-code.ts`) in the CLI driving adapter holding the terminal-state→code mapping plus a typed `ReviewExitSignal`; the `review` action computes the code and `throw`s the signal, and `runProgram`'s existing catch translates it to `run()`'s return — the same throw-carries-exit-code shape `commander` already uses two lines up. Core untouched; `CliDeps` untouched.
- affected_areas_digest: NEW `cli/exit-code.ts`; EDIT `cli/commands/review-command.ts`, `cli/create-cli.ts`; tests NEW `__test__/exit-code.test.ts`, EDIT `__test__/review.test.ts`, `__test__/help.test.ts`.
- interfaces_digest: `resolveReviewExitCode(state, verdict, changesExitCode) => number`; `class ReviewExitSignal extends Error { code }`; `--changes-exit-code <n>` flag (default 1, validated 0–255) local to the command.

## Summary

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- design_status: ready-for-plan

## Design Overview

H1 left the seam explicit: `runProgram` returns `0` for any completed `parseAsync`, and a `commander` action callback cannot return a value to `run()`. This design closes it **without a mutable channel and without core changes**, by reusing the mechanism `runProgram` already implements: `commander` signals its own exit code by throwing a `CommanderError` whose `exitCode` the catch returns. The review action does the same — after a successful `persistRun` and render, it computes the code from a pure mapping and `throw`s a typed `ReviewExitSignal(code)`; `runProgram`'s catch gains one `instanceof` branch that returns `error.code`. This is stateless (each run's outcome is fully local, so a program built once and `run()` repeatedly — the test pattern — never leaks a stale code), keeps `CliDeps` an immutable contract, and satisfies AC-9 by ordering: the signal is thrown only *after* persistence succeeds, so a persistence failure throws the original error first and falls through to the catch-all (exit 1), dominating the terminal-state table.

The mapping itself is a pure two-axis function reading only `result.state`, `result.verdict`, and the flag-resolved changes code — no core internals beyond the exported `TerminalState`/`Verdict` types, no new domain state.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driving/cli/exit-code.ts` (NEW) | `resolveReviewExitCode()` pure mapping + `ReviewExitSignal` class. Imports `type { TerminalState, Verdict }` from `core/run` public index only. | low |
| `src/adapters/driving/cli/commands/review-command.ts` | Add `--changes-exit-code <n>` option with `parseChangesExitCode` validator + default 1; add `EXIT_CODE_HELP` via `.addHelpText("after", …)` (AC-10); after render, `throw new ReviewExitSignal(resolveReviewExitCode(...))`; refresh the doc-comment (H1's "nothing reads `result.state`" claim is now H2). | med |
| `src/adapters/driving/cli/create-cli.ts` | `runProgram` catch: `if (error instanceof ReviewExitSignal) return error.code;` before the `CommanderError` branch; refresh module doc-comment point 3. | low |
| `__test__/exit-code.test.ts` (NEW) | Table-driven unit tests of the pure mapping (AC-1..AC-5, AC-7). | low |
| `__test__/review.test.ts` | End-to-end via `createCli` + fakes: each state/verdict→code (AC-1..AC-3), flag override + soft-gate 0 (AC-4/AC-5), invalid flag rejected before `runReview` (AC-6), persistence-failure-dominates on `request-changes` (AC-9), no-TTY demonstration (AC-8). | low |
| `__test__/help.test.ts` | `review --help` states the exit-code contract (AC-10). | low |

Untouched (confirmed): `cli-deps.ts`, `main/container.ts`, `main/cli.ts`, all of `src/core/**`. The flag flows purely locally through `ReviewOptions.changesExitCode`; no new `deps` field is needed (aligns with e6h2-D2, flag-only).

## Interfaces, Data, And State

- **Mapping** — `resolveReviewExitCode(state: TerminalState, verdict: Verdict | undefined, changesExitCode: number): number`. Body: `if (state !== "ok") return 2;` then `return verdict === "request-changes" ? changesExitCode : 0;`. The ternary is inherently defensive — an absent verdict on `ok` (type-impossible per `RunReviewResult`) resolves to `0` (pass), the least-surprising default since `request-changes` is the sole blocking verdict.
- **Signal** — `class ReviewExitSignal extends Error { readonly code: number }`. Extends `Error` to satisfy Biome's throw-only-error rule and to mirror `CommanderError`; it is caught by its own branch and never reaches `formatErrorLine`.
- **Flag** — `.option("--changes-exit-code <n>", "<desc>", parseChangesExitCode, 1)`. `parseChangesExitCode(raw)` mirrors `parseTimeoutMs`: `Number(raw)`, reject with `InvalidArgumentError("expected an integer 0-255")` unless `Number.isInteger(value) && value >= 0 && value <= 255`. Default `1` means `options.changesExitCode` is always a `number`; `ReviewOptions` gains a non-optional `readonly changesExitCode: number`.
- **AC-9 control flow (explicit ordering)** in the action: `runReview` → `try { persistRun } catch { render unpersisted; stderr diag; throw original }` → render outcome → `throw new ReviewExitSignal(resolveReviewExitCode(result.state, result.verdict, options.changesExitCode))`. A `request-changes` run whose `persistRun` throws exits 1 via the catch-all, never reaching the mapping — persistence failure dominates.
- **AC-8** — no new TTY dependency is introduced; output still flows through the injected `CliIo`. The new `review.test.ts` case drives a completed review through `createCli` with the capturing IO doubles and asserts both the rendered lines and `await cli.run(argv)`'s returned code — the demonstration that no controlling terminal is required.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Typed `ReviewExitSignal` thrown by the action, translated by `runProgram`'s catch | **Chosen** | Symmetric with `commander`'s own throw-`exitCode` handled in the same catch; stateless (no per-invocation reset, no cross-`run()` leakage); AC-9 falls out of throw ordering; `CliDeps` stays immutable. Cost: control-flow-by-throw, incl. on exit 0 — contained in one documented, well-named class. |
| Mutable exit-code sink/channel on `deps` | Rejected | Adds mutable state to an otherwise-immutable contract, and the program is built once per `createCli` so the sink would need explicit per-`run()` reset or fresh construction to avoid stale-code leakage across invocations. |
| A result object the action records / a return value from the action | Rejected | `commander` discards an action's return value; a recorded object is the sink approach under another name, with the same reset problem. |
| Mapping under `render/` | Rejected | It is exit-code policy, not a formatter; a dedicated `cli/exit-code.ts` states intent and keeps `render/` about output text. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Defensive value for a (type-impossible) absent verdict on `ok` | Governs one mapping branch | plan | resolved: `0` (pass); alternative `changesExitCode` noted and rejected as more surprising |
| Exact `--help` wording (AC-10) and flag description | In-product doc surface | executor | A-level; bounded by AC-10 (0 = approved/comment; default 1 = changes requested; 2 = could not complete) |

## Approval Notes

- Every architecture guard holds: no core→adapter or adapter→adapter import; `exit-code.ts` imports only the exported `TerminalState`/`Verdict` **types** from `core/run`'s public index; no adapter instantiation added, so `wiring-only-in-main` is untouched; no logic pushed into core and no sixth terminal state.
- Spec gaps found: none material. The spec's AC-9 ordering, AC-6 validation pattern, and AC-7 purity all map cleanly onto this design; risk-e6h2-002 is resolved by the chosen signal mechanism. Recommend `sddl-plan`.

## Budget Notes

- Compact design proportional to a bounded single-command change; the load-bearing decision (signal mechanism) and its AC-9 interaction are stated explicitly for the planner.
