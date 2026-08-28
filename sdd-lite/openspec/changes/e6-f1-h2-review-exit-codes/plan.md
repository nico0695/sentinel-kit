# Plan

## Execution Digest

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- digest_summary: Four small code-touching stages plus a final gate implement the design exactly. Spine follows the real dependency chain: the pure mapping (S1) and the `--changes-exit-code` flag/validator (S2) are independent leaves; the `ReviewExitSignal` + `runProgram` branch + review-action wiring (S3) consumes both; `--help` docs (S4) close AC-10. Each stage leaves the tree green.
- stage_plan_digest: S1 pure `exit-code.ts` + unit table → S2 flag + validator (AC-6) → S3 signal + wiring + e2e cases (AC-1/2/3/4/5/8/9) → S4 `--help` (AC-10) → S5 final gate.
- validation_digest: Every code stage validates with `npm run check` (biome + tsc + depcruise guards) and `npx vitest run --project adapters`; S5 runs full `npm run check` + `npm test` (baseline 681 + new).

## Summary

- change_name: e6-f1-h2-review-exit-codes
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true (after S1 `stage_approval`)
- plan_status: ready-for-execution

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Pure exit-code mapping | — | NEW `src/adapters/driving/cli/exit-code.ts`: `resolveReviewExitCode(state, verdict, changesExitCode)` (`state!=="ok"→2`; else `verdict==="request-changes"?changesExitCode:0`; absent-verdict→0), importing only `type {TerminalState, Verdict}` from `core/run` index. NEW `__test__/exit-code.test.ts`: full table (AC-1,2,3,4,5,7). | `npx vitest run --project adapters -t "exit-code"`; `npm run check` (depcruise confirms core-type-only import) | yes | pending |
| S2 | `--changes-exit-code` flag + validator | S1 | EDIT `commands/review-command.ts`: add `parseChangesExitCode` (integer 0–255, else `InvalidArgumentError`, mirroring `parseTimeoutMs`), `.option("--changes-exit-code <n>", …, parseChangesExitCode, 1)`, non-optional `changesExitCode: number` on `ReviewOptions`. EDIT `__test__/review.test.ts`: AC-6 (non-numeric + out-of-range rejected as usage error before `runReview`). | `npx vitest run --project adapters -t "review"`; `npm run check` | yes | pending |
| S3 | Signal + wiring + e2e outcomes | S1, S2 | EDIT `exit-code.ts`: add `class ReviewExitSignal extends Error { readonly code }`. EDIT `create-cli.ts`: `runProgram` catch gains `if (error instanceof ReviewExitSignal) return error.code;` BEFORE the `CommanderError` branch; refresh doc-comment point 3. EDIT `review-command.ts`: after render `throw new ReviewExitSignal(resolveReviewExitCode(result.state, result.verdict, options.changesExitCode))`, preserving AC-9 order (persistence-failure rethrow happens first); refresh doc-comment. EDIT `__test__/review.test.ts`: each state/verdict→code (AC-1/2/3), override + soft-gate 0 (AC-4/5), no-TTY via capturing IO doubles (AC-8), `request-changes` whose `persistRun` throws exits 1 (AC-9). | `npx vitest run --project adapters -t "review"`; `npm run check` | yes | pending |
| S4 | `--help` exit-code contract | S2 | EDIT `review-command.ts`: `.addHelpText("after", …)` stating 0 = approved/comment, default 1 (configurable) = changes requested, 2 = could not complete. EDIT `__test__/help.test.ts`: assert `review --help` states the contract (AC-10). | `npx vitest run --project adapters -t "help"`; `npm run check` | yes | pending |
| S5 | Final validation gate | S1–S4 | No source change. Confirm all 10 ACs covered by a test; run full gate. | `npm run check` && `npm test` (expect 681 baseline + new tests green) | no | pending |

## Validation Strategy

- Per stage: the targeted `-t` filter above proves the stage's ACs, then `npm run check` proves the architecture guards still hold — critically depcruise on S1/S3 (the exit-code mapping imports only exported core value types; no core→adapter, no adapter→adapter, no wiring outside `main/`).
- CLI is exercised in-process through `createCli` + the capturing IO doubles (`__test__/cli-test-doubles.ts`) with fakes — no engine, no git worktree, no TTY. This is the AC-8 demonstration and why no manual smoke stage is needed.
- Final gate S5: whole suite green at the 681 baseline plus the added `exit-code`/`review`/`help` cases, and an explicit AC-1..AC-10 → test cross-check.

## Dependencies And Sequencing

- S1 and S2 are independent leaves; S1 is sequenced first because `ReviewExitSignal` lives in `exit-code.ts`.
- S3 is the join: it needs both the mapping (S1) and the resolved `options.changesExitCode` (S2), so it must run after both — this is the design's real dependency, not a stylistic order.
- S4 depends only on the flag existing (S2) to document it; placed after S3 to keep one coherent review pass over `review-command.ts`.
- S5 gates the whole change.

## Planner Stop Note

- objective is `new-feature`, not `planner`; execution proceeds after approval. Route stays `continue-lite` (not downgraded, not macro-plan).

## Approval Notes

- Every code-touching stage (S1–S4) requires `stage_approval` before any edit; `sddl-executor` runs exactly one approved stage at a time. Do NOT execute here.
- Firm constraints carried into every stage: e6h2-D1/D2/D3 hold — five terminal states only, no sixth; flag-only, no `GlobalConfigSchema` key, no `CliDeps`/`container.ts` change; no `--json`. `exit-code.ts` imports core value **types** only.
- risk-e6h2-004 (spec/design authored under reduced isolation) stands: QA should scrutinize the AC-9 ordering and the two-axis table against these stages.

## Budget Notes

- Compact plan proportional to a bounded single-command change; the load-bearing sequencing decision (S2 before S3, because the signal needs the flag-resolved code) is stated explicitly.
