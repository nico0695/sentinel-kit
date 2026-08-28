/**
 * Driving adapter: cli — the dependency contract every command is built on
 * (`[E6.F1.H1]`, #36; design §"Interfaces, Data, And State").
 *
 * The organising rule of this adapter: **a command never sees an adapter, a
 * port or a path**. It receives already-bound use-case thunks (`CliUseCases`),
 * two line writers (`CliIo`) and a clock. Every filesystem fact, adapter
 * construction and engine choice lives in `src/main/` (guard
 * `wiring-only-in-main`), and this adapter imports nothing from
 * `src/adapters/driven/**` (guard `adapters-isolated`) — it shares only the
 * core types below.
 *
 * That is what makes AC-1 mechanical rather than a promise: a command is
 * constructible in a test without building a single driven adapter, so there
 * is nowhere for domain logic to hide.
 */

import type {
  GetRunRequest,
  GetRunResult,
  ListRunsRequest,
  ListRunsResult,
  PersistRunRequest,
  PersistRunResult,
} from "../../../core/history/index.js";
import type {
  GlobalConfig,
  ListReposResult,
  RegisterRepoRequest,
  RegisterRepoResult,
  RepoRegistry,
} from "../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
} from "../../../core/run/index.js";

/**
 * The adapter's only output channel. Line-oriented on purpose: results go to
 * `stdout`, diagnostics and errors to `stderr` (AC-10), and nothing in the
 * adapter touches `process` — which is what lets the tests capture both
 * streams in-process without stubbing globals.
 */
export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * Raw configuration facts the review path needs, loaded by `src/main/` and
 * handed to the command (design A-5). Reading `config.yaml`/`repos.yaml` is
 * not domain logic, and a third core use case is a widening this story does
 * not authorise.
 */
export interface ReviewContext {
  readonly config: GlobalConfig;
  readonly repos: RepoRegistry;
}

/**
 * Core use cases, already bound to their deps in the composition root. One
 * entry per command path (AC-3); `review` is the only path that calls two
 * (`runReview` then `persistRun`, D1).
 */
export interface CliUseCases {
  registerRepo(request: RegisterRepoRequest): Promise<RegisterRepoResult>;
  listRepos(): Promise<ListReposResult>;
  runReview(request: RunReviewRequest): Promise<RunReviewResult>;
  persistRun(request: PersistRunRequest): Promise<PersistRunResult>;
  listRuns(request: ListRunsRequest): Promise<ListRunsResult>;
  getRun(request: GetRunRequest): Promise<GetRunResult>;
}

/** Everything `createCli` needs. Built once, in `src/main/`. */
export interface CliDeps {
  readonly useCases: CliUseCases;
  readonly io: CliIo;
  /** Loads `config.yaml`/`repos.yaml`; called only by the `review` command. */
  readonly loadContext: () => Promise<ReviewContext>;
  /**
   * Clock seam — the run's start instant for `persistRun`, and the elapsed
   * time reported when persistence fails (D13). `src/main/` binds the SAME
   * function to `persistRun`'s own `now` dep, so both ends of a run's
   * duration are measured by one clock (`R2-003`).
   */
  readonly now: () => number;
  /** `package.json`'s version, resolved in `src/main/` (AC-4). */
  readonly version: string;
  /**
   * Clones root, a fact `src/main/` owns; forwarded verbatim to
   * `resolveReviewRequest`, which needs it to derive a repo path.
   */
  readonly clonesDir: string;
}
