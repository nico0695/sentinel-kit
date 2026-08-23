/**
 * Shared fixture builders for the `runReview` test suite.
 *
 * Assembles the sanctioned fakes — `createFakeGitPort` (workspace),
 * `FakeHarnessLoader` (review) and `createFakeEngine` (adapters) — into
 * ready-to-use request/deps shapes, plus the two seams the suite needs that
 * no existing fake provides: a manual, call-recording `TimeoutScheduler` and
 * a never-settling, request-recording engine.
 *
 * Cross-boundary imports (the adapters fake, another module's `__test__/`
 * fake) are sanctioned: `.dependency-cruiser.cjs` excludes `__test__/` paths,
 * so `depcruise src` never cruises this file, while `tsc --noEmit` still
 * typechecks it (`r-test-fake-cross-boundary`, dec-005).
 */

import { createFakeEngine } from "../../../adapters/driven/engines/fake/fake-engine.js";
import type { DiffResult } from "../../repos/index.js";
import { FakeHarnessLoader } from "../../review/__test__/fake-harness-loader.js";
import {
  type ContextMode,
  type HarnessLoader,
  HarnessValidationError,
  type LoadHarnessesDeps,
  type Skill,
  SkillNotFoundError,
} from "../../review/index.js";
import { createFakeGitPort } from "../../workspace/__test__/workspace-git-fake.js";
import type {
  ReviewEngine,
  ReviewRequest,
  ReviewResult,
  RunReviewDeps,
  RunReviewRequest,
  TimeoutScheduler,
} from "../index.js";

/**
 * Re-exported, not just imported: `run-review.test.ts` reaches the declared-
 * validations fake through this fixtures module rather than importing
 * `fake-process-runner.js` directly (D-7's file stays the sole implementation).
 */
export {
  createFakeProcessRunner,
  type FakeProcessOutcome,
  type FakeProcessRunner,
  type FakeProcessRunnerCall,
  okResult,
} from "./fake-process-runner.js";

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

export const REPO_PATH = "/sentinel/clones/owner/my-repo";
export const WORKTREES_DIR = "/sentinel/worktrees";
export const BASE_REF = "main";
export const TARGET_REF = "feature/login";
export const HARNESS_TYPE = "pr-review";
/**
 * Deliberately large: if any test ever awaited the real wall clock instead of
 * an injected scheduler, it would blow straight past vitest's per-test
 * timeout instead of passing slowly.
 */
export const TIMEOUT_MS = 60_000;
export const FIXED_TS = 1700000000000;

/**
 * A non-empty diff the fake git port serves by default, so `computeReviewDiff`
 * yields a `ReviewDiff` with one real file entry (raw chunk + matching stats).
 */
export const SAMPLE_DIFF_RESULT: DiffResult = {
  raw: "diff --git a/src/a.ts b/src/a.ts\n+added\n",
  stats: [{ path: "src/a.ts", additions: 1, deletions: 0 }],
};

/* ------------------------------------------------------------------ */
/*  Request / deps builders                                            */
/* ------------------------------------------------------------------ */

/** A valid baseline request; override single fields to break it per case. */
export function buildRequest(
  overrides?: Partial<RunReviewRequest>,
): RunReviewRequest {
  return {
    repoPath: REPO_PATH,
    baseRef: BASE_REF,
    targetRef: TARGET_REF,
    harnessType: HARNESS_TYPE,
    timeoutMs: TIMEOUT_MS,
    ...overrides,
  };
}

/** Fake git port pre-configured with the sample diff. */
export function buildGit(
  config?: Parameters<typeof createFakeGitPort>[0],
): ReturnType<typeof createFakeGitPort> {
  return createFakeGitPort({ diffResult: SAMPLE_DIFF_RESULT, ...config });
}

/**
 * Fully valid deps over the fakes: git with the sample diff, an engine that
 * approves, one resolvable `pr-review` harness, fixed clock.
 */
export function buildDeps(overrides?: Partial<RunReviewDeps>): RunReviewDeps {
  return {
    git: buildGit(),
    engine: createFakeEngine({
      ok: true,
      result: { output: "VERDICT: approve" },
    }),
    harnesses: buildHarnessDeps(),
    worktreesDir: WORKTREES_DIR,
    now: () => FIXED_TS,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Harness fixtures                                                   */
/* ------------------------------------------------------------------ */

/**
 * A `{ factory, user }` loader pair whose factory carries one `HARNESS_TYPE`
 * harness. Options break it per AC-6 case: `contextMode: "agent"` for the
 * non-`inline` producer, `harnessSkills` naming an unregistered skill for the
 * missing-skill producer.
 */
export function buildHarnessDeps(options?: {
  readonly contextMode?: ContextMode;
  readonly harnessSkills?: readonly string[];
  readonly registeredSkills?: readonly Skill[];
}): LoadHarnessesDeps {
  const factory = new FakeHarnessLoader();
  factory.addHarness({
    type: HARNESS_TYPE,
    instructions: "Review the diff and answer with a VERDICT line.",
    skills: options?.harnessSkills ?? [],
    contextMode: options?.contextMode ?? "inline",
  });
  for (const skill of options?.registeredSkills ?? []) {
    factory.addSkill(skill);
  }
  return { factory, user: new FakeHarnessLoader() };
}

/**
 * A loader pair whose factory advertises `HARNESS_TYPE` but throws
 * `HarnessValidationError` on load — the ninth AC-6 producer, which no
 * `FakeHarnessLoader` path can raise.
 */
export function buildValidationFailingHarnessDeps(): LoadHarnessesDeps {
  const failing: HarnessLoader = {
    async listHarnesses(): Promise<string[]> {
      return [HARNESS_TYPE];
    },
    async loadHarness(type: string): Promise<never> {
      throw new HarnessValidationError(`Harness "${type}" failed validation`, [
        { path: "instructions", message: "Required" },
      ]);
    },
    async listSkills(): Promise<string[]> {
      return [];
    },
    async loadSkill(name: string): Promise<never> {
      throw new SkillNotFoundError(name, HARNESS_TYPE);
    },
  };
  return { factory: failing, user: new FakeHarnessLoader() };
}

/* ------------------------------------------------------------------ */
/*  Engine fixtures                                                    */
/* ------------------------------------------------------------------ */

/** An engine that never settles, recording every request it receives. */
export interface HangingEngine extends ReviewEngine {
  readonly requests: readonly ReviewRequest[];
}

export function createHangingEngine(): HangingEngine {
  const requests: ReviewRequest[] = [];
  return {
    requests,
    review(request: ReviewRequest): Promise<ReviewResult> {
      requests.push(request);
      return new Promise<ReviewResult>(() => {
        // Never settles: the run's own wall clock must win the race (AC-5).
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Manual timeout scheduler                                           */
/* ------------------------------------------------------------------ */

export interface ManualScheduler {
  readonly scheduler: TimeoutScheduler;
  /** One entry per `schedule` invocation, in order. */
  readonly calls: readonly { readonly ms: number }[];
  /** How many times a returned cancel function has been invoked. */
  cancelCount(): number;
  /** Fires the pending `onElapsed` callbacks manually (non-immediate mode). */
  fireAll(): void;
}

/**
 * Deterministic replacement for `deps.scheduleTimeout`: records every
 * scheduling call and, with `fireImmediately`, elapses the budget
 * synchronously at schedule time — zero wall-clock waiting (AC-5).
 */
export function createManualScheduler(options?: {
  readonly fireImmediately?: boolean;
}): ManualScheduler {
  const calls: { ms: number }[] = [];
  const pending: (() => void)[] = [];
  let cancels = 0;

  const scheduler: TimeoutScheduler = (ms, onElapsed) => {
    calls.push({ ms });
    if (options?.fireImmediately === true) {
      onElapsed();
    } else {
      pending.push(onElapsed);
    }
    return () => {
      cancels += 1;
    };
  };

  return {
    scheduler,
    calls,
    cancelCount: () => cancels,
    fireAll: () => {
      for (const onElapsed of pending.splice(0)) {
        onElapsed();
      }
    },
  };
}
