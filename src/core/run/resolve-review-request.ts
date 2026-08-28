/**
 * Core module: run — review-request composition (D5, spec.md AC-8).
 *
 * Pure function that turns what the caller knows (a registry alias, a target
 * ref and the parsed per-invocation flags) plus what configuration says (the
 * `RepoEntry` and the `GlobalConfig`) into a complete `RunReviewRequest`. It
 * exists so no driving adapter re-implements the flag → repo → global
 * cascade: `[E6.F2.H1]`'s TUI resolves a review exactly like the CLI does.
 *
 * Two deliberate properties:
 *
 * 1. It performs the registry lookup itself, raising the existing
 *    `RepoNotFoundError` (`repos`' public barrel), and it calls
 *    `resolveEngine` internally rather than beside it — so `engineName` on
 *    the returned request is always a validated `EngineName` and
 *    `UnknownEngineError` surfaces before any git or engine work starts.
 * 2. It is pure: no I/O, no port, no `node:path` (banned in core — the clone
 *    path is string-concatenated exactly as `registerRepo` already does it).
 */

import type { GlobalConfig, RepoRegistry } from "../repos/index.js";
import { RepoNotFoundError } from "../repos/index.js";
import { resolveEngine } from "./resolve-engine.js";
import { InvalidRunRequestError } from "./run-errors.js";
import type { RunReviewRequest } from "./run-review.js";

/* ------------------------------------------------------------------ */
/*  Public constants                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fallback wall-clock budget for the engine invocation when neither the
 * `--timeout` flag nor `config.reviewTimeoutMs` supplies one — 10 minutes,
 * the "generous" budget of PRD §7 (spec.md AC-8, D3).
 *
 * It lives here, beside `DEFAULT_VALIDATION_TIMEOUT_MS`, and deliberately NOT
 * as a zod `.default()` on `GlobalConfigSchema`: an absent `reviewTimeoutMs`
 * must stay absent after parsing so the precedence below stays the single
 * place the effective value is decided.
 */
export const DEFAULT_REVIEW_TIMEOUT_MS = 600_000;

/* ------------------------------------------------------------------ */
/*  Public request shape                                               */
/* ------------------------------------------------------------------ */

/** Per-invocation overrides, already parsed by the driving adapter. */
export interface ResolveReviewRequestFlags {
  /** `--type`; wins over `RepoEntry.defaultHarness`. */
  readonly harnessType?: string;
  /** `--engine`; the per-run level of the `resolveEngine` cascade. */
  readonly engineName?: string;
  /** `--timeout`, in milliseconds; wins over `config.reviewTimeoutMs`. */
  readonly timeoutMs?: number;
}

export interface ResolveReviewRequestInput {
  /** Registry key, as typed by the user (`owner/repo`). */
  readonly repoAlias: string;
  /** Ref under review — the `review` command's `<branch>` positional. */
  readonly targetRef: string;
  /** Parsed `repos.yaml`. */
  readonly repos: RepoRegistry;
  /** Parsed `config.yaml`. */
  readonly config: GlobalConfig;
  /** Root the managed clones live under; a fact the composition root owns. */
  readonly clonesDir: string;
  readonly flags?: ResolveReviewRequestFlags;
}

/* ------------------------------------------------------------------ */
/*  Use case                                                           */
/* ------------------------------------------------------------------ */

/**
 * Composes the `RunReviewRequest`, one cascade per field:
 *
 * | Field | Cascade |
 * |---|---|
 * | `repoPath` | `entry.localPath` → `${clonesDir}/${alias}` |
 * | `baseRef` | `entry.baseBranch` → `config.defaultBaseBranch` |
 * | `targetRef` | the `<branch>` positional |
 * | `harnessType` | `--type` → `entry.defaultHarness` → throw |
 * | `timeoutMs` | `--timeout` → `config.reviewTimeoutMs` → `DEFAULT_REVIEW_TIMEOUT_MS` |
 * | `limits` | `config.diffLimits`, else omitted |
 * | `validations` | `entry.validations` |
 * | `validationTimeoutMs` | `entry.validationTimeoutMs` → `config.validationTimeoutMs` |
 * | `engineName` | `resolveEngine(global, repo, run)` |
 * | `cleanupPolicy` | omitted — `runReview`'s `"always"` default stands |
 *
 * Throws `RepoNotFoundError` for an unknown alias, `InvalidRunRequestError`
 * when no harness type can be resolved (guessing one would decide what the
 * engine is told to do, and what the run costs), and `UnknownEngineError`
 * from the internal `resolveEngine` call for an unknown engine name.
 */
export function resolveReviewRequest(
  input: ResolveReviewRequestInput,
): RunReviewRequest {
  const entry = input.repos[input.repoAlias];
  if (entry === undefined) {
    throw new RepoNotFoundError(input.repoAlias);
  }

  const flags = input.flags ?? {};

  const harnessType = flags.harnessType ?? entry.defaultHarness;
  if (harnessType === undefined) {
    throw new InvalidRunRequestError(
      `No harness type for "${input.repoAlias}": pass --type or set a default harness for the repository`,
    );
  }

  const validationTimeoutMs =
    entry.validationTimeoutMs ?? input.config.validationTimeoutMs;

  return {
    repoPath: entry.localPath ?? `${input.clonesDir}/${input.repoAlias}`,
    baseRef: entry.baseBranch ?? input.config.defaultBaseBranch,
    targetRef: input.targetRef,
    harnessType,
    timeoutMs:
      flags.timeoutMs ??
      input.config.reviewTimeoutMs ??
      DEFAULT_REVIEW_TIMEOUT_MS,
    ...(input.config.diffLimits !== undefined
      ? { limits: input.config.diffLimits }
      : {}),
    ...(entry.validations !== undefined
      ? { validations: entry.validations }
      : {}),
    ...(validationTimeoutMs !== undefined ? { validationTimeoutMs } : {}),
    engineName: resolveEngine({
      globalDefault: input.config.defaultEngine,
      ...(entry.defaultEngine !== undefined
        ? { repoOverride: entry.defaultEngine }
        : {}),
      ...(flags.engineName !== undefined
        ? { runOverride: flags.engineName }
        : {}),
    }),
  };
}
