# Design

## Routing Digest

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- digest_summary: A `commander` program built by a single pure factory `createCli(deps)` in `src/adapters/driving/cli/`, driven entirely by injected use-case thunks and injected output writers, plus a composition root split into `src/main/{cli,container,paths}.ts`. Core gains exactly the two authorised additions (`persistRun` in `history`, `resolveReviewRequest` + `DEFAULT_REVIEW_TIMEOUT_MS` in `run`) and the `reviewTimeoutMs` schema field.
- affected_areas_digest: `src/adapters/driving/cli/**` (new, 9 files + tests), `src/main/**` (3 files), `src/core/history/{persist-run.ts,index.ts}`, `src/core/run/{resolve-review-request.ts,index.ts}`, `src/core/repos/ports/config-schemas.ts`, `package.json` (+`commander`), `vitest.config.ts` (one include), `docs/testing.md` (one line).
- interfaces_digest: `createCli(deps: CliDeps): SentinelCli` with `run(argv): Promise<number>`; `CliDeps = { useCases, io, loadContext, now }`; `persistRun(request, deps): Promise<PersistRunResult>`; `resolveReviewRequest(input): RunReviewRequest`; `resolveSentinelHome(env, homeDir)` + `sentinelPaths(root)`.

## Summary

- change_name: e6-f1-h1-cli-base
- objective: implementer
- route: continue-lite
- design_status: ready-for-plan with one blocking open question (OQ-D1) and one non-blocking one (OQ-D2)

The design's organising idea: **the CLI adapter never sees an adapter, a port or a path**. It receives a bag of already-bound use-case thunks, two line writers and a clock; every filesystem fact, adapter construction and engine choice lives in `src/main/`. That is what makes AC-1 and AC-3 testable with fakes only, and it is also what keeps `[E6.F2.H1]`'s TUI able to reuse the same seam later.

## Design Overview

**1. CLI adapter — one factory, no process access.**

```
src/adapters/driving/cli/
  index.ts                       createCli, formatErrorLine, the CliDeps/SentinelCli types
  cli-deps.ts                    CliDeps, CliUseCases, CliIo, ReviewContext
  create-cli.ts                  program assembly, exitOverride, output routing, root help
  commands/repo-commands.ts      registerRepoCommands(program, deps)  -> repo add | repo list
  commands/review-command.ts     registerReviewCommand(program, deps)
  commands/runs-commands.ts      registerRunsCommands(program, deps)  -> runs list | runs show
  render/format-repos.ts         formatRepoLine, formatRegisterOutcome
  render/format-runs.ts          formatRunSummaryLine, formatRunRecordBlock
  render/format-review.ts        formatReviewOutcome
  render/format-error.ts         formatErrorLine
  __test__/*.test.ts
```

`createCli(deps)` returns `SentinelCli = { run(argv: readonly string[]): Promise<number> }`. It calls `program.exitOverride()` and `program.configureOutput({ writeOut, writeErr })` bound to `deps.io`, so **nothing in the adapter touches `process`** — help, version, usage errors and results all flow through the injected writers and the returned exit code. `run` catches everything: a `CommanderError` yields `err.exitCode` (0 for `--help`/`--version`, non-zero for usage errors), any other throwable is rendered by `formatErrorLine` to `io.stderr` and yields `1`. This is exactly AC-12's boundary: a *completed* review returns 0 whatever its terminal state, because no command inspects `result.state` for exit purposes.

`formatErrorLine(error: unknown): string` is presentation only — `error instanceof Error ? error.message : String(error)`, one line, no `cause` chain, no stack, no per-error-type branching (AC-13). Core errors already carry human messages; adding a mapping table here would re-import domain knowledge into the adapter.

Render helpers are pure `(...) => string | string[]`, tab-separated with a fixed field order and `-` for absent fields, so `repo list` / `runs list` survive a pipe (AC-10) and a later `--json` (D6) is an added branch, never a rewrite.

**2. Composition root — `src/main/{cli.ts, container.ts, paths.ts}`.**

`cli.ts` stays ~10 lines: `const cli = createCli(createCliDeps()); process.exitCode = await cli.run(process.argv);`. `container.ts` owns the whole wiring order: paths → driven adapters → engine factory → use-case thunks. `paths.ts` owns D2.

**3. Sentinel home layout (D2, design-owned).**

| Path | Consumer |
|---|---|
| `<root>/config.yaml`, `<root>/repos.yaml` | `createConfigStoreAdapter(root)` |
| `<root>/harnesses/`, `<root>/skills/` | user `createHarnessLoaderAdapter(root)` |
| `<root>/clones/<owner>/<repo>` | `RegisterRepoDeps.clonesDir = <root>/clones` |
| `<root>/worktrees/` | `RunReviewDeps.worktreesDir` |
| `<root>/runs/<repoName>/<id>/` | `createRunStoreFsAdapter(<root>/runs)` |

`resolveSentinelHome(env, homeDir)`: `env.SENTINEL_HOME` trimmed and non-empty → `resolve(value)`, else `join(homeDir, ".sentinel")`. `sentinelPaths(root)` returns the four absolute derived paths. Factory harnesses come from the *package* root, not the home root: `resolvePackageRoot()` walks up from `fileURLToPath(import.meta.url)` to the first directory containing `package.json`, which lands on the repo root under `npm run dev` (`src/main/cli.ts`) and on the installed package root under `dist/cli.js` — the two entry depths differ, so a fixed `../..` would be wrong in one of them.

**4. `persistRun` (D1) — `src/core/history/persist-run.ts`, exported from `history/index.ts`.**

Composition rules: `harness/baseRef/targetRef` from the request; `state/verdict/prompt/engineOutput/usage` from the result; `engine = result.engineName ?? request.engineName`; `validationOutput = request.validationOutput` (the result carries none); `durationMs = Math.max(0, now() - startedAtEpochMs)`; `diff` reduced to `RunDiffSummary` — `fileCount: result.diff.files.length`, `totalLines`, `estimatedTokens`, `truncated`, `warnings: result.diff.warnings.map(w => w.message)` — **never a diff body** (AC-5); `failure` reduced to `{ stage, message }` where `message = e instanceof Error ? e.message : String(e)`, so no throwable can reach disk. It reads `result.diff` structurally, so neither `ReviewDiff` nor `DiffWarning` needs a new export from `workspace`/`run`; the only cross-module import is `../run/index.js` (guard `core-modules-via-index`).

**5. `resolveReviewRequest` (D5) — `src/core/run/resolve-review-request.ts`, sibling to `resolve-engine.ts`.**

Pure, no I/O, string-concatenates paths (`${clonesDir}/${alias}`) because `node:path` is banned in core — the same trick `registerRepo` already uses. It performs the registry lookup itself (throwing the existing `RepoNotFoundError` from `repos/index.js`) so the command holds neither lookup nor precedence logic, and it calls `resolveEngine` internally rather than beside it, so `engineName` is always a validated `EngineName` on the returned request and `UnknownEngineError` surfaces before any git or engine work (AC-12's "invocation failure" side).

**6. Engine selection.** `resolveReviewRequest` decides *which* engine; `container.ts` maps that name to an adapter inside the `runReview` thunk (`request.engineName` → `createClaudeCodeAdapter()` / `createOpenCodeAdapter({ model })`). The engine is therefore constructed per invocation, in `main`, after resolution — the only arrangement that keeps `resolveEngine` in core and adapter construction in `main` simultaneously.

**7. Command tree and help (AC-2).** `sentinel` → `repo add|list`, `review`, `runs list|show`, plus `-V, --version` (reading `package.json`, preserving `[E0.F1.H3]`) and `-h, --help` at every level via commander's built-ins. The root program gets `.addHelpText("after", ...)` documenting `SENTINEL_HOME` and its `~/.sentinel` default; every option and positional is declared with a description string, which is what makes the per-level help non-empty.

**8. Manual smoke for `risk-e6h1-006`** (no e2e safety net yet). Against `SENTINEL_HOME=$(mktemp -d)` and a throwaway local git repo: `repo add file:///tmp/…` → `repo list` → `runs list <alias>` (empty) → `review <alias> <branch> --type quick --timeout 60000` → `runs list` → `runs show <alias> <id>`. Even with no engine binary installed this exercises the full graph — path resolution, config write/read, clone, harness load, worktree, diff, prompt, engine invocation failure, `persistRun`, and both read paths — and must end in a persisted `engine-error` run, not a crash. Record the transcript in the execution log.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driving/cli/**` | New: `create-cli.ts`, `cli-deps.ts`, 3 command modules, 4 render modules, `index.ts` barrel replacing `export {}` | medium |
| `src/main/cli.ts` | Replace the `--version` stub with the entrypoint (build deps, run, set `process.exitCode`) | high (hot path) |
| `src/main/container.ts` | New: all adapter instantiation + use-case thunks + engine factory | high (hot path) |
| `src/main/paths.ts` | New: `resolveSentinelHome`, `sentinelPaths`, `resolvePackageRoot` (D2) | medium |
| `src/core/history/persist-run.ts` + `index.ts` | New use case, one new barrel export (D1) | medium |
| `src/core/run/resolve-review-request.ts` + `index.ts` | New pure resolver + `DEFAULT_REVIEW_TIMEOUT_MS`, both barrel-exported (D3, D5) | medium |
| `src/core/repos/ports/config-schemas.ts` | `reviewTimeoutMs: z.number().optional()` on `GlobalConfigSchema` (D3) | low |
| `package.json` | `commander` added to `dependencies` — the only addition (D4/AC-9) | low |
| `vitest.config.ts`, `docs/testing.md` | `adapters` project include widened to cover `src/main/**/__test__` (see A-4) | low |

## Interfaces, Data, And State

```ts
// src/adapters/driving/cli/cli-deps.ts
export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}
/** Raw config facts the review path needs; loaded by main, never by a command. */
export interface ReviewContext {
  readonly config: GlobalConfig;
  readonly repos: RepoRegistry;
}
export interface CliUseCases {
  registerRepo(request: RegisterRepoRequest): Promise<RegisterRepoResult>;
  listRepos(): Promise<ListReposResult>;
  runReview(request: RunReviewRequest): Promise<RunReviewResult>;
  persistRun(request: PersistRunRequest): Promise<PersistRunResult>;
  listRuns(request: ListRunsRequest): Promise<ListRunsResult>;
  getRun(request: GetRunRequest): Promise<GetRunResult>;
}
export interface CliDeps {
  readonly useCases: CliUseCases;
  readonly io: CliIo;
  readonly loadContext: () => Promise<ReviewContext>;
  readonly now: () => number;
  readonly version: string;
  readonly clonesDir: string;   // needed only to hand resolveReviewRequest a fact main owns
}

// src/adapters/driving/cli/index.ts
export interface SentinelCli { run(argv: readonly string[]): Promise<number>; }
export function createCli(deps: CliDeps): SentinelCli;
export function formatErrorLine(error: unknown): string;

// src/core/history/persist-run.ts
export interface PersistRunRequest {
  readonly repoName: string;            // registry alias (see OQ-D1)
  readonly startedAtEpochMs: number;
  readonly request: RunReviewRequest;
  readonly result: RunReviewResult;
}
export interface PersistRunDeps { readonly store: RunStore; readonly now?: () => number; }
export interface PersistRunResult { readonly runDir: string; readonly record: RunRecord; }
export function persistRun(r: PersistRunRequest, d: PersistRunDeps): Promise<PersistRunResult>;

// src/core/run/resolve-review-request.ts
export const DEFAULT_REVIEW_TIMEOUT_MS = 600_000;
export interface ResolveReviewRequestInput {
  readonly repoAlias: string;
  readonly targetRef: string;
  readonly repos: RepoRegistry;
  readonly config: GlobalConfig;
  readonly clonesDir: string;
  readonly flags?: {
    readonly harnessType?: string;
    readonly engineName?: string;
    readonly timeoutMs?: number;
  };
}
export function resolveReviewRequest(input: ResolveReviewRequestInput): RunReviewRequest;
```

Precedence implemented by `resolveReviewRequest`, one row per `RunReviewRequest` field:

| Field | Cascade |
|---|---|
| `repoPath` | `entry.localPath` → `${clonesDir}/${alias}` |
| `baseRef` | `entry.baseBranch` → `config.defaultBaseBranch` (no `--base`, per spec) |
| `targetRef` | positional `<branch>` |
| `harnessType` | `--type` → `entry.defaultHarness` → **throw** (A-3) |
| `timeoutMs` | `--timeout` → `config.reviewTimeoutMs` → `DEFAULT_REVIEW_TIMEOUT_MS` (D3/AC-8) |
| `limits` | `config.diffLimits` (else omitted) |
| `validations` | `entry.validations` (AC-11) |
| `validationTimeoutMs` | `entry.validationTimeoutMs` → `config.validationTimeoutMs` |
| `engineName` | `resolveEngine({ globalDefault: config.defaultEngine, repoOverride: entry.defaultEngine, runOverride: --engine })` |
| `cleanupPolicy` | omitted — `runReview`'s `"always"` default stands |

State: none held in the adapter. The only cross-invocation state is the filesystem under the sentinel home, already owned by the driven adapters.

Test placement: `src/core/history/__test__/persist-run.test.ts`, `src/core/run/__test__/resolve-review-request.test.ts`, `src/core/repos/__test__/…` (schema), `src/adapters/driving/cli/__test__/{repo,review,runs,help,errors,version}.test.ts` (fake use cases + a capturing `CliIo`), `src/main/__test__/paths.test.ts`.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| `createCli` returns a `Command` vs. a `run(argv) => exit code` façade | **A-1: the façade** | Keeps `process` entirely out of the adapter, makes AC-2/AC-12/AC-13 assertable in-process, and gives `[E6.F1.H2]` a single place to change exit-code mapping. |
| Commands receive port objects / adapters vs. bound use-case thunks | **A-2: thunks in `CliUseCases`** | The `wiring-only-in-main` guard plus AC-1's "adapter tests drive commands with fake use cases only". |
| Missing harness: silently default to `pr-review` vs. throw | **A-3: throw `InvalidRunRequestError`** with an actionable one-liner | `harnessType` decides what the engine is told to do and what it costs; guessing is worse than a clear error, and `repo add --harness` sets it once. No product default is invented. |
| Where composition-root unit tests run | **A-4: widen the `adapters` vitest include to `src/{adapters,main}/**/__test__`** | AC-14 keeps `e2e/` empty and `docs/testing.md` fixes "three projects"; widening one include drifts less than a fourth project. One-line doc update included. |
| Who reads `config.yaml`/`repos.yaml` for `review` | **A-5: `loadContext` thunk implemented in `container.ts`** over `ConfigStore` | Reading raw config is not domain logic (`listRepos` is already a one-line passthrough) and a third core use case is exactly the widening the handoff forbids. Recorded as a deliberate, visible seam. |
| Engine adapter built once at startup vs. per invocation | **A-6: per invocation, inside the `runReview` thunk** | `resolveEngine`'s cascade is per-run by definition, and `opencode` must not be constructed (nor its model demanded) when `claude-code` is selected. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| **OQ-D1 — repo alias (`owner/repo`) vs `RunStore` `repoName` (single path segment).** `registerRepo`'s `deriveAlias` produces `owner/repo` and `repos.yaml` is keyed by it, but `RunRecordPathFieldsSchema`/`RunQueryFieldsSchema` **reject any `repoName` containing `/`** (`RunStore.contract.ts` AC-19). So `sentinel review owner/repo main` would fail inside `persistRun`, and `runs list owner/repo` inside `listRuns` — a real integration mismatch, exactly the class `risk-e6h1-006` predicted, and unresolvable without deciding who normalises. Options: **(a) recommended** — normalise inside `core/history` with a module-private helper (`owner/repo` → `owner__repo`, idempotent for names with no separator) applied by `persistRun`, `listRuns` and `getRun`; no new public export, no signature change, the CLI keeps accepting the alias everywhere. (b) Export a public `toRunRepoName` from `history` and let the CLI map — a third piece of core surface and puts a persistence-key rule in the adapter. (c) Use only the alias's last segment — silently merges the histories of `a/x` and `b/x`. (a) touches `listRuns`/`getRun` *behaviour* (not their signatures), which brushes the spec's "no change to any existing core use case", hence the escalation rather than an A-level call. | `sddl-plan` (it adds or removes a stage) | **open, B-level — orchestrator must put it to the user** |
| **OQ-D2 — `createOpenCodeAdapter` requires a mandatory `model` and no config field supplies one.** `docs/engines/opencode.md` is explicit that `-m provider/model` is mandatory in practice. Recommendation: read `SENTINEL_OPENCODE_MODEL` in `container.ts` and fail with a one-line message when the engine resolves to `opencode` and the variable is unset — no model id hardcoded, no config-schema change beyond D3. Alternative: a `defaultModel` config field (a second config-format change this story did not authorise). | `sddl-executor` (one branch in `container.ts`; does not change the plan's shape) | **open, B-level, non-blocking for planning** |

## Approval Notes

- Core surface added stays exactly the two authorised pieces (D1, D5) plus D3's field and constant. OQ-D1's recommended option (a) deliberately adds **no** public export.
- `--json` absent (D6); the tab-separated line formatters are the extension point.
- AC-12 holds structurally: no command reads `result.state` to decide an exit code.
- Recommended next stage: `sddl-plan`, gated on OQ-D1.

## Budget Notes

- Above the 400-600 word target, as spec.md was: the change spans a new driving adapter, a rewritten composition root, two new core functions and a schema field, and the handoff explicitly asked design to fix signatures and file paths so the executor invents no structure.
