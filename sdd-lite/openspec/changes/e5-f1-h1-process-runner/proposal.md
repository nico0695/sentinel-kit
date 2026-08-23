# Proposal

## Routing Digest

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- digest_summary: Introduce `ProcessRunner`, the second driven port of `src/core/run` (PRD §4.3), plus its `execa`-backed adapter in the so-far-empty `src/adapters/driven/exec/`. The port's job is safe execution of a declared process — a timeout that actually kills, full stdout/stderr capture, and a `cwd` pinned to the review worktree — with the exit code surfaced to the domain rather than swallowed. Issue #31's three acceptance criteria are exactly those three properties. This is the last missing port of the MVP catalog and the hard dependency of `[E5.F1.H2]` (declared validations in the review flow).
- feasibility_signal: high — two structurally identical private precedents already exist in the repo (`ClaudeCodeProcessRunner` and `OpenCodeProcessRunner`, each a `process-runner.ts` seam over `execa` with `reject: false`, `timeout`, `killSignal: "SIGTERM"`, `forceKillAfterDelay: 2000`, and conditional spreads for `exactOptionalPropertyTypes`). This story generalizes that proven shape into a real core-owned port. `execa ^9.6.1` is already a runtime dependency; `src/adapters/driven/exec/index.ts` already exists as an empty placeholder naming this exact story.
- scope_sketch_digest: IN = `ProcessRunner` port + request/result types + error family in `src/core/run/ports/`, the `execa` adapter in `src/adapters/driven/exec/`, a `ProcessRunner.contract.ts` shared suite, adapter tests proving the three ACs against real processes. OUT = wiring it into the review flow (that is `[E5.F1.H2]`), retrofitting the git-cli or engine adapters onto it, composition-root wiring (`E6.F1`), any change to `runReview`.

## Summary

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (four open questions, two of them material)
- exploration_performed: true

## Problem And Desired Outcome

`src/core/run/index.ts`'s own header states the gap: *"The module's second driven port, `ProcessRunner`, lands in E5.F1.x."* `src/adapters/driven/exec/index.ts` is a placeholder whose entire body is `export {}` under the comment *"process execution for validations, implementing ProcessRunner (PRD §4.2). Lands in E5.F1.x."* This story is that landing.

`ProcessRunner` is the fourth and last unimplemented port of the PRD §4.3 MVP catalog (`ReviewEngine`, `GitPort`, `ConfigStore`, `RunStore` all exist). Its purpose is narrow and specific: `[E5.F1.H2]` needs to run **repo-declared validation scripts** (`npm test`, `npm run lint`, …) inside the review worktree, capture their output as evidence for the prompt, and continue the review even when they fail. That requires a port the core can depend on without importing `execa` — which the `core-no-io-libs` guard forbids outright (`zod` is core's only permitted npm import).

Issue #31's three acceptance criteria name the properties precisely:

1. **Timeout kills the process** — not "the promise rejects while the child keeps running." A validation script that hangs must actually die, or every subsequent review inherits an orphaned process.
2. **Full output captured** — the output *is* the deliverable here. Unlike the engine seam (which captures stdout only, because the engine's answer is a JSON envelope on stdout), a failing validation's diagnostic value is usually on **stderr**. Capturing both is what makes "failed validation = review continues with the evidence" (`[E5.F1.H2]`'s third AC) possible at all.
3. **Exit code available to the domain** — the core must be able to distinguish "script ran, exited 1" (a validation failure, evidence) from "script could not be spawned" (an infrastructure error). This dictates a resolve-not-reject contract, matching the precedent both engine seams already set.

Desired outcome: `[E5.F1.H2]` has a core-owned port to depend on, with a real adapter proven against actual child processes, and no new coupling between `src/core/**` and any I/O library.

## Initial Scope Sketch

### Likely In Scope

- **The `ProcessRunner` port** in `src/core/run/ports/process-runner.ts` — pure types, zero imports beyond (possibly) `zod`. A `run(request)` method plus a request type (`command`, `args`, `cwd`, `timeoutMs`, likely `env`) and a result type (`stdout`, `stderr`, `exitCode`, `signal`, `timedOut`).
- **An error family** for the failure modes the resolve-not-reject contract does *not* cover — a binary that cannot be spawned (`ENOENT`, `EACCES`) is genuinely exceptional, not a "process that exited nonzero." Naming follows the module convention (`RunError` base, `…Error` suffix, lives in `src/core/run/`).
- **Input validation** — `cwd` must be absolute and inside the worktree; `command` must be a declared, non-empty string. Precedent exists in both directions: `git-cli.ts` guards `isAbsolute` pre-spawn, and `run-store-schemas.ts`/`config-store-schemas.ts` use narrow `zod` schemas for exactly the fields that become paths.
- **The `execa` adapter** in `src/adapters/driven/exec/` — generalizing the shape both engine `process-runner.ts` files already prove: `reject: false`, `timeout: timeoutMs`, `killSignal: "SIGTERM"`, `forceKillAfterDelay: 2000`, `cwd` passed through, conditional spreads for `exactOptionalPropertyTypes`.
- **`ProcessRunner.contract.ts`** — a shared contract suite in `src/adapters/driven/exec/__test__/`, following the established convention (imports only `vitest` + core types/errors, never a concrete adapter; exports one `processRunnerContract(harness, label?)` function).
- **Adapter tests against real child processes**, hermetic, proving each AC — most importantly that the timeout genuinely reaps a child that ignores a graceful exit, not merely that the promise settles.

### Likely Out Of Scope

- **Running declared validations in the review flow** — that is `[E5.F1.H2]` (#32), which the backlog marks as depending on this story. This story ships the port and adapter with no caller, exactly as `[E4.F2.H3]`'s `resolveEngine` and `[E5.F2.H1]`'s `RunStore` did.
- **Retrofitting `git-cli.ts` or the two engine adapters onto `ProcessRunner`.** Tempting (both engine seams are near-duplicates of each other), but it is a refactor of three merged, tested adapters that issue #31 does not ask for, and it would put this story's diff on top of `[E4.F2.H1-H3]`'s surface. Worth proposing as a follow-up backlog item, not doing here.
- **Fixing the git adapter's missing timeout** — a real known gap (recorded in `e4-f1-h1-run-review`'s `state.yaml` as belonging to the git adapter), but it is not this story and not this port.
- **Composition-root wiring** — `E6.F1`, unchanged from the two prior stories' deferrals.
- **Streaming / incremental output.** The backlog says "capture," and `[E5.F1.H2]` injects a summary into a prompt after the fact. Nothing needs partial output as it arrives.
- **Concurrency, process pools, or cancellation tokens.** Not named anywhere in the backlog for this story.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Adapter mechanics | Two working precedents in-repo (`engines/claude-code/process-runner.ts`, `engines/opencode/process-runner.ts`) already encode the exact `execa` option bag, the resolve-not-reject decision, the `exactOptionalPropertyTypes` conditional-spread idiom, and the `timedOut`/`signal`/`exitCode` result shape. `execa ^9.6.1` is already installed. | high |
| Port placement and guards | `src/core/run/ports/` exists with one sibling (`review-engine.ts`); the port is pure types, so the `core-no-io-libs` guard is satisfied by construction. `src/adapters/driven/exec/` exists and is empty — no collision, no migration. | high |
| Contract-suite convention | Four existing `<PortName>.contract.ts` suites establish the pattern precisely (harness-of-factories interface, single exported `…Contract()` function, `instanceof` assertions against both the specific and base error class). | high |
| Testing a timeout that *actually kills* | The genuinely non-trivial part. Proving "the process died" is stronger than proving "the promise settled with `timedOut: true`" — it needs a child that deliberately ignores `SIGTERM` (so `forceKillAfterDelay`'s `SIGKILL` is what actually reaps it), and a post-hoc liveness assertion. Doable hermetically with a small `node -e` script, but the test design is the story's real work, not the adapter code. | medium |
| Scope of `env` and the security surface | A port that runs an arbitrary command string is the largest new attack surface this codebase has added. The whole point of `[E5.F1.H2]` is "only scripts **declared** in the repo config, never auto-detection" — but *where* that restriction is enforced (this port, or its caller) is undecided, and getting it wrong means shipping a general-purpose shell-execution primitive. | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **Where is the "only declared scripts" restriction enforced — in `ProcessRunner`, or in `[E5.F1.H2]`'s caller?** `[E5.F1.H2]`'s AC is "only declared scripts executable." If this port is a general `run(anyCommand)`, the guarantee lives entirely in a caller that does not exist yet, and this story ships an unconstrained execution primitive. If the port instead takes something narrower (an already-validated declared-validation descriptor), the guarantee is structural. This is the story's most consequential fork and directly shapes the port's signature. | **open, B-level** |
| **Does the port take `command` + `args` separately (never a shell string), and is `shell: false` a stated invariant?** Passing `args` as an array with no shell is what makes command injection structurally impossible, and every existing adapter in the repo already does it that way. Almost certainly yes — but it deserves to be a pinned acceptance criterion rather than an inherited habit, given the surface. | open, A/B-level |
| **What is the `env` contract?** The two engine seams disagree deliberately: claude-code omits `env` entirely (inheriting `process.env`), opencode requires it. For validation scripts, `npm test` genuinely needs a real `PATH` — so full inheritance is likely necessary — but `[E5.F2.H1]`'s "nothing sensitive persisted" AC has a natural counterpart here ("nothing sensitive leaked into a captured output that later lands in a prompt"). Worth an explicit decision. | open, B-level |
| **Is output truncated, and where?** Captured stdout/stderr feeds a prompt in `[E5.F1.H2]`. An `npm test` run on a large repo can emit megabytes; `execa` has `maxBuffer`. Whether this port truncates (and surfaces a `truncated` flag, mirroring how `[E2.F3.H2]`'s diff handles a size policy) or hands back everything and leaves the policy to the caller is a real design choice with a precedent to follow. | open, A/B-level |

## Contradictions Found

- **None blocking.** One tension worth flagging for spec: the backlog describes the adapter as *"adapter over execa with timeout, stdout/stderr capture, and cwd in the worktree"* — but `cwd in the worktree` cannot be enforced by the port itself without the port knowing what "the worktree" is, which would couple `ProcessRunner` to `WorktreeRef` and thus to the `workspace` module's concerns. The likely resolution is that the port validates `cwd` is absolute (as `git-cli.ts` does) and the *caller* supplies the worktree path, but spec should say so explicitly rather than leave "in the worktree" as an unenforced doc claim.

## Approval Notes

- Scope is `[E5.F1.H1]` / issue #31 alone. Its only declared dependency, `[E0.F1.H1]` (scaffold), has been merged since the start of the project.
- Branch: `claude/e5-f1-h1-process-runner`, cut fresh from `origin/main` at `8c080cb` (includes the merged `[E5.F2.H2]` PR #70). 0 open PRs at the time of writing, well within the max-5 limit.
- This story unblocks `[E5.F1.H2]` (#32), the only remaining required E5 story after it.
- Recommended next stage: `sddl-spec`, which must resolve the two B-level questions above — where the "only declared scripts" guarantee is enforced, and the `env` contract — as firm acceptance criteria before design.

## Budget Notes

- Lite artifact. One port file (pure types), one small error addition, one adapter, one contract suite, one adapter test file. Mechanically the smallest of the three E5 stories so far; the effort concentrates in the timeout-actually-kills test design and in pinning the security surface, not in volume of code.
