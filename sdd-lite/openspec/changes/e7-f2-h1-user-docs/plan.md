# Plan

## Execution Digest

- change_name: e7-f2-h1-user-docs
- objective: new-feature
- route: continue-lite
- digest_summary: Docs-only story [E7.F2.H1] (#43). Three flat user docs plus a links-only README insert, written to design.md outlines and checked by two scripts kept in the change dir. No production code, no live model call (d-006).
- stage_plan_digest: S1 scripts + dry baseline -> S2 quick-start -> S3 harness guide -> S4 privacy + README -> S5 full verification and gate. One `stage_approval` per stage. Post-execution gates (not stages): 4R review, final QA, history entry, PR with F1-F7 filing.
- validation_digest: Scripts run in a scratchpad sandbox with an engine-free PATH (asserted before every review). Every doc command is compared with `--help` and CF-1..CF-17. S5 records the claim-to-CF table and proves the blast radius with `git diff --stat main`.

## Summary

- change_name: e7-f2-h1-user-docs
- objective: new-feature
- route: continue-lite
- Sandbox root (scratchpad only): `/tmp/claude-0/-home-user-sentinel-kit/ea91228b-6432-5c98-808e-7ad37e07d226/scratchpad`.
- Authoritative inputs: design.md outlines, "Harness Example" and README text copied exactly; decisions d-001..d-014 in state.yaml. d-014 overrides design.md privacy section 2.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required |
|---|---|---|---|---|---|---|
| S1 | Write `verify-quickstart.sh` (V1-V15) and `verify-verdict.mts`; dry baseline run against current code so facts are confirmed before prose. Sandbox install from the branch HEAD, help texts saved (V3). | none | Create in change dir: `verify-quickstart.sh`, `verify-verdict.mts`; start `execution-log.md`. Sandbox files only in the scratchpad. | Baseline: V1-V8, V10, V13, V14, V15 pass; engine-absence assert (`! command -v claude && ! command -v opencode`) passes before every review; reviews end `engine-error` at `engine`. V9, V11, V12 and the verdict check run in S3 and S5, where their doc inputs exist. | No (scripts are sdd-lite evidence, not product code) | yes |
| S2 | Write `docs/quick-start.md` per design outline (sections 1-7, Next steps). Install only here. D6 sentence in section 4. | S1 | Create `docs/quick-start.md`. | Re-run V1-V10, V14 with commands extracted from the doc; every command/flag/env/path vs saved help (AC-7); grep AC-4 jargon list; `grep -c '```mermaid'` = 0. | No | yes |
| S3 | Write `docs/build-your-own-harness.md` with the exact `my-review` example (harness.md, skills.yaml, house-rules.md, output.md). | S2 (links, placeholders explained once) | Create `docs/build-your-own-harness.md`. | V11, V12, V13 executed from the guide's literal files; `verify-verdict.mts` against the sandbox clone's `builtin-verdict-extraction.ts` and the example output.md (long synthetic answer parses to `request-changes`, verdict-first control gives `null`); `grep -i extraskills` empty; AC-4 grep. | No | yes |
| S4 | Write `docs/privacy.md` (one Mermaid, 5 nodes) applying d-014; insert README "Using sentinel" section before `## Quick start (development)`. | S2, S3 | Create `docs/privacy.md`; edit `README.md` (one added section). | `grep -c '```mermaid'` = 1, no `style`/`classDef`/`%%{init`; `grep -nE 'claude -p|--model' docs/privacy.md` empty (d-014); OpenCode sentence present; AC-4 grep; `git diff README.md` shows only the added block (AC-17). | No | yes |
| S5 | Full verification against the written docs and gate. Record claim-to-CF table (AC-14) and AC-1..AC-18 evidence in execution-log.md. | S1-S4 | Edit `execution-log.md` only (plus script fixes if the scripts, not the docs, were wrong). | Commands extracted from the three docs equal what the scripts execute; full `verify-quickstart.sh` and `verify-verdict.mts` green; cross-doc read (AC-5); `npm run check` and `npm test` green; `git diff --stat main` shows only 3 docs + README + sdd-lite/history, nothing under `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json`, or contributor docs (AC-1, AC-18). | No | yes |
| S6 | Docs-only fix of the review-ledger info rows (d-017, cp-014). See Amendment 1. | S5 | Edit `docs/quick-start.md`, `docs/build-your-own-harness.md`, `docs/privacy.md`; `README.md` only if a link changes; append to `execution-log.md`. | Per Amendment 1: claim-to-code table, literal replay of changed commands, link check, AC-4 grep, Mermaid limits, d-014 grep, `npm run check` + `npm test`, diff limited to the docs. | No | yes |

## Validation Strategy

- Evidence-first: S1 confirms CF rows against real behavior before any prose exists; S2-S4 each re-check only their own doc, S5 repeats everything end to end.
- No live model call, ever (d-006). The PATH shim assertion must hold before every `review`; if it fails, stop.
- Doc commands run literally in the sandbox, with `~/.sentinel` mapped to `$SENTINEL_HOME` and the GitHub URL to a local clone of this branch.
- Stop conditions (all stages): a documented command or output behaves differently than its CF row says; a CF row is false; any need to change `src/`, `e2e/`, `fixtures/`, `harnesses/`, `skills/`, `package.json` or contributor docs; sandbox touches the real `~/.sentinel`; an engine binary appears on PATH. Report as a contradiction (C-level); do not adjust code or silently reword scope.
- Doc wording that a CF row cannot support is removed, not softened.

## Dependencies And Sequencing

- Strictly sequential S1 -> S2 -> S3 -> S4 -> S5; S3 reuses S2's placeholder explanations, S4 links to both. Doc writing (S2-S4) stays separate from final verification (S5).
- Stages are not merged: each doc is independently reviewable and each has a different verification slice.
- Executor instruction for S4 (d-014): privacy section 2 must NOT show `claude -p --model sonnet` or any engine invocation flags. Write: Claude Code runs with your own Claude Code permission settings; sentinel adds no limits of its own. Keep the OpenCode sentence (sentinel blocks file edits, shell commands and web fetches). design.md is not rewritten.
- Post-execution steps (orchestrator, not executor stages):
  1. 4R review of the frozen diff, then final QA (`qa-report.md`; discloses the not-verified-live gap, risk-e7f2h1-002).
  2. History entry via `history-log`.
  3. File follow-up issues F1-F7 on GitHub at PR time (link #16 for the repo-defaults item); GitHub writes are not executor work.
  4. PR `[E7.F2.H1] ...` with `Closes #43`, F1-F7 numbers and the d-006 gap in the body. Human merges.

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this plan authorizes execution one stage at a time after the user approves the first stage. No stage runs without its own `stage_approval`.

## Approval Notes

- Design `Needed Before: execution` rows:
  - F1-F7 follow-up issues plus link #16: affects the post-execution PR step (AC-19) and the S5 cross-check that docs do not promise fixes for them. Filing is orchestrator work at PR time.
  - V8 exit code when the opencode model variable is missing (pre-run error expected = 1): affects S1 (record the observed value in execution-log.md) and S2 section 6 wording (describe the error message only, do not document the code).
- d-014 (user-approved) carried into S4 as above.
- Approval requested now: S1 only.

## Budget Notes

- Over the 300-500 word target because the stage table carries per-stage validation and stop rules.

## Amendment 1 (S6, d-017 / cp-014)

S1-S5 rows are unchanged. S6 is a docs-only fix stage from the review-ledger info rows, with its own `stage_approval`. Info rows never enter the protocol fix loop, so a scoped re-review is NOT required; the orchestrator runs final QA after S6.

Binding: d-001 brevity (short sentences, user language, each concept once, at most 1 Mermaid per doc), small net growth, replace sentences rather than add sections. Every new claim is recorded as claim -> file:line in `execution-log.md`.

### S6 work units (one per ledger id)

| Id | Doc | Change |
|---|---|---|
| R3-001 | quick-start sec. 5 | Replace the "failureStage/failureMessage give a short reason" sentence: `ambiguous` means the engine answered but sentinel found no verdict line; both fields print `-`; read `result.md`. Short. |
| R4-002 | quick-start sec. 3 | Private repo: git must already clone it without asking (stored credentials or SSH); if `repo add` fails, check address and access. Executor verifies in code that `repo add` accepts an ssh URL before mentioning SSH; otherwise drop SSH. Consistent with `repo add --help`. |
| R1-005 | privacy credentials + quick-start sec. 3 | No tokens or passwords in the repository address; sentinel saves it as given. Say once, link from the other doc. |
| R4-003 | quick-start sec. 2 | One line: keep the cloned folder where it is (the installed command uses it). |
| R2-001 | quick-start sec. 5, privacy sec. 3, privacy/guide | Run-folder contents listed in ONE doc (privacy sec. 3; includes `validations/`), linked from quick-start sec. 5. Prompt contents/order stated once (privacy sec. 1 or guide sec. 1), linked from the other. |
| R1-001 | privacy | Claude Code keeps its own session history of each review prompt (which includes the diff) on the user's machine. |
| R1-002 | privacy | The engine runs inside the reviewed branch, so that branch's own Claude Code project settings can apply too. User terms. |
| R1-003 | privacy | Soften the OpenCode sentence ("sentinel asks OpenCode to block..." / "sentinel's OpenCode settings deny..."), worded per `permission-config.ts`. No precedence claim. |
| R1-004 | privacy | Temporary copy removed when the review ends normally; if interrupted it can stay under `~/.sentinel/worktrees/` (add to the disk list). |
| R4-004 | guide sec. 1/7 | One sentence: with `SENTINEL_HOME` set, use that folder instead of `~/.sentinel` in every path; add location to sec. 7's "not in the list" check. |
| R2-003 | privacy, quick-start | Use "sentinel's copy of the repository" (clone) vs "a temporary copy of the branch" consistently; relabel the Mermaid node (still 5 nodes or fewer, no styles). |
| R2-002 | privacy | Validations clause: keep factual but state it applies only if check commands are configured (not covered by these docs), or drop it; choose the shorter. |

### S6 validation

- Claim -> code table in `execution-log.md` (including the ssh-URL check for R4-002 and the `permission-config.ts` wording for R1-003).
- Re-run the affected verification: literal replay of any changed command (none expected), link check, AC-4 jargon grep, Mermaid limits (`grep -c '```mermaid'` at most 1 per doc, no `style`/`classDef`/`%%{init`), d-014 grep (`grep -nE 'claude -p|--model' docs/privacy.md` empty).
- No live model call (d-006). `npm run check` and `npm test` stay green.
- `git diff` limited to the three docs (README untouched unless a link changes) plus sdd-lite files.
- Stop conditions as in Validation Strategy; a claim code cannot support is removed, not softened further.

### Post-execution gates (orchestrator, not stages)

Final QA after S6, history entry, then at PR time file F1-F7 plus product follow-ups F8 (Claude Code isolation flags) and F9 (OpenCode config precedence). The PR body lists them and the d-006 gap.

### Approval request

S6 only.
