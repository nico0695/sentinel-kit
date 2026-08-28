# Plan

## Execution Digest

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- digest_summary: Eleven ordered stages: tooling first, then the three core additions (D3/D5 resolution, D7 normalisation, D1 `persistRun`) which are unit-testable in isolation, then the CLI adapter bottom-up (shell → simple commands → `review`), then the composition root (`paths` before `container`/`cli`), then the mandatory manual smoke, then the deviation-declaration closeout.
- stage_plan_digest: S1 tooling · S2 core run resolution · S3 core history normaliser (D7) · S4 `persistRun` · S5 CLI shell · S6 repo+runs commands · S7 review command · S8 `main/paths.ts` · S9 `main/container.ts`+`cli.ts` · S10 manual smoke · S11 closeout (no code).
- validation_digest: Every stage ends green on `npm run check` + `npm test` with the existing 500 tests intact; each stage adds its own tests in `<module>/__test__/*.test.ts` under the `core` or `adapters` project; `e2e/**` stays empty; S10 is the only integration evidence and its transcript goes in `execution-log.md`.

## Summary

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- planner_terminal: false
- execution_ready: true (after `stage_approval`)
- plan_status: ready-for-executor

D1-D8 are fixed inputs; no stage may reopen them. Three of them (D1, D5, D7) widen the story beyond its backlog text and are user-authorised — S11 exists so that declaration is not forgotten at PR time.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| S1 | Tooling prerequisites, staged alone so they never hide inside a feature diff | — | `package.json` (+`commander` in `dependencies`, D4/AC-9 — nothing else), `package-lock.json`, `vitest.config.ts` (`adapters` include widened to `src/{adapters,main}/**/__test__/**/*.test.ts`, A-4), `docs/testing.md` (one line: the `adapters` project also covers composition-root unit tests) | `npm run check` + `npm test` green, 500 tests unchanged; runtime deps read exactly `commander, execa, yaml, zod` (AC-9) | yes | pending |
| S2 | Review-request resolution in core (D3 + D5) | S1 | `src/core/repos/ports/config-schemas.ts` (`reviewTimeoutMs: z.number().optional()`), `src/core/run/resolve-review-request.ts` (+`DEFAULT_REVIEW_TIMEOUT_MS = 600_000`), `src/core/run/index.ts` barrel, tests in `src/core/repos/__test__/` and `src/core/run/__test__/resolve-review-request.test.ts` | Core unit tests: existing `config.yaml` shapes still parse with the field absent (AC-8); one test per precedence row of design's table, incl. all three timeout levels (flag > config > constant) and the missing-harness `InvalidRunRequestError` (A-3); `RepoNotFoundError` on an unknown alias; `UnknownEngineError` via the internal `resolveEngine` call | yes | pending |
| S3 | D7 alias → storage-key normalisation inside `core/history` — behaviour change to two merged use cases, isolated on purpose | S1 | module-private idempotent helper in `src/core/history/` (no barrel export), applied by `list-runs.ts` and `get-run.ts` | Core unit tests: `owner/repo` → `owner__repo`; an alias with no separator passes through unchanged; the helper is idempotent (`f(f(x)) === f(x)`); existing `listRuns`/`getRun` suites still pass; `depcruise` clean | yes | pending |
| S4 | `persistRun` use case (D1/AC-5) | S3 | `src/core/history/persist-run.ts`, `src/core/history/index.ts` barrel, `src/core/history/__test__/persist-run.test.ts` | Core unit tests with an in-memory `RunStore` fake: an `ok` run and a failed run (`failure` populated, `verdict` absent); `diff` reduced to `RunDiffSummary` with no diff body persisted; `failure.message` is a string for a non-`Error` throwable; the alias is normalised via S3's helper; `depcruise` `core-modules-via-index` (only `../run/index.js`) | yes | pending |
| S5 | CLI shell: factory, deps contract, error/version/root-help behaviour | S1 | `src/adapters/driving/cli/{index.ts,cli-deps.ts,create-cli.ts,render/format-error.ts}`, `__test__/{help,version,errors}.test.ts` | Adapter tests with a capturing `CliIo`: root `--help` exits 0, is non-empty and names `SENTINEL_HOME` and `SENTINEL_OPENCODE_MODEL` (AC-2); `--version` prints the injected version and exits 0 (AC-4); an unknown flag exits non-zero with stderr output; thrown core errors render one line on stderr, no stack (AC-13); nothing touches `process` (code read + `depcruise`) | yes | pending |
| S6 | `repo add`/`repo list` and `runs list`/`runs show` commands + their formatters | S5 | `commands/repo-commands.ts`, `commands/runs-commands.ts`, `render/format-repos.ts`, `render/format-runs.ts`, `__test__/{repo,runs}.test.ts` | Adapter tests with fake use cases only (AC-1): one test per command path (AC-3); results on stdout / diagnostics on stderr, stable tab-separated field order, empty registry prints nothing to stdout (AC-10); `partial`/`corrupt` run entries render their status without fabricated fields; `--help` non-empty at each level (AC-2) | yes | pending |
| S7 | `review` command — the parse-and-delegate shell over `resolveReviewRequest` → `runReview` → `persistRun` | S2, S4, S5, S6 | `commands/review-command.ts`, `render/format-review.ts`, `__test__/review.test.ts` | Adapter tests with fakes: `<repo> <branch> --type --engine --timeout` map onto the resolved request; `persistRun` called exactly once with the `runReview` result and the run dir printed (AC-6); `validations`/`validationTimeoutMs` reach the `runReview` fake (AC-11); exit 0 for `engine-error` and `request-changes` results, non-zero for an unregistered alias with no run persisted (AC-12); no `result.state` read for exit purposes (code read, AC-1) | yes | pending |
| S8 | Sentinel home resolution (D2/AC-7), isolated from the wiring that consumes it | S1 | `src/main/paths.ts` (`resolveSentinelHome`, `sentinelPaths`, `resolvePackageRoot`), `src/main/__test__/paths.test.ts` | Unit tests (in the widened `adapters` project, S1): `SENTINEL_HOME` set / unset / set-but-blank; returned paths absolute; the derived layout matches design's table; `resolvePackageRoot` finds the nearest `package.json` upward | yes | pending |
| S9 | Composition root — the hot-path assembly, last because everything it wires is already tested | S2, S3, S4, S7, S8 | `src/main/container.ts` (adapter instantiation, `loadContext` thunk A-5, per-invocation engine factory A-6 incl. D8's `SENTINEL_OPENCODE_MODEL` guard, `createExecProcessRunner` wired into `RunReviewDeps.processRunner`), `src/main/cli.ts` (replaces the `[E0.F1.H3]` stub, ~10 lines, sets `process.exitCode`) | `npm run check` (`depcruise`: adapters instantiated only here, no core → adapters) + `npm test`; `--version` regression still passes (AC-4); code read confirming AC-7 (every path derives from S8) and AC-11 | yes | pending |
| S10 | Manual smoke for `risk-e6h1-006` — **mandatory, not optional** | S9 | no source changes; `execution-log.md` gains the transcript | `SENTINEL_HOME=$(mktemp -d)` + a throwaway local git repo: `repo add file://…` → `repo list` → `runs list <alias>` (empty) → `review <alias> <branch> --type quick --timeout 60000` → `runs list` → `runs show <alias> <id>`. With no engine binary present the review must end in a **persisted `engine-error` run, not a crash**; nothing may be created under `~/.sentinel`. Any mismatch is a finding, not a fix-in-passing | no (evidence only) | pending |
| S11 | Closeout: declare the authorised deviations | S10 | PR description + history entry (no source) | The PR description and the `history/` entry both name D1 (`persistRun`), D5 (`resolveReviewRequest`) and D7 (normalisation changing `listRuns`/`getRun` behaviour) as user-authorised widenings beyond the backlog text; PR titled `[E6.F1.H1] Base command CLI`, `Closes #36`; gate output quoted | no | pending |

## Validation Strategy

- **Per stage:** `npm run check` (biome + `tsc --noEmit` + `depcruise src`) and `npm test` must both exit 0 before the stage is reported done. No stage may leave the tree red for the next one, and the existing 500 tests must keep passing throughout — a drop in count is a blocker, not a rounding error.
- **Where tests live:** `core` project for S2-S4 (in-memory port fakes only), `adapters` project for S5-S8 (fake use cases and a capturing `CliIo`; S8 rides the widened include from S1). `e2e/**` stays empty — that suite is `[E7.F1.H1]` (AC-14).
- **Acceptance-criteria coverage:** AC-1/AC-3 S6+S7 · AC-2 S5+S6+S7 · AC-4 S5+S9 · AC-5 S4 · AC-6 S7 · AC-7 S8+S9 · AC-8 S2 · AC-9 S1 · AC-10 S5+S6 · AC-11 S7+S9 · AC-12 S7 · AC-13 S5 · AC-14 every stage.
- **Known gap:** unit tests with fakes cannot catch integration mismatches between core request shapes and adapter factories (`risk-e6h1-006`, open, medium). S10 is the only mitigation available in this story and is therefore non-negotiable; its transcript is the evidence QA reads.

## Dependencies And Sequencing

- S1 gates everything: `commander` must be installed before S5 compiles and the widened vitest include before S8's tests are collected.
- S2, S3 and S8 are mutually independent after S1 and may be approved in any order among themselves; S4 strictly follows S3 (it uses the same normaliser).
- The CLI adapter goes bottom-up: S5 (shell) → S6 (simple commands, exercising the render + IO seam) → S7 (`review`, the only command with two use cases).
- S9 is deliberately last of the code stages: by then every function it wires has its own tests, so a failure there points at wiring rather than logic.
- S10 cannot run before S9; S11 cannot be written before S10's outcome is known.

## Planner Stop Note

- `objective` is `implementer`, not `planner`: this plan is meant to be executed. It is not execution-ready until the orchestrator takes `stage_approval` to the user; `sddl-plan` does not route to `sddl-executor` itself.

## Approval Notes

- Every code-touching stage (S1-S9) requires explicit `stage_approval` before `sddl-executor` runs it, one stage per invocation.
- Scope fence: `[E6.F1.H2]`'s exit-code table, the TUI, `--json` (D6), markdown/colour rendering, `sentinel open` and the e2e smoke suite are other stories. A stage that finds itself needing any of them must stop and report, not widen.
- D1-D8 are settled. A contradiction between this plan and the repo is a STOP for the executor, not an improvisation.

## Budget Notes

- Slightly above the 300-500 word target: eleven stages across a driving adapter, a composition root, two new core functions, a behaviour change to two merged use cases and a mandatory manual smoke, each needing its own validation note so the executor invents nothing.
