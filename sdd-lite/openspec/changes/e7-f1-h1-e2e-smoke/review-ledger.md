# Review Ledger

## Review Digest

- target_identity: `f5cd81f20af7ee6519ee57ee88afc2a880b1b908` / diff `e590a73~1..f5cd81f` (code+config), sha256 `0e9569b41eff2d894ef55c7253b80ff274aefc7b48b685bec9da32096d0acd93`
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e7-f1-h1-e2e-smoke
- round: 1
- counts: confirmed=1 suspect=0 escalated=0 info=13
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: >-
    Scoped re-review of the ST-7 fix delta (`520aa8b..90a4233`, sha256 `8f177e35…`) verified
    R3-001 closed by an independent trace of the fixture — the divergent `main` commit makes
    the `mergeBase` -> `baseRef` mutation produce a two-file diff, so both the `fileCount`
    and the paired `unrelated.ts` assertions would go red. All ten fix ids closed, R3-005
    correctly not added. Two new SUGGESTION rows, neither blocking. Zero open severe
    findings, so the review protocol is done; `sddl-qa-review` in final mode is the only
    remaining stage and the only one that may mark the change completed. Round 1 of 2 was
    consumed by ST-7; round 2 is unspent.
- updated_at: "2026-09-30"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|
| 1 | `f5cd81f` / diff sha256 `0e9569b4…` | 4r | full-4r | 1 of 2 | pass_with_warnings (was `fail`; R3-001 fixed and verified by scoped re-review) | 2026-09-30 |

## Target

- description: Story `[E7.F1.H1]` (issue #41) — the repo's first `e2e/` root: a smoke test of register → review → history, plus the optional test-only `ReviewEngine` seam in the composition root and the quality-gate widening that brings `e2e/` under biome and tsc.
- target_kind: diff
- paths_or_diff_reference: `src/main/container.ts`, `e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts`, `tsconfig.json`, `biome.json`
- changed_lines: 490 (488 insertions, 2 deletions) — over the 400-line threshold, which is what put this target in the `full-4r` tier
- immutable_reference: commit `f5cd81f20af7ee6519ee57ee88afc2a880b1b908`; frozen diff sha256 `0e9569b41eff2d894ef55c7253b80ff274aefc7b48b685bec9da32096d0acd93` (547 lines)
- created_at: "2026-09-24"

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R3-001 | reliability | `e2e/review-flow.test.ts:205` | CRITICAL | verified | deterministic | introduced | yes | The diff and prompt stages — the literal middle of the flow the suite claims to cover — are completely unobserved: `prompt.md` is only asserted to be non-empty and `metadata.diff` is never read, so an empty, wrongly-ranged or diff-less prompt passes both tests green. | `e2e/review-flow.test.ts:188,328` (the only prompt assertion is `.length > 0`); orchestrator re-verified: `grep` for `metadata.diff`/`fileCount`/`totalLines` in the test file returns NOTHING, while `run-layout.ts:127-138` persists `diff.{fileCount,totalLines,estimatedTokens,truncated}`; `assemble-prompt.ts:23-28` — a zero-file diff still renders several KB, so `length > 0` cannot distinguish full diff from no diff; `fake-engine.ts:51` discards the request, so nothing else observes the prompt; four named surviving mutations incl. `computeReviewDiff` using `from: request.baseRef` instead of `mergeBase`, which destroys PR semantics (CLAUDE.md §Architecture) |
| R3-002 | reliability | `e2e/review-flow.test.ts:236` | WARNING | info | deterministic | introduced | no | Worktree cleanup is asserted only via the parent directory that `git worktree add` creates, so a review that leaks its worktree — the ephemeral-worktree guarantee of PRD §5.1 — still passes. | `e2e/review-flow.test.ts:236-238` inspects `<home>/worktrees`, one level above the leaf; `src/core/workspace/helpers.ts:44-52` — the worktree is `<worktreesDir>/<repoBasename>/<label>-<ts>`; surviving mutations: `cleanupPolicy` defaulting to `keep`, `cleanupWorktree` returning `policy-keep`, or `worktree remove` losing `--force` |
| R3-003 | reliability | `e2e/review-flow.test.ts:190` | WARNING | info | deterministic | introduced | no | Nothing in either test asserts a single line of the `review` command's stdout, so the primary user-visible output of the flow's terminal command can render garbage — or omit the verdict entirely — with the suite green. | Orchestrator re-verified: the review leg asserts only `reviewed.io.err` and `reviewed.code` (`:176-177`, `:315-316`); `io.out` never inspected; `format-review.ts:58-69,91-110` emits ten `key\tvalue` lines; the `state`/`verdict` assertions at `:228-230` are on `formatRunRecordBlock`, a different renderer |
| R3-004 / R4-003 / R1-003 | reliability + resilience + risk | `vitest.config.ts:31` | WARNING | info | inferential | introduced | no | The new e2e tests spawn roughly twenty git subprocesses each under vitest's default 5000 ms per-test timeout while 49 other test files run in parallel workers, so the suite is liable to flake red on a 2-vCPU ubuntu-latest runner. | Converged independently by three lenses. `vitest.config.ts:27-34` sets no `testTimeout` at project or root level (vitest default 5000 ms); ~10 git spawns in the fixture plus ~11 in the review leg; `GitPort.contract.ts:103-105` — the repo's other git-spawning suite provisions in `beforeEach` under the 10 s hook budget, so this suite moved the same work under a tighter one; `ci.yml` runs the aggregate on Node 22 and 24, so the e2e worker competes for CPU (the 2/2 determinism observation was of the e2e project in isolation) |
| R4-001 / R1-002 | resilience + risk | `e2e/support/hermetic-git.ts:76` | WARNING | info | deterministic | introduced | no | If any of the ten `git` spawns in `createHermeticRepo` rejects, the temp root created before them is never returned and never registered for teardown, so the fixture directory (bare origin + clone) leaks with its path unrecoverable. | Converged independently by two lenses. `hermetic-git.ts:76` creates the root, ten awaited `git(...)` calls follow with no try/finally, and the root is exposed only by the `return`; `review-flow.test.ts:98-99,250-251` register AFTER the await; the `afterEach` comment at `:90-91` claims no leak on failure, which holds for assertion failures but not setup failures. In-scope triggers: git absent, git < 2.28 rejecting `init -b`, full or read-only tmpfs, push failure |
| R1-001 | risk | `e2e/support/hermetic-git.ts:37-44` | WARNING | info | deterministic | introduced | no | `HERMETIC_GIT_ENV` spreads `process.env` and neutralises only `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`, so ambient `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and the `GIT_CONFIG_COUNT/KEY/VALUE` channel still reach every fixture spawn — and that channel can set exactly the `core.hooksPath` the doc-comment claims is unreachable. | `hermetic-git.ts:37-44` (no `GIT_DIR`/`GIT_CONFIG_COUNT` entry) vs the doc-comment at `:30-36`; every spawn goes through `execa("git", args, { env: HERMETIC_GIT_ENV })` at `:46-48`; ordinary triggers named: `npm test` from a git hook, `git bisect run npm test`, `git rebase --exec`. **Lens disagreement, recorded rather than averaged** — R3 raised the same claim at SUGGESTION, while R4 inspected the identical code and deliberately did NOT report it, judging it too niche for the precision gate. Two of three lenses reported it |
| R3-005 | reliability | `e2e/review-flow.test.ts:243` | SUGGESTION | info | deterministic | introduced | no | Exit code 2 — the entire non-`ok` arm of the documented exit-code contract — is unexercised, so `resolveReviewExitCode` can be mutated to return 0 for every failed or ambiguous run without either test noticing. | `exit-code.ts:52-58`; ST-5's M3 only mutated the `request-changes` arm, so this branch was never probed; `review-command.ts` EXIT_CODE_HELP documents `2` as a contract scripts branch on |
| R3-006 | reliability | `e2e/review-flow.test.ts:150-160` | SUGGESTION | info | deterministic | introduced | no | Passing both `--local-path` and `--base-branch` means `registerRepo` performs zero git work, so its default-branch detection is unexercised and `metadata.baseRef` merely echoes a flag the test itself supplied. | `register-repo.ts:80-113` — `clone` runs only without `localPath`, `defaultBranch` only without `baseBranch`; `review-flow.test.ts:216` asserts a value the same test passed in three legs earlier |
| R4-002 | resilience | `e2e/review-flow.test.ts:92` | SUGGESTION | info | deterministic | introduced | no | The teardown loop clears the registry with `splice(0)` before deleting anything and does not isolate each removal, so one `rmSync` failure aborts the loop and destroys the record of the remaining roots. | `review-flow.test.ts:92-94`; `force: true` suppresses ENOENT only — EACCES/EBUSY still throw |
| R2-001 | readability | `e2e/support/hermetic-git.ts:40` | SUGGESTION | info | deterministic | introduced | no | `HERMETIC_GIT_ENV` is exported with no consumer anywhere in the repo, so a reader must assume something depends on it and cannot change it freely. | Repo-wide grep: 4 hits, 2 in this file (the only use site is its own `git()` helper at `:51`) and 2 in an independent module-private copy; the origin it restates keeps it unexported (`git-cli.test.ts:52`) |
| R2-002 | readability | `e2e/review-flow.test.ts:286` | SUGGESTION | info | inferential | introduced | no | The second test's copy of the `run` helper is byte-identical to the first but drops its rationale, so the second scenario no longer explains why a fresh dependency graph is built per CLI leg. | `:134-157` carries the doc comment, `:283-305` is the same body without it; the invariant is load-bearing per `container.ts:14-23` (property 1). R2 judged the duplication on merit rather than deferring to the recorded decision, and found the duplication itself acceptable — only the lost rationale defensible |
| RR1-001 | scoped re-review | `e2e/support/hermetic-git.ts:96` | SUGGESTION | info | inferential | introduced | no | The cleanup `rmSync` in the `createHermeticRepo` catch block is unguarded, so an EACCES/EBUSY there would throw and replace the original provisioning error the fix intended to rethrow unchanged. | `hermetic-git.ts:93-98`; the equivalent call in `afterEach` IS guarded (`review-flow.test.ts:96-100`), so the fix is internally inconsistent about the same hazard. Found by the scoped re-review, i.e. introduced BY the fix, not by the original diff |
| RR1-002 | scoped re-review | `e2e/support/hermetic-git.ts:168` | SUGGESTION | info | deterministic | introduced | no | The final `checkout -q main` is now a no-op because the fixture has been on `main` since line 149, and its comment ("leave the clone on the base branch") reads as if it undoes a checkout of the feature branch. | `hermetic-git.ts:149,165-168` — the first `checkout -q main` was added by ST-7 to commit `unrelated.ts` |

Blocking rows: 0 after fix round 1 (R3-001 verified). Info rows: 13 — 11 from the original four lenses after merging 3 duplicate claims, plus 2 from the scoped re-review.

## Corroboration Log

The refuter pass takes only `BLOCKER`/`CRITICAL` findings whose `evidence_class` is `inferential`; deterministic findings are never refuted.

| Candidate | Evidence Class | Outcome | Note |
|---|---|---|---|
| R3-001 | deterministic | not eligible | The sole severe finding is deterministic, so the refuter has no candidates and the pass was correctly not run. Budget unspent. |

Instead of a refuter pass, the orchestrator re-verified R3-001 directly against the code: `grep` for `metadata.diff`, `fileCount` and `totalLines` in `e2e/review-flow.test.ts` returns nothing, `prompt.md` appears only inside two `.length` assertions (`:188`, `:328`), and `run-layout.ts:127-138` confirms the metadata the test could have asserted is already being written. The claim holds on direct inspection.

## Cross-Lens Convergence

Worth recording because it is the signal this protocol is built to produce — the lenses were blind to each other:

- The temp-root leak before teardown registration was found independently by **risk** and **resilience**.
- The default 5 s test timeout was found independently by **risk**, **reliability** and **resilience**.
- `HERMETIC_GIT_ENV` hermeticity was reported by **risk** (WARNING) and **reliability** (SUGGESTION), and explicitly considered and rejected as too niche by **resilience**. That disagreement is preserved above rather than averaged into a single severity.

## Notable Clean Results

Recorded because they were the specific risks the change was designed around, and a reviewer should be able to see they were checked rather than assumed:

- **The d-003 containment holds.** Risk traced every reference to `engineOverride` / `createCliDeps`: the only production call site is `src/main/cli.ts:30` with `createCliDeps({ version: pkg.version })`, built from no argv, config or env input. `EngineNameSchema` is untouched, `TuiDepsOptions` deliberately omits the field, and `package.json` is bin-only with no `main`/`exports`, so `createCliDeps` is not even an importable library surface. The seam is unreachable at runtime from any user-facing input. Reliability and resilience concurred independently.
- **No escape path in the recursive deletion.** Both roots handed to `rmSync(..., { recursive: true, force: true })` derive solely from `realpathSync(mkdtempSync(...))`; no external data enters either path, and Node unlinks symlinks rather than recursing through them.
- **No shell or argument injection.** Every git invocation uses array argv through `execa` with no `shell: true` and no interpolation of external values.
- **The seam's failure semantics are unchanged.** With the field omitted the expression is byte-identical to the previous call, so per-invocation construction, the `default:` throw and the `SENTINEL_OPENCODE_MODEL` path are all intact.
- **Test isolation is sound.** Separate temp homes and fixtures per test, no shared mutable state, no order dependence, and teardown survives a mid-test assertion failure.
- **The ST-5b assertions are non-vacuous**, independently confirmed: `readdirSync` throws where the directory was never created, rather than passing silently as `existsSync` would.

## Verdict

`fail` — one open CRITICAL. Note what this verdict is and is not: it is not a defect in the product, which the suite exercises correctly end to end. It is a hole in the safety net itself. The story's headline acceptance criterion is "fails if any piece of the flow breaks", and R3-001 names four concrete mutations in the middle of that flow — including one that destroys the PR diff semantics the PRD mandates — that leave both tests green. Shipping the net with that hole would deliver false confidence, which is the specific failure mode this story exists to prevent.

Zero of two fix rounds used at the time of the original verdict; see Fix Round 1 below.

## Fix Round 1

Applied as stage ST-7 under decisions d-012, d-013 and d-014. **Round 1 of a maximum 2 is consumed.** The fix delta is the ST-7 commit; the scoped re-review sees only this ledger plus that delta, never the original diff again.

| Ledger id | Status after ST-7 | What changed | Evidence |
|---|---|---|---|
| R3-001 | fixed (awaiting verification) | `metadata.diff` is now read (`fileCount` 1, `totalLines` > 0, `truncated` false); `prompt.md` is asserted by content — positive `<file path="widget.ts"` and `export const tightened = true;`, paired with the negative `unrelated.ts`. The fixture gained a commit on `main` made AFTER the feature branch is cut, without which `merge-base(main, feature) == main` and the `mergeBase` -> `baseRef` mutation was undetectable | M4 RED at `review-flow.test.ts:205`; M5 RED at `:203`; M6 RED at `:219` — each reverted with an empty diff. Orchestrator independently re-ran baseline, M4 and M5 |
| R3-002 | closed (info) | worktree LEAF asserted empty, complementing ST-5b's parent assertion | folded into ST-7 |
| R3-003 | closed (info) | `reviewed.io.out` asserted: `runDir\t<runDir>`, `state\tok`, `verdict\tapprove` | folded into ST-7 |
| R3-004 / R4-003 / R1-003 | closed (info) | `testTimeout` and `hookTimeout` 30000 on the `e2e` project only | `vitest.config.ts` diff |
| R4-001 / R1-002 | closed (info) | provisioning wrapped; a failure removes its own temp root and rethrows the original error | `hermetic-git.ts` diff |
| R4-002 | closed (info) | teardown isolates each `rmSync` and clears the registry after the loop | folded into ST-7 |
| R1-001 | closed (info) | `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_CONFIG_COUNT` set to `undefined` | `hermetic-git.ts` diff |
| R2-001 | closed (info) | `HERMETIC_GIT_ENV` no longer exported | `hermetic-git.ts` diff |
| R2-002 | closed (info) | rationale comment restored on the second test's `run` helper | folded into ST-7 |
| R3-006 | closed (info) | `--base-branch` dropped from the happy path only; fixture runs `git remote set-head origin main` so default-branch detection is real | M8 RED at `:187` |
| R3-005 | deferred | third scenario would exceed AC-12 / N-3 | follow-up issue, owed by the orchestrator |

Qualifications recorded honestly rather than smoothed over: under M4 the `fileCount === 1` assertion is shadowed by the earlier prompt assertion and is isolated only by M6; and M8 fails earlier than planned (the review leg exits 2 because `master` does not resolve) rather than at the `baseRef` assertion — detected, but by a coarser assertion.

## Scoped Re-Review (after fix round 1)

Target: the immutable fix delta `520aa8b..90a4233` restricted to `e2e/` and `vitest.config.ts`, sha256 `8f177e35a4b1cba8d81e5bd0e51dd9ea5364f45a35f582f224b5b63e4eff6787`, 232 lines. The reviewer read only the Findings Ledger table and the delta — deliberately **not** the Fix Round 1 section above, which is the orchestrator's own unverified summary and would have anchored its judgement. It changed nothing and applied no mutations.

**Every ledger row rechecked independently: closed.** R3-001, R3-002, R3-003, R3-004 (with R4-003, R1-003), R4-001 (with R1-002), R4-002, R1-001, R2-001, R2-002 and R3-006 were each judged `closed` with a file:line proof. R3-005 was confirmed *not* added — a grep shows exactly two tests, so AC-12 / N-3 holds.

**R3-001, traced rather than trusted.** Seed commit `S` (`widget.ts`=1) on `main`, pushed. `feature/tighten-widget` cut from `S` with `widget.ts`=2 plus the `tightened` line (`F`). Then `main` advances to `M = S + unrelated.ts`, pushed. `merge-base(main, feature)` = `S`, while the tip of `main` = `M`. The correct diff `S..F` is `widget.ts` alone (`fileCount` 1). The mutant computes `M..F`: `widget.ts` changed plus `unrelated.ts` as a deletion, so `fileCount` is 2 and the prompt contains `<file path="unrelated.ts"`. Both `diff.fileCount` `toBe(1)` and `not.toContain('unrelated.ts')` therefore fail under the mutation. The negative assertion is paired with two positives in the same test, so an empty prompt fails them; `BASE_ONLY_FILE` is imported from the fixture and is the very constant written and committed, so no typo can decouple the negative from what it tests. This independently agrees with the orchestrator's own empirical M4 run, which went RED at `review-flow.test.ts:205`.

Also confirmed by the reviewer: `undefined` env entries are dropped by `execa` (checked with a poisoned `GIT_DIR` in the parent), which closes the `GIT_CONFIG_COUNT` channel; `set-head` needs no network; nothing imports the now-private `HERMETIC_GIT_ENV`; the 30 s timeouts are sensible against a ~1.6 s isolated run.

**New findings: two `SUGGESTION` rows, both `info`, neither blocking** — RR1-001 (the catch-block cleanup is unguarded although the `afterEach` equivalent is guarded) and RR1-002 (the final `checkout -q main` is now a no-op with a misleading comment). RR1-001 is a genuine, if small, inconsistency in the fix itself. Neither was worth spending fix round 2 on.

## Verdict After Scoped Re-Review

`pass_with_warnings`. The original verdict was `fail` on R3-001; that finding is `verified`, so there are zero open severe findings. The 13 info rows are recorded and none blocks. The hole in the safety net that the original review found — an empty, wrongly-ranged or diff-less prompt passing both tests — is closed, and closed *demonstrably*: four mutations drive it RED. Fix round 2 is unspent.
