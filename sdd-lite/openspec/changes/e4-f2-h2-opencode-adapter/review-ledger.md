# Review Ledger

## Review Digest

- target_identity: `e9ee543e3616ae5d20ece66916c2a2c08a9d42be` (diff vs merge-base `aa664bbec265415b2e01cf2fb2cf97695cb4f403`, paths `src/`)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e4-f2-h2-opencode-adapter
- round: 1
- counts: confirmed=1 suspect=0 escalated=0 info=11 refuted=1 · after ST-6: fixed=5 (1 severe + 4 info), info-remaining=7
- open_severe_findings: 0 (R1-001 fixed in ST-6; awaiting scoped re-review to reach `verified`)
- verdict: fail (round 0) — superseded pending scoped re-review of the ST-6 fix delta
- next_action_digest: ST-6 landed the fix for R1-001 plus the four bundled conformance findings (R2-001, R3-002, R3-003, R4-002), all five now `fixed`. All three mutations (text-order reverse, timeout-budget swap, gate removal) now FAIL the suite where two of them previously survived it. `npm test` 284/284. Next: scoped re-review of the fix delta to move the five rows to `verified`, then ST-5.
- updated_at: "2026-08-16T02:45:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|
| 1 | `e9ee543` (src/ diff vs `aa664bb`) | 4r | full-4r | 0 | fail | 2026-08-16T02:10:00Z |

## Target

- description: `[E4.F2.H2]` opencode `ReviewEngine` adapter — 5 new source files, 1 new test file, 1 barrel export line
- target_kind: diff
- paths_or_diff_reference: `git diff aa664bb...e9ee543 -- src/`
- changed_lines: 1062 (1059 added, 3 deleted)
- immutable_reference: `e9ee543e3616ae5d20ece66916c2a2c08a9d42be`
- created_at: "2026-08-16T02:10:00Z"

Tier rationale: `full-4r` on two independent triggers — 1062 changed lines (> 400) and a permissions-relevant surface (the `OPENCODE_CONFIG` deny-permission injection guarding a write-capable-by-default CLI).

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R1-001 | risk | `src/adapters/driven/engines/opencode/opencode-adapter.ts:120-131` | CRITICAL | fixed | deterministic | introduced | **yes** | The real invocation's `exitCode`/`signal`/`timedOut` are never read, so a run killed or exiting non-zero after emitting any `text` event resolves as a complete, successful `ReviewResult` carrying a verdict. | Converged independently by `risk` and `resilience` lenses. Orchestrator reproduced both paths against the real adapter: `{stdout: <partial>, signal:"SIGTERM", timedOut:true}` → resolved `{"output":"VERDICT: approve\n[SEV: minor] partial..."}`; `{stdout:<partial>, exitCode:1}` → resolved `{"output":"VERDICT: approve\ntruncated"}`. `docs/engines/opencode.md` failure table: SIGTERM/SIGKILL leave "partial NDJSON stream, truncated mid-line". `fixtures/opencode/valid-verdict.ndjson`: the verdict arrives in the FIRST text chunk, so truncation preserves a verdict while dropping its findings. Sibling `claude-code/envelope.ts:59-73` does consult `signal`/`exitCode`; this adapter has no counterpart. |
| R1-002 | risk | `src/adapters/driven/engines/opencode/opencode-adapter.ts:99,123` | CRITICAL → low | refuted | inferential | introduced → pre-existing | no | Worktree-local opencode config (attacker-controlled) might override the injected `OPENCODE_CONFIG` deny posture. | See Corroboration Log. Refuted on attribution and threat model; a residual documentation/verification gap survives at low severity. |
| R3-001 | reliability | `src/adapters/driven/engines/opencode/process-runner.ts:28-34,94` | WARNING | info | deterministic | introduced | no | With execa `reject:false` a genuine spawn failure RESOLVES, so the doc-comment's "Only a genuine spawn failure (ENOENT, permission denied) REJECTS" is false and the adapter's `catch` is dead code in production; a missing binary reports `pre-flight check exited with code undefined`. | Lens probed installed `execa@9.6.1` directly: ENOENT → resolved, no `exitCode` property, `failed:true`. `node_modules/execa/types/arguments/options.d.ts:240` confirms `reject:false` "resolves the result's promise with the error instead of rejecting it". End-to-end: `binaryPath:"opencode-not-installed-xyz"` → `OpenCodeUnavailableError: ...exited with code undefined`. Subsumes the `resilience` lens's separate signal-kill variant of the same message defect (same root cause). |
| R3-002 | reliability | `src/adapters/driven/engines/opencode/envelope.ts:109` | WARNING | fixed | deterministic | introduced | no | AC-11's "concatenated in stream order, compared exactly" is asserted nowhere; reversing text-event order keeps the suite green. | Mutation test in a sandbox copy: `...map(textOf).reverse().join("")` → `npx vitest run` **275/275 passing**, identical to baseline. The only multi-text fixture (`no-verdict.ndjson`, 2 text events) has a test asserting `usage` only; `noisy-output`'s asserts `output.length > 0`. |
| R3-003 | reliability | `src/adapters/driven/engines/opencode/opencode-adapter.ts:103-128` | WARNING | fixed | deterministic | introduced | no | Nothing asserts which timeout budget goes to which invocation; swapping `PREFLIGHT_TIMEOUT_MS` and `request.timeoutMs` keeps the suite green. AC-19's own validation hint (never-resolving pre-check stub) was never implemented. | Mutation test in a sandbox copy: budgets swapped → `npx vitest run` **275/275 passing**. Tests capture `options` for both calls but assert only `cwd`/`args`/`input`. |
| R4-002 | resilience | `src/adapters/driven/engines/opencode/permission-config.ts:29-31` | WARNING | fixed | deterministic | introduced | no | `mkdtemp` runs before `writeFile` and the `cleanup` handle is only returned after the write succeeds, so a write failure orphans the temp directory with no cleanup path in existence, and a raw `fs` error escapes from outside `review()`'s `try`. | Converged by `resilience` and `reliability`. Orchestrator confirmed source ordering: `mkdtemp`(offset 1145) < `writeFile`(1250) < `return {`(1307). `opencode-adapter.ts:97` awaits the factory before `try {` at :98. Extends the ST-3 stage-QA note, which recorded the untyped error but not the leak. |
| R2-001 | readability | `src/adapters/driven/engines/opencode/envelope.ts:86-92` (doc) / `:100-107` (code) | WARNING | fixed | deterministic | introduced | no | The doc-comment states "any `event.type === "error"` → throw", but the code additionally requires `.error !== undefined`, so an error event without that payload falls through to the success path. spec.md AC-16 and design.md both state the unconditional rule. | Converged by `readability` and `reliability`. Orchestrator reproduced: stream `[text, {"type":"error"}]` → `extractOutcome` did NOT throw, resolved `{"output":"some text"}`. |
| R4-003 | resilience | `src/adapters/driven/engines/opencode/envelope.ts:94-98` | WARNING | info | deterministic | introduced | no | The zero-parseable-lines branch throws a fixed string, discarding the stdout log dump that names the failure, the `model` id that caused it, and the exit code — and the repo has no logging framework, so the message is the only operator channel. | `model` is in scope at the caller (`opencode-adapter.ts:63-64,121`), never interpolated. `OpenCodeProcessResult` has no `stderr` field at all, so the cleanest signature (`Error: Model not found: <id>`) is never captured. Logging sweep: one non-test `console.log` in all of `src/` (`main/cli.ts:12`) — absence of logging correctly not flagged; loss of message content is. |
| R2-002 | readability | `src/adapters/driven/engines/opencode/envelope.ts:86-92,116-131` | SUGGESTION | info | deterministic | introduced | no | `extractOutcome`'s doc-comment scopes itself to AC-15..18 while the body also implements AC-11/12/13/14, leaving the change's most trap-laden rule — that `tokens.total` exists and must be ignored — unmarked in the file. | `valid-verdict.ndjson` carries `tokens:{input:4720,output:66,reasoning:179,total:4965}`; correct `totalTokens` is 4786. Sibling `claude-code/envelope.ts:33` cites its ACs; only a test constant guards this. |
| R2-003 | readability | `src/adapters/driven/engines/opencode/errors.ts:1-9` | SUGGESTION | info | deterministic | introduced | no | The module header generalizes the no-`cause` rationale to all three classes, contradicting the pre-flight handler which catches a real exception and keeps only its message. | `opencode-adapter.ts:109` binds a genuine `Error` then discards all but `.message`. design.md scopes the rationale to the two NDJSON-path classes only. |
| R2-004 | readability | `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts:1-14,433` | SUGGESTION | info | deterministic | introduced | no | The file header claims coverage of all 24 ACs with an exception list that omits the ACs actually missing (AC-18's three-throw check, AC-14's key-omission rule, and plan.md's two signal-driven adapter-reaction tests). | plan.md:40,59 specified all three. The file already models the right convention at :417-427 (one declined test recorded with rationale), making the silent omissions read as coverage. |
| R2-005 | readability | `src/adapters/driven/engines/opencode/envelope.ts:63-65` | SUGGESTION | info | deterministic | introduced | no | `isFinishEvent` accepts `"step-finish"` on the OUTER event type, a spelling no fixture or real CLI output produces, with no comment and a neighbouring interface declaring only the other form. | Every fixture uses `step_finish` at event level, `step-finish` only inside `part`. design.md:179 lists no hyphenated outer variant. Dead disjunct implies a variant that does not exist. |
| R4-004 | resilience | `src/adapters/driven/engines/opencode/opencode-adapter.ts:103-118` | SUGGESTION | info | inferential | introduced | no | The pre-flight already captures `opencode --version` stdout but reads only `exitCode`, discarding the one cheap signal that the CLI is the version whose `OPENCODE_CONFIG` behavior was verified. | `preflight.stdout` referenced nowhere. `docs/engines/opencode.md`: "Flags verified only against `1.17.9`; re-verify on version bumps (PRD risk #1)" and "never invoke without the deny config". A future rename of `OPENCODE_CONFIG` would degrade silently into writes against the reviewed worktree. |

Severity floor applied: all `WARNING`/`SUGGESTION` rows created directly as `info`; none blocks and none enters the fix loop or re-review.

## Corroboration Log

One refuter pass, run over the full candidate list of severe **inferential** findings. `R1-001` was excluded from refutation because the orchestrator's own reproduction reclassified it from `inferential` to `deterministic`, and deterministic findings are never refuted.

| Id | Verdict | Reasoning |
|---|---|---|
| R1-002 | **refuted** | Survives on one sub-claim only: nothing in the repo establishes precedence between `OPENCODE_CONFIG` and worktree-local opencode config — an exhaustive grep across `docs/`, all 7 change artifacts, `history/`, and `fixtures/` returns zero hits, and the spike verified the deny posture against a *benign* worktree. But an unverified assumption is not a demonstrated vulnerability, and the finding fails on two independent grounds that hold even granting the mechanism. **(a) Threat model**: PRD §60 ("Scripts declared per repo … executed in the worktree") means the product already executes attacker-controlled code from the reviewed branch by design; PRD risk #4 accepts this with "declared scripts, never auto-run" as the only mitigation. The deny config is therefore hygiene — keeping the diffed tree pristine — not a containment boundary against an adversary who already has a shorter path (prompt injection through the diff itself). CRITICAL overstated by ~2 levels. **(b) Attribution, decisive**: the already-merged claude-code sibling sets the same `cwd: request.worktree.path` (`claude-code-adapter.ts:100,118`) with **no `env` field at all** — orchestrator verified `ClaudeCodeProcessRunOptions` is `{cwd, input?, timeoutMs}`, no env — and passes neither `--setting-sources` nor `--strict-mcp-config`, both listed as candidates in `docs/engines/claude-code.md`. The exposure is strictly *worse* in the merged sibling; this change is the first adapter to ship an explicit deny posture at all. Flagging the change that adds a mitigation as the one introducing the risk inverts causality. Residual recorded below at severity `low`, disposition `pre-existing`. |

**Residual from R1-002 (recorded, not blocking):** the `OPENCODE_CONFIG`-vs-worktree-config precedence question is genuinely untested and cannot be settled in this environment (`opencode` is not installed here — orchestrator confirmed). It belongs in `docs/todo/E4/manual-verification.md` as a step on item 2, and the equivalent, larger gap for claude-code (no `--setting-sources`) is a worthwhile follow-up against item 1.

## Fix Rounds

| Round | Findings In Scope | Outcome |
|---|---|---|
| 1 | R1-001 (severe), R2-001, R3-002, R3-003, R4-002 (info, bundled — same three files) | Applied in ST-6 after the user chose to amend the spec (`dec-003`). All five → `fixed`. Verified by mutation: (a) text-order reverse now FAILS (previously survived 275/275), (b) timeout-budget swap now FAILS (previously survived), (c) removing `assertCleanExit` fails 3 AC-25 tests. R1-001's original reproduction now rejects where it previously resolved. `npm test` 284/284 (275 + 9 new), `npm run check` green, diff confined to the 4 in-scope files. One vanity test caught and rewritten mid-stage (the R4-002 test initially failed `mkdtemp` instead of `writeFile`, never exercising the fix). Round budget used: 1 of 2. |

## Verdict And Routing

**Verdict: `fail`** — one `open`, `CRITICAL`, `introduced` finding (R1-001).

Routing is **not** the default "insert a fix stage in scope", because the fix contradicts an approved acceptance criterion. spec.md AC-18 reads: *"AC-15, AC-16, and AC-17 are the **ONLY** three rejection paths for the real invocation's stdout handling; every other observed shape (any `text` events present, regardless of whether a `step-finish reason:"stop"` was reached) resolves `review()`."* Adding a process-status rejection path is a fourth path.

Note the precise shape of the gap: AC-18 scopes itself to *"stdout handling"*. Process status (`exitCode`/`signal`/`timedOut`) was never addressed by any AC — the spec did not decide to ignore it, it never considered it. So this is a **specification gap plus its faithful implementation**, not a code-vs-spec deviation. The code does exactly what the approved contract says.

Per the Fix Routing table, "active change, findings exceed spec/design scope" → reopen `sddl-design`/`sddl-plan` with the finding in the envelope, or record a follow-up (`scope_change`). This is a user decision, raised as `review_gate`.

Suggested options, with a recommendation:

1. **(Recommended) Amend the spec and fix in this story.** Add an AC making a non-zero exit / signal termination / `timedOut` on the real invocation reject with `OpenCodeReviewError`, reword AC-18 from "ONLY three" to admit the process-status path, then run `sddl-plan` for a bounded fix stage (`envelope.ts` gains the process result as an input, or the adapter branches before parsing) plus the missing tests. Keeps the story honest and self-contained; the change is small and the fix surface is one file plus tests.
2. **Ship as-is, record as a known defect, fix in a follow-up story.** Defensible only if #30 (cascading engine resolution) is far enough out that no user can reach the path — but the adapter is exported from the barrel today, so any wiring makes it live.
3. **Escalate to reconsider the design symmetrically**, since the sibling claude-code adapter is protected only accidentally (its single-JSON envelope fails closed on truncation) rather than by an explicit status check — worth one cross-cutting decision instead of two divergent ones.

The 11 `info` findings need no decision; several (R3-002, R3-003, R2-004) are test-coverage gaps that would be cheap to close alongside option 1 if the user wants them, and R4-002's temp-directory leak is a small, self-contained fix in the same file family.
