# QA Report

## Closeout Digest

- change_name: e7-f1-h1-e2e-smoke (`[E7.F1.H1]`, issue #41)
- mode: **final** (change-wide closeout), reviewed at HEAD `88729e5`, range `e590a73~1..HEAD`
- verdict: **pass_with_warnings**
- completion: **deferred** — not marked completed; a `final_review` acceptance is needed for the warnings below
- recommended lifecycle_status: `reviewing`; next action: user accepts the warnings (N-1 boundary, R3-005 -> #79, stale `open_risks`), then complete
- Real quality gate: `npm run check` clean, `npm test` 1039/1039, build OK, e2e 2/2, one mutation re-run went RED and was reverted.

## Findings (before summary)

| Id | Severity | Finding |
|---|---|---|
| QA-1 | low (known limitation, not a defect) | **N-1 coverage boundary.** The smoke drives `createCli(createCliDeps({...})).run(argv)` in-process. It does NOT exercise `src/main/cli.ts` argv dispatch, `process.exitCode` assignment, or the built `dist/cli.js`. "Fails if any piece of the flow breaks" is therefore bounded at the composition-root boundary: true from `createCliDeps` inward, not above it. CI's `node dist/cli.js --version` (re-run here: `0.0.0`) is a partial offset only: it proves the bundle boots, not dispatch, subcommands or exit codes. Accepted by the user as d-003. |
| QA-2 | low | **R3-005 deferred.** The exit-code-2 arm (non-`ok` states) is not exercised end to end. Kept out on purpose (a third scenario breaks AC-12 / N-3); unit tests pin it; tracked as issue #79 (risk-e7h1-014). |
| QA-3 | low | **Stale `open_risks` in `state.yaml`.** It still lists -001..-007, -009, -010, -012, -013 whose summaries are historical or record closure. Live/accepted only: -005 (test-only seam, mitigated by AC-7), -007 (AC-7 verified by reading), -014 (#79). Recommend the orchestrator prune or mark them closed. |
| QA-4 | low | **Risk-id inconsistency (reconciled below).** |
| QA-5 | info | Two non-blocking review SUGGESTIONs from the scoped re-review remain (RR1-001 unguarded `rmSync` in the fixture catch block; RR1-002 no-op `checkout -q main`). |

## Risk-id reconciliation (authoritative reading)

The ST-5b entry in `execution-log.md` (append-only, not edited) labels the M2 worktree-location blind spot `risk-e7h1-008` in three places. **That is a typo.** Authoritative mapping:

- `risk-e7h1-011` = M2 worktree-location blind spot (found by ST-5's M2, closed by ST-5b). Registered as such in `plan.md` Amendment 1 and `state.yaml`; `state.yaml` records it CLOSED.
- `risk-e7h1-008` = ST-2 quality-gate interaction risk, RETIRED at ST-2 (isolation run byte-identical to baseline). It was never reopened.
- `risk-e7h1-012` = the documentation mismatch itself; this report resolves it.

## Acceptance criteria (re-verified independently)

| AC | Result | Proof |
|---|---|---|
| AC-1 | PASS | `npx vitest run --project e2e`: 1 file, 2 tests passed |
| AC-2 | PASS | `e2e/support/hermetic-git.ts` pins `GIT_CONFIG_GLOBAL/SYSTEM`, per-invocation identity, `init -b main`, realpath'd temp roots; `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_CONFIG_COUNT` neutralised. Node 22/24 CI matrix not observable locally (see AC-10) |
| AC-3 | PASS | `env: { SENTINEL_HOME: sentinelHome }` injected (`review-flow.test.ts:133-136`, `:311-313`); `process.env` not mutated; dead-home canary `existsSync(deadHomeDir)` false (`:~256`) |
| AC-4 | PASS | S1-S4 in one test; every leg is an argv array through `createCli(createCliDeps(...)).run` (`:133,142`) |
| AC-5 | PASS | `result.md` toBe `ENGINE_OUTPUT` (`:196`); `repo/baseRef/targetRef/state` asserted (`:207-211`); id = dir basename vs `runs list` (`:242-246`); `validations/` absent (`:235`, `:380`). grep for `.engine`/`id`-field assertions: only comments |
| AC-6 | PASS | `toBe(0)` at `:187`; `toBe(1)` at `:354` |
| AC-7 | PASS | `git diff e590a73~1..HEAD -- src/core/repos/ports/config-schemas.ts` = 0 bytes. `container.ts` diff read: `engineOverride?` optional on `CliDepsOptions` and `WiringGraphOptions`; call site is `options.engineOverride ?? createEngine(request.engineName, env)`, so absence leaves the original call verbatim; doc-comment says test-only, `@internal`, unreachable from argv/config/env; `TuiDepsOptions` untouched |
| AC-8 | PASS | `tsconfig.json` and `biome.json` widened; `npm run check` covers 165 files, `depcruise src` unchanged; ST-6 spot check logged in `execution-log.md` (not re-run) |
| AC-9 | PASS | 1039/1039 across 50 files (baseline 1037 + 2); zero files under `src/**/__test__/` touched |
| AC-10 | PASS-WITH-CAVEAT | The `test` job runs `npm test` (all projects), no workflow edit in the range. No CI run observable from here, so the Node 22/24 legs are inferred, not observed |
| AC-11 | PASS-WITH-CAVEAT | Re-ran M2 (`worktreesDir: paths.clonesDir`, `container.ts:256`): 1 failed / 1 passed, `ENOENT scandir '<tmp>/worktrees'` at `review-flow.test.ts:266`; reverted, `git diff src/main/container.ts` = 0 bytes. Log evidence: M1 (`run-store-fs.ts`, RED), M3 (`exit-code.ts`, RED), M2 (RED after ST-5b), M4/M5/M6/M8 (RED after ST-7). Caveat = QA-1 (N-1) |
| AC-12 | PASS | exactly 2 tests; `quick` harness |

## Command evidence

| Command | Result |
|---|---|
| `npm run check` | `Checked 165 files ... No fixes applied`; `no dependency violations found (107 modules, 254 dependencies cruised)` |
| `npm test` | 50 files passed, 1039/1039 tests passed |
| `npm run build` | ESM build success, `dist/cli.js` 124.20 KB |
| `node dist/cli.js --version` | `0.0.0` |
| `npx vitest run --project e2e` | 1 file, 2/2 passed (~2.3 s) |

## Scope discipline (`e590a73~1..HEAD`, non-doc paths)

Exactly `biome.json` (+1), `tsconfig.json`, `vitest.config.ts` (+4: e2e-only `testTimeout`/`hookTimeout`, from fix round 1), `src/main/container.ts` (+26/-2), `e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts`. No `__test__` file, `.dependency-cruiser.cjs`, `package.json` or `config-schemas.ts` change. `vitest.config.ts` is a small addition beyond the listed intent in the story's original scope, justified by ledger rows R3-004/R4-003/R1-003. Working tree at start: only `state.yaml` modified (orchestrator-owned); no mutation residue.

## Review evidence (`review-ledger.md`)

Original 4R verdict `fail` on R3-001 (CRITICAL, prompt/diff stages unobserved). Fix round 1 (ST-7) is recorded; scoped re-review verified R3-001 by an independent fixture trace and moved the verdict to `pass_with_warnings`. Counts: confirmed=1 (verified), suspect=0, escalated=0, info=13, open severe findings = 0. R3-005 correctly deferred: two tests only, AC-12/N-3 hold. Round 2 of 2 unspent.

## Verdict

`pass_with_warnings`. Every AC is met on the evidence, and the seam is contained. The verdict is not a clean `pass` because of QA-1 (a known, user-accepted boundary), QA-2 (deferred exit-code-2 coverage) and unobserved CI matrix legs, all of which warrant explicit acceptance rather than silent closure.
