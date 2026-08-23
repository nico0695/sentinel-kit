# Proposal

## Routing Digest

- change_name: e6-f1-h1-cli-base
- objective: new-feature
- route: continue-lite
- digest_summary: First story of E6. Replace the `[E0.F1.H3]` `--version` stub in `src/main/cli.ts` with a real composition root plus a `commander`-style driving adapter under `src/adapters/driving/cli/` (today an empty `export {}` placeholder), exposing `repo add|list`, `review`, `runs list|show`, `--version` and `--help`. Every core use case the commands must reach already exists and is exported from its module `index`; this story is wiring plus argument/output shaping, not new domain logic.
- feasibility_signal: medium-high mechanically, medium overall — the use-case surface is complete and stable, but three wiring facts have no owner yet (runtime path root, review timeout source, run persistence) and one B-level dependency decision (`commander`) is deliberately unresolved.
- scope_sketch_digest: IN = CLI driving adapter (command definitions, argument parsing, `--help` text, terminal/pipe-friendly output), composition root wiring in `src/main/`, the first runtime CLI dependency, adapter-project tests for the command surface. OUT = exit-code contract per terminal state (`[E6.F1.H2]`, #37), TUI/clack (`[E6.F2.H1]`), markdown result rendering (`[E6.F2.H2]`), `sentinel open` (⚪ `[E6.F2.H3]`), e2e smoke (`[E7.F1.H1]`), user docs (`[E7.F2.H1]`).

## Summary

- change_name: e6-f1-h1-cli-base
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (five open questions, three of them material and B-level)
- exploration_performed: true

## Problem And Desired Outcome

Five epics of core and driven adapters are merged and 500 tests pass, but nothing in the product is reachable by a human. `src/main/cli.ts` is still the `[E0.F1.H3]` stub — it prints `pkg.version` when `--version` appears in `argv` and otherwise exits 0 doing nothing — and `src/adapters/driving/cli/index.ts` is an empty `export {}`. Every use case (`registerRepo`, `listRepos`, `listBranches`, `runReview`, `listRuns`, `getRun`) and every driven adapter (`git`, `storage`, `exec`, three engines) exists, is tested, and has never been instantiated together.

`[E6.F1.H1]` (issue #36) is the story that closes that gap: a scriptable command surface where each command parses arguments, calls exactly one use case, and prints the result. Its two acceptance criteria are the whole shape of the work — *each command invokes its use case (zero logic in the command)* and *useful `--help` per command* — and the first of them restates the architecture rule this repo's guards exist to protect (PRD §4: use cases are the only core API; adapters are instantiated only in `src/main/`).

Desired outcome: `sentinel repo add <url>`, `sentinel repo list`, `sentinel review <repo> <branch>`, `sentinel runs list <repo>`, `sentinel runs show <repo> <id>`, `--version` and `--help` all work end to end against the real adapters, with output that reads well in a terminal and survives a pipe. That unblocks `[E6.F1.H2]` (exit codes), `[E6.F2.H1]` (TUI), `[E7.F1.H1]` (e2e smoke) and `[E7.F2.H1]` (docs), all of which declare a dependency on this story.

## Initial Scope Sketch

### Likely In Scope

- **A CLI driving adapter** in `src/adapters/driving/cli/` — one module per command group (`repo`, `review`, `runs`), each defining its arguments, options and help text, and delegating to an injected use case. Adapters never import other adapters, so the commands receive their dependencies rather than constructing them.
- **The real composition root** in `src/main/cli.ts` — the single place `createGitCliAdapter`, `createConfigStoreAdapter`, `createRunStoreFsAdapter`, `createHarnessLoaderAdapter` (factory + user pair), `createExecProcessRunner` and the engine adapters are instantiated and handed to the CLI adapter. The `wiring-only-in-main` guard and `depcruise` enforce part of this mechanically; `--version` must keep working.
- **The first runtime CLI dependency** (`commander` per `docs/setup-tecnico-sentinel.md` §4, pending the B-level decision below) — the first addition to `package.json` runtime deps since E0, which currently hold exactly `execa`, `yaml`, `zod`.
- **Terminal-and-pipe-friendly output shaping** for the listing commands (`repo list`, `runs list`) and the single-record command (`runs show`). "Suitable for pipes" is the backlog's wording; what it guarantees precisely is an open question.
- **Argument-to-request mapping** — turning CLI strings into the exact request shapes the use cases already declare (`RegisterRepoRequest`, `ListBranchesRequest`, `RunReviewRequest`, `ListRunsRequest`, `GetRunRequest`), and translating the core's typed error families into readable messages without raw stack traces.
- **Tests in the `adapters` vitest project** covering the command surface with fake use cases, plus whatever `main`-level wiring assertion is feasible without spawning processes.

### Likely Out Of Scope

- **Exit codes per terminal state** — `[E6.F1.H2]` (#37) owns that contract explicitly. See the boundary question below.
- **TUI / `@clack/prompts`** — `[E6.F2.H1]`. This story's `review` is the non-interactive path only.
- **Markdown result rendering, colors as a feature, `marked-terminal`** — `[E6.F2.H2]` owns "verdict and blockers visible at a glance". Whether `picocolors` lands here or there is an open question.
- **`sentinel open`** — ⚪ `[E6.F2.H3]`, skipped per workflow contract rule 7.
- **e2e smoke with FakeEngine** — `[E7.F1.H1]`; the `e2e/` project is still empty by design.
- **README / user documentation** — `[E7.F2.H1]`.
- **Any change to core module APIs.** If a command cannot be expressed with the existing use-case surface, that is a STOP, not a quiet core edit.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Use-case surface completeness | Verified directly in the module indexes: `registerRepo(request, deps)`, `listRepos(deps)`, `listBranches(request, deps)`, `runReview(request, deps)`, `listRuns(request, deps)`, `getRun(request, deps)` are all exported with explicit request/deps/result interfaces. Every command has exactly one call target. | high |
| Adapter constructors | All driven factories take simple arguments (`createConfigStoreAdapter(basePath)`, `createRunStoreFsAdapter(runsRoot)`, `createHarnessLoaderAdapter(basePath)`, `createGitCliAdapter()`, engine adapters with optional options objects). Nothing needs a builder or lifecycle. | high |
| Command-parsing mechanics | `commander` is a stable, well-understood library and the story is a flat command tree with no plugins or dynamic loading. Low mechanical risk once the dependency decision is made. | high |
| Runtime path root | **No owner.** `ConfigStore`, `HarnessLoader`, `RunStore` and `runReview` all need injected absolute paths (`basePath`, `runsRoot`, `clonesDir`, `worktreesDir`), and nothing in the repo resolves them today. PRD §5.1 names the layout (`config.yaml`, `repos.yaml`, `runs/<repo>/<ts>/`, `worktrees/<repo>/<branch>-<ts>`) but no story defines the root directory or an env override. The composition root is the first code that must decide. | medium |
| Run persistence on `review` | **A real gap.** `RunReviewDeps` has no `RunStore` — `runReview` computes and returns a `RunReviewResult` but never persists it. `[E5.F2.H1]` built the store; no story wires it to the review flow. PRD use case 5 ("consult a repo's review history") is dead unless something calls `store.save()`. Assembling a `RunRecord` in the CLI adapter would directly violate this story's own AC-1. | medium |
| Review timeout source | `RunReviewRequest.timeoutMs` is required and has no default. `GlobalConfigSchema` carries `validationTimeoutMs` but no engine/review timeout field. The CLI must get the number from somewhere not yet defined. | medium |
| Blast radius | `src/main/cli.ts` is hot-path wiring by the project's own risk classification, and this is the first time the full dependency graph is assembled. Contained, but it is where integration mismatches surface. | medium |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| **Adopt `commander`, and does `picocolors` belong in this story?** `CLAUDE.md` marks `docs/setup-tecnico-sentinel.md` recommendations as re-evaluable on implementation with justification, and this is the first runtime dependency added since E0 (current deps: `execa`, `yaml`, `zod`). Alternatives named in §4: `citty`, `yargs`, `oclif` (already discarded there as a heavy framework), or hand-rolled `parseArgs` from `node:util`. Colors are arguably `[E6.F2.H2]`'s concern, and adding `picocolors` here would be dependency creep against a story whose acceptance criteria never mention color. | **open, B-level — user decides. Do not resolve in spec without the checkpoint.** |
| **Who persists the run after `review`?** `runReview` returns a result and does not save; the `RunStore` fs adapter exists and is unused. Options: (a) the CLI/composition root assembles a `RunRecord` and calls `store.save()` — fastest, but it puts assembly logic outside a use case and reads as an AC-1 violation; (b) a thin `persistRun`-style use case in `core/history` — clean, but new core surface this story's backlog entry does not authorize; (c) declare persistence out of scope here and file it as a gap for a later story, accepting that `sentinel review` writes no history until then. This is arguably a workflow-rule-8 STOP (backlog gap), not a design fork. | **open, B/C-level — must be resolved before design.** |
| **Where does the sentinel home root come from?** Every path-taking adapter needs an absolute base. Options: a fixed `~/.sentinel`, an env override (e.g. `SENTINEL_HOME`), a `--config-dir` global flag, or `cwd`-relative. Affects config format expectations, UX and every later story that reads those files — repo-structure-affecting, therefore B-level. | **open, B-level** |
| **Where does `review`'s `timeoutMs` come from?** `RunReviewRequest.timeoutMs` is mandatory with no default anywhere. Options: a new `GlobalConfig` field (config-format change → B-level), a constant in `main`, or a `--timeout` flag. Note `runReview` also needs `harnessType`; `RepoEntry.defaultHarness` exists to supply it, with `--type` as the override. | **open, A/B-level** |
| **Exactly where is the H1 / H2 boundary?** `[E6.F1.H2]` (#37) owns "exit codes documented and tested per terminal state (ok/approve=0, request-changes≠0 configurable, error/timeout≠0)". Proposed boundary, for spec to confirm: **H1** defines the `review` command's full argument surface (`<repo> <branch> --type --engine`), calls `runReview`, and prints the result; it exits 0 on a completed invocation and non-zero only on usage/invocation failure. **H2** adds the terminal-state-to-exit-code mapping, its configurability, and the no-TTY guarantee. Without an explicit line here the two stories overlap in the same file. | **open, needs confirmation, low risk** |
| **What does "output suitable for pipes" guarantee?** Stable column/line format on stdout with diagnostics on stderr, or a `--json` flag? The backlog says only "suitable for terminal and pipes"; a `--json` surface would be a public API commitment worth pinning deliberately rather than discovering in `[E6.F1.H2]`. | open, A/B-level |

## Contradictions Found

- **One material gap, not a contradiction between documents.** The backlog's dependency chain assumes `sentinel review` produces history (use case 5, and `[E5.F2.H2]`'s `listRuns` exists precisely so `runs list` has something to show), but no story between `[E5.F2.H1]` and `[E6.F1.H1]` wires `RunStore` into the review flow, and `runReview`'s deps deliberately exclude it. Spec must either claim that wiring explicitly or record it as an unowned backlog gap and escalate.
- Minor, non-blocking: `RunReviewDeps.processRunner`'s own doc comment says "the composition root wires this only once an adapter exists (E6)" — that adapter (`createExecProcessRunner`) shipped in `[E5.F1.H1]`, so this story is the intended moment to wire it. Worth confirming in spec that declared validations are expected to run through the CLI's `review` path.

## Approval Notes

- Scope is `[E6.F1.H1]` / issue #36 alone, milestone "E6 — Interface". Both declared dependencies (`[E2.F2.H3]`, `[E5.F2.H2]`) are merged to `main` (`1e7cf01`); `npm run check` and `npm test` (500 tests / 28 files) exit 0 on the working branch.
- Three questions above are B-level under the project's A/B/C protocol and are deliberately left unresolved by this stage: the `commander`/`picocolors` dependency decision, run persistence ownership, and the sentinel home root. The persistence question may escalate to C (workflow rule 8, backlog gap) if the answer requires new core surface.
- Recommended next stage: `sddl-spec`, gated on a user checkpoint for the B-level items — spec should not invent answers to them.

## Budget Notes

- Lite artifact. One new driving adapter with three command groups, one composition root rewrite, one runtime dependency, one adapter-project test suite. Mechanically the largest wiring change since E0, with the genuine risk concentrated in unowned integration facts rather than in code volume.
