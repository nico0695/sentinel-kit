# Review Ledger

## Review Digest

- target_identity: e5-f1-h1-process-runner @ 046ca31 (base 8c080cb)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e5-f1-h1-process-runner
- round: 1
- counts: confirmed=0 suspect=0 escalated=0 info=6
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: R4-001 fixed and scoped-re-reviewed clean (ST-5), mutation-proven. 6 info-tier findings remain recorded, non-blocking. Recommend sddl-qa-review in final mode.
- updated_at: "2026-08-23T02:15:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: ProcessRunner driven port + execa-backed adapter (src/core/run/ports/process-runner.ts, src/core/run/process-run-request.ts, run-errors.ts/index.ts edits, src/adapters/driven/exec/**)
- target_kind: diff
- paths_or_diff_reference: `git diff 8c080cb2112382dbd04c3074c6c2ff7b54beab57..046ca31f91cda3ed383cce5ead33842324d531e4 -- src/`
- changed_lines: 680 insertions, 3 deletions, 11 files
- immutable_reference: 046ca31f91cda3ed383cce5ead33842324d531e4 (base 8c080cb2112382dbd04c3074c6c2ff7b54beab57)
- created_at: "2026-08-23T01:45:00Z"

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R4-001 | resilience | src/adapters/driven/exec/process-runner-exec.ts:74-84 | CRITICAL | fixed | deterministic | introduced | yes | A genuine spawn failure's `ProcessSpawnError.cause` is built from the stripped `ExecaLikeResult` object, which never carries `command`/`args`/`cwd` — an operator debugging the error cannot tell which binary, arguments, or working directory actually failed to spawn. | src/adapters/driven/exec/process-runner-exec.ts:74-84 (object passed to classifyExecaResult has no command/args/cwd field); src/adapters/driven/exec/classify-execa-result.ts:20-28 (ExecaLikeResult interface structurally has no such field) and :49-54 (`cause: result` is exactly the stripped object); src/adapters/driven/exec/__test__/classify-execa-result.test.ts:70-88 (AC-14 test never asserts command/cwd presence); src/core/run/run-errors.ts module doc ("the raw underlying error is preserved in cause for observability" — the stated contract this construction does not honor for the single most operationally relevant field) |
| R4-002 | resilience | src/adapters/driven/exec/process-runner-exec.ts:61-71 | WARNING | info | deterministic | introduced | no | The adapter never sets `detached`/process-group options, so the timeout kill is delivered only to the immediate child pid, not to any grandchild the invoked command itself forks — such grandchildren can survive past the "hard wall-clock budget" and the forced kill, for any command that is itself a process-spawning wrapper (e.g. `npm test`). | src/adapters/driven/exec/process-runner-exec.ts:61-71 (no `detached` option); node_modules/execa/lib/terminate/kill.js:23-40 and main-async.js:101-102 (execa's kill path is a direct-pid `subprocess.kill()`, never a process-group kill); spec.md AC-1 ("the child is genuinely reaped ... not merely that the promise settles") and design.md's load-bearing test spawning only a single non-forking child |
| R1-001 | risk | src/adapters/driven/exec/classify-execa-result.ts:65-66 | WARNING | info | deterministic | introduced | no | `stdoutTruncated`/`stderrTruncated` can report a false positive on the stream that was NOT truncated, when only the other stream overflowed and this stream's genuine (untruncated) length happens to equal the budget exactly, because `isMaxBuffer` is execa's single global flag, not per-stream. | src/adapters/driven/exec/classify-execa-result.ts:65 (`stdoutTruncated = result.isMaxBuffer && result.stdout.length >= budget`); node_modules/execa/types/return/result.d.ts:108-111 (`isMaxBuffer` is one boolean for the whole run); src/adapters/driven/exec/__test__/classify-execa-result.test.ts (no boundary-equal-length test case) |
| R2-001 | readability | src/adapters/driven/exec/process-runner-exec.ts:69 | SUGGESTION | info | deterministic | introduced | no | `stripFinalNewline: false` silently diverges from execa's default and from both sibling engine seams, with no WHY-comment, even though every other option in the same bag is explained. | src/adapters/driven/exec/process-runner-exec.ts:69 (no comment); src/adapters/driven/engines/claude-code/process-runner.ts:77-88 (no override, so default `true` applies); src/adapters/driven/engines/opencode/process-runner.ts (same) |
| R3-001 | reliability | src/adapters/driven/exec/process-runner-exec.ts:52-56 | WARNING | info | deterministic | introduced | no | The adapter-owned `cwd`-must-be-absolute rejection (design.md D-2) has no test anywhere in the diff. | src/adapters/driven/exec/process-runner-exec.ts:52-56; src/adapters/driven/exec/__test__/process-runner-exec.test.ts and ProcessRunner.contract.ts (no relative-cwd case in either) |
| R3-002 | reliability | src/adapters/driven/exec/process-runner-exec.ts:70 | WARNING | info | deterministic | introduced | no | The `env` overlay behavior documented on the port ("overlaid on top of the inherited parent environment, never a replacement") is never exercised by any test. | src/core/run/ports/process-runner.ts:35; src/adapters/driven/exec/process-runner-exec.ts:70; no test in the diff sets `env` on a request |
| R3-003 | reliability | src/adapters/driven/exec/process-runner-exec.ts:27,58 | SUGGESTION | info | deterministic | introduced | no | `DEFAULT_MAX_OUTPUT_CHARS`'s default-selection path (when `maxOutputChars` is omitted) is never exercised — every test supplies an explicit value. | src/adapters/driven/exec/process-runner-exec.ts:27,58; src/adapters/driven/exec/__test__/process-runner-exec.test.ts:224 (only explicit-value case) |

Field rules and governing rules: per `sdd-lite/skills/_shared/sddl-review-ledger-contract.md` (severity floor, blocking requires `introduced`/`behavior-activated`/`worsened`, severity-to-risk mapping).

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| R4-001 | direct code reading (deterministic — refuter not applicable per protocol) | corroborated | Orchestrator independently re-read `process-runner-exec.ts:74-84` and `classify-execa-result.ts:20-28,49-54` and confirmed `ExecaLikeResult` structurally has no `command`/`args`/`cwd` field and the constructed object omits all three. No refuter pass launched: `evidence_class: deterministic` findings are never refuted per the ledger contract, and R4-001 was the only CRITICAL/BLOCKER finding — zero inferential-severe candidates qualified for the refuter batch. |

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|
| 1 | R4-001 | ST-5 (plan.md fix stage, `cp-review-gate` authorized) | 2026-08-23T02:15:00Z | Fix delta confined to `classify-execa-result.ts`/`process-runner-exec.ts` (production) plus their two direct test files — no spill into R4-002 or any info-tier finding. `ExecaLikeResult` now carries `command`/`args`/`cwd`; `ProcessSpawnError`'s `cause` and message both carry them for every genuine spawn failure. Mutation-proven: reverting the fix makes the new/extended regression tests fail for exactly the claimed reason. R4-001: `open` → `fixed`. |
