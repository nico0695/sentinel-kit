# S20 — [E4.F2.H1] claude-code adapter, end to end

- **Date**: 2026-08-16
- **Branch**: `claude/validar-e1-preparar-e4-m1xkhl`
- **Scope**: `[E4.F2.H1]` (issue #28) end to end — full lite sdd-lite flow, ST-1..ST-5, final QA `pass_with_notes`, PR #66. First real `ReviewEngine` implementation.
- **sdd-lite changes**: [`e4-f2-h1-claude-code-adapter`](../../sdd-lite/openspec/changes/e4-f2-h1-claude-code-adapter/)

## Objective

Deliver the first real engine adapter (`engines/claude-code`) behind the frozen `ReviewEngine` port, per issue #28's three checklist items, following on from `[E4.F1.H1]`/`[E4.F1.H2]` (S18/S19), which only ever exercised the pipeline against `FakeEngine`.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S20-D1 | Rebuild `claude/validar-e1-preparar-e4-m1xkhl` from `origin/main` before starting new work | Keep stacking on the old branch | PR #65 had merged and its remote branch was gone; CLAUDE.md requires restarting a merged branch from the latest default before adding follow-up work | `claude` |
| S20-D2 | Adapter-owned SIGTERM→SIGKILL timeout enforcement in scope for this story | Defer again to a later E4.F2 story | Both `r-engine-not-cancellable`/`r-cleanup-races-abandoned-engine` in H1's state.yaml explicitly named "E4.F2" as owner; claude-code is the first such adapter | `claude` |
| S20-D3 | `isAvailable()` gap resolved without a port change: `review()` runs an internal `claude --version` pre-check before the real invocation | Add an `isAvailable()` port method (B/C-level, touches a frozen `[E0.F2.H2]` deliverable) | Satisfies issue #28 AC-3 fully inside one `review()` call; PRD §6.2's `isAvailable()` mention doesn't require a literal port method | `claude` |
| S20-D4 | Binary-mocking seam: injectable `runProcess: ClaudeCodeProcessRunner` factory option, `reject:false` default execa runner | `PATH` shimming, `execa` monkey-patching | No existing seam precedent in the repo; a plain async function double is simplest for fixture replay | `claude` |
| S20-D5 | AC-19: adapter's own execa timeout = `request.timeoutMs` exactly (not shortened), `forceKillAfterDelay: 2000` (execa default 5000) | Shorten the adapter's internal budget for a deterministic adapter-wins race | Re-read `engine-timeout.ts:76-111` directly: the outer race's expiry timer resolves synchronously, the adapter's OS-mediated kill inherently settles later, so the outer race reliably wins in practice without capping the user's configured budget; shortening would make the adapter's own rejection win *more* often, degrading `"timeout"` to `"engine-error"` | `claude` |
| S20-D6 | Corrected `noisy-output.json`'s usage figures in spec.md (Expected Behavior table + AC-11) before accepting spec | Trust the spec worker's cited numbers | Orchestrator re-parsed the fixture directly: `output_tokens:529`, not the cited `164`; `totalTokens:531`, not `166` — traced to a fixture mix-up with `no-verdict.json`'s real values | `claude` |
| S20-D7 | `ReviewEngine.contract.ts`'s "propagates the configured usage" test changed from a lone `{totalTokens:42}` to a full `{inputTokens:10, outputTokens:32, totalTokens:42}` tuple | Document a permanent AC-22 exception instead; escalate as C-level with no recommendation | The original fixture was genuinely unsatisfiable by any derivation-based real engine (`extractSuccess` always computes `totalTokens` as the sum of the other two, never independently) — a first-real-implementation discovery, not a claude-code-specific defect; the fix also unblocks the future `opencode` adapter (#29) from hitting the same wall; presented via `AskUserQuestion` with 3 options | `claude→user` |
| S20-D8 | AC-24 ("successful real review") deliberately NOT attempted; documented as pending, user-owned follow-up | Use the `claude` binary present on this session's `PATH` to perform the verification | User explicitly declined: invoking it would spawn a real, authenticated agentic session as a side effect of a build task, a materially riskier action needing explicit authorization the user chose not to give; user will run all CLI/external testing themselves later | `user` |
| S20-D9 | Proceeded through final QA and PR creation with AC-24's gap disclosed, rather than pausing again | Wait for the user to close AC-24 before opening a PR | User's explicit instruction: "continua hasta cerrar el sdd-lite, frena solo si tengo que confirmar algo" | `user` |

## Deviations

- **Branch reconstruction.** PR #65's remote branch was already deleted by GitHub after merge; `claude/validar-e1-preparar-e4-m1xkhl` was reset to `origin/main` (`git checkout -B ... origin/main`) before any new commit, per CLAUDE.md's merged-branch-restart rule.
- **Executor STOP mid-ST-4 (C-level, resolved).** `ReviewEngine.contract.ts`'s frozen "propagates the configured usage" test was structurally unsatisfiable by any derivation-based real engine, refuting spec.md's own approved AC-22 assumption ("passes unmodified"). Escalated to the user rather than silently patched; resolved per S20-D7, re-verified sound by both the orchestrator and the final QA pass.
- **AC-24 ("successful real review") not satisfied within this session** — issue #28's own acceptance checklist item stays open, by explicit user choice (S20-D8/D9), not an oversight. `state.yaml`'s `lifecycle_status` stays `reviewing`, not `completed`; `open_risks.r-ac24-manual-verification-pending` stays open.
- **Two minor, non-blocking test-coverage gaps** found by final QA, not fixed in this session (recorded as notes, not defects): AC-9's missing/non-string `.result` branch has no dedicated runtime test; AC-15's spec-suggested never-resolving pre-check stub test is absent.
- **Two self-caught doc-staleness fixes**, same class as PRs #64/#65's Copilot findings but caught here before any PR: `engines/index.ts`'s header comment (still named `FakeEngine` as the sole public API after `createClaudeCodeAdapter` was added to the same barrel) and a stale in-file test comment referencing the (by-then-resolved) contract-test contradiction.

## Work done

- Branch rebuilt from `origin/main` (`ab798ed`, includes PR #65's merge).
- Full sdd-lite lite flow, one commit per stage:
  - `5d390ba` proposal, `6c9140c` spec (27 ACs, 4 open risks resolved), `bd813c4` design (AC-19 fixed), `236e3d2` plan (5 stages, AC-16/17 test strategy).
  - `9f42762` ST-1 (`errors.ts`, `envelope.ts`), `db06965` ST-2 (`process-runner.ts`), `79697d8` ST-3 (`claude-code-adapter.ts` + barrel export), `ce762d3` ST-4 (test suite, 24 tests, `ReviewEngine.contract.ts` fix), `2a2f7ad` ST-5 (closing gate; AC-24 documented pending).
  - `5e8caf2` final QA (`pass_with_notes`, 26/27 ACs independently re-verified), `d3b8289` PR #66 recorded.
- **PR #66 opened**: [`nico0695/sentinel-kit#66`](https://github.com/nico0695/sentinel-kit/pull/66), `Closes #28`, AC-24's gap explicitly disclosed in the body.
- Full gate green throughout: `npm run check` clean at every stage; `npm test` 226/226 (baseline) → 250/250 (final, +24 new).
- Orchestrator independently re-verified every executor stage against actual source/test bytes (not trusted from agent self-reports) at every checkpoint, per this project's standing practice.

## Pending and next steps

- **User**: run AC-24's manual verification (real authenticated `claude` CLI, genuine diff) and report the command/exit-code/`VERDICT:` line back, so it can be recorded in `execution-log.md` — the sole remaining item before `state.yaml` can move to `lifecycle_status: completed`.
- **User**: review and merge PR #66 (or request changes) — per CLAUDE.md, only the human merges.
- **Claude, next backlog item**: `[E4.F2.H2]` (#29, `engines/opencode` adapter) once PR #66 is merged or otherwise closed out — max-5-open-PRs rule currently non-binding (1 open).

## Open questions for the user

—
