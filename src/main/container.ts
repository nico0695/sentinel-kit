/**
 * Composition root: the dependency graph (`[E6.F1.H1]`, #36, design §2).
 *
 * This is the **only** module in the codebase allowed to instantiate an
 * adapter (PRD §4.2, guard `wiring-only-in-main`). Everything above it is
 * pure or injected: the CLI adapter receives already-bound use-case thunks,
 * two line writers, a clock and the one filesystem fact it cannot own
 * (`clonesDir`), and never sees a port, an adapter or a path it derived
 * itself.
 *
 * Three properties are load-bearing, and none of them is a convention a
 * future edit may quietly drop:
 *
 * 1. **`sentinelPaths()` is called exactly once** and the single resulting
 *    object feeds every consumer. `registerRepo` computes
 *    `${deps.clonesDir}/${alias}` and `resolveReviewRequest` computes
 *    `entry.localPath ?? ${input.clonesDir}/${input.repoAlias}`
 *    independently, with identical string concatenation: if the two
 *    `clonesDir` values ever diverged, `repo add` would clone into one
 *    directory and `review` would look in another — silently, and invisibly
 *    to every fake-based unit test (`risk-e6h1-013`). There is one
 *    `SentinelPaths` object in existence here, so the divergence has nowhere
 *    to come from, and nothing in this file concatenates a path.
 * 2. **The engine is built per invocation** (design A-6), inside the
 *    `runReview` thunk, from the `engineName` core already resolved and
 *    validated (`resolveEngine`, reached through `resolveReviewRequest`).
 *    Building both engines up front would demand `SENTINEL_OPENCODE_MODEL`
 *    (D8) from a user who selected `claude-code`.
 * 3. **`processRunner` is wired** (AC-11). `runReview` treats an absent
 *    `processRunner` as "stage 5 never runs", so leaving it out would make
 *    `[E5.F1.H2]`'s declared validations dead code with no test failing.
 *
 * The two roots stay distinct (see `paths.ts`): the *factory* harnesses and
 * skills ship inside the npm package and are loaded from
 * `resolvePackageRoot()`, while the user's overrides live under the sentinel
 * home.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import {
  createClaudeCodeAdapter,
  createOpenCodeAdapter,
} from "../adapters/driven/engines/index.js";
import { createExecProcessRunner } from "../adapters/driven/exec/index.js";
import { createGitCliAdapter } from "../adapters/driven/git/index.js";
import {
  createConfigStoreAdapter,
  createHarnessLoaderAdapter,
  createRunStoreFsAdapter,
} from "../adapters/driven/storage/index.js";
import type {
  CliDeps,
  CliIo,
  CliUseCases,
  ReviewContext,
} from "../adapters/driving/cli/index.js";
import {
  createClackPrompter,
  type TuiDeps,
  type TuiIo,
} from "../adapters/driving/tui/index.js";
import { getRun, listRuns, persistRun } from "../core/history/index.js";
import { listBranches, listRepos, registerRepo } from "../core/repos/index.js";
import { loadHarnesses } from "../core/review/index.js";
import type { ReviewEngine } from "../core/run/index.js";
import { runReview } from "../core/run/index.js";
import {
  type PathEnv,
  resolvePackageRoot,
  resolveSentinelHome,
  sentinelPaths,
} from "./paths.js";

const OPENCODE_MODEL_VAR = "SENTINEL_OPENCODE_MODEL";

/** Inputs the entrypoint owns; every default reads the real process. */
export interface CliDepsOptions {
  /** `package.json`'s version, read by the entrypoint (AC-4). */
  readonly version: string;
  /** Environment to resolve `SENTINEL_HOME`/`SENTINEL_OPENCODE_MODEL` from. */
  readonly env?: PathEnv;
  /** Home directory backing the `~/.sentinel` default. */
  readonly homeDir?: string;
  /** Output sink; defaults to the real streams. */
  readonly io?: CliIo;
}

/**
 * Line-oriented writers over the real streams. `process.stdout.write` rather
 * than `console.log` so the two channels stay exactly one write per line
 * (AC-10), and so nothing decorative can slip onto `stdout`.
 */
const processIo: CliIo = {
  stdout: (line: string): void => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line: string): void => {
    process.stderr.write(`${line}\n`);
  },
};

/**
 * Picks the engine adapter for one run.
 *
 * `engineName` arrives already validated: `resolveReviewRequest` runs the
 * `resolveEngine` cascade and throws `UnknownEngineError` before any git or
 * engine work starts, so no cascade, no default and no config read happens
 * here — this is a name → constructor lookup and nothing more.
 *
 * D8: `opencode` has no safe engine-wide default model
 * (`docs/engines/opencode.md`), and no config field supplies one in this
 * story. The model comes from `SENTINEL_OPENCODE_MODEL`; unset or blank is a
 * one-line failure naming the variable, rendered on `stderr` by the CLI's
 * catch-all.
 */
function createEngine(
  engineName: string | undefined,
  env: PathEnv,
): ReviewEngine {
  switch (engineName) {
    case "opencode": {
      const model = env[OPENCODE_MODEL_VAR]?.trim();
      if (model === undefined || model === "") {
        throw new Error(
          `The opencode engine needs a model id: set ${OPENCODE_MODEL_VAR} (for example "anthropic/claude-sonnet-4") and run the review again`,
        );
      }
      return createOpenCodeAdapter({ model });
    }
    case "claude-code":
      return createClaudeCodeAdapter();
    default:
      // Unreachable through the CLI: `resolveEngine` rejects any other name.
      // Kept as an explicit failure rather than a silent fallback, so adding
      // an engine to `EngineNameSchema` without wiring it is loud.
      throw new Error(
        `No review engine adapter is wired for "${String(engineName)}"`,
      );
  }
}

/** The subset of the surface options the wiring graph itself consumes. */
interface WiringGraphOptions {
  readonly env?: PathEnv;
  readonly homeDir?: string;
}

/**
 * Builds the wiring graph, in order: paths → driven adapters → use-case
 * thunks → the `loadContext`/`now` seams.
 *
 * One call builds one graph, and each surface factory below calls it exactly
 * once — that is what keeps property 1 of the module doc-comment structural:
 * `sentinelPaths()` runs here and nowhere else, so every projection of the
 * graph shares the single `SentinelPaths` object. The adapters in the return
 * (`git`, `configStore`, `harnesses`) are part of the graph's surface so a
 * projection can bind surface-specific thunks from the same instances
 * instead of constructing anything twice.
 */
function createWiringGraph(options: WiringGraphOptions) {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();

  // Called ONCE — see property 1 in the module doc-comment. Every path below
  // is a field of this object; none is re-derived by concatenation.
  const paths = sentinelPaths(resolveSentinelHome(env, homeDir));
  const packageRoot = resolvePackageRoot();

  const git = createGitCliAdapter();
  const configStore = createConfigStoreAdapter(paths.root);
  const runStore = createRunStoreFsAdapter(paths.runsDir);
  const processRunner = createExecProcessRunner();
  const harnesses = {
    factory: createHarnessLoaderAdapter(packageRoot),
    user: createHarnessLoaderAdapter(paths.root),
  };

  /**
   * The sentinel home is created lazily, and only on the one path that
   * writes into its root: `ConfigStore.writeRepos` uses `writeFile`, which
   * does not create parent directories, so `repo add` on a machine with no
   * `~/.sentinel` would otherwise fail with a `ConfigWriteError`. Every other
   * consumer already creates what it needs — `createRunStoreFsAdapter`
   * `mkdir -p`s its tree, `git clone` and `git worktree add` create their
   * target's parents, and the harness loader treats a missing directory as
   * "no harnesses". Doing it here rather than at startup keeps `--help`,
   * `--version` and every read path free of filesystem side effects.
   */
  const ensureHomeRoot = (): void => {
    mkdirSync(paths.root, { recursive: true });
  };

  /**
   * Design A-5: reading `config.yaml`/`repos.yaml` for the `review` path is
   * not domain logic, and a third core use case is a widening this story does
   * not authorise. It stays a visible seam owned by the composition root.
   */
  const loadContext = async (): Promise<ReviewContext> => {
    const [config, repos] = await Promise.all([
      configStore.readConfig(),
      configStore.readRepos(),
    ]);
    return { config, repos };
  };

  /**
   * The single clock the review path reads (`R2-003`). It is handed BOTH to
   * `CliDeps.now` — which the `review` command reads for the run's start
   * instant — and to `persistRun`, which derives `durationMs` from it. Left
   * unbound, `persistRun` would fall back to its own `Date.now` default and
   * the two ends of the same measurement would come from two different
   * clocks: harmless in production, nonsense under an injected fake clock.
   */
  const now = (): number => Date.now();

  const useCases: CliUseCases = {
    registerRepo: (request) => {
      ensureHomeRoot();
      return registerRepo(request, {
        git,
        config: configStore,
        clonesDir: paths.clonesDir,
      });
    },
    listRepos: () => listRepos({ config: configStore }),
    runReview: (request) =>
      runReview(request, {
        git,
        engine: createEngine(request.engineName, env),
        harnesses,
        worktreesDir: paths.worktreesDir,
        processRunner,
      }),
    persistRun: (request) => persistRun(request, { store: runStore, now }),
    listRuns: (request) => listRuns(request, { store: runStore }),
    getRun: (request) => getRun(request, { store: runStore }),
  };

  return { paths, git, configStore, harnesses, useCases, loadContext, now };
}

/**
 * Projects the CLI's view of the wiring graph: the bound use-case thunks,
 * line IO, the context/clock seams, and the one filesystem fact the CLI
 * reports (`clonesDir`).
 */
export function createCliDeps(options: CliDepsOptions): CliDeps {
  const graph = createWiringGraph(options);
  return {
    useCases: graph.useCases,
    io: options.io ?? processIo,
    loadContext: graph.loadContext,
    now: graph.now,
    version: options.version,
    clonesDir: graph.paths.clonesDir,
  };
}

/** Inputs the entrypoint owns for the TUI surface; defaults read the real process. */
export interface TuiDepsOptions {
  /** Environment to resolve `SENTINEL_HOME`/`SENTINEL_OPENCODE_MODEL` from. */
  readonly env?: PathEnv;
  /** Home directory backing the `~/.sentinel` default. */
  readonly homeDir?: string;
  /** Output sink; defaults to the real streams. */
  readonly io?: TuiIo;
}

/**
 * Projects the TUI's view of the wiring graph (`[E6.F2.H1]`, #38): the CLI's
 * review quartet plus the two enumerations navigation needs, the clack-backed
 * prompter, and the TTY facts the adapter must not read from `process` itself
 * (e6f2h1-A1 — that is what keeps AC-2 assertable in-process).
 *
 * `listHarnessTypes` returns names only (the merged map's keys, e6f2h1-A3):
 * the flow hands a type string to `resolveReviewRequest` and has no use for
 * `ResolvedHarness` internals. Only `main/cli.ts`'s dispatch decides which
 * surface runs, so each process builds exactly one graph either way.
 */
export function createTuiDeps(options: TuiDepsOptions = {}): TuiDeps {
  const graph = createWiringGraph(options);
  return {
    useCases: {
      listRepos: graph.useCases.listRepos,
      listBranches: (request) =>
        listBranches(request, {
          git: graph.git,
          config: graph.configStore,
          clonesDir: graph.paths.clonesDir,
        }),
      listHarnessTypes: async () => [
        ...(await loadHarnesses(graph.harnesses)).keys(),
      ],
      runReview: graph.useCases.runReview,
      persistRun: graph.useCases.persistRun,
    },
    io: options.io ?? processIo,
    prompter: createClackPrompter(),
    tty: {
      stdin: process.stdin.isTTY === true,
      stdout: process.stdout.isTTY === true,
    },
    loadContext: graph.loadContext,
    now: graph.now,
    clonesDir: graph.paths.clonesDir,
  };
}
