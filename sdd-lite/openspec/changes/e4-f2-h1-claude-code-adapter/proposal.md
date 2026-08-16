# Proposal

## Routing Digest

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Implement `createClaudeCodeAdapter(): ReviewEngine` in `src/adapters/driven/engines/claude-code/`, the first real (non-fake) `ReviewEngine` implementation, wrapping the canonical `cd <worktree> && cat <prompt> | claude -p --model <m> --output-format json` invocation captured by the `[E1.F1.H1]` spike (`docs/engines/claude-code.md`). It must pass the shared `reviewEngineContract` suite against a mocked binary (fixtures already captured in `[E1.F1.H3]`), self-enforce `timeoutMs` via SIGTERM→SIGKILL since claude-code has no native timeout flag, and report a missing/unauthenticated binary clearly.
- feasibility_signal: high on invocation mechanics (exact command, JSON shape, and all five failure signatures are documented with real evidence), medium-low on one structural gap — the `ReviewEngine` port has no `isAvailable()`-style method, yet PRD §6.2 lists "isAvailable() before running" as an already-fixed operational requirement and issue #28's third AC demands it. This is the proposal's central open question, not a blocker to spec.
- scope_sketch_digest: IN = the claude-code adapter (spawn, stdin write, JSON parse, `.result`/`.usage` extraction, `.is_error` success check, adapter-owned SIGTERM/SIGKILL timeout enforcement), the contract suite passing against a mocked binary, clear missing-binary/unauthenticated error reporting. OUT = OpenCode adapter (#29), cascading engine resolution (#30), any change to `runReview`/`ReviewEngine` port shape, persistence (E5), and a live-network "successful real review" as an automated CI test (satisfied instead by a manual verification run recorded as evidence, since CI cannot assume an authenticated `claude` CLI is present).

## Summary

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (with two open questions)
- exploration_performed: true

## Problem And Desired Outcome

`[E4.F1.H1]` (#26) and `[E4.F1.H2]` (#27) built and hardened the entire `runReview` pipeline — worktree → diff → prompt → engine → parse → terminal state → cleanup — but only ever exercised it against `FakeEngine` (`src/adapters/driven/engines/fake/fake-engine.ts`), a scripted double that "does NOT enforce `timeoutMs`, compute a verdict, decide a `TerminalState`, or add any typed port error" by design (its own doc-comment). The `ReviewEngine` port (`src/core/run/ports/review-engine.ts`) is frozen and stable — `review(request: ReviewRequest): Promise<ReviewResult>`, a single method, `{ worktree, prompt, timeoutMs } → { output, usage? }` — but zero adapters implement it against a real engine. `sentinel review <repo> <branch> --type pr-review` (the E4 DoD) cannot run a real review until one exists.

Issue #28 states the goal directly: "first real engine behind the port (canonical invocation from the spike)." The spike (`[E1.F1.H1]`, #7) already answered the hard questions with real evidence — exact command, input path, output shape, permission behavior, and all five failure signatures — captured in `docs/engines/claude-code.md` and replayed in `fixtures/claude-code/*.json` (6 files: `valid-verdict`, `no-verdict`, `noisy-output`, `timeout-sigterm`, `context-overflow`, `auth-error`). Desired outcome, tied to the issue's three checklist items:

1. **Contract suite green (binary mocked by fixtures)**: the shared `reviewEngineContract` suite (`src/adapters/driven/engines/__test__/ReviewEngine.contract.ts`) exercises this adapter the same way it exercises `FakeEngine`, with the real `claude` binary invocation replaced by a mock that replays the captured fixture bytes.
2. **Successful real review**: end-to-end evidence that the adapter, invoked against the real authenticated `claude` CLI, returns `VERDICT: request-changes` (or similar) for a genuine diff — mirroring the spike's own acceptance run, not a new capability.
3. **Missing/unauthenticated engine reported clearly before running**: a user without `claude` installed, or without valid auth, gets an understandable error rather than a raw `ENOENT`/JSON-parse crash or a confusing `engine-error` with no context.

## Initial Scope Sketch

### Likely In Scope

- `createClaudeCodeAdapter(): ReviewEngine` under `src/adapters/driven/engines/claude-code/`, following the file-layout precedent of `src/adapters/driven/git/git-cli.ts` (factory function, `execa`-based, adapter-owned error translation) — the only existing "spawn an external binary" adapter in the codebase.
- Canonical invocation exactly as the spike fixed it: cwd = `worktree.path`, prompt piped via **stdin** (not argv — the spike measured argv capped at ~1 MiB and stdin has no such limit), command `claude -p --model <configured-model> --output-format json`.
- Response handling: parse the single JSON document on stdout; `.is_error` (boolean) is the **authoritative** success flag per the spike — `.subtype` is explicitly unreliable (reads `"success"` even on the captured `auth-error.json` and `context-overflow.json` fixtures, confirmed by direct inspection: both have `is_error: true` and `subtype: "success"`). `.result` (string, present on success and most `is_error` cases) is the raw text handed back as `ReviewResult.output` — **no parsing of `VERDICT:` here**, that is `[E4.F1.H2]`'s frozen `VerdictParser`, which explicitly deferred "JSON/NDJSON envelope parsing, `.result` extraction" to this story (`e4-f1-h2-verdict-parser/proposal.md`, Likely Out Of Scope). `.usage.input_tokens` / `.usage.output_tokens` map to `ReviewUsage`; `totalTokens` has no direct source field and needs a spec-level decision (sum the two, or omit).
- Adapter-owned timeout enforcement: claude-code has **no native timeout flag** (spike, confirmed) — `docs/engines/claude-code.md`'s documented strategy is "send SIGTERM first...escalate to SIGKILL (empty stdout) only if it does not exit," using `timeoutMs` from `ReviewRequest`. This directly resolves two open risks recorded in `e4-f1-h1-run-review/state.yaml` for this exact story: `r-engine-not-cancellable` ("real timeout enforcement... E4.F2 adapters own process kill") and `r-cleanup-races-abandoned-engine` ("Owner: E4.F2 kill-before-cleanup ordering"). Judgment call below.
- Missing-binary / auth-failure detection: `claude --version` (exit 0) as a cheap install probe per the spike's own `isAvailable()` note; auth failure is recognizable at run time via exit 1 + `is_error: true` + `api_error_status: 401` (confirmed present in `fixtures/claude-code/auth-error.json`). Exact mechanism (pre-flight call vs. inline check inside `review()`) is the proposal's chief open question — see below.
- Contract suite passing with the real `claude` binary swapped for a fixture-replaying mock — needs a design-stage decision on the injection seam (see open questions), since neither the port nor `git-cli.ts`'s precedent expose one today.
- Adapter-level error translation: every raw failure (`execa` rejection, JSON parse failure, non-`Error` throwable) becomes a plain `Error` before leaving `review()`, so the shared contract's `rejects.toBeInstanceOf(Error)` assertion holds and `runEngineWithTimeout`'s `r-sync-throw-unwrapped` risk (a synchronous throw escaping unwrapped) never triggers — the whole `review()` body should never throw synchronously, only ever reject its returned Promise, mirroring `git-cli.ts`'s `wrapAs` pattern.

### Likely Out Of Scope

- **OpenCode adapter** (issue #29) — separate engine, separate spike doc (`docs/engines/opencode.md`), separate fixture set (`fixtures/opencode/`). Not touched here.
- **Cascading engine resolution** (global → per-repo → per-run, issue #30 / PRD §6.2) — that is composition-root wiring in `src/main/`, which does not exist yet; this story only makes one engine adapter available to be wired later.
- **Any change to the `ReviewEngine` port shape** (`src/core/run/ports/review-engine.ts`) or to `runReview`'s pipeline (`src/core/run/run-review.ts`) — both are frozen deliverables of `[E0.F2.H2]` / `[E4.F1.H1]`. If the `isAvailable()` question below resolves toward a port change, that is a B/C-level escalation, not something this story does unilaterally.
- **A live-network "successful real review" as an automated test.** CI cannot assume an authenticated `claude` CLI is present (the spike itself ran on the operator's personally-authenticated machine). Issue #28's second checklist item is proposed to be satisfied by a **manual verification run** — invoke the finished adapter against the real CLI once, capture the command, exit code, and `VERDICT:` line as evidence in `execution-log.md` — the same "interim evidence, not a repository artifact" pattern H1/H2 already used for untested concurrency (`d-st1-evidence-obligation` in `e4-f1-h2-verdict-parser/state.yaml`) and for the spike itself (`history/entries/2026-08-08-S17-...md`). Not a CI-enforced acceptance criterion.
- **Persistence of runs/usage** — `RunStore` is E5.F2.H1, not built.
- **`ProcessRunner` / `src/adapters/driven/exec/`** — that adapter is explicitly stubbed for E5.F1.x validations ("No public API yet."); this story spawns `claude` directly via `execa`, mirroring `git-cli.ts`, not through that future port.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Invocation mechanics | Exact command, stdin path, JSON output shape, `.is_error`/`.result`/`.usage` fields, and all five failure signatures (auth, unknown-model, context-overflow, SIGTERM, SIGKILL) are documented with real evidence in `docs/engines/claude-code.md`, captured 2026-08-08 against CLI `2.1.226`. | high |
| Fixture availability | 6 real, anonymized fixtures at `fixtures/claude-code/*.json`, covering every case the contract suite and the error-reporting AC need (`valid-verdict`, `no-verdict`, `noisy-output`, `timeout-sigterm`, `context-overflow`, `auth-error`), per `fixtures/README.md`. Verified directly: `timeout-sigterm.json` genuinely has no `.result` field (only an `errors` array) — the adapter must tolerate that, matching a risk H2 already tested the parser against for the same fixture. | high |
| Adapter pattern precedent | `git-cli.ts` is a working example of the exact shape needed: `execa`-based, factory function, no constructor args, translates every raw failure into a typed/plain `Error` before it reaches the core. Direct template to follow. | high |
| Version drift | `docs/engines/claude-code.md` names its own limitation explicitly: "Flags verified only against `2.1.226`; flag drift... re-verify on version bumps." The spike is 7 days old (2026-08-08 → today 2026-08-15); low material risk but not re-verified for this story. Flagged as an open risk below, not assumed away. | medium |
| Contract-test injection seam | Neither the `ReviewEngine` port nor the `git-cli.ts` precedent expose a way to point an adapter at a mock binary. The contract suite's "binary mocked by fixtures" AC needs a seam (injectable command/path, injectable `execa`-like function, or a `PATH`-shimmed fake `claude` script) that does not exist today and has no established pattern in this repo to copy. Central design-stage unknown. | low |
| `isAvailable()` port gap | PRD §6.2 lists `isAvailable()` before running as an "already fixed operational consideration," and issue #28's third AC demands missing/unauthenticated detection "before running" — but the frozen `ReviewEngine` port has exactly one method, `review()`. See Open Questions. | low |

## Judgment Calls Made Autonomously (for orchestrator ratification)

- **Adapter-owned SIGTERM→SIGKILL timeout enforcement is IN SCOPE for this story, not deferred further.** Both `e4-f1-h1-run-review/state.yaml` open risks that named "E4.F2" as owner (`r-engine-not-cancellable`, `r-cleanup-races-abandoned-engine`) point specifically at "the E4.F2 adapters" (#28-30) as the place process-kill gets implemented, and claude-code is the first of those adapters to be built. Deferring it again would mean no E4.F2 story ever picks it up. Recommendation: the adapter kills its own child process using `timeoutMs` from the request (SIGTERM, escalate to SIGKILL on non-exit) — this closes both risks for this engine specifically. `r-timeout-budget-precedence` (the *exact* ordering rule between the adapter's internal kill and `runReview`'s outer race) is narrower and left as an explicit open question below, since the outer race's escape hatch (rejecting with the exported `EngineTimeoutError`) is already tested and could also be the adapter's mechanism — that choice belongs to design, not proposal.
- **JSON envelope extraction (`.result`, `.usage`) is IN SCOPE for this adapter**, not the verdict parser. This is not new scope — `[E4.F1.H2]`'s own proposal already fixed this boundary explicitly ("this happens before `deps.parseVerdict` is called... it does not parse JSON or NDJSON itself... that is the `ReviewEngine` adapter's job (E4.F2.x, not built yet)"). Restating it here as confirmed, not re-litigated.

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **How does "missing/unauthenticated... before running" get satisfied given the `ReviewEngine` port has only `review()`?** Options: (a) the adapter's single `review()` call does an internal pre-check (e.g. `claude --version`) before invoking the real review, so the distinction is structural but stays inside one port call; (b) a new `isAvailable()` port method is added — a port-shape change, which is a B/C-level escalation since the port is a frozen `[E0.F2.H2]` deliverable; (c) the check happens one layer up, in `src/main/` composition, before the engine is even wired — outside this adapter's scope entirely. PRD §6.2 explicitly names `isAvailable()` as an already-decided requirement, which favors (b), but nothing in the codebase has built it yet and no other adapter has this shape. | open, B-level |
| **Contract-test binary-mocking seam.** The suite needs "binary mocked by fixtures" (issue AC-1) but there is no existing injection pattern for swapping a real spawned binary for a scripted one. Candidates: an injectable command path / binary name parameter on the factory, an injectable `execa`-compatible function, or a `PATH`-prepended fake `claude` shell script per fixture. Affects the adapter's public factory signature. | open, B-level |
| **What does a non-auth, non-timeout `is_error: true` result do?** (`context-overflow.json`: `is_error: true`, `api_error_status: 400`, no genuine review happened.) Reject (→ `engine-error`, most accurate — no review was actually produced) or resolve with the error text as `output` (falls through to H2's parser, which would likely read it as prose with no `VERDICT:` line → `ambiguous`, technically working but mislabeled)? Recommendation: reject, for terminal-state fidelity — but this is a real design choice with fixture-backed test cases on both sides (`fixtures/claude-code/context-overflow.json`, `auth-error.json`). | open, B-level |
| **`ReviewUsage.totalTokens` has no direct source field.** `.usage` gives `input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` separately; the port's `totalTokens` needs either a sum (which sum — cache tokens included or not?) or to be left `undefined`. Low stakes (usage is "best-effort," per the port's own doc-comment) but needs a stated rule. | open, A/B-level, low stakes |

## Contradictions Found

- **PRD §6.2 vs. the frozen `ReviewEngine` port.** PRD §6.2 states "already fixed operational considerations: ... `isAvailable()` before running..." as settled product direction, but the port `[E0.F2.H2]` actually shipped has a single `review()` method with no availability-check surface. This is the same category of PRD-vs-reality gap `[E4.F1.H2]`'s proposal flagged for the "`VERDICT:` at the top" wording — not a blocker, but worth surfacing rather than silently deciding it inside this story. See Open Questions above.

## Approval Notes

- Scope is `[E4.F2.H1]` / issue #28 alone. It depends on and does not reopen `[E1.F1.H1]` (#7, spike), `[E1.F1.H3]` (#9, fixtures), or `[E0.F2.H2]` (#6, port + contract suite) — all closed and merged.
- The most consequential open item for spec is the `isAvailable()` port-gap question: it decides whether this story's AC-3 is satisfiable purely inside the adapter or requires touching the frozen port (a bigger, B/C-level decision). Recommend spec fix this first, since it shapes the adapter's public signature before anything else is designed.
- The contract-test binary-mocking seam is the second load-bearing open item: it decides the adapter factory's signature and needs to be resolved before design, not discovered mid-implementation.
- Recommended next stage: `sddl-spec`, which should fix (1) the `isAvailable()` mechanism, (2) the binary-mocking seam, (3) the `is_error: true` non-auth classification rule, and (4) the `totalTokens` computation rule as firm acceptance criteria, and should formally record the manual-verification approach for the "successful real review" AC (issue #28 checklist item 2) so it is not silently dropped as untestable.

## Budget Notes

- Lite artifact. This story composes one new adapter file (plus its contract-test wiring) against already-frozen ports and an already-captured fixture corpus — no new core module, no port change expected unless spec escalates the `isAvailable()` question. Exact file layout, the mock-binary mechanism, and the timeout-precedence rule belong to `sddl-design`, not here.
