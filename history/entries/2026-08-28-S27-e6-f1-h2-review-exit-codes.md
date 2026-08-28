# S27 — [E6.F1.H2] Non-interactive review exit codes, end to end

- **Date**: 2026-08-28
- **Branch**: `claude/validar-estado-proyecto-rcvz8c`
- **Scope**: project-state validation (PR #73 merge confirmed, E6.F1.H1 landed on `main` @ `16e3650`) + story `[E6.F1.H2]` (issue #37) implemented end to end
- **sdd-lite changes**: [`e6-f1-h2-review-exit-codes`](../../sdd-lite/openspec/changes/e6-f1-h2-review-exit-codes/) — proposal · spec · design · plan · execution-log · qa-report · state

## Objective

Confirm project state after PR #73 merged, then take `[E6.F1.H2]` — `sentinel review` non-interactive
exit codes (PRD use case 6, gate-mode seed) — through a fresh sdd-lite change end to end: proposal →
spec → design → plan → executor → final QA, and open its PR.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S27-D1 | Surgical bootstrap refresh (config/project-context/skill-catalog) to post-E6.F1.H1 reality before the proposal | Proposal-first with a staleness warning, refresh later | The story builds directly on the just-landed CLI adapter; stale bootstrap affects file targets, and code-touching stages may not start on it | `claude→user` |
| S27-D2 | Exit-code table = 0 (ok+approve/comment) / configurable default-1 (ok+request-changes) / single 2 for every non-ok state (`e6h2-D1`) | Distinct code per failure state | Leaner seed; a script distinguishes "changes requested" (1) from "tool failed" (2); distinct per-state codes are a future gate-mode refinement | `claude→user` |
| S27-D3 | "Configurable" via a per-invocation flag `--changes-exit-code <n>` (default 1), no config-schema key (`e6h2-D2`) | Flag + global config key with precedence | Keeps the story a tight seed, avoids widening `GlobalConfigSchema`; scripting is per-invocation | `claude→user` |
| S27-D4 | Defer `--json` / structured output out of H2 (`e6h2-D3`) | Include a minimal `--json` (H1 pointed it here) | Exit codes alone satisfy "scriptable without TTY"; keeps H2 a focused exit-code contract | `claude→user` |
| S27-D5 | Signalling mechanism: a typed `ReviewExitSignal extends Error` the action throws, translated by `runProgram`'s catch | Mutable exit-code sink on `deps` | Reuses commander's own throw-carries-code shape; stateless (program built once per `createCli`); keeps `CliDeps` immutable; AC-9 falls out of throw ordering | `claude` (A, design) |
| S27-D6 | Pure `resolveReviewExitCode` in a new `cli/exit-code.ts`, not under `render/` | Place it beside the renderers | It is policy, not formatting | `claude` (A, design) |
| S27-D7 | Author `spec.md` inline (orchestrator) after the delegated worker was cut off | Re-delegate a fresh spec worker | A provider spend limit interrupted the worker mid-stage; decisions were already firm; re-delegating would spend more budget. Fallback clause invoked, degradation recorded as `risk-e6h2-004` | `claude` (A, forced) |
| S27-D8 | Execute S1–S4 in one approved pass + S5 gate | Batch by dependency; one stage at a time | Small change, fully in-process testable (no engine/git/TTY) — batching is safe | `claude→user` |
| S27-D9 | Fix `risk-e6h2-005` (blank `--changes-exit-code` → silent soft gate) before opening the PR | Defer as a hardening nit (QA logged it non-blocking) | One-line guard + one test in the same file; improves exactly the contract this story ships | `claude→user` |

## Deviations

- **Provider spend limit interrupted the `sddl-spec` delegation** before it wrote any artifact. Per the
  SDDL-ORCHESTRATOR "Fallback if Agent tool is unavailable" clause, the orchestrator authored `spec.md`
  inline with reduced fresh-context isolation (S27-D7), recorded as `risk-e6h2-004`. The final QA
  independently re-derived the AC-9 ordering and the two-axis table from source and found no spec
  defect — risk resolved.
- **Final QA (verdict `pass`) surfaced `risk-e6h2-005`**: `parseChangesExitCode` accepted an
  empty/whitespace argument as a silent soft-gate 0 (`Number("")===0`). Non-blocking (violates no AC),
  but a real scripting footgun; fixed before the PR at the user's request (S27-D9).

## Work done

- `3eece38` chore(sddl): surgical bootstrap refresh post-E6.F1.H1 (branch restarted from `main` @ `16e3650`, since #73 merged)
- `5ddba58` proposal + state (issue #37, D1–D3 decided) · `f7b1f11` spec (10 ACs) · `d341ee9` spec checkpoint resolved · `f439670` design (`ReviewExitSignal`) · `cc1db55` plan (5 stages)
- `25542bb` **feat(cli): review exit codes — closes #37** — new `cli/exit-code.ts` (`resolveReviewExitCode` + `ReviewExitSignal`), `--changes-exit-code` flag + validator, `runProgram` branch, `--help` contract, e2e + unit tests
- `c38e51a` final QA `pass`, change `completed` · `add25d7` fix: reject blank `--changes-exit-code` (`risk-e6h2-005`)
- Validations: `npm run check` clean (biome + tsc + depcruise, 98 modules, 232 deps, 0 violations); `npm test` **707 passed / 39 files** (baseline 681/38; +26 tests, +1 file). Independently re-run by the orchestrator and by final QA. Two executor mutation-verifies killed the expected tests and were reverted.
- 9 stage delegations attempted (1 interrupted); all sdd-lite stages completed; change `completed`.

## Pending and next steps

- **PR for `[E6.F1.H2]` (`Closes #37`)** — being opened by the orchestrator now; **review + merge is the user's** (never Claude's).
- Risks: `e6h2-002/003/004/005` resolved; `e6h2-001` (the two-axis conflation) encoded by `e6h2-D1` and covered by the exit-code table tests. None left blocking.
- Next E6 stories (not started): `[E6.F2.H1]` TUI navigation (#38), then `[E6.F2.H2]` result rendering (#39). `[E6.F2.H3]` (`sentinel open`) is ⚪ optional.

## Open questions for the user

—
