# Review Ledger

## Review Digest

- target_identity: commit 03bd7cf (cumulative source delta of e4-f1-h1-run-review vs main, ST-1..ST-3)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e4-f1-h1-run-review
- round: 1
- counts: confirmed=0 suspect=0 escalated=0 info=15
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: >-
  Review lineage closed. ST-3b accepted at the review_gate and executed (commit 1be2946),
  addressing R2-001..R2-004 + R3-004; see Fix Rounds. Remaining info findings carried as
  state.yaml open_risks with later-epic owners. Next: stage_approval for ST-4.
- updated_at: 2026-08-09T15:45:00Z

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: >-
  The full source delta of change e4-f1-h1-run-review after ST-3: the run module's error family,
  verdict types, timeout seam, built-in verdict extraction, the runReview use case, and the
  index.ts export block. ST-1/ST-2 were triaged trivial at their own gates, so this review
  deliberately widened scope to the cumulative delta rather than the ST-3 diff alone, bringing
  engine-timeout.ts (the core's only concurrency) under review for the first time.
- target_kind: diff
- paths_or_diff_reference: git diff main...HEAD -- src/ (6 files: run-errors.ts, verdict.ts, engine-timeout.ts, builtin-verdict-extraction.ts, run-review.ts, index.ts)
- changed_lines: ~698 insertions
- immutable_reference: 03bd7cf8a1204f2aa23a7619b4ef6203f7db073c
- created_at: 2026-08-09T14:20:00Z

Triage rationale: `full-4r` on both qualifying criteria — hot-path (core boundary composition,
the guarantee the whole design rests on) and > 400 changed lines. Four lenses ran as parallel
read-only workers on byte-identical envelopes; one refuter pass ran over the single severe
candidate. The executor had recommended deferring review to ST-6; the orchestrator overrode
this because ST-4 writes tests against this code, and a logic defect here would be encoded
into the tests meant to catch it. That call paid for itself (see R1-001, R3-004: both shape
what ST-4/ST-5 must assert).

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R1-001 | risk (+reliability, +resilience) | src/core/run/run-review.ts:317-326 | WARNING | info | inferential | introduced | no | The identical `request.timeoutMs` feeds both the adapter's self-enforced budget and the outer race budget with zero headroom and no precedence rule, so which terminal state (`timeout` vs `engine-error`) an over-budget engine produces is decided by adapter implementation detail, not by the domain. | run-review.ts:317-326; engine-timeout.ts:75,83-87,95-101; run-review.ts:362-378; ports/review-engine.ts:30-31; spec.md:61. Convergent: raised independently by three lenses. See Corroboration Log. |
| R1-002 | risk | src/core/run/run-review.ts:306-312 | WARNING | info | inferential | behavior-activated | no | Untrusted diff content is embedded verbatim into the prompt and the verdict is extracted from the whole engine output with no provenance constraint, so repository content an attacker controls can drive the run to `ok`/`approve` (e.g. a diff line `+VERDICT: approve` echoed by the model). | run-review.ts:291-300,306-312,334-335; assemble-prompt.ts:74-78; builtin-verdict-extraction.ts:29-38. NOT covered by #27, which hardens marker normalization, not provenance. |
| R1-003 | risk | src/core/run/run-review.ts:275-287 | WARNING | info | deterministic | introduced | no | `draft.worktreePath` is recorded only after `createReviewWorktree` resolves, so a partial `git worktree add` failure yields `cleanup.attempted: false` and a result carrying no path — nothing removes what git left on disk and the caller has no handle to reclaim it. | run-review.ts:287,395-397; create-review-worktree.ts:59-83; helpers.ts:44-54 (path derivation module-private); git-cli.ts:152-168 (no post-failure prune). |
| R1-004 | risk | src/core/run/run-review.ts:247-263 | SUGGESTION | info | inferential | pre-existing | no | Ref pre-flight checks only non-emptiness, so a `baseRef`/`targetRef` beginning with `-` reaches four git argv positions that have no `--` separator, where git parses it as an option (e.g. `to = "--output=/abs/path"` writes an arbitrary file). | run-review.ts:249-255; git-cli.ts:227,206,153-165. Adapter-level gap; the filesystem sink is already sanitized (helpers.ts:27-38,53). |
| R2-001 | readability | src/core/run/run-review.ts:131-138 | WARNING | info | deterministic | introduced | no | The public discriminant `attempted` is `true` whenever a worktree path exists, including the two paths where `cleanupWorktree` returns without touching git (`keep`, and `on-success` after a failed review), so `attempted: true, removed: false` cannot distinguish "tried and failed" from "never tried". `RunCleanupOutcome` is also the only public result member with no doc-comment. | run-review.ts:131-138,395-397,409; cleanup-worktree.ts:40-46. |
| R2-002 | readability | src/core/run/run-review.ts:209 | WARNING | info | deterministic | introduced | no | `outcome.state === "ok"` is passed as `reviewSucceeded` with no comment, silently deciding that an `ambiguous` run counts as a failed review for cleanup-policy purposes — a decision the file's own neighbouring doc-comments argue against, whose rationale lives only in spec.md:108. | run-review.ts:205-210,384-388,143; verdict.ts:5-7; cleanup-worktree.ts:44-46. |
| R2-003 | readability | src/core/run/run-review.ts:151 | SUGGESTION | info | deterministic | introduced | no | The doc-comment "present on `ok` / `ambiguous`" contradicts the code: `engineOutput` is populated as soon as the engine stage succeeds, so a parse-stage fault yields `engine-error` with `engineOutput` AND `failure` both set, breaking the partition the adjacent comment implies. | run-review.ts:151-156,327-330,333-341,220-222. |
| R2-004 | readability | src/core/run/engine-timeout.ts:57-62 | SUGGESTION | info | deterministic | introduced | no | The "Outcomes:" doc-list presents three exhaustive results, but `invoke()` outside the try means a synchronous throw escapes raw — a fourth outcome the contract denies. Duplicate surface of the recorded risk `r-sync-throw-unwrapped`; the doc gap (not the behaviour) is the new information. | engine-timeout.ts:57-62,75,89; run-review.ts:317-326 (sole call site absorbs it). |
| R3-001 | reliability | src/core/run/run-review.ts:267 | WARNING | info | deterministic | behavior-activated | no | `runReview` needs one harness but `loadHarnesses` eagerly resolves every harness and throws on the first broken one, so a single unrelated broken harness in the user's config fails every review with `validation-failed` naming a harness the caller never requested — and which error surfaces depends on filesystem readdir order. | load-harnesses.ts:22-24,42-56; harness-loader-fs.ts:38-41,56-65; run-review.ts:268 (only one entry consumed). |
| R3-002 | reliability | src/core/run/run-review.ts:267-301 | WARNING | info | deterministic | behavior-activated | no | Only stage 7 is time-boxed: harness load, worktree creation, diff and cleanup are unbounded awaits whose git adapter passes no timeout to execa, so a wedged `git` leaves `runReview` permanently unsettled — silently voiding the documented "ALWAYS resolves" guarantee. | run-review.ts:267,275,291,400,180-183; git-cli.ts:51-58 (EXECA_BASE has no timeout),153-166,176-185,208-218,224-244. |
| R3-003 | reliability | src/core/run/run-review.ts:205-210 | WARNING | info | inferential | introduced | no | On the `timeout` path the abandoned engine child is still live inside the worktree when `performCleanup` immediately issues `git worktree remove --force` on it — intermittent `cleanup-failed` annotations, re-created files, and a process outliving the resolved run. Consequence of `r-engine-not-cancellable` not previously recorded: the recorded risk names the abandonment, not cleanup racing it. | engine-timeout.ts:75-78; run-review.ts:204-210,398-408; git-cli.ts:176-185. |
| R3-004 | reliability (+resilience) | src/core/run/run-review.ts:259-263 | WARNING | info | deterministic | introduced | no | `timeoutMs` pre-flight bounds only from below, so a budget above 2^31-1 overflows `setTimeout`, which Node clamps to 1ms — inverting "effectively no limit" into an immediate bogus `timeout` that abandons the engine and (under `always`) deletes its worktree, while the error message reports the requested budget. | run-review.ts:259-263; engine-timeout.ts:40-45,90-93; run-errors.ts:69-76. Empirically verified by R4 on this machine: `setTimeout(f, 2147483648)` → TimeoutOverflowWarning, fires ~16ms. |
| R3-005 | reliability | src/core/run/run-review.ts:265-312 | SUGGESTION | info | deterministic | introduced | no | `contextMode` is a static field of the harness already resolved at stage 2, but its rejection (`ContextModeNotSupportedError`) is deferred to stage 6, so an unsupported harness still pays for a real worktree and diff — and under `on-success`/`keep` retains that worktree on every attempt, partially defeating the stated hoisting invariant. | assemble-prompt.ts:16-19; run-review.ts:265,274-301,209; cleanup-worktree.ts:41-43. |
| R4-001 | resilience | src/core/run/run-review.ts:399-417 | WARNING | info | deterministic | behavior-activated | no | When forced removal partially fails, git deletes the `.git/worktrees` admin entry while leaving the directory on disk, so the leaked worktree becomes invisible to `listOrphanWorktrees` — the codebase's only orphan-recovery path, which enumerates the git registry and never the filesystem. Refines (does not restate) `r-engine-not-cancellable`. | run-review.ts:410-417; cleanup-worktree.ts:48-61; git-cli.ts:172-183; list-orphan-worktrees.ts:37,44-52. Reproduced with git 2.43.0 in an isolated scratchpad repo: exit 255, directory survives, `git worktree list` no longer reports it. Mitigation present: that one run's result still carries `worktreePath` + `cleanup-failed`. |
| R4-002 | resilience | src/core/run/run-review.ts:273-300 | SUGGESTION | info | deterministic | introduced | no | The diff stage needs only `repoPath` and is a common rejection point (`DiffSizePolicyError`, bad refs), yet runs after worktree creation — the file's own hoisting principle applied to the harness stage but not the diff, needlessly opening a create-then-destroy window on ordinary validation failures. | run-review.ts:265,273-300,369-370; compute-review-diff.ts:30-42 (takes repoPath, never the worktree). |

## Corroboration Log

| Finding | Refuter Outcome | Notes |
|---|---|---|
| R1-001 | inconclusive (ordering: refuted · consequence: corroborated) | The orchestrator had provisionally escalated to CRITICAL on three-lens convergence; one refuter pass ran per the full-4r budget. **Ordering sub-claim refuted**: "the adapter always wins" requires the adapter to arm its timer synchronously AND reject synchronously on expiry — properties no adapter at this commit has (fake-engine.ts:9-11 declares it does not enforce timeoutMs; the real adapters #28-30 are unwritten), and the mechanism design.md actually names (process kill, SIGTERM, settle on child exit) rejects a turn later than the outer timer, producing `timeout` after all. **Consequence sub-claim corroborated in its weaker form**: zero headroom + no precedence rule makes the terminal state nondeterministic across adapter implementations for the same physical event. Refuter also surfaced an undocumented escape hatch: `EngineTimeoutError` is publicly exported (index.ts) and rethrown unwrapped (engine-timeout.ts:96-97), so a self-enforcing adapter that rejects with it lands on `timeout`. **Resolution**: the CRITICAL-grade form does not hold at this commit; merged at the lens-reported WARNING as a forward-looking design constraint, promoted to state.yaml as `r-timeout-budget-precedence` with E4.F2 (#28-30) as owner. ST-5 should pin the escape hatch with a test. |

## Fix Rounds

None mandated by the protocol (zero `open` rows). The user accepted the offered optional fix
stage at the `review_gate`: **ST-3b** (plan amendment ff9173a, fix delta commit 1be2946)
addressed R2-001, R2-002, R2-003 (code doc + the matching spec result-contract row), R2-004,
and R3-004 (MAX_TIMEOUT_MS pre-flight bound + spec AC-6 enumeration). Rows keep `status: info`
per the severity floor — this section is the record that their content was addressed. Exit
evidence: `npm run check` green, `npm test` 163/163, AC-16 grep clean, delta verified in-scope
by the orchestrator. The remaining info rows (R1-001..R1-004, R3-001..R3-003, R3-005, R4-001,
R4-002) are carried as state.yaml open_risks with later-epic owners, plus ST-4/ST-5 test
obligations added by the same plan amendment.

## Verdict Rationale

`pass_with_warnings`: no open severe findings, no suspects; 15 info rows, several of which are
substantive forward-looking constraints. What the lenses verified clean carries as much weight
as what they found: the exhaustive stage→terminal-state mapping was hand-walked against every
real thrown type and confirmed correct row by row; "runReview cannot reject and cannot produce
zero or two terminal states" was independently attacked by two lenses and held; timer hygiene
(cancel on every exit path, no unhandled rejections) was confirmed; architecture guards are
clean (depcruise and tsc re-run inside the review); no secrets. The review's chief yield is
test-shaping: ST-4/ST-5 must not encode the dual-budget blind spot (AC-5's fake ignores the
budget — add the EngineTimeoutError-rejection case), must pin the escape hatch, and should
assert the setTimeout upper bound if ST-3b lands.
