/**
 * The minimal result step and persistence (AC-7, AC-8, AC-12).
 *
 * Two contracts under guard:
 *
 * - **AC-7 / H1-H2 boundary**: the result block is exactly state, verdict
 *   when present, and run directory — asserted as the literal tail of
 *   `stdout`, so no markdown or severity rendering can slip in unnoticed.
 * - **AC-8**: `persistRun` runs exactly once per completed run whatever the
 *   terminal state; when it throws, the outcome is still shown with `-` for
 *   the run directory, a no-history diagnostic lands on `stderr`, and the
 *   exit code is non-zero. A completed AND persisted run exits 0 regardless
 *   of terminal state (design §Interfaces, recorded A-level decision).
 */

import { describe, expect, it } from "vitest";
import type {
  PersistRunRequest,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
  TerminalState,
} from "../../../../core/run/index.js";
import { formatTuiResult } from "../render.js";
import { createTui } from "../tui-flow.js";
import {
  answer,
  createScriptedPrompter,
  createTuiTestDeps,
} from "./tui-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260829-000000-abc";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
};

const repos: RepoRegistry = {
  "owner/repo": { url: "https://example.test/owner/repo.git" },
};

const okResult: RunReviewResult = {
  state: "ok",
  verdict: "approve",
  cleanup: { attempted: true, removed: true, reason: "policy-always" },
  engineName: "claude-code",
};

const okRecord: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "main",
  targetRef: "feature",
  state: "ok",
  verdict: "approve",
  engine: "claude-code",
};

/** Drops the optional key rather than setting it to `undefined`. */
function withoutVerdict(record: RunRecord): RunRecord {
  const { verdict: _verdict, ...rest } = record;
  return rest;
}

interface ResultHarness {
  readonly deps: ReturnType<typeof createTuiTestDeps>;
  readonly runReviewRequests: RunReviewRequest[];
  readonly persistRunRequests: PersistRunRequest[];
  run(): Promise<number>;
}

function harness(
  options: {
    readonly result?: RunReviewResult;
    readonly record?: RunRecord;
    readonly persistRunFails?: unknown;
  } = {},
): ResultHarness {
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];

  const deps = createTuiTestDeps({
    prompter: createScriptedPrompter([
      answer("owner/repo"),
      answer("feature"),
      answer("pr-review"),
      answer(true),
    ]),
    loadContext: () => Promise.resolve({ config, repos }),
    now: () => 1_700_000_000_000,
    useCases: {
      listRepos: () => Promise.resolve({ repos }),
      listBranches: (request) =>
        Promise.resolve({
          alias: request.alias,
          branches: [{ name: "feature", kind: "local" as const }],
        }),
      listHarnessTypes: () => Promise.resolve(["pr-review"]),
      runReview: (request) => {
        runReviewRequests.push(request);
        return Promise.resolve(options.result ?? okResult);
      },
      persistRun: (request) => {
        persistRunRequests.push(request);
        if (options.persistRunFails !== undefined) {
          return Promise.reject(options.persistRunFails);
        }
        return Promise.resolve({
          runDir: RUN_DIR,
          record: options.record ?? okRecord,
        });
      },
    },
  });

  return {
    deps,
    runReviewRequests,
    persistRunRequests,
    run: () => createTui(deps).run(),
  };
}

describe("formatTuiResult (AC-7)", () => {
  it("renders state, verdict and run directory when all are present", () => {
    expect(formatTuiResult("ok", "approve", RUN_DIR)).toEqual([
      "State: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
  });

  it("omits the verdict line when no verdict exists", () => {
    expect(formatTuiResult("timeout", undefined, RUN_DIR)).toEqual([
      "State: timeout",
      `Run directory: ${RUN_DIR}`,
    ]);
  });

  it("renders `-` rather than fabricating a run directory", () => {
    expect(formatTuiResult("ok", "approve")).toEqual([
      "State: ok",
      "Verdict: approve",
      "Run directory: -",
    ]);
  });
});

describe("result step per terminal state (AC-7, AC-8)", () => {
  const failedStates: readonly TerminalState[] = [
    "ambiguous",
    "engine-error",
    "timeout",
    "validation-failed",
  ];

  it("renders the minimal block and exits 0 for a persisted ok run", async () => {
    const h = harness();

    const code = await h.run();

    expect(code).toBe(0);
    // The literal tail of stdout IS the minimal block — nothing rendered
    // after it, no markdown, no severities (H1/H2 boundary).
    expect(h.deps.io.out.slice(-3)).toEqual([
      "State: ok",
      "Verdict: approve",
      `Run directory: ${RUN_DIR}`,
    ]);
    expect(h.persistRunRequests).toHaveLength(1);
    expect(h.deps.io.err).toEqual([]);
  });

  it.each(failedStates)(
    "persists once and still exits 0 for a completed %s run",
    async (state) => {
      const h = harness({
        result: { state, cleanup: { attempted: false } },
        record: { ...withoutVerdict(okRecord), state },
      });

      const code = await h.run();

      // Recorded design decision: gate semantics are the CLI's scripting
      // contract; a completed, persisted interactive run exits 0.
      expect(code).toBe(0);
      expect(h.persistRunRequests).toHaveLength(1);
      expect(h.deps.io.out.slice(-2)).toEqual([
        `State: ${state}`,
        `Run directory: ${RUN_DIR}`,
      ]);
    },
  );

  it("hands persistRun the run it just completed, exactly once", async () => {
    const h = harness();

    await h.run();

    expect(h.persistRunRequests).toHaveLength(1);
    const persisted = h.persistRunRequests[0] as PersistRunRequest;
    expect(persisted.repoName).toBe("owner/repo");
    expect(persisted.startedAtEpochMs).toBe(1_700_000_000_000);
    expect(persisted.request).toBe(h.runReviewRequests[0]);
    expect(persisted.result).toBe(okResult);
  });
});

describe("persistence failure (AC-8, D13 mirror)", () => {
  const writeFailed = new Error("Failed to persist run at /runs/owner__repo");

  it("still shows the outcome, with `-` for the run directory", async () => {
    const h = harness({ persistRunFails: writeFailed });

    await h.run();

    expect(h.deps.io.out.slice(-3)).toEqual([
      "State: ok",
      "Verdict: approve",
      "Run directory: -",
    ]);
  });

  it("emits the no-history diagnostic and the failure, and exits non-zero", async () => {
    const h = harness({ persistRunFails: writeFailed });

    const code = await h.run();

    expect(code).toBe(1);
    expect(h.deps.io.err).toHaveLength(2);
    expect(h.deps.io.err[0]).toContain("could not be persisted");
    expect(h.deps.io.err[1]).toBe(writeFailed.message);
  });

  it("attempted persistence exactly once — no retry, no second run", async () => {
    const h = harness({ persistRunFails: writeFailed });

    await h.run();

    expect(h.persistRunRequests).toHaveLength(1);
    expect(h.runReviewRequests).toHaveLength(1);
  });

  it("shows a failed run's outcome too when its record could not be written", async () => {
    const h = harness({
      persistRunFails: writeFailed,
      result: { state: "engine-error", cleanup: { attempted: false } },
    });

    const code = await h.run();

    expect(code).toBe(1);
    expect(h.deps.io.out.slice(-2)).toEqual([
      "State: engine-error",
      "Run directory: -",
    ]);
  });
});
