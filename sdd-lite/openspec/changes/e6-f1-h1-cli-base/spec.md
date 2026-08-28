# Spec

## Routing Digest

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- digest_summary: Formalizes `[E6.F1.H1]` (issue #36): a `commander` CLI driving adapter (`repo add|list`, `review`, `runs list|show`, `--version`, `--help`) plus the real composition root in `src/main/cli.ts`, carrying user decisions D1-D4 as fixed inputs. Widened, with user authorisation, by one new core use case (`persistRun` in `core/history`) and one config-schema field (`reviewTimeoutMs`).
- scope_digest: IN = CLI adapter (6 command paths + per-command help), composition root wiring of all driven adapters, `persistRun` use case, `SENTINEL_HOME` root resolution, `reviewTimeoutMs` + `--timeout`, `commander` dependency, stdout/stderr separation, adapter+core tests. OUT = exit-code contract per terminal state (`[E6.F1.H2]`), TUI, markdown/colour rendering, `sentinel open`, e2e smoke, user docs.
- acceptance_digest: 14 numbered criteria. AC-1 (zero logic in the command) and AC-2 (useful per-command `--help`) are the story's own backlog criteria; AC-5/AC-7/AC-8/AC-9 formalize D1/D2/D3/D4; AC-12 fixes the H1/H2 boundary; AC-11 confirms `processRunner` wiring.

## Summary

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- spec_status: ready-for-design, gated on one B-level checkpoint (two open decisions: `--json` surface, review-request composition owner)

This change makes the product reachable. Every core use case and driven adapter exists and is tested; nothing has ever instantiated them together. The spec fixes what the command surface guarantees, what the composition root owns, and where `[E6.F1.H1]` stops and `[E6.F1.H2]` starts.

## Scope Boundary

### In Scope

- **CLI driving adapter** under `src/adapters/driving/cli/` (today `export {}`): one module per command group (`repo`, `review`, `runs`), each declaring positionals, options and help text and delegating to injected use cases. Commands receive dependencies; they never construct adapters.
- **Composition root** `src/main/cli.ts` replacing the `[E0.F1.H3]` `--version` stub: the only place `createGitCliAdapter`, `createConfigStoreAdapter`, `createRunStoreFsAdapter`, `createHarnessLoaderAdapter` (factory + user pair), `createExecProcessRunner` and the engine adapters are instantiated.
- **`persistRun` use case in `core/history`** (D1) — composes a `RunRecord` from the `RunReviewRequest`/`RunReviewResult` pair and calls `RunStore.save()`. **Declared, user-authorised widening beyond the backlog entry's literal text** (state.yaml D1, level C); must be called out in the PR description and the history entry.
- **`SENTINEL_HOME` root resolution** (D2) in the composition root: env var when set, else `~/.sentinel`; every adapter path (`basePath`, `runsRoot`, `clonesDir`, `worktreesDir`) derives from it.
- **`reviewTimeoutMs` on `GlobalConfigSchema`** plus a `--timeout <ms>` flag on `review` (D3). Config-format change to an existing schema, with its own tests.
- **`commander` as the only new runtime dependency** (D4). `package.json` runtime deps go 3 → 4.
- **stdout/stderr separation** and stack-trace-free error rendering.
- **Tests**: `adapters` project for the command surface against fake use cases; `core` project for `persistRun` (in-memory `RunStore` fake) and the schema change.

### Out Of Scope

- Terminal-state → exit-code mapping, its configurability, and the no-TTY guarantee — `[E6.F1.H2]` (#37), see AC-12.
- TUI / `@clack/prompts` — `[E6.F2.H1]`. `picocolors`, markdown/`marked-terminal` rendering — `[E6.F2.H2]` (D4).
- `sentinel open` — ⚪ `[E6.F2.H3]`, skipped per workflow rule 7.
- e2e smoke with FakeEngine — `[E7.F1.H1]`; the `e2e/` vitest project stays empty.
- README / user docs — `[E7.F2.H1]`, which inherits documenting `SENTINEL_HOME`.
- A `repo branches` command. `listBranches` exists but the backlog gives H1 no command for it; it is `[E6.F2.H1]`'s consumer.
- A `--base` flag on `review`. `baseRef` comes from `RepoEntry.baseBranch` → `GlobalConfig.defaultBaseBranch`.

### Non-Goals

- **No change to any existing core use-case signature.** `runReview` stays untouched (`[E5.F2.H1]`'s explicit decision, honoured by D1). Only additive core surface (`persistRun`, `reviewTimeoutMs`, a `DEFAULT_REVIEW_TIMEOUT_MS` constant) is authorised; anything more is a STOP.
- No colour, no progress spinner, no interactive prompt on any path.
- No new driven adapter or port.
- Not a performance or resilience change: residual E5 debt (`risk-006`, process-group kill on timeout) stays out.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `sentinel repo add <url> [--local-path] [--base-branch] [--harness]` | Maps 1:1 onto `RegisterRepoRequest`, calls `registerRepo`, prints alias + resolved local path on stdout; an already-registered repo is reported, not an error. | `RegisterRepoResult.alreadyRegistered` |
| `sentinel repo list` | Calls `listRepos`, prints one stable line per alias (alias, url, base branch, harness). Empty registry prints nothing to stdout and a note on stderr. | `ListReposResult.repos: RepoRegistry` |
| `sentinel review <repo> <branch> [--type <harness>] [--engine <e>] [--timeout <ms>]` | Resolves the request from the repo entry + global config + flags, calls `runReview`, then `persistRun`, then prints terminal state, verdict (when present) and the absolute run directory. | `RunReviewRequest`; `RunStore.save` resolves the run dir |
| `review` on an unregistered alias | Fails before touching git or the engine, message on stderr, non-zero exit, no run persisted. | usage/invocation failure, AC-12 |
| `review` completing with any terminal state (`ok`/`ambiguous`/`engine-error`/`timeout`/`validation-failed`) | Result printed, run persisted, **exit 0** in this story. | AC-12; `[E6.F1.H2]` changes this deliberately |
| `sentinel runs list <repo>` | Calls `listRuns`, one line per `RunSummary` ascending by start time; `partial`/`corrupt` entries render their status without fabricating absent fields. | `[E5.F2.H2]` D2 |
| `sentinel runs show <repo> <id>` | Calls `getRun`, prints the record; `RunNotFoundError`/`RunCorruptedError` render as a message on stderr, non-zero exit. | `GetRunResult = RunRecord` |
| `sentinel --version` / `-V` | Prints the package version, exits 0 — the `[E0.F1.H3]` contract survives the rewrite. | regression guard |
| `SENTINEL_HOME=/tmp/x sentinel repo list` | Every path used derives from `/tmp/x`; nothing under `~/.sentinel` is read or created. | D2, and the seam `[E7.F1.H1]` needs |
| Any command's `--help` | Exits 0, prints usage, positionals, and every option with its meaning; the root help documents `SENTINEL_HOME`. | AC-2 |
| Any core typed error reaching a command | Rendered as a one-line human message on stderr, no stack trace, no raw exception. | mirrors `[E6.F2.H1]`'s acceptance wording |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Each command body invokes its use case(s) and holds no domain logic — no `RunRecord` composition, no adapter construction, no port call, no re-implementation of a cascade that core already owns. `review` may call two use cases in sequence (`runReview` then `persistRun`, D1) and may call the exported pure helper `resolveEngine`. | Adapter tests drive every command with fake use cases only; `npm run check` (`depcruise`: no `src/core → src/adapters`, wiring only in `src/main`); code read of `src/adapters/driving/cli/**` | must |
| AC-2 | `--help` is useful at every level: `sentinel`, `sentinel repo`, `repo add`, `repo list`, `review`, `sentinel runs`, `runs list`, `runs show` each exit 0 and print a usage line, all positionals and all options with descriptions. The root help documents `SENTINEL_HOME` and its `~/.sentinel` default. | Adapter test asserting non-empty help output and the presence of `SENTINEL_HOME` in root help | must |
| AC-3 | The six command paths map exactly to `registerRepo`, `listRepos`, `runReview`(+`persistRun`), `listRuns`, `getRun` — one use case per path, no command left unwired and no extra command added. | Adapter tests, one per path | must |
| AC-4 | `sentinel --version` prints `package.json`'s version and exits 0, preserving `[E0.F1.H3]`. | Regression test | must |
| AC-5 | `persistRun(request, deps)` exists in `core/history`, is exported from its module `index`, composes a `RunRecord` from a `RunReviewRequest`/`RunReviewResult` pair (including `diff` reduced to `RunDiffSummary` — never diff bodies), calls `RunStore.save()` and returns the run directory path. It imports `run`'s types only through `run`'s public barrel. | Core unit tests with an in-memory `RunStore` fake, covering `ok` and a failed run (`failure` populated, `verdict` absent); `depcruise` `core-modules-via-index` | must |
| AC-6 | `sentinel review` persists exactly one run per completed invocation and prints its absolute directory. A run that ends in a non-`ok` terminal state is still persisted. | Adapter test asserting the `persistRun` fake is called once with the result the `runReview` fake returned | must |
| AC-7 | The sentinel home root is `process.env.SENTINEL_HOME` when set and non-empty, else `~/.sentinel`; all four adapter path inputs and `runReview`'s `clonesDir`/`worktreesDir` derive from it, resolved to absolute paths in `src/main/` and nowhere else. | Test/inspection of the root resolver with the env var set and unset | must |
| AC-8 | `GlobalConfigSchema` gains `reviewTimeoutMs: z.number().optional()`; the fallback constant `DEFAULT_REVIEW_TIMEOUT_MS = 600_000` (10 min, "generous" per PRD §7) lives in `core/run` beside `DEFAULT_VALIDATION_TIMEOUT_MS`, not as a zod `.default()`. Effective precedence is **`--timeout` flag > `config.reviewTimeoutMs` > `DEFAULT_REVIEW_TIMEOUT_MS`**. | Core schema test (field optional, existing configs still parse) + a precedence test covering all three levels | must |
| AC-9 | `commander` is the only dependency added to `package.json`'s `dependencies`; `picocolors`, `@clack/prompts`, `marked*` are absent. Runtime deps end at exactly `commander`, `execa`, `yaml`, `zod`. | `package.json` diff review | must |
| AC-10 | Command results go to **stdout**; diagnostics, warnings and error messages go to **stderr**. Listing output is one record per line with a stable field order, so `repo list` and `runs list` survive a pipe unchanged. Nothing decorative is written to stdout. | Adapter tests capturing the two streams separately | must |
| AC-11 | `createExecProcessRunner` is wired into `RunReviewDeps.processRunner` in the composition root, and `review` forwards `RepoEntry.validations` / `validationTimeoutMs`, so declared validations (`[E5.F1.H2]`, #32) actually execute through the CLI's review path. Leaving it unwired would make `[E5.F1.H2]` dead code and is not acceptable. | Wiring inspection + adapter test asserting `validations` reaches the `runReview` fake | must |
| AC-12 | **H1/H2 boundary, confirmed (A-level).** H1 owns `review`'s full argument surface (`<repo> <branch> --type --engine --timeout`), the `runReview` + `persistRun` invocation and the printed result; it exits **0 for any completed invocation regardless of terminal state**, and non-zero only for usage or invocation failure — **including a post-review persistence failure (D13): the outcome is still rendered on stdout, `runDir` shows the `-` absence marker, one diagnostic goes to stderr and the exit is non-zero, since a run whose record never reached disk did not fully complete. No sixth terminal state is introduced**. Usage/invocation failures are: unknown command or flag, unregistered repo, unreadable config, unknown engine or harness, and a post-review persistence failure. H2 (#37) adds the terminal-state → exit-code mapping, its configurability and the no-TTY guarantee. No exit-code table is introduced here. | Adapter tests asserting exit 0 for a `request-changes`/`engine-error` result, non-zero for an unregistered alias, and — for D13 — that a rejecting `persistRun` still renders the outcome on stdout with `runDir` as `-`, emits one stderr diagnostic, and exits non-zero | must |
| AC-13 | Core typed errors (`RepoNotFoundError`, `ConfigValidationError`, `RunNotFoundError`, `RunCorruptedError`, `UnknownEngineError`, `HarnessNotFoundError`, …) render as one-line messages on stderr with no stack trace and no raw exception object. | Adapter tests throwing each error family from a fake use case | must |
| AC-14 | `npm run check` and `npm test` exit 0, the existing 500 tests still pass, and the new tests live in `<module>/__test__/*.test.ts` under the `core` and `adapters` vitest projects. The `e2e` project stays empty. | `npm run check && npm test` | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `risk-e6h1-006` — first full assembly of the dependency graph, in hot-path `src/main/` wiring, with no e2e safety net (`[E7.F1.H1]` not yet written) | medium | Integration mismatches between core request shapes and adapter factories surface here and unit tests with fakes cannot catch them. Mitigation: a manual `npm run dev` smoke against a throwaway repo with the fake engine, recorded in the execution log. |
| `persistRun` widens the story (D1) | medium | Authorised, but it makes `[E6.F1.H1]`'s PR larger than its backlog entry. Must be declared explicitly in the PR description and history entry, not smuggled in. |
| `reviewTimeoutMs` is a config-format change | low-medium | Optional field, so existing `config.yaml` files keep parsing; AC-8 requires a test that proves it. |
| Review-request composition (see OQ-2) sits close to AC-1 | medium | Whichever way OQ-2 lands, the resolution rules must be the same ones core already documents (PRD §3.1-D); duplicating a cascade inside the adapter is the failure mode to watch for in review. |
| `SENTINEL_HOME` becomes public surface | low | Deliberate (D2). A later rename is a breaking change; `[E7.F2.H1]` must document it. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| **OQ-1 — Does `review`/`runs list`/`repo list` get a `--json` flag?** AC-10 already guarantees the uncontroversial half (stable line format on stdout, diagnostics on stderr). A `--json` surface is a **public API commitment** that scripts would depend on for the product's lifetime, which makes it B-level, not the spec's to decide. **Recommendation: defer `--json`.** For: machine consumption is the story's stated goal and retrofitting it later means a second output path through the same commands. Against: no backlog story asks for it, its schema would be a de-facto public contract designed before `[E6.F1.H2]`/`[E7.F2.H1]` know what consumers need, and line-oriented stdout already satisfies "suitable for pipes". Deferring costs one additive flag later; committing early costs a schema we cannot change. | `sddl-design` | **open, B-level — orchestrator must put it to the user** |
| **OQ-2 — Who composes the `RunReviewRequest` from repo entry + global config + flags?** `runReview` needs `repoPath`, `baseRef`, `harnessType`, `timeoutMs`, `limits`, `validations`, `validationTimeoutMs`; each comes from a flag → `RepoEntry` → `GlobalConfig` cascade. Doing it inside the `review` command is the same class of concern D1 removed from the CLI. **Recommendation: a pure `resolveReviewRequest` helper exported from `core/run`'s barrel**, sibling to the already-exported pure `resolveEngine` — consistent with D1's reasoning, testable in the `core` project, and it keeps the command a parse-and-delegate shell. Alternative: leave the cascade in the adapter as pure option-defaulting with no I/O, arguing it is below AC-1's threshold — smaller diff, but it puts PRD §3.1-D precedence rules outside core and invites drift with the TUI, which will need the same resolution. Additive core surface again, hence B-level like D1. | `sddl-design` | **open, B-level — orchestrator must put it to the user** |
| H1/H2 boundary (`risk-e6h1-005`) | Two stories touch the same command file | — | **decided (A-level, this stage) — AC-12.** `[E6.F1.H2]`'s backlog description restates the full command shape as context; the only surface its acceptance criteria uniquely name is exit codes + TTY-less usability. H1 must define `--type` regardless, because `RunReviewRequest.harnessType` is mandatory and has no other source. |
| `processRunner` wiring | `[E5.F1.H2]` is dead code until something wires it | — | **decided (A-level, this stage) — AC-11: wired, and declared validations do run through `review`.** |
| D1-D4 | — | — | **settled by the user at `cp-proposal-b-decisions`; formalized as AC-5/AC-7/AC-8/AC-9.** No re-litigation downstream. |

## Approval Notes

- Scope stays `[E6.F1.H1]` / issue #36 (milestone "E6 — Interface") plus the one user-authorised widening (D1) and the one config-schema addition (D3).
- Baseline: `main` @ `1e7cf01`; `npm run check` and `npm test` (500 tests / 28 files) exit 0 on the working branch.
- Two B-level open questions (OQ-1, OQ-2) materially shape `design.md` and must reach the user before `sddl-design` writes interfaces. Everything else is definitive.
- Recommended next stage: `sddl-design`, gated on the OQ-1/OQ-2 checkpoint.

## Budget Notes

- Lite artifact, deliberately above the 300-500 word target: 14 acceptance criteria are needed because the change spans a driving adapter, the composition root, one new core use case and one schema change, and each of D1-D4 needs its own checkable criterion.
