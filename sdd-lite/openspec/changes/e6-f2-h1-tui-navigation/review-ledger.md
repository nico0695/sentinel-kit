# Review Ledger — e6-f2-h1-tui-navigation

## Review Digest

- mode: 4r (full-4r tier)
- target: commit range `7b4b17b..f3dea84` (branch `claude/project-status-review-xuvj3g`), code diff sha256 `2dd75aee287649036af4ee0024e13a45cafa3579573b692985d98ec38058d1b5` (excludes `sdd-lite/`, `package-lock.json`); 15 files, +1873/−22
- triage: full-4r — the diff touches `src/main/` (hot-path wiring) and far exceeds 400 changed lines
- lenses run: R1 risk, R2 readability, R3 reliability, R4 resilience — one sweep each. The first R1/R2/R3 workers were killed mid-sweep by a provider session limit before returning any findings; they were relaunched with byte-identical envelopes (a retry of the same sweep, not a second sweep). R4 completed on the first launch.
- refuter: not run — the only severe finding (R1-001) is `deterministic`, and deterministic findings are never refuted; zero severe inferential candidates existed
- counts: confirmed 1 · suspect 0 · escalated 0 · info 4
- open_severe_findings: 1
- fix rounds used: 0 of 2
- verdict: not_reached (fix round pending for R1-001)

## Findings

### R1-001 — CRITICAL — open

- location: `src/adapters/driving/tui/clack-prompter.ts:61` (activation site `src/adapters/driving/tui/tui-flow.ts:183-193`)
- severity: CRITICAL · evidence_class: deterministic · causal_disposition: introduced
- claim: Pressing Ctrl+C or Escape while a clack spinner is active (branch fetch, or the up-to-10-minute review run) triggers `@clack/core`'s raw-mode keypress handler, which calls `process.exit(0)` immediately: the review engine child process is orphaned and keeps running (billing API time), `runReview`'s in-process worktree cleanup never executes (worktree leaks in `~/.sentinel/worktrees` and stays registered in the managed clone), `persistRun` never runs, and the process reports success (exit 0) — contradicting the flow's own "cancel → exit 0, zero side effects" and "non-zero means failure" contract.
- proof_refs:
  - `node_modules/@clack/prompts/dist/index.mjs:989` — spinner start calls `block({ output })`, putting stdin in raw mode
  - `node_modules/@clack/core/dist/index.mjs:140-145` — `block()`: `setRawMode(true)`, then on a cancel key: `process.exit(0)`
  - `node_modules/@clack/core/dist/index.mjs:55-59` — cancel aliases are `\x03` (Ctrl+C; raw mode means no SIGINT is generated) and `escape`
  - `src/core/run/run-review.ts:274-299` — worktree cleanup is in-process after the engine await; `process.exit` skips it; the execa engine child is not killed by parent exit
  - Contrast: the CLI review path has no spinner, so Ctrl+C delivers SIGINT to the whole foreground process group (parent and engine child die, exit 130); the TUI spinner converts this into a parent-only exit 0 with the child left running
- status: open

### R1-002 — WARNING — info

- location: `src/adapters/driving/tui/tui-flow.ts:184`
- evidence_class: deterministic · causal_disposition: introduced
- claim: An externally delivered SIGINT/SIGTERM arriving while a spinner is active is swallowed: clack's spinner registers `process.on('SIGINT'/'SIGTERM')` handlers that only render a "Canceled" line and return, so the first termination request to a TUI review is silently ignored and the review continues to completion, persists, and exits 0.
- proof_refs: `node_modules/@clack/prompts/dist/index.mjs:966-973`; `src/adapters/driving/tui/tui-flow.ts:186-193`
- note: same root as R1-001 (clack's spinner process-control behavior); a fix for R1-001 should resolve or consciously re-scope this too.

### R2-001 — SUGGESTION — info

- location: `src/adapters/driving/tui/tui-deps.ts:112` (repeated at `src/main/container.ts:271-272`)
- evidence_class: deterministic · causal_disposition: introduced
- claim: The doc comment on `TuiUseCases` says "the review quartet the CLI proved out, plus the two enumerations" but the interface has five methods (3 CLI-inherited + 2 new), so no grouping of four exists and the reader cannot resolve which members "quartet" names.

### R3-001 — SUGGESTION — info

- location: `src/adapters/driving/tui/tui-flow.ts:110`
- evidence_class: deterministic · causal_disposition: behavior-activated
- claim: The branch step's spinner can spin without bound because `listBranches`' underlying `git fetch` runs with no timeout, and this change is the first user-facing activation of `listBranches`. Systemic pre-existing pattern (clone/worktree/diff git calls are equally unbounded); this story merely puts it behind an interactive spinner.

### R3-002 — SUGGESTION — info

- location: `src/main/cli.ts:26`
- evidence_class: deterministic · causal_disposition: introduced
- claim: The argv-length dispatch is asserted by no test at any level; a predicate regression would ship without a CI failure. Matches the pre-agreed residual sliver in risk-e6f2h1-003 (entry-file testing deferred to E7's process-level smoke).

## Corroboration Log

- No refuter pass: zero severe findings with `evidence_class: inferential`. R1-001 is deterministic (proof traced to installed `@clack/{prompts,core}` dist sources and core cleanup structure) and stands as `open` without corroboration per the ledger contract.

## Lens Evidence Summaries

- R1 risk: full diff + node_modules clack sources traced (spinner/block/prompt cancel paths); `tsc --noEmit` clean; guards hold; cleared: secrets, injection via branch names (git refname rules + execa array args), TOCTOU listRepos→loadContext (fails closed), persist-once, non-TTY guard, no stack traces.
- R2 readability: doc-claims vs code verified (persist-once, cancel-before-run, persist-failure, shared clock all true); no dead code; `runTuiFlow` length justified and documented; doubles mirror the CLI idioms. One info finding (R2-001).
- R3 reliability: adapters project 400/400, `tsc` clean, `depcruise` clean; every spec AC in the review contract has a corresponding passing test; no vanity tests, swallowed errors, or uncontrolled nondeterminism. Two info findings (R3-001, R3-002).
- R4 resilience: clean sweep — spinner stop-before-rethrow on both paths, persist-failure mirrors D13, cancel zero-side-effects, top-level containment, `GIT_TERMINAL_PROMPT=0` prevents credential-prompt deadlock under the spinner, no I/O at container construction, `process.exitCode` (never `process.exit`) in the entrypoint.

## Fix Rounds

- Round 1: pending — R1-001 (and R1-002 as same-root) routed via `review_gate`: rerun `sddl-plan` to insert a fix stage (S7) from the confirmed ledger ids, then `stage_approval`, then `sddl-executor`, then a scoped re-review of the fix delta.

## Review History

- (none — first lineage for this change)
