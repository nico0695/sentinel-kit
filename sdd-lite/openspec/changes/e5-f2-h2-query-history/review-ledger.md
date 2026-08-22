# Review Ledger

## Review Digest

- target_identity: e5-f2-h2-query-history full-story diff (14 files, ST-1..ST-4)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e5-f2-h2-query-history
- round: 1
- counts: confirmed=2 suspect=0 escalated=0 info=4
- open_severe_findings: 2
- verdict: fail
- next_action_digest: 2 confirmed CRITICAL findings (R3-001, R4-001) need a fix stage before final QA; route via review_gate — awaiting user authorization for a fix round through sddl-plan/stage_approval/sddl-executor.
- updated_at: "2026-08-22T22:20:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: `[E5.F2.H2]` Query history — `RunStore.list()`/`get()`, `listRuns`/`getRun` use cases, `RunMetadataSchema`, error family additions.
- target_kind: diff
- paths_or_diff_reference: `git diff origin/main...56fd37405526598e169892a23b93614618c3560f -- src/` (14 files)
- changed_lines: 1273 insertions, 23 deletions (1296 total) — over the 400-line full-4r threshold outright; also grepped for auth/security/payments/sensitive-data/migration markers, none genuine (only `usage.inputTokens`/`outputTokens`/`totalTokens` LLM token-count fields, not credentials)
- immutable_reference: commit `56fd37405526598e169892a23b93614618c3560f`
- created_at: "2026-08-22T22:00:00Z"

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R3-001 | reliability | `src/adapters/driven/storage/run-store-fs.ts:67-78,375-390` | CRITICAL | open | deterministic | introduced | yes | `get()`'s `"missing"` branch cannot distinguish "finalDir doesn't exist" from "finalDir exists but metadata.json is absent" — both produce `RunNotFoundError` unless a `.partial-<id>` sibling happens to exist, so a real corrupted run (dir present, metadata gone) is misreported as not-found, contradicting `list()`'s classification of the identical on-disk state as `corrupt`. | `run-store-fs.ts:67-78` (`readMetadata`), `:375-390` (`get()`'s missing branch, only checks staging sibling); verified independently by direct code read (orchestrator) — `readMetadata`'s ENOENT-on-`readFile` cannot tell "dir absent" from "dir present, file absent" apart, and `get()` never separately checks `exists(finalDir)` |
| R4-001 | risk-resilience | `src/adapters/driven/storage/run-store-fs.ts:310-318` | CRITICAL | open | deterministic | introduced | yes | A single "final" entry's raw non-ENOENT fs failure while reading its `metadata.json` inside `list()`'s loop (e.g. `EACCES`, `EMFILE`) is caught only to be rethrown as `RunPersistenceError`, which propagates out of the `for` loop and rejects the entire `list()` call — one bad entry makes every other already-classified run in the same repo invisible, contradicting AC-7's "none affecting the others" intent (tested only for classified missing/invalid-JSON/schema/version cases, never for this raw-fs-error class). | `run-store-fs.ts:310-318` (the uncaught-by-the-loop `throw` inside `for (const entry of entries)`), contrast with the `partial`/`corrupt` branches a few lines away that DO degrade gracefully; verified independently by direct code read (orchestrator) — the `throw` at line 314 has no enclosing per-entry recovery |
| R2-001 | readability | `src/adapters/driven/storage/run-store-fs.ts:346-447` | WARNING | info | deterministic | introduced | no | `get()`'s closure inlines validation, corrupt/missing/partial disambiguation, three body-file reads, and manual `RunRecord` reconstruction via 8 nested conditional spreads with no internal decomposition, unlike `save()`'s numbered-step comments and unlike `serializeRunMetadata`'s symmetric extraction into a pure, directly-unit-tested function in `run-layout.ts`. | `run-store-fs.ts:346-447`; contrast `run-store-fs.ts:173-261` (`save()`'s numbered comments); `run-layout.ts:1-13,112-150` (pure-function design principle + `serializeRunMetadata`); `run-layout.test.ts` (has a `serializeRunMetadata` suite, no deserialize counterpart) |
| R2-002 | readability | `src/adapters/driven/storage/run-store-fs.ts:263-344` | SUGGESTION | info | deterministic | introduced | no | `list()`'s closure inlines classification, precedence-merge, and sort with no numbered-step comments and no extraction of the merge/sort step into a pure, independently-testable function, unlike `classifyRunDirEntry` (which the same loop calls, and which IS extracted and unit-tested). | `run-store-fs.ts:263-344`; `run-layout.ts:56-88` (`classifyRunDirEntry`, extracted contrast) |
| R3-002 | reliability | `src/adapters/driven/storage/run-store-fs.ts:130-147` | WARNING | info | deterministic | introduced | no | `readOptionalValidationLogs` reads and includes every entry under `validations/` with no filter for the `NNN.log` naming convention; a stray non-log file (e.g. `.DS_Store`) is silently spliced into `validationOutput` as if it were a genuine log, and can shift array positions since `.` sorts before digits. | `run-store-fs.ts:130-147`; empirical repro by R3 (isolated scratch harness, no repo files touched) |
| R3-003 | reliability | `src/adapters/driven/storage/run-store-fs.ts:130-147` | WARNING | info | deterministic | introduced | no | Validation-log read order uses lexicographic (not numeric) sort; the zero-padded 3-digit writer convention (`NNN.log`) means a run with ≥1000 validation entries would read `"1000.log"` before `"999.log"`, silently misordering `validationOutput`. | `run-store-fs.ts:142-146`; empirical repro by R3 (isolated scratch harness) |

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| — | refuter | not run | Zero candidates qualified: both severe findings (R3-001, R4-001) are `evidence_class: deterministic`, which per protocol are never sent to the refuter — deterministic claims are verifiable by direct code inspection, not inferential speculation. The orchestrator independently re-verified both by reading the exact code paths before merging them into this ledger (see each row's proof_refs). |

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|
| — | R3-001, R4-001 | pending | — | not yet routed — awaiting review_gate decision |

## Verdict Rationale

- `fail`: 2 open CRITICAL findings (R3-001, R4-001), both `causal_disposition: introduced` (blocking-eligible per the severity model) and both independently re-verified by the orchestrator through direct code reading, not merely trusted from the lens report. Neither required the refuter (both deterministic). 4 additional findings (R2-001, R2-002, R3-002, R3-003) are `WARNING`/`SUGGESTION`, recorded as `info`, non-blocking per the severity floor.
- R1 Risk reported zero findings after specifically probing path-traversal, unsafe deserialization, and unauthorized access — the read side has no live caller yet (composition-root wiring is `E6.F1`), so no external trust boundary is currently crossed, and the path-traversal/JSON-parse safety properties are both implemented and tested.

## Next Recommended Action

- Raise a `review_gate` checkpoint to the user: both confirmed findings are inside this change's approved scope (they are defects in code `[E5.F2.H2]` itself wrote, not a scope-exceeding discovery) — the suggested route is rerunning `sddl-plan` to insert one bounded fix stage covering exactly `R3-001` and `R4-001`, then `stage_approval`, then `sddl-executor`. The blanket "ejecutar todo modo auto" authorization covers stage-to-stage pacing for the already-approved plan, not a new fix stage — CLAUDE.md's `stage_approval` requirement for code-touching work applies here independently, and the fix-routing protocol itself requires asking before starting any fix round.
- The 4 `info` findings are recorded, not blocking, and not part of the suggested fix stage — R2-001/R2-002 are a legitimate refactor opportunity (extracting `get()`'s deserialize logic symmetrically to `serializeRunMetadata`) and R3-002/R3-003 are real but narrower robustness gaps (stray-file filtering, >999-entry sort order) worth flagging to the user as optional follow-up, not mandatory for this story.

## Budget Notes

- Full-4r tier: 4 lens sweeps (one each, no second sweep needed — no lens reported it needed additional passes), 0 refuter passes (0 qualifying inferential-severe candidates), round 1 of 2 available fix rounds.
