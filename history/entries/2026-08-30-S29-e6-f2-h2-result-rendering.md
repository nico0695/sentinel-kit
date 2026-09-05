# S29 — [E6.F2.H2] Terminal result rendering, owner review, PR #77 merged — E6 complete

- **Date**: 2026-08-30
- **Branch**: `claude/project-post-merge-analysis-a4tcbl`
- **Scope**: project-state validation (PR #75 merge confirmed, E6.F2.H1 on `main` @ `59b806e`) + story `[E6.F2.H2]` (issue #39) — the last required story of E6
- **sdd-lite changes**: [e6-f2-h2-result-rendering](../../sdd-lite/openspec/changes/e6-f2-h2-result-rendering/)

## Objective

Validate the project state after PR #75, then run `[E6.F2.H2]` (terminal result rendering) as a full
sdd-lite change. The story closes E6: the TUI's result step renders a digest instead of three placeholder
lines, and offers the engine's raw markdown behind one opt-in prompt.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S29-D1 | Work `[E6.F2.H2]` (issue #39) rather than jumping to E7 | Start `[E7.F1.H1]` (unblocked); refresh bootstrap only | Workflow contract rule 1: only current-epic stories. #39 closes the last required E6 story and unblocks #42 | `claude→user` |
| S29-D2 | Rendering depth: compact digest **plus** an opt-in full view (e6f2h2-D1) | Digest only (orchestrator's recommendation); full styled render | User chose the toggle: the digest satisfies "at a glance" while removing the "open a file to learn why" friction. Introduces the flow's first post-run prompt | `claude→user` |
| S29-D3 | `picocolors` only, exact-pinned; `marked-terminal` rejected (e6f2h2-D2) | Both; no dependency, hand-rolled ANSI | Consequence stated honestly in the spec: with no markdown renderer the full view is raw markdown, not rendered markdown | `claude→user` |
| S29-D4 | Severity extraction lives in the TUI adapter (e6f2h2-D3) | A findings model in `src/core/run/` | Keeps the story presentational, zero core changes. Closes the level-C scope-creep vector `risk-e6f2h2-004` | `claude→user` |
| S29-D5 | TUI only; the CLI's machine-parseable block untouched (e6f2h2-D4) | Both surfaces share the rich render | `REVIEW_OUTCOME_FIELDS` is a `key<TAB>value` contract for pipes; `adapters-isolated` forbids sharing anyway | `claude→user` |
| S29-D6 | Collapse the multi-line `failure.message` in the digest (e6f2h2-D9) | Leave as designed; collapse **and** truncate | Stage QA found QA-S4-01 with a vacuous guard test. `render.ts:35` already collapses ten lines above, and the CLI's `field()` does the same with a comment naming the hazard. Recorded as an amendment to `design.md`, which said `record.failure` passes through untouched | `claude→user` |
| S29-D7 | Fix all three CRITICALs with a spec amendment, plus three info rows (e6f2h2-D12) | Fix only the two not touching the contract; defer all three to E7 | AC-12's byte-verbatim identity **is** the vulnerability, so the contract had to change first. Two of the info rows were the same vacuity species the change had already produced twice | `claude→user` |
| S29-D8 | Add the AC-4 degradation case driven by the real `noisy-output.json` (e6f2h2-D13, Q-F1) | Decline, per the fix-stage rule "exactly the confirmed ids" | Measured, not argued: that fixture yields **0** recognised findings against `valid-verdict.json`'s 2, so the degradation path is the *common* real path yet was asserted only against a hand-written string | `claude→user` |
| S29-D9 | Trailing-CR ruling: follow AC-18, correct the contradicting design prose (e6f2h2-D14) | Follow the prose; leave the contradiction | S8 surfaced a contradiction **between approved artifacts** instead of picking a side silently. Four sources against one; AC-18 is the acceptance criterion. Fixed the prose so no latent contradiction reached the re-review | `claude` |
| S29-D10 | Spend the last fix round on RR1-001 + RR2-001 (e6f2h2-D16) | RR1-001 alone; stop and hand the ledger to the user | Round 1 introduced RR1-001; leaving it would ship a silent-deletion defect. RR2-001 rode along since the stage was open | `claude→user` |
| S29-D11 | Repair RR1-001 at **all nine** structural positions (e6f2h2-D17) | Repair only the leading position the ledger row named | One id, one mechanism, one failure mode. The row understated it: 45 of 45 combinations, reproduced by the orchestrator. Repairing one position would have left eight alive — precisely how round 1 failed | `claude` |
| S29-D12 | Qualify the fifth bare `AC-8` citation (e6f2h2-D15) | Leave it, as outside the four ledger ids | AC-21's own verifier requires every H2 citation qualified; `:278` is H2's while `:207` is H1's, 71 lines apart. Leaving it makes AC-21 fail its own check | `claude` |
| S29-D13 | Accept the change at `pass_with_warnings` and close it (e6f2h2-D18) | Hold in `reviewing`; open a third fix round | No residual is severe and each carries a disposition. The single medium (`risk-e6f2h2-014`) is exactly what `[E7.F1.H1]`'s E2E smoke exists to cover — closing it here would mean building the next story early. The protocol caps the lineage at two rounds | `claude→user` |
| S29-D14 | Correct the README status line in this PR | Leave it entirely to `[E7.F2.H1]` | It was false on two counts — only E0 complete, engines still "spiked" — since E4. One line; the PR already touches CLAUDE.md for the same reason. The full rewrite stays with `[E7.F2.H1]` | `claude→user` |
| S29-D15 | The owner's post-merge PR #76 review reopens the change; fix both findings and push (e6f2h2-D19) | Leave both as follow-up issues; fix only the bidi finding | Repo precedent (`[E5.F1.H2]`, `[E6.F1.H1]`): an owner's PR review reopens a "completed" change outside the normal 4R fix-round budget, which governs only the internal lineage. Both findings — bidi terminal injection and the exit-code flip on the optional post-run prompt — were independently confirmed real before agreeing to fix | `claude→user` |
| S29-D16 | Correct the reachability prose for the exit-code-guard fix rather than the fix itself (e6f2h2-D20) | Leave the EPIPE/piped-reader narrative as written; rewrite the fix to match the wrong narrative | A fresh scoped re-review found the *justification* wrong in five places (code, two spec artifacts, the ledger, a test comment), not the fix: `sentinel \| head` never reaches this code (the TTY gate exits first), and Node's blocking TTY writes mean the actually-reachable failure is a synchronous write error (e.g. `EIO` on terminal hangup) or a prompter throwing, not an async EPIPE. Reproduced both sub-claims independently before correcting the prose only | `claude` |

## Deviations

- **A STOP occurred and was resolved.** The first `sddl-qa-review` worker died on an API session
  rate limit before writing anything; the change was left at `implementing` with a history entry, and
  running the stage inline was **declined** — final QA is the only stage that may set `completed`, and
  this session orchestrated every stage, so doing it here would have violated the fresh-review rule.
  Re-launched after the limit reset and completed normally. Nothing was ever left half-written.
- **Final QA withheld `completed` on its own judgement** and set `reviewing`, routing to a
  `final_review` checkpoint: with the fix budget exhausted, "ship with these named residuals" is a
  human acceptance decision rather than a stage's. The user accepted (S29-D13).
- **Fix round 1 introduced the defect it was convened to close.** It closed R1-003's interior-control
  position and created an identical silent-deletion mode in the leading position. `design.md:53` recorded
  "the trim itself is unchanged" without tracing the consequence, and every test the round added placed
  the control *inside* the remainder. Closed in round 2 as RR1-001. Fix budget now 2 of 2, exhausted.
- **The same vacuity species appeared seven times** — an assertion whose input cannot violate the property
  it claims: `"spawn failed"` fed to a newline check; palette assertions that are `x === x` under the
  mandated local gate; a palette untested at its call sites; the AC-12(c) duplicate; a worker's
  comment-only proof that "passed" twice on the sha256 of an empty string; and **the orchestrator's own
  verification probe**, which tested a hardcoded copy of the old regexes rather than the shipped module.
  Every instance was caught by deliberate mutation-verification or a fresh reviewer, never by the suite
  being green. The plan generalised it into a standing negative-assertion pairing rule.
- **Two orchestrator `state.yaml` patches missed their anchors** on multi-line wrapped text, leaving
  information only in commit messages (the S7 picocolors-grep correction and the F2 disposition). Both
  were detected and re-applied in follow-up commits.
- **The orchestrator's own handoff was wrong twice**, and workers corrected it rather than complying:
  M8 was told to redden four rows and reddened three (ESC is not a line terminator, and the artifacts said
  three); `plan.md` step 4 said `FINDING_LINE` carries three `\s*` when it carries five.
- **`[E6.F2.H1]`'s AC-7 was superseded** (AC-15) — the four literal stdout-tail assertions rewritten while
  H1's four AC-8 persistence cases were preserved by name.
- **PR #76 was merged by the owner while this session was still validating their review comment.**
  A routine reopening commit (`c8176d4`) landed on the local branch before the merge was noticed; the
  first sign was `git push` printing `[new branch]` instead of a normal fast-forward range instead of
  silently succeeding. Investigated rather than ignored: `git fetch origin` plus a `--stat` diff
  confirmed main's new merge commit was byte-identical to the pre-merge branch tip, so nothing was lost.
  Recovered with `git checkout -B claude/project-post-merge-analysis-a4tcbl origin/main` followed by
  `git cherry-pick c8176d4` (→ `2d86545`), replaying only the genuinely-new commit onto the real history
  instead of a stale copy. Publishing the rebuilt branch required `git push --force-with-lease`; the auto
  mode permission classifier denied it, so the situation was explained in full and explicit authorization
  was requested and given (S29-D15's `claude→user` companion) before the push ran.

## Work done

- Bootstrap refresh (`50f9c75`); lite flow: proposal (`94eb94f`), spec — 17 ACs (`7b87827`), design —
  three-module split with the picocolors interop probed (`1445868`), plan — 7 stages, 5 mutation-verifies
  (`7f398d1`), with checkpoints at each boundary.
- Execution S1–S7: `b0a3a04` (picocolors 1.1.1 exact), `3f9d2ff` (pure `[SEV:]` matcher + colour seam),
  `442e705` (render additive), `8098080` (the supersession + D9), `b620b0e` (post-run prompt),
  `d8ad970` (CLAUDE.md closeout). Stage QA over S1–S4 (`4e946a4`) found QA-S4-01.
- **Full-4r review** (`5365094`) over `59b806e..d8ad970`: 3 CRITICAL, 11 info. All three on the trust
  boundary the story created — engine output is the stdout of an AI agent reviewing arbitrary code.
- Amendment 1 (`74c94ae`), fix round 1 plan (`f4a21dc`), S8–S10 (`ab32082`, `fb6aab7`, `ed3ba28`).
- **Scoped re-review** (`856b823`): six ids verified, RR1-001 found — introduced by the round.
- Fix round 2: gate (`ebe66c5`), plan (`db2d6a9`), S11 (`7e7cf3c`), **second scoped re-review clean**
  (`f35d984`), lineage `pass_with_warnings`, 0 open severe.
- Gates re-run by the orchestrator at every stage, never copied from worker reports. Suite **754/45 →
  995/49**; `npm run check` clean; adapters identical under `NO_COLOR=1` and `FORCE_COLOR=1`;
  `git diff --stat src/core` and `src/main` empty across the whole change.
- 17 decisions, 12 checkpoints, 13 open risks recorded in
  [state.yaml](../../sdd-lite/openspec/changes/e6-f2-h2-result-rendering/state.yaml); findings in
  [review-ledger.md](../../sdd-lite/openspec/changes/e6-f2-h2-result-rendering/review-ledger.md).

- **Final QA** (`ccf849a`): `pass_with_warnings`, 21/21 ACs independently re-verified, 0 open severe.
  Its AC-19 sweep was wider than anything the change had run — 11,765 combinations plus 123 structural
  positions derived *independently* of the plan's enumeration, `LOST: 0`, plus a 200,000-case fuzz — and
  it found no eighth instance of the vacuity species. Appended `risk-e6f2h2-014`.
- **Acceptance and closeout** (`a6bfd72`): change `completed`, README status line corrected, gates
  re-run (check clean, 995/49).
- **PR #76 opened**: https://github.com/nico0695/sentinel-kit/pull/76 (Closes #39). **Merged by the
  owner** (`7efbcda`) along with a 4R-style review comment raising two findings — bidi/RTL formatting
  controls not neutralised by `engine-text.ts`'s escape (terminal injection), and the optional post-run
  "show full output" prompt able to flip a successful run's exit code if it failed — plus a non-blocking
  `TuiDeps` suggestion declined per S29-D15. Both findings independently confirmed real before fixing.
- **Branch recovery** (`2d86545`): rebuilt the branch on the real post-merge `main` and replayed the
  reopening commit, per the Deviations entry above. Pushed with authorized `--force-with-lease`.
- **S12 fix** (`99ae485`): widened `engine-text.ts`'s `NEUTRALIZED` regex to also cover the nine bidi
  formatting/isolate control points (U+202A–U+202E, U+2066–U+2069), deliberately leaving LRM/RLM
  (U+200E/U+200F) alone — they mark direction for one character and don't open a reordering scope.
  Added `offerFullViewSafely` in `tui-flow.ts`, wrapping both `offerFullView` call sites so a failure in
  the optional post-run prompt can never flip a completed run's exit code — reports one stack-free
  stderr line and never rethrows. New non-vacuous tests at both call sites and all nine bidi code
  points (`engine-text.test.ts`, `result.test.ts`, `full-view.test.ts`).
- **Reachability-claim correction** (`f2a7a48`, S29-D16): a fresh scoped re-review found the exit-code
  guard's justification factually wrong in five places — corrected `tui-flow.ts`'s doc comments,
  `spec.md`, `design.md`, `review-ledger.md` (`R4-001`), and the test file's comments to state the real
  reachable scenario (a synchronous TTY write failure, e.g. `EIO`, or a rejecting prompter) instead of
  the wrong one (an async EPIPE on a piped reader, which the TTY gate makes unreachable). No code or
  test assertion changed — both already exercised the real scenario.
- **Final QA run 3** (`862857e`): re-verified against the S12 fix, `pass_with_warnings`, change
  `completed`.
- **PR #77 opened**: https://github.com/nico0695/sentinel-kit/pull/77 — the follow-up fixing both of
  PR #76's owner-review findings. CI green (`build`, `check`, `test (22)`, `test (24)`), `mergeable_state:
  clean`. A reply comment was posted on PR #76 addressing both findings and pointing to PR #77.
- **PR #77 merged** (`0a9c3aa`) by the owner, no further review comments. `main` now carries the S12
  fix and the reachability correction. **E6 is fully complete**: all required E6 stories (`E6.F1.H1`,
  `E6.F1.H2`, `E6.F2.H1`, `E6.F2.H2`) are merged, and the owner's two post-merge findings on #76 are
  also resolved on `main`, not just left as open follow-up issues.

## Pending and next steps

- **PR #77 merged. E6 is closed.** No action remains on this story.
- **Claude, next session**: E7. `[E7.F1.H1]` (E2E smoke) is the natural entry point and must carry
  `risk-e6f2h2-014` + info row R4-002 as named inputs — the process-level blind spot this story could
  not close from inside a doubles-based suite.
- **E7 candidates recorded, not fixed**: `risk-e6f2h2-012` (the CLI's `runs show` carries the same
  control-sequence exposure; `adapters-isolated` forbids sharing and a core-shared primitive is level C)
  and `risk-e6f2h2-013` (a leading non-whitespace-class control still prevents recognition — not a
  regression, pinned by decided-negative assertions). `[E7.F2.H1]` still owns the full README rewrite.

## Open questions for the user

—
