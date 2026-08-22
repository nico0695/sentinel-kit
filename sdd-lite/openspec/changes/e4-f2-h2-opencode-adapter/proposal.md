# Proposal

## Routing Digest

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Implement `createOpenCodeAdapter(): ReviewEngine` in `src/adapters/driven/engines/opencode/`, the second real `ReviewEngine` implementation, wrapping the canonical `cd <worktree> && cat <prompt> | OPENCODE_CONFIG=<deny-config> opencode run -m <provider/model> --format json` invocation captured by the `[E1.F1.H2]` spike (`docs/engines/opencode.md`). Same port, same `ClaudeCodeProcessRunner`-shaped injection-seam pattern the merged `[E4.F2.H1]` adapter established, adapted for OpenCode's structurally different NDJSON event stream and its default-write permission posture (which the claude-code adapter never had to handle).
- feasibility_signal: high — every open question `[E4.F2.H1]`'s proposal had to escalate to spec (isAvailable() mechanism, binary-mocking seam, timeout ownership) is already resolved and precedented in the merged code; this story reuses those answers rather than re-deriving them. The only genuinely new design surface is NDJSON parsing and the mandatory `OPENCODE_CONFIG` permission-deny injection.
- scope_sketch_digest: IN = the opencode adapter (spawn, stdin write, `OPENCODE_CONFIG` deny-config injection, NDJSON line-by-line parse tolerating a truncated final line, `text`-event concatenation, `step_finish` usage extraction, availability pre-check), the contract suite passing against a mocked binary (`fixtures/opencode/*`), clear missing-binary/unconfigured-model error reporting. OUT = cascading engine resolution (#30, depends on this + H1), any change to `runReview`/`ReviewEngine` port shape (frozen, already validated stable by H1), persistence (E5), and a live-network "successful real review" as an automated CI test (same manual-verification pattern H1 used).

## Summary

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (three open questions, all narrower than H1's)
- exploration_performed: true

## Problem And Desired Outcome

`[E4.F2.H1]` (#28, merged in PR #66) proved the `ReviewEngine` port genuinely abstracts over an external engine: `createClaudeCodeAdapter()` implements `review(request) → Promise<ReviewResult>` against the real `claude` CLI with zero changes to `src/core/`. Issue #29's own acceptance criteria demand the converse proof — a **second**, structurally different engine, implemented with **zero changes needed in the core to add it**. If the port or `runReview` pipeline had to bend to accommodate OpenCode, that would falsify the port's design; if it doesn't, E4.F2.H3's cascading resolution (#30) has two real engines to switch between.

The `[E1.F1.H2]` spike (`docs/engines/opencode.md`) already did the hard discovery work with real evidence: canonical invocation, the NDJSON event-stream output shape (`step_start` / `text` / `step_finish` / `tool_use` / `error` events), the failure-signature table, and — critically — the single most consequential behavioral difference from claude-code: **`opencode run` writes files by default** and is only made read-only via a `permission: deny` config injected through the `OPENCODE_CONFIG` env var. 6 real fixtures exist at `fixtures/opencode/*` (`valid-verdict`, `no-verdict`, `noisy-output`, `context-overflow`, `timeout-sigterm-partial`, `unknown-model-stdout`) mirroring H1's coverage. Desired outcome, tied to issue #29's three checklist items:

1. **Same contract suite green (binary mocked by fixtures)**: `reviewEngineContract` exercises this adapter identically to how it exercises the claude-code adapter, with a mocked process runner replaying the NDJSON/plain-text fixture bytes.
2. **Successful real review**: end-to-end evidence (manual, per the H1 precedent — CI cannot assume an authenticated `opencode` CLI) that the adapter returns a `VERDICT:`-bearing result against the real CLI.
3. **Zero changes needed in the core to add it**: no edit to `src/core/run/**` — the adapter conforms to the existing, unmodified `ReviewEngine` port.

## Initial Scope Sketch

### Likely In Scope

- `createOpenCodeAdapter(): ReviewEngine` under `src/adapters/driven/engines/opencode/`, mirroring the merged claude-code adapter's four-file split (`opencode-adapter.ts` orchestration, a process-runner seam, an envelope/NDJSON-parsing module, typed errors) — same shape, same `create<Thing>` factory-function convention (no class), same "every failure path is a `throw` inside an `async function`, never a synchronous throw" discipline.
- Canonical invocation per the spike: cwd = `worktree.path`, prompt on **stdin** (argv hits the same ~1 MiB `execve` ceiling measured for claude-code), command `opencode run -m <provider/model> --format json`, with `OPENCODE_CONFIG` set to the read-only deny config (`{"permission":{"edit":"deny","bash":"deny","webfetch":"deny"}}`) on **every** invocation — this is not optional hardening, it is the difference between a review and an unreviewed write to the target repo's worktree.
- NDJSON response handling: parse stdout line-by-line, tolerate a truncated/malformed final line (the SIGTERM/SIGKILL fixture ends mid-line — same tolerance H2 (`[E4.F1.H2]`) already required of the verdict parser's tail-window logic, but here it is the *envelope* parser's job, one layer earlier); concatenate every `text` event's `.part.text` in order as `ReviewResult.output`; take usage from the last `step_finish` event's `.part.tokens` (`input`/`output`, mapped the same way H1 mapped claude-code's `.usage`, for a consistent `totalTokens` rule across both adapters — reuse H1's resolved computation, not re-derive it). An in-stream `error` event (e.g. `ContextOverflowError`) is a review failure, not a parse failure.
- Availability / configuration pre-check: `opencode --version` (exit 0) proves installation, mirroring H1's `PREFLIGHT_TIMEOUT_MS`-bounded pre-flight pattern exactly. Model/credential availability is structurally different from claude-code — see Open Questions; the spike's own guidance is `opencode models` output as the reliable "is this model actually usable" probe.
- Adapter-level error translation for the "unknown model / stdout is a log dump, not JSON" failure mode (`fixtures/opencode/unknown-model-stdout.txt`) — this is new relative to H1: claude-code always emits a parseable JSON document even on failure, OpenCode does not, so the parser must classify "stdout does not parse as NDJSON at all" as a distinct, cleanly-reported error rather than crash on `JSON.parse`.
- Contract suite passing with the real `opencode` binary swapped for a fixture-replaying mock, using the same injectable-runner seam shape H1 already established (no new pattern to invent).

### Likely Out Of Scope

- **Cascading engine resolution** (#30) — global → per-repo → per-run engine selection is `src/main/` composition-root wiring that doesn't exist yet and explicitly depends on both H1 and this story landing first.
- **Any change to the `ReviewEngine` port** (`src/core/run/ports/review-engine.ts`) or to `runReview` — issue #29's third acceptance criterion is precisely that no such change is needed; if design discovers the port genuinely cannot express something OpenCode needs, that is a C-level stop (reality contradicting the "zero core changes" assumption the backlog itself asserts), not a unilateral port edit.
- **A live-network "successful real review" as an automated CI test** — same reasoning and same manual-verification-recorded-as-evidence pattern H1 used for its AC-24.
- **`isAvailable()` as a new port method** — H1 already resolved this question (internal pre-flight inside `review()`, no port change) and it was accepted; re-opening it for this story alone, when the pattern already exists and works, would be scope creep, not a genuine new decision.
- **Persistence, `ProcessRunner`/`exec` adapter** — same E5 boundary as H1.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Invocation mechanics | Exact command, stdin path, mandatory `OPENCODE_CONFIG` deny injection, and all six failure signatures are documented with real evidence in `docs/engines/opencode.md`, captured 2026-08-08 against CLI `1.17.9`. | high |
| Fixture availability | 6 real fixtures at `fixtures/opencode/*`, covering the same case matrix as claude-code's (`valid-verdict`, `no-verdict`, `noisy-output`, `context-overflow`, `timeout-sigterm-partial`) plus one OpenCode-specific case (`unknown-model-stdout.txt`, a non-JSON log dump). | high |
| Adapter pattern precedent | The merged `[E4.F2.H1]` adapter is a direct, working template for the file layout, the injectable-runner seam, the pre-flight-then-real-invocation two-call shape, and the "resolve, don't reject, on non-zero exit" execa convention. Every structural question H1 had to escalate to spec is already answered in shipped code. | high |
| New surface: NDJSON parsing | Genuinely new relative to H1 (which parsed one JSON document). Line-by-line parsing with a tolerated truncated final line and a distinct "not parseable at all" failure class are both spec-able against fixture evidence, but this is real new design work, not a copy of H1's `envelope.ts`. | medium |
| New surface: default-write permission posture | OpenCode's default `run` writes files; correctness of the adapter depends on `OPENCODE_CONFIG` being set on every single invocation with no code path that skips it. This is a correctness-critical detail with no analogue in H1 (claude-code's `-p` flag is read-only by construction) — needs an explicit acceptance criterion and a contract-suite assertion, not just a doc note. | medium |
| Version drift | `docs/engines/opencode.md` is 8 days old (2026-08-08 → today 2026-08-16); same low-but-not-zero flag-drift risk PRD risk #1 names, one day older than what H1 flagged for claude-code. | medium |

## Judgment Calls Made Autonomously (for orchestrator ratification)

- **Reuse H1's resolved `isAvailable()` mechanism (internal pre-flight inside `review()`) without re-litigating it.** The merged adapter already established the pattern, it works, and the backlog's own H2 acceptance criterion ("zero changes needed in the core") argues for *less* structural novelty here, not more. Treating this as settled, not open.
- **Reuse H1's `totalTokens` computation rule** (input + output, cache fields excluded) rather than re-deriving a separate rule for OpenCode's `step_finish.part.tokens` shape, for consistency across both adapters at the `ReviewUsage` boundary — spec should confirm the field-mapping is straightforward (it appears to be: `input`/`output`/`reasoning`/`cache.read`/`cache.write` are all named explicitly in the spike doc) rather than treat this as a fresh open question.

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **NDJSON truncated-final-line tolerance: parse strategy.** Split on `\n`, parse each line independently, and silently drop a line that fails `JSON.parse` (covers both a truncated last line from a kill and any stray non-JSON noise) — or explicitly detect "this is the last line and it's incomplete" vs. "this line is garbage mid-stream" as two different conditions? The fixture (`timeout-sigterm-partial.ndjson`) only exercises the first case. Affects whether a genuinely malformed *middle* line (which should probably not happen, but isn't ruled out) is silently swallowed or surfaced. | open, A/B-level |
| **"Unparseable stdout at all" (`unknown-model-stdout.txt`) vs. "valid NDJSON but an in-stream `error` event" (`context-overflow.ndjson`): are these the same error class or two?** Both should reject `review()`, but the spike notes unknown-model and missing-credentials are *themselves* indistinguishable from each other (`ProviderModelNotFoundError` either way) — should the adapter's error message say so explicitly (point the user at `opencode models`), distinct from a context-overflow rejection? Affects error-message content, not control flow. | open, A-level, low stakes |
| **Where exactly does `OPENCODE_CONFIG` get written/injected — a temp file per invocation, or a fixed path reused across calls?** The spike rejected a worktree-local `opencode.json` (pollutes the diffed tree) but didn't fix the alternative's mechanics. A temp file per call is simplest and avoids any shared-state/concurrency hazard between parallel reviews; needs to be a stated design decision, not left implicit. | open, A-level |

## Contradictions Found

- None. Unlike H1 (which found a real PRD-vs-port gap over `isAvailable()`), this story inherits an already-resolved answer to that question and surfaces no new contradiction between the backlog, the PRD, and the current port/codebase state.

## Approval Notes

- Scope is `[E4.F2.H2]` / issue #29 alone. It depends on and does not reopen `[E1.F1.H2]` (#8, spike, merged), `[E1.F1.H3]` (#9, fixtures, merged), `[E0.F2.H2]` (#6, port + contract suite, merged), or `[E4.F2.H1]` (#28, claude-code adapter, merged PR #66).
- This story is lower-risk than H1: the structural unknowns H1 had to escalate (isAvailable mechanism, binary-mocking seam, timeout ownership, error-translation discipline) are all pre-resolved by the merged reference implementation. The genuinely new work is narrowly scoped to NDJSON parsing and the mandatory permission-deny injection.
- Recommended next stage: `sddl-spec`, which should fix (1) the NDJSON parse-tolerance strategy, (2) whether unparseable-stdout and in-stream-error are one error class or two, and (3) the `OPENCODE_CONFIG` injection mechanism, as firm acceptance criteria — and should explicitly assert the "reuse H1's isAvailable/totalTokens patterns, do not re-derive" judgment calls above as confirmed AC baggage, so design doesn't re-open them.

## Budget Notes

- Lite artifact. Same shape and cost class as H1: one new adapter (four files, mirroring the merged reference) against an already-frozen port and an already-captured fixture corpus. Lower design risk than H1 since the structural questions are pre-answered; the NDJSON-parsing and permission-injection specifics are the only material new design surface.
