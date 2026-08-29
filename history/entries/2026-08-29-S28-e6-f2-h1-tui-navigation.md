# S28 — [E6.F2.H1] TUI navigation flow, end to end

- **Date**: 2026-08-29
- **Branch**: `claude/project-status-review-xuvj3g`
- **Scope**: project-state validation (PR #74 merge confirmed, E6.F1 complete on `main` @ `ac7a442`) + story `[E6.F2.H1]` (issue #38) end to end
- **sdd-lite changes**: [e6-f2-h1-tui-navigation](../../sdd-lite/openspec/changes/e6-f2-h1-tui-navigation/)

## Objective

Validate the project state after PR #74, then run `[E6.F2.H1]` (TUI navigation flow) as a full
sdd-lite change through proposal → spec → design → plan → executor (S1–S7) → full-4r review →
final QA, with the user-mandated CLAUDE.md refresh as the last stage before the PR.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S28-D1 | Session execution mode: `interactive` | `auto` (recommended) | User preference at session kickoff; every stage summary shown and confirmed | `claude→user` |
| S28-D2 | CLAUDE.md refresh is the mandatory last step before the PR (e6f2h1-D0) | Do it opportunistically / later | CLAUDE.md still claimed "pre-implementation"; recorded as a firm closeout stage so it survives handoffs | `user` |
| S28-D3 | Bare `sentinel` on a TTY launches the TUI (e6f2h1-D1) | `sentinel tui` subcommand | PRD §3.1-G: TUI is the primary interactive surface, CLI the scripting equivalent | `claude→user` |
| S28-D4 | TUI library ratified at design time, not pre-approved (e6f2h1-D2) | Pre-ratify @clack/prompts | User chose evaluation; design compared clack vs @inquirer/prompts vs readline and ratified clack (cancel-as-value, built-in spinner, ESM) | `claude→user` |
| S28-D5 | Cancel semantics pre-run only, no mid-run abort (e6f2h1-D3) | Implement mid-run abort | Keeps the story inside the TUI adapter; engine timeout already bounds the run | `claude→user` |
| S28-D6 | Keep resolved @clack/prompts 1.7.0 despite design's 0.10–0.11.x guess (e6f2h1-D5) | Repin 0.11.0 | Design's intent was "pin latest stable exact"; 1.x is the maintained line; required exports verified at install; A-level, reversible | `claude` |
| S28-D7 | Completed+persisted TUI runs exit 0 regardless of terminal state | Mirror CLI gate exit codes in the TUI | Gate codes are the CLI scripting contract; the non-TTY guard means no script can consume TUI exit codes; non-zero reserved for failures. Flagged to the user at the design checkpoint, approved | `claude→user` |
| S28-D8 | S6 (CLAUDE.md refresh) executed inline by the orchestrator | Delegate a worker | Single-file doc edit whose full current text and session evidence were already in orchestrator context; recorded as a deliberate deviation in the execution log | `claude` |
| S28-D9 | Fix round 1 for R1-001: owned interval-driven spinner in `clack-prompter.ts` | `wont-fix`; patching clack's listeners | User approved the fix route at the review_gate; owning the spinner removes raw mode, keypress exit and signal swallowing structurally (also resolves R1-002) | `claude→user` |

## Deviations

- **Provider session limit killed the first R1/R2/R3 review lens workers mid-sweep** (R4 completed).
  They returned no findings, so they were relaunched with byte-identical envelopes — recorded in the
  review ledger as a retry of the same sweep, not a second sweep. No budget impact.
- **Design's library-version assumption was wrong** (0.10–0.11.x vs real 1.7.0): the executor stopped
  on the planned flag; resolved as e6f2h1-D5 (S28-D6). Clack 1.7.0 needed zero API accommodations at S5.
- **Plan baseline was stale** (707 tests vs measured 708/39 at HEAD); corrected in the execution log,
  all later gates measured against reality.
- **The 4R review found what 749 green tests could not**: R1-001 (CRITICAL) — clack's raw-mode spinner
  calls `process.exit(0)` on Ctrl+C/Escape mid-run (orphaned engine child, leaked worktree, skipped
  persist, false success). Fixed in S7, verified by scoped re-review with red-pre-fix regression tests
  and a mutation-verify. Exactly the class of defect the doubles-based suites were structurally blind to.

## Work done

- Surgical bootstrap refresh post-E6.F1.H2 (`0c1d292`); change scaffold + state.
- Lite flow artifacts, all committed: proposal (`04e12b4`), spec — 14 ACs, A1–A4 (`3bcd51a`),
  design — clack ratified, TUI-owned renderer, TuiDeps seam (`e565d65`), plan — 6 stages (`7a402e1`),
  checkpoints (`3e04072`, `7ed4b9d`, `ed51119`, `7b4b17b`).
- Execution S1–S6: `3cb488e` (@clack/prompts 1.7.0 exact), `be26cb6` (createWiringGraph refactor,
  behavior-preserving), `92bbc05` (TuiDeps contract, renderer, runTuiFlow + 5 suites, 41 tests, two
  mutation-verifies), `9d8c95d` (clack prompter, barrel, createTuiDeps, argv dispatch + built non-TTY
  smoke), `f3dea84` (CLAUDE.md refreshed to the implemented E0–E6 state — D0/AC-14).
- Full-4r review over the frozen diff `7b4b17b..f3dea84` (`b541402`): 1 CRITICAL + 4 info; fix round 1
  (`a727f8f` plan, `4a6b4c2` S7 owned spinner), scoped re-review verified, lineage closed
  `pass_with_warnings` (`68a672f`).
- Final QA (final mode): all 14 ACs independently re-verified, gates re-run (check clean,
  `npm test` **754/45**), verdict **pass**, change `completed` (`f6548c0`).
- Three low QA findings carried as E7 candidates (argv-dispatch smoke, prompter's stdout sink note,
  pre-existing EPIPE on piped `--help`).

## Pending and next steps

- **Claude**: open the PR `[E6.F2.H1] TUI navigation flow` (Closes #38) — imminent, same session.
- **User**: review and merge the PR (workflow contract: the human merges everything).
- **Next story**: `[E6.F2.H2]` result rendering (issue #39) — last required E6 story; then E7.
- E7 backlog notes from this session: R3-002 (argv dispatch untested until process-level smoke),
  QA-F3 (EPIPE hardening), R3-001 (unbounded `git fetch` behind the branch spinner — systemic).

## Open questions for the user

—
