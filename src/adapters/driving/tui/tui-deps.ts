/**
 * Driving adapter: tui — the dependency contract the whole flow is built on
 * (`[E6.F2.H1]`, #38; design §"Interfaces, Data, And State").
 *
 * The organising rule is the CLI's, repeated: **the adapter never sees an
 * adapter, a port, a path or `process`**. It receives already-bound use-case
 * thunks (`TuiUseCases`), two line writers (`TuiIo`), a clock, and the two
 * seams that are genuinely new here:
 *
 * - `TuiPrompter` — the interactive-prompt seam. Cancel is a *value*
 *   (`PromptOutcome.cancel`), never an exception, so every cancel branch in
 *   the flow is a plain `if` with a visible early `return` (AC-4) and the
 *   tests script answers instead of emulating keypresses (AC-12). The
 *   clack-backed implementation lives in `clack-prompter.ts` — the only file
 *   allowed to import `@clack/prompts` — and is instantiated in `src/main/`.
 * - `TuiTty` — the TTY facts, injected by `src/main/` rather than read from
 *   `process` here, so the non-interactive guard (AC-2) is assertable
 *   in-process.
 *
 * `TuiIo` deliberately re-declares `CliIo`'s shape instead of importing it:
 * the `adapters-isolated` guard forbids every cross-adapter import, driving →
 * driving included (design §Resolution 2). Adapters share only core types.
 */

import type {
  PersistRunRequest,
  PersistRunResult,
} from "../../../core/history/index.js";
import type {
  GlobalConfig,
  ListBranchesRequest,
  ListBranchesResult,
  ListReposResult,
  RepoRegistry,
} from "../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
} from "../../../core/run/index.js";

/**
 * The adapter's only output channel. Line-oriented on purpose: flow text and
 * results go to `stdout`, diagnostics and errors to `stderr` (AC-9), and
 * nothing in the adapter touches `process` — which is what lets the tests
 * capture both streams in-process without stubbing globals.
 */
export interface TuiIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * TTY facts for the two streams the flow needs (e6f2h1-A1): interactive
 * means BOTH are TTYs; anything else takes the guidance path (AC-2).
 * Resolved once by `src/main/` from `process.std{in,out}.isTTY`.
 */
export interface TuiTty {
  readonly stdin: boolean;
  readonly stdout: boolean;
}

/**
 * What one prompt resolves to. Cancel-as-value is the load-bearing choice
 * (design §Resolution 1): the flow pattern-matches `kind` instead of catching
 * a library symbol or exception, so "cancel → exit 0, zero side effects"
 * (AC-4) is an early return the tests can see.
 */
export type PromptOutcome<T> =
  | { readonly kind: "answer"; readonly value: T }
  | { readonly kind: "cancel" };

/** One selectable entry of a `select` prompt. */
export interface TuiSelectOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

/**
 * The single activity indicator (e6f2h1-A2): static phase text, started and
 * stopped around one awaited call — no staged progress the core cannot
 * report (AC-6).
 */
export interface TuiSpinner {
  start(text: string): void;
  stop(text?: string): void;
}

/** The interactive-prompt seam. Fulfilled by clack in `src/main/` only. */
export interface TuiPrompter {
  select(input: {
    readonly message: string;
    readonly options: readonly TuiSelectOption[];
  }): Promise<PromptOutcome<string>>;
  confirm(input: { readonly message: string }): Promise<PromptOutcome<boolean>>;
  spinner(): TuiSpinner;
}

/**
 * Raw configuration facts the review path needs, loaded by `src/main/` and
 * handed to the flow before the confirmation gate (design A-5 precedent):
 * reading `config.yaml`/`repos.yaml` is not domain logic, and the resolved
 * request built from them is what lets the summary show the effective engine
 * (AC-5).
 */
export interface TuiReviewContext {
  readonly config: GlobalConfig;
  readonly repos: RepoRegistry;
}

/**
 * Core use cases, already bound to their deps in the composition root. The
 * review quartet the CLI proved out, plus the two enumerations navigation
 * needs. `listHarnessTypes` returns **names only** (the merged map's keys,
 * e6f2h1-A3): the flow selects a type string for `resolveReviewRequest` and
 * has no use for `ResolvedHarness` internals — narrower seam, less core
 * surface in the adapter.
 */
export interface TuiUseCases {
  listRepos(): Promise<ListReposResult>;
  listBranches(request: ListBranchesRequest): Promise<ListBranchesResult>;
  listHarnessTypes(): Promise<readonly string[]>;
  runReview(request: RunReviewRequest): Promise<RunReviewResult>;
  persistRun(request: PersistRunRequest): Promise<PersistRunResult>;
}

/** Everything `createTui` needs. Built once, in `src/main/`. */
export interface TuiDeps {
  readonly useCases: TuiUseCases;
  readonly io: TuiIo;
  readonly prompter: TuiPrompter;
  readonly tty: TuiTty;
  /** Loads `config.yaml`/`repos.yaml`; read before the confirmation gate. */
  readonly loadContext: () => Promise<TuiReviewContext>;
  /**
   * Clock seam — the run's start instant for `persistRun`. `src/main/` binds
   * the SAME function to `persistRun`'s own `now` dep, so both ends of a
   * run's duration are measured by one clock (`R2-003`).
   */
  readonly now: () => number;
  /**
   * Clones root, a fact `src/main/` owns; forwarded verbatim to
   * `resolveReviewRequest`, which needs it to derive a repo path.
   */
  readonly clonesDir: string;
}
