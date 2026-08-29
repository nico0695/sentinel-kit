# QA Report — e6-f2-h1-tui-navigation

## Closeout Digest

- mode: **final** (change-wide closeout review, S1–S7)
- verdict: **pass** — every one of the 14 ACs independently verified against the real code and tests; both gates green (`npm run check` clean; `npm test` **754 tests / 45 files**, 0 failed); review ledger consumed (0 open severe findings, R1-001 verified)
- completion: **allowed** — this passing final QA marks the change `completed`
- reviewed range: `3cb488e..68a672f` on `claude/project-status-review-xuvj3g` (HEAD clean); code surface: `package.json`(+lock, S1 in `3cb488e`), `src/adapters/driving/tui/**` (10 files), `src/main/{cli.ts,container.ts}`, `CLAUDE.md`
- reported_at: 2026-08-29

## What Was Reviewed And How

Independent re-verification, not a replay of the execution log: every TUI source and test file was read in full; both quality gates and a fresh build + process-level smoke were re-run in this session; the review ledger's fix-round evidence (R1-001) was spot-checked against the real regression suite. Extra scrutiny went where a defect matters most — the tui-flow exit-code paths (cancel 0 / empty 0 / error 1 / non-TTY 1 / completed 0) and the persist-failure ordering.

## Gate Results (run by this QA session)

| Command | Outcome |
|---|---|
| `npm run check` (biome + tsc + depcruise) | **clean** — 156 files checked, no lint/type errors; no dependency violations (103 modules, 247 dependencies cruised) |
| `npm test` (full suite, non-TTY shell) | **45 files passed, 754 tests passed, 0 failed** — exactly the expected 754/45 (708/39 baseline + 41 flow tests in 5 files + 5 spinner tests in 1 file) |
| `npm run build` + built smoke | tsup ok; bare `sentinel` with non-TTY stdin → one stderr guidance line naming `sentinel review …` and `--help`, empty stdout, **exit 1**, no hang; `--version` → `0.0.0` exit 0; `--help` exit 0; `nonsense` → `error: unknown command`, exit 1 |

## AC Verification

| AC | Result | Evidence (independently checked) |
|---|---|---|
| AC-1 | verified | `src/main/cli.ts:27-32` — one argv-length ternary; non-bare invocations reach commander byte-identically. `git diff 3cb488e..68a672f -- src/adapters/driving/cli src/core` is **empty** (CLI adapter and core untouched); full suite incl. all CLI suites green; built smoke: `--help`/`--version`/unknown-command behave as before |
| AC-2 | verified | `tui-flow.ts:61-64` gate on injected `deps.tty`; `errors.test.ts:51-76` covers all three non-TTY combinations asserting the line content, exit 1, zero prompts/spinners (empty-script structural proof); built smoke reproduced it at process level (exit 1, stderr only) |
| AC-3 | verified | `flow.test.ts:205-255` — trace assertion pins the exact order `listRepos → listBranches:owner/repo → listHarnessTypes → loadContext → runReview → persistRun` and the request composed through the CLI cascade (`repoPath`, `baseRef: "develop"` from repo config, `engineName`) |
| AC-4 | verified | `cancel.test.ts:91-105` — `it.each` over all four steps; recording fakes for `runReview`/`persistRun` (which would reject if reached) assert length 0, exit 0, "cancelled" line, empty stderr. Non-vacuous: the S4 mutation-verify (confirmation gate ignoring `false`) turned it red |
| AC-5 | verified | `tui-flow.ts:154-178` resolves via `resolveReviewRequest` before the gate; `flow.test.ts:258-281` asserts summary content and confirm-index strictly before runReview-index in the trace; `cancel.test.ts:123-139` proves cancel-after-summary still has zero side effects |
| AC-6 | verified | `flow.test.ts:297-318` uses a deferred `runReview`: spinner `start:` with static "Running review" text while pending, `persistRun` untouched until resolution, `stop:` after. No staged progress, no cancel offered (no prompt exists in step 5) |
| AC-7 | verified | `render.ts:42-52` emits only state/verdict/run-dir; `result.test.ts:174-178` asserts the literal **tail** of stdout is the minimal block (nothing rendered after it — no H2 surface can slip in); per-terminal-state cases incl. verdict-line omission |
| AC-8 | verified | `tui-flow.ts:196-227`; `result.test.ts` — persist exactly once for `ok` + all four failed states; persist-failure: outcome shown with `-` runDir, no-history diagnostic + underlying error on stderr (ordering asserted: `err[0]` diagnostic, `err[1]` failure), exit 1, exactly one attempt. S4 mutation-verify (duplicated persist → 8 red) recorded |
| AC-9 | verified | `errors.test.ts` — one typed error per step through the real `createTui().run()` catch-all, `expectOneFriendlyLine` forbids newlines and ` at ` frames; non-Error throwable, multi-line collapse, and a stack-frame sweep over both streams with a proven-stack-carrying Error |
| AC-10 | verified | `empty-states.test.ts` — no repos → `sentinel repo add` guidance + zero prompts (structural); no branches → line names the repo; no harnesses → broken-installation hint; all exit 0, empty stderr |
| AC-11 | verified | `depcruise` clean in this session's `check`; grep: `@clack/prompts` imported **only** in `clack-prompter.ts` (single import: `confirm`, `isCancel`, `select`); no cross-adapter import (`TuiIo` re-declared, not imported from CLI); only core value import in the adapter is `resolveReviewRequest`; all instantiation in `src/main/` (`createTuiDeps`, container.ts:281-308) |
| AC-12 | verified | All suites drive `createTui(deps)` with scripted prompter + capturing IO + injected `tty`/`now`/`loadContext` doubles (`tui-test-doubles.ts`); the full suite passed in this session's non-TTY shell; spinner tests inject a capturing sink under fake timers |
| AC-13 | verified | Both gates re-run by QA: check clean, **754/45** green (baseline 708/39 intact per D5's corrected count — the spec's 707 figure was corrected at S1 with evidence) |
| AC-14 | verified | CLAUDE.md now reads "Current state: E0–E6 implemented" with this story's entry behavior, exact-pinned `@clack/prompts` confined to `tui/clack-prompter.ts`, and the "Driving surfaces" paragraph; grep sweep over CLAUDE.md/README/CONTRIBUTING finds zero stale pre-implementation claims |

## Review Evidence (ledger consumed)

- `review-ledger.md`: full-4r, verdict `pass_with_warnings`, counts confirmed 1 / suspect 0 / escalated 0 / info 4, **0 open severe**, fix round 1 of 2 used.
- **R1-001 (CRITICAL → verified)** spot-checked against reality: `clack-prompter.ts` no longer imports clack's `spinner`; `createOwnedSpinner` is interval-driven rendering to an injected sink — no stdin, no raw mode, no process listeners. `spinner.test.ts` is real and green (5/5): listener counts on the exact five events clack registered, stdin `keypress`/`data` counts, and zero-writes-after-stop under fake timers. The log's red-pre-fix (4/5) and mutation-verify (clack spinner restored → same 4 red) evidence is consistent with the suite's design — these assertions cannot pass against the clack-backed spinner. R1-002 structurally resolved by the same fix.
- The 4 info rows (R1-002 resolved, R2-001 doc-comment "quartet" wording, R3-001 unbounded `git fetch` under the branch spinner — systemic pre-existing, R3-002 untested argv dispatch line — pre-agreed residual, E7 smoke) need no action; recorded in Findings.

## Findings

| Id | Severity | Finding |
|---|---|---|
| QA-F1 | low | The four ledger info rows stand as stated; none blocks closeout. R3-002 (argv dispatch line untested at any level) is the one worth carrying into E7's process-level smoke scope. |
| QA-F2 | low | `clack-prompter.ts:106` holds the adapter's single real `process` access (`spinnerOutput ?? process.stdout`). Planned in fix round 1 and confined to the designated impure translation file; the flow and TTY facts remain fully injected, so AC-12 holds. Acceptable; note if the "adapter never touches process" phrasing is ever tightened into a guard. |
| QA-F3 | low (pre-existing, out of scope) | `node dist/cli.js --help \| head -3` crashes with an unhandled EPIPE when the consumer closes the pipe early — reproduced during smoke. The write site is the CLI's `processIo` from E6.F1; `git diff` confirms this range touched neither the CLI adapter nor its IO. Candidate hardening for E7, not this story. |

## Verdict

**pass** (final mode). Every AC independently verifies against the real code and tests, both gates are green as re-run by this QA session, and the review lineage is closed with zero open severe findings. Per the final-mode rules, this passing final QA **marks the change completed** (`lifecycle_status: completed` — state sync is orchestrator-owned for this run, per the handoff). The three low findings are observations, none blocking.

## Next Action

Change is complete. Proceed to the session's audit history entry (`history-log`), then open the PR (`[E6.F2.H1] …`, `Closes #38`) — `npm run check` and `npm test` evidence above satisfies the workflow contract's pre-PR gate.

## Review History

- 2026-08-29 — final mode — verdict **pass** — full change S1–S7 vs spec.md's 14 ACs; gates re-run (check clean, 754/45); ledger consumed (R1-001 verified, 4 info). First QA entry for this change (stage-mode QA was deferred at batch boundaries by the orchestrator's approved batching).
