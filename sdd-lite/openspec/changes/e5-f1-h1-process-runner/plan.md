# Plan

## Execution Digest

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    4 executor stages, matching design.md's own recommended sequencing (core types first, then
    the pure classifier with childless unit tests, then the impure adapter shell, then the
    real-child suite as the closing gate). ST-1 lands the core surface: `ProcessRunner` port +
    request/result types (`ports/process-runner.ts`), the guard-clause pre-flight
    (`process-run-request.ts`), two new errors on the existing `RunError` base
    (`InvalidProcessRequestError`, `ProcessSpawnError`), and the barrel — pure types, no execa, no
    fs. ST-2 lands `classifyExecaResult`, the single pure function carrying every one of spec
    revision 2's six empirical findings, with unit tests constructing the result record directly
    (no spawning) — this is where AC-6/7/9/10/14/16/17 get their cheapest, fastest proof. ST-3
    lands the impure adapter shell (`process-runner-exec.ts`) wiring the pinned execa option bag
    to the classifier, plus `ProcessRunner.contract.ts` (the sixth contract suite). ST-4 adds the
    real-child test suite proving what only a live process can (AC-1's reaping, byte-exact
    capture, cwd, no-shell) and is the story's closing gate, re-verifying AC-15.
- stage_plan_digest: >-
    ST-1 core/run/{ports/process-runner,process-run-request,run-errors}.ts (new/edit) +
    core/run/index.ts (barrel, edit) -> ST-2 adapters/driven/exec/classify-execa-result.ts (new)
    + its test (new) (depends on ST-1's port types) -> ST-3
    adapters/driven/exec/process-runner-exec.ts (new) + adapters/driven/exec/index.ts (edit) +
    ProcessRunner.contract.ts (new) (depends on ST-1, ST-2) -> ST-4
    adapters/driven/exec/__test__/process-runner-exec.test.ts (new) + closing gate (depends on
    ST-3).
- validation_digest: >-
    Per stage: `npm run check` (biome + tsc + depcruise) and `npm test` green, diff scoped to the
    stage's named files only. ST-2 additionally proves each of the four classifier rules by
    mutation (the ones the spec names: naive-`failed`, naive-`isMaxBuffer`, passthrough-`timedOut`
    each caught). ST-4 additionally re-verifies AC-15 (empty diff over `src/core/run/run-review.ts`,
    `src/adapters/driven/git/**`, `src/adapters/driven/engines/**` for the whole story) and the
    architecture guards.

## Summary

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Core surface: `ProcessRunner` port + `ProcessRunRequest`/`ProcessRunResult` (`ports/process-runner.ts`, new); `validateProcessRunRequest` guard-clause pre-flight mirroring `runReview`'s style, deliberately not checking `cwd` absoluteness (D-2) (`process-run-request.ts`, new); `InvalidProcessRequestError`/`ProcessSpawnError` added to the existing `run-errors.ts`; real barrel update in `index.ts` | — | `src/core/run/ports/process-runner.ts` (new), `src/core/run/process-run-request.ts` (new), `src/core/run/run-errors.ts` (edit), `src/core/run/index.ts` (edit), `src/core/run/__test__/process-run-request.test.ts` (new) | `npm run check` green (`depcruise` proves the port file imports nothing beyond its own module — no `execa`, no `node:*`); `npm test` green with AC-13's table-driven rejection tests (empty `command`, `timeoutMs <= 0`/non-finite, invalid `maxOutputChars`) — pure, no fs, no child process | yes | yes | pending |
| ST-2 | The pure classifier: `classifyExecaResult(result, budget, timeoutMs, elapsedMs)` in `src/adapters/driven/exec/classify-execa-result.ts`, implementing design's four rules verbatim — never-ran detection (D-5, `exitCode`/`signal` both absent), `timedOut` derived from elapsed-vs-budget rather than `result.timedOut` (D-4), per-stream truncation by length comparison (D-6), conditional-spread exit/signal shape | ST-1 | `src/adapters/driven/exec/classify-execa-result.ts` (new), `src/adapters/driven/exec/__test__/classify-execa-result.test.ts` (new) | `npm run check` + `npm test` green; unit tests constructing `ExecaLikeResult` records directly (no `execa` call, no child process) covering: clean exit (AC-8), non-zero exit resolves not throws (AC-10, AC-16 — asserted against a record with `failed: true, exitCode: 1`), signal-without-exit-code (AC-9), never-ran → `ProcessSpawnError` (AC-14), per-stream truncation (AC-6, AC-7), and the overflow-then-hang case (AC-17 — `isMaxBuffer: true`, `timedOut: false`, `signal` set, `elapsed >= budget` → still classified `timedOut: true`). Each of the four rules proven by mutation: classify on `failed` instead of exit/signal presence → AC-16's test fails; pass `isMaxBuffer` straight to both streams → AC-7's test fails; pass `result.timedOut` straight through → AC-17's test fails | yes | yes | pending |
| ST-3 | Impure adapter shell: `createExecProcessRunner()` in `process-runner-exec.ts` — validate (ST-1) → `isAbsolute` check on `cwd` (D-2, throwing the core `InvalidProcessRequestError`) → `execa(command, args, { ...pinned option bag })` with the spec-pinned bag (`reject: false`, `timeout`, `killSignal: "SIGTERM"`, `forceKillAfterDelay`, per-fd `maxBuffer`, `stripFinalNewline: false`, `env` overlay per D2) → `classifyExecaResult(...)` with a self-measured `elapsedMs`; replaces the `export {}` placeholder in `exec/index.ts`; `ProcessRunner.contract.ts` (new, the sixth contract suite, following the five-suite convention) with portable resolve-not-reject + typed-error assertions | ST-1, ST-2 | `src/adapters/driven/exec/process-runner-exec.ts` (new), `src/adapters/driven/exec/index.ts` (edit), `src/adapters/driven/exec/__test__/ProcessRunner.contract.ts` (new) | `npm run check` + `npm test` green; contract suite driven by a minimal harness (one real `node -e` child per assertion) covering what's observable through the port alone: resolve-not-reject on non-zero exit, typed rejection on a malformed request, typed rejection on a genuinely unspawnable binary | yes | yes | pending |
| ST-4 | Real-child test suite proving what only a live process can: AC-1's reaping (`SIGTERM`-trapping child, pid printed as stdout line 1, post-resolve `process.kill(pid, 0)` throws `ESRCH`, `signal: "SIGKILL"`), AC-2/AC-3 (timeout flag + no false positive), AC-4 (byte-exact stdout incl. trailing newline), AC-5 (separate stderr), AC-11 (`cwd` honored), AC-12 (no shell — `; touch pwned` creates nothing), AC-14's three spawn-failure shapes for real (`ENOENT`, `EACCES` via `chmod 000`, nonexistent `cwd`), one real overflow-then-hang case corroborating AC-17; **closing gate** | ST-3 | `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` (new) | `npm run check` + `npm test` green; **closing gate additionally verifies**: (a) `git diff <story base>..HEAD -- src/core/run/run-review.ts src/adapters/driven/git src/adapters/driven/engines` is empty (AC-15); (b) `depcruise src` confirms all four architecture guards hold, in particular no `execa` import anywhere under `src/core/**`; (c) full story diff confined to the 9 files named across ST-1..ST-4 | yes | yes | pending |

## Validation Strategy

- Each stage runs `npm run check` and `npm test` before being reported complete, matching the two prior E5 stories' precedent.
- ST-1 is the lowest-risk stage: pure types plus guard clauses copying `runReview`'s established idiom exactly. Its only genuinely new risk is forgetting D-2's deliberate omission (no `isAbsolute` check in core) — the stage's own test file must assert a relative `cwd` does NOT reject at this layer, proving the split was intentional rather than an oversight.
- ST-2 is where the story's real difficulty lives and where it must be proven cheapest: every finding from spec revision 2 (R1 through R5) becomes one deterministic unit test with a hand-built input record, no execa call, no spawn. This is also where each rule's named mutation runs during development (analogous to `[E5.F2.H1]`/`[E5.F2.H2]`'s mutation-testing discipline): temporarily reverting a rule to its "obvious but wrong" form and confirming the specific test that exists to catch it actually fails, then reverting back.
- ST-3's contract suite stays deliberately thin — it asserts only what any future `ProcessRunner` implementation must satisfy (resolve-not-reject, typed errors, capture shape), not execa-specific behavior; the execa-specific proof is ST-2 (classifier) and ST-4 (real children).
- ST-4 is the expensive stage by design (real child processes, `chmod`, real timeouts) and is deliberately last and smallest in unique-logic terms — it exercises code ST-2/ST-3 already unit-tested, so a failure here should mean the *wiring* is wrong (option bag, `isAbsolute` placement), not the classification logic.
- ST-4 is the story's closing gate: after its diff, verify the full story diff touches exactly the 9 files named across ST-1..ST-4, `src/core/run/run-review.ts` and the git/engine adapters are untouched (AC-15), and no `src/main/` file appears in the diff.
- No manual/human-in-the-loop verification anywhere in this plan — real children are hermetic (`node -e` one-liners, `mkdtemp` cwds under `os.tmpdir()`), fully runnable in CI.

## Dependencies And Sequencing

- ST-2 depends on ST-1 for `ProcessRunResult`'s exact shape (`classifyExecaResult`'s return type) and for `ProcessSpawnError`, which it throws.
- ST-3 depends on ST-1 (the port signature it implements, the request validator it calls, `InvalidProcessRequestError` it may re-throw from the `isAbsolute` check) and ST-2 (`classifyExecaResult`, which it calls rather than inlining any classification logic).
- ST-4 depends on ST-3 existing to have a real `ProcessRunner` implementation to test against; it adds no new production code, matching the tests-only closing-stage precedent from both prior E5 stories.
- No stage touches `src/core/run/run-review.ts`, `src/adapters/driven/git/**`, or `src/adapters/driven/engines/**` (AC-15), enforced by construction: no stage's Expected Scope lists any of those files, and ST-4's closing gate makes the empty diff an explicit checked assertion.
- No stage wires `ProcessRunner` into `runReview`, any composition root, or `[E5.F1.H2]`'s (not-yet-existing) validation flow — this port ships with no caller, per design's stated scope and the two prior E5 stories' precedent.

## Planner Stop Note

- Not applicable: `objective` is `new-feature`. This plan is execution-ready; `sddl-executor` runs ST-1 through ST-4 one at a time, each gated by its own `stage_approval` checkpoint.

## Approval Notes

- User approved design.md ("si, avanza con el plan") and this plan proceeds under the same advancement. Each stage still requires its own explicit `stage_approval` before `sddl-executor` touches code.
- Sequencing follows design.md's own recommendation verbatim (core types, then the pure classifier with its cheap unit tests, then the impure adapter shell, then the real-child suite as the closing gate) — the same core-first-then-pure-then-impure-then-integration shape both prior E5 stories used.
