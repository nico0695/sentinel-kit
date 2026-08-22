# Review Ledger

## Review Digest

- target_identity: e5-f2-h1-run-store, full ST-1..ST-4 implementation diff (`4497f01..52e797c`)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e5-f2-h1-run-store
- round: 1
- counts: confirmed=0 suspect=0 escalated=0 info=1
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: No fix loop needed. 1 info row (R4-001, non-blocking) and 1 refuted CRITICAL row (R1/R3-001, refuted with a residual nuance recorded — see Corroboration Log) — both purely informational. Recommend proceeding to `sddl-qa-review` (final mode).
- updated_at: "2026-08-22T16:45:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: Story `[E5.F2.H1]` (issue #33) — `RunStore` port, `RunRecord` shapes, error family, and a filesystem adapter (`run-store-fs.ts` + `run-layout.ts`) persisting runs to `runs/<repo>/<ts>/`. First content in `src/core/history/`.
- target_kind: diff
- paths_or_diff_reference: `git diff 4497f01..52e797c -- src/core/history src/adapters/driven/storage`
- changed_lines: 1016 (1013 insertions / 3 deletions per `--stat`)
- immutable_reference: `4497f01..52e797c` (base = `origin/main` post-`[E4.F2.H3]` merge; head = ST-4/closing-gate commit)
- created_at: "2026-08-22T16:20:00Z"

## Triage

`full-4r` — 1016 changed lines exceeds the 400-line threshold outright (methodology matches `[E4.F2.H3]`'s ledger: counts both `+`/`-` lines including tests, not source-only). Grepped the diff's added lines for auth/security/payments/sensitive-data/migration markers — the only hits were `estimatedTokens`/`inputTokens` (usage token counts, not credentials) and the deliberate `DECOY-SECRET-TOKEN-DO-NOT-PERSIST` test fixture string — no genuine sensitive-surface trigger, but the line count alone already mandates `full-4r`, so all four lenses ran plus one refuter pass over the sole severe inferential finding.

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R1/R3-001 | risk + reliability (merged, same location/claim) | `src/adapters/driven/storage/run-store-fs.ts:84-139` | CRITICAL | refuted | inferential | introduced | no | Two concurrent `save()` calls for the identical `repoName`+`startedAtEpochMs` share one deterministic `stagingDir`; the unconditional `rm`+`mkdir` remnant-clear at step 6 races with the other call's in-flight writes, allegedly letting a winning `rename` succeed with a `finalDir` mixing both records' files with no error surfaced to either caller. | `run-store-fs.ts:102-104` (unconditional `rm`+`mkdir`, no lock), `run-store-fs.ts:84-96` (pre-check has no lock), `RunStore.contract.ts:78-92` (existing test only awaits sequentially) |
| R4-001 | resilience | `src/adapters/driven/storage/run-store-fs.ts:141-143` | WARNING | info | inferential | introduced | no | The catch block's best-effort `rm(stagingDir)` cleanup silently discards its own failure via `.catch(() => {})`; if cleanup itself fails for a genuine reason (permissions, busy handle — `force:true` already absorbs `ENOENT`), the original error is correctly preserved as `cause`, but a second, distinct failure mode is masked with zero diagnostic trace, and the `.partial-` remnant from the current run persists. | `run-store-fs.ts:140-143` |

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| R1/R3-001 | refuter | refuted | Refuter traced every constructible interleaving of two concurrent `save()` calls for the identical record, step by step through `save()`'s actual `await` boundaries (Node's single-threaded, interleave-only-at-`await` model — not real parallelism). Result: **in every interleaving, exactly one call's `rename(stagingDir, finalDir)` targets a `stagingDir` that has already been consumed by the other call's `rename`, or a `finalDir` that already exists** — because both calls share the identical deterministic path pair and `rename` can only succeed once per source. That call is guaranteed to throw (`ENOENT` or `ENOTEMPTY`/`EEXIST`), caught by the existing `catch` block, and surfaces as `RunPersistenceError` to that caller. This directly refutes the claim's load-bearing clause — "a winning rename succeeds... and no error surfaced to either caller" — since the losing caller is *always* errored. **Residual nuance, not re-opened as a new finding per protocol (refuters may not add findings; recorded as an update to `risk-005` in `state.yaml` instead):** the refuter's own trace confirms content-mixing inside the *winning* caller's `finalDir` remains plausible before the loser's rename fails — the winner can resolve successfully with a directory containing an interleave of both records' writes. This is a narrower, already-covered case of `risk-005` (concurrent-save collision handling is accepted, bounded, and never corrupts more than one directory's contents at a time), sharpened with this specific mechanism rather than escalated, since neither of this story's own acceptance criteria nor any downstream story depends on concurrent saves of the identical record being safe. |

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|

No fix round opened. `R1/R3-001` left the fix loop via `refuted`. `R4-001` is `info` and never enters the fix loop per the severity floor.

## Verdict Rationale

- `pass_with_warnings`: zero `open` severe findings after corroboration (the sole `CRITICAL` was refuted), one non-blocking `info` row (`R4-001`). No `BLOCKER`/`CRITICAL` finding stands `open`; nothing here requires a fix stage before `sddl-qa-review`.
- The refuter's rigor is worth noting: it did not merely assert the claim was wrong, it traced the actual `await`-interleaving semantics of `save()` step by step and showed the specific fs error (`ENOENT`/`ENOTEMPTY`) that structurally guarantees the losing concurrent caller is errored — a concrete, code-level counter-proof, not an opinion.
- `R4-001` (cleanup-failure masking) is real but low-impact: it affects diagnosability of a rare secondary failure, not correctness of the primary path, and the primary error (`cause`) is always preserved. Recorded as `info`; not pursued further per the severity floor.
- R2 (readability) returned clean: the change closely mirrors the established `config-store-yaml.ts` precedent, and its one piece of non-trivial control flow (the staging clear-then-recreate step, and the pre-check/rename race) is already explained in-file and matches the documented, accepted `D-7`/`risk-005` trade-offs rather than being silently introduced.

## Next Recommended Action

- Proceed to `sddl-qa-review` (final mode) — no fix stage is warranted. `state.yaml`'s `risk-005` text should be updated with the refuter's sharper mechanism detail (content-mixing possible in the winning caller's directory before the loser's rename fails) as a documentation refinement, not a new finding.

## Budget Notes

- `full-4r`: 4 lens sweeps (one each), 1 refuter pass over the single severe inferential finding — within budget. Zero fix rounds used (0 of the 2-round cap).
