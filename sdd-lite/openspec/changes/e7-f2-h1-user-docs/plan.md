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
