# Execution Log

Change: `e6-f1-h2-review-exit-codes` — `[E6.F1.H2]` (issue #37), review exit codes.

## Stage Overview

| Stage | Goal | Status | Quick check |
|---|---|---|---|
| S1 | Pure exit-code mapping + unit table | completed | `vitest -t resolveReviewExitCode` + `npm run check` green |
| S2 | `--changes-exit-code` flag + validator | completed | `vitest -t review` + `npm run check` green |
| S3 | `ReviewExitSignal` + wiring + e2e cases | completed | `vitest -t review` + `npm run check` green; two mutations killed |
| S4 | `--help` exit-code contract | completed | `vitest -t help` + `npm run check` green |
| S5 | Final validation gate | completed | `npm run check` + `npm test` → 705 passed / 39 files |

Approval reference: user granted a single `stage_approval` to execute S1–S4 together, then the S5 final gate, in one pass (dependency order S1 → S2 → S3 → S4 → S5).

## S1 — Pure exit-code mapping

- NEW `src/adapters/driving/cli/exit-code.ts`: `resolveReviewExitCode(state, verdict, changesExitCode)` — `state !== "ok" → 2`; else `verdict === "request-changes" ? changesExitCode : 0` (defensive absent-verdict on `ok` → 0). Imports only `type { TerminalState, Verdict }` from `../../../core/run/index.js` (public index, type-only).
- NEW `src/adapters/driving/cli/__test__/exit-code.test.ts`: full table — every state, every verdict-within-`ok`, a custom changes code (20), the soft-gate 0, and the defensive absent-verdict case.
- Quick check: `npx vitest run --project adapters -t "resolveReviewExitCode"` → 11 passed. `npm run check` green — depcruise confirms the core-type-only import raises no guard (98 modules, no violations).
- No wiring in this stage; a pure leaf.

## S2 — `--changes-exit-code` flag + validator

- EDIT `commands/review-command.ts`: added `parseChangesExitCode` (integer 0–255 else `InvalidArgumentError("expected an integer 0-255")`, mirroring `parseTimeoutMs`), the `.option("--changes-exit-code <n>", …, parseChangesExitCode, 1)` (default 1), and a non-optional `readonly changesExitCode: number` on `ReviewOptions` (default means it is always present, so it does not use the `toFlags` absent-key pattern).
- EDIT `__test__/review.test.ts`: AC-6 — a non-numeric value and out-of-range values (`-1`, `256`, `1.5`, `300`) are rejected as a usage error before `runReview`, with nothing persisted and nothing on stdout.
- Correction during S2: the initial reject-list included `""`, but `Number("") === 0` is a valid soft-gate value, so `""` is correctly accepted (not rejected). Replaced with `300`. This is exactly the divergence from `parseTimeoutMs`, where `""`/`0` are rejected because `0` is not a valid timeout — here `0` is a valid soft gate (AC-5).
- Quick check: `npx vitest run --project adapters -t "review"` → 44 passed. `npm run check` green. Old exit-code behavior still intact at this stage (no wiring yet).

## S3 — `ReviewExitSignal` + wiring + e2e outcomes

- EDIT `exit-code.ts`: added `class ReviewExitSignal extends Error { readonly code }` — an adapter control-signal (not a domain error), documented as caught by its own branch and never reaching `formatErrorLine`.
- EDIT `create-cli.ts`: `runProgram`'s catch gained `if (error instanceof ReviewExitSignal) return error.code;` placed BEFORE the `CommanderError` branch and the generic catch-all; refreshed module doc-comment point 3.
- EDIT `commands/review-command.ts`: after the successful `persistRun` + render, `throw new ReviewExitSignal(resolveReviewExitCode(result.state, result.verdict, options.changesExitCode))`; refreshed the action doc-comment (H1's "nothing reads `result.state`" property is now H2's). AC-9 ordering preserved: the persistence-failure `catch` rethrows the original error first (reaching the catch-all, exit 1) and never falls through to the signal throw.
- EDIT `__test__/review.test.ts`: replaced the H1 "exits 0 for any completed invocation" block with the H2 contract — AC-1 (approve/comment → 0), AC-2 (request-changes → default 1), AC-3 (four non-`ok` states → 2), AC-4 (custom code 20; passing row unaffected), AC-5 (soft gate 0), AC-8 (no-TTY via `createCli` + capturing IO doubles, asserting both output and returned code), AC-9 (a `request-changes` run whose `persistRun` throws exits 1 under `--changes-exit-code 20`, not 20). Refreshed the file header bullet.
- Quick check: `npx vitest run --project adapters -t "review"` → 51 passed. `npm run check` green (232 dependencies cruised, no violations).
- **Mutation-verify (quality gate):**
  - Mapping mutation — `request-changes ? changesExitCode : 0` → `request-changes ? 0 : 0`: 3 tests went red (AC-2 default-1, AC-4 custom-20, AC-8). Reverted.
  - AC-9 ordering mutation — moved the `ReviewExitSignal` throw to immediately after `runReview`, before the `persistRun` try-block: 20 tests went red, including `review — persistence dominates the gate (AC-9)` (would return 20 instead of 1) and `persists exactly one run` (persist never reached). Reverted.
  - Both guards confirmed live; tree restored to green (51 passed) after each revert.

## S4 — `--help` exit-code contract

- EDIT `commands/review-command.ts`: added `EXIT_CODE_HELP` and `.addHelpText("after", EXIT_CODE_HELP)` documenting 0 = passed (approve/comment), 1 = changes requested (configurable via `--changes-exit-code`, 0 for a soft gate), 2 = could not complete (ambiguous / engine-error / timeout / validation-failed) — AC-10.
- EDIT `__test__/help.test.ts`: asserts `review --help` exits 0 and its output states the "Exit codes:" contract with the 0 / configurable-1 / 2 branches and names `--changes-exit-code`.
- Quick check: `npx vitest run --project adapters -t "help"` → 18 passed. `npm run check` green.

## S5 — Final validation gate

- `npm run check` → biome (145 files, no fixes), `tsc --noEmit` clean, depcruise (98 modules, 232 dependencies, no violations). All five architecture guards hold; the exit-code mapping imports only exported core **types**.
- `npm test` → **705 passed / 39 test files** (baseline 681 / 38; +1 file `exit-code.test.ts`, +24 net tests). No failures, no skips.

### AC → test cross-check (all 10 covered)

| AC | Covered by |
|---|---|
| AC-1 ok/approve & ok/comment → 0 | `exit-code.test`: "returns 0 for ok/approve", "returns 0 for ok/comment"; `review.test`: "exits 0 for a completed ok review with verdict approve\|comment (AC-1)" |
| AC-2 ok/request-changes → default 1 | `exit-code.test`: "returns the changes code (default 1)…"; `review.test`: "exits the default code 1 for ok/request-changes (AC-2)" |
| AC-3 every non-ok → 2 | `exit-code.test`: "returns 2 for %s" (4 states); `review.test`: "exits 2 for a run that ended in %s (AC-3)" (ambiguous, engine-error, timeout, validation-failed) |
| AC-4 `--changes-exit-code` overrides only that row | `exit-code.test`: "returns the custom code…", "leaves the passing and failing rows unaffected…"; `review.test`: "exits the custom --changes-exit-code… (AC-4)", "leaves a passing review at 0… (AC-4)" |
| AC-5 `--changes-exit-code 0` soft gate | `exit-code.test`: "returns 0 for ok/request-changes with a soft gate of 0"; `review.test`: "exits 0 for ok/request-changes under --changes-exit-code 0 (AC-5)" |
| AC-6 flag validates its argument | `review.test`: "rejects a non-numeric --changes-exit-code… (AC-6)", "rejects the out-of-range… value %j (AC-6)" |
| AC-7 pure, isolated mapping | whole `exit-code.test`; enforced by `npm run check` depcruise (type-only core import, no core→adapter/adapter→adapter, no logic in core) |
| AC-8 usable without a TTY | `review.test`: "resolves the exit code and full output through the injected io alone (AC-8)" |
| AC-9 backward compatibility + persistence dominates | `review.test`: "exits 1, not the changes code, when a request-changes run fails to persist (AC-9)"; existing persistence-failure suite (R4-001/D13); `--version`/`--help` exit 0 and usage errors keep commander's codes (help.test + missing-branch/invalid-flag cases) |
| AC-10 documented in `--help` | `help.test`: "documents the review exit-code contract (AC-10)" |

## Scope & Boundaries

- Only the approved files changed: NEW `exit-code.ts` + `__test__/exit-code.test.ts`; EDIT `review-command.ts`, `create-cli.ts`, `__test__/review.test.ts`, `__test__/help.test.ts`. Firm decisions honored — no `GlobalConfigSchema`/`container.ts`/`CliDeps` change (e6h2-D2), no `--json` (e6h2-D3), five terminal states only.
- No contradiction, scope drift, or blast-radius expansion encountered. No git side effects (no commit/push/PR — the orchestrator owns those).

## Next Action

Recommend `sddl-qa-review` (final mode) — the change touches code across three source files with new public CLI surface (a flag + exit-code contract), and only final QA may mark the change completed.
