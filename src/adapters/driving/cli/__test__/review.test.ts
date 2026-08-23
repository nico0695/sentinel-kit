/**
 * `sentinel review` behaviour (AC-1, AC-2, AC-6, AC-10, AC-11, AC-12, AC-13).
 *
 * Everything here runs against fake use cases and a capturing `CliIo` — no
 * driven adapter, no filesystem, no `process` (AC-1). Three properties get
 * dedicated guards, because each of them is a bug the story exists to
 * prevent:
 *
 * - **exit 0 for any completed invocation** whatever the terminal state
 *   (AC-12); non-zero only when the invocation itself fails, and then with
 *   nothing persisted.
 * - **exactly one persisted run** per completed invocation, failed runs
 *   included (AC-6).
 * - **`validations` / `validationTimeoutMs` reach `runReview`** (AC-11);
 *   without them `[E5.F1.H2]` would be dead code behind the CLI.
 */

import { describe, expect, it } from "vitest";
import type {
  PersistRunRequest,
  PersistRunResult,
  RunRecord,
} from "../../../../core/history/index.js";
import type {
  GlobalConfig,
  RepoRegistry,
} from "../../../../core/repos/index.js";
import { RepoNotFoundError } from "../../../../core/repos/index.js";
import type {
  RunReviewRequest,
  RunReviewResult,
} from "../../../../core/run/index.js";
import { createCli } from "../create-cli.js";
import { REVIEW_OUTCOME_FIELDS } from "../render/format-review.js";
import { argv, createTestDeps } from "./cli-test-doubles.js";

const RUN_DIR = "/tmp/sentinel-test/runs/owner__repo/20260824-000000-abc";

const config: GlobalConfig = {
  defaultEngine: "claude-code",
  defaultBaseBranch: "main",
  validationTimeoutMs: 30_000,
};

const repos: RepoRegistry = {
  "owner/repo": {
    url: "https://example.test/owner/repo.git",
    baseBranch: "develop",
    defaultHarness: "pr-review",
    validations: ["npm test", "npm run check"],
    validationTimeoutMs: 45_000,
  },
};

const okResult: RunReviewResult = {
  state: "ok",
  verdict: "approve",
  cleanup: { attempted: true, removed: true, reason: "policy-always" },
  engineName: "claude-code",
};

/** The record a real `persistRun` would compose from `okResult`. */
const okRecord: RunRecord = {
  repoName: "owner__repo",
  startedAtEpochMs: 1_700_000_000_000,
  durationMs: 4200,
  harness: "pr-review",
  baseRef: "develop",
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

interface ReviewHarness {
  readonly runReviewRequests: RunReviewRequest[];
  readonly persistRunRequests: PersistRunRequest[];
  readonly deps: ReturnType<typeof createTestDeps>;
  run(...args: string[]): Promise<number>;
}

/**
 * Drives the whole CLI (not the command in isolation), so the assertions
 * cover the same path `src/main/cli.ts` will take.
 */
function harness(
  options: {
    readonly result?: RunReviewResult;
    readonly record?: RunRecord;
    readonly runReviewFails?: unknown;
    readonly registry?: RepoRegistry;
  } = {},
): ReviewHarness {
  const runReviewRequests: RunReviewRequest[] = [];
  const persistRunRequests: PersistRunRequest[] = [];

  const deps = createTestDeps({
    loadContext: () =>
      Promise.resolve({ config, repos: options.registry ?? repos }),
    now: () => 1_700_000_000_000,
    useCases: {
      runReview: (request: RunReviewRequest): Promise<RunReviewResult> => {
        runReviewRequests.push(request);
        if (options.runReviewFails !== undefined) {
          return Promise.reject(options.runReviewFails);
        }
        return Promise.resolve(options.result ?? okResult);
      },
      persistRun: (request: PersistRunRequest): Promise<PersistRunResult> => {
        persistRunRequests.push(request);
        return Promise.resolve({
          runDir: RUN_DIR,
          record: options.record ?? okRecord,
        });
      },
    },
  });

  const cli = createCli(deps);

  return {
    runReviewRequests,
    persistRunRequests,
    deps,
    run: (...args: string[]) => cli.run(argv(...args)),
  };
}

function fieldsOf(lines: readonly string[]): Map<string, string> {
  return new Map(
    lines.map((line) => {
      const [key, ...rest] = line.split("\t");
      return [key ?? "", rest.join("\t")] as const;
    }),
  );
}

describe("review — argument surface", () => {
  it("maps the positionals and every flag onto the resolved request", async () => {
    const h = harness();

    const code = await h.run(
      "review",
      "owner/repo",
      "feature",
      "--type",
      "quick",
      "--engine",
      "opencode",
      "--timeout",
      "60000",
    );

    expect(code).toBe(0);
    expect(h.runReviewRequests).toHaveLength(1);
    expect(h.runReviewRequests[0]).toMatchObject({
      repoPath: "/tmp/sentinel-test/clones/owner/repo",
      baseRef: "develop",
      targetRef: "feature",
      harnessType: "quick",
      timeoutMs: 60_000,
      engineName: "opencode",
    });
  });

  it("falls back to the repository and config cascade when no flag is given", async () => {
    const h = harness();

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(0);
    expect(h.runReviewRequests[0]).toMatchObject({
      harnessType: "pr-review",
      // No --timeout and no config.reviewTimeoutMs: core's constant stands.
      timeoutMs: 600_000,
      engineName: "claude-code",
    });
  });

  it("forwards the repository's declared validations and their timeout (AC-11)", async () => {
    const h = harness();

    await h.run("review", "owner/repo", "feature");

    expect(h.runReviewRequests[0]?.validations).toEqual([
      "npm test",
      "npm run check",
    ]);
    expect(h.runReviewRequests[0]?.validationTimeoutMs).toBe(45_000);
  });

  it("omits absent optional fields instead of sending undefined values", async () => {
    const h = harness({
      registry: {
        "owner/repo": { url: "https://example.test/owner/repo.git" },
      },
    });

    await h.run("review", "owner/repo", "feature", "--type", "quick");

    const request = h.runReviewRequests[0] as RunReviewRequest;
    expect(Object.hasOwn(request, "validations")).toBe(false);
    expect(Object.hasOwn(request, "limits")).toBe(false);
    expect(request.validationTimeoutMs).toBe(30_000);
  });

  it("rejects a non-numeric --timeout instead of forwarding NaN", async () => {
    const h = harness();

    const code = await h.run(
      "review",
      "owner/repo",
      "feature",
      "--timeout",
      "soon",
    );

    expect(code).not.toBe(0);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.persistRunRequests).toHaveLength(0);
    expect(h.deps.io.out).toEqual([]);
    expect(h.deps.io.err.join("\n")).toContain("--timeout");
  });

  it.each(["0", "-5", "1.5", ""])(
    "rejects the unusable --timeout value %j",
    async (value) => {
      const h = harness();

      const code = await h.run(
        "review",
        "owner/repo",
        "feature",
        "--timeout",
        value,
      );

      expect(code).not.toBe(0);
      expect(h.runReviewRequests).toHaveLength(0);
    },
  );

  it("exits non-zero without calling a use case when <branch> is missing", async () => {
    const h = harness();

    const code = await h.run("review", "owner/repo");

    expect(code).not.toBe(0);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.deps.io.err.length).toBeGreaterThan(0);
  });
});

describe("review — persistence (AC-6)", () => {
  it("persists exactly one run, with the result runReview returned", async () => {
    const h = harness();

    await h.run("review", "owner/repo", "feature");

    expect(h.persistRunRequests).toHaveLength(1);
    const persisted = h.persistRunRequests[0] as PersistRunRequest;
    expect(persisted.result).toBe(okResult);
    expect(persisted.request).toBe(h.runReviewRequests[0]);
    expect(persisted.repoName).toBe("owner/repo");
    expect(persisted.startedAtEpochMs).toBe(1_700_000_000_000);
  });

  it("persists a run that ended in a non-ok terminal state", async () => {
    const failed: RunReviewResult = {
      state: "engine-error",
      cleanup: { attempted: true, removed: true, reason: "policy-always" },
      failure: { stage: "engine", error: new Error("engine binary not found") },
    };
    const h = harness({ result: failed });

    await h.run("review", "owner/repo", "feature");

    expect(h.persistRunRequests).toHaveLength(1);
    expect(h.persistRunRequests[0]?.result).toBe(failed);
  });

  it("prints the persisted run directory on stdout", async () => {
    const h = harness();

    await h.run("review", "owner/repo", "feature");

    expect(fieldsOf(h.deps.io.out).get("runDir")).toBe(RUN_DIR);
  });

  it("persists nothing when runReview itself throws", async () => {
    const h = harness({ runReviewFails: new Error("worktree exploded") });

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(1);
    expect(h.persistRunRequests).toHaveLength(0);
    expect(h.deps.io.err).toEqual(["worktree exploded"]);
  });
});

describe("review — exit codes (AC-12)", () => {
  it("exits 0 for a run that ended in engine-error", async () => {
    const h = harness({
      result: {
        state: "engine-error",
        cleanup: { attempted: false },
        failure: { stage: "engine", error: new Error("boom") },
      },
      record: {
        ...withoutVerdict(okRecord),
        state: "engine-error",
        failure: { stage: "engine", message: "boom" },
      },
    });

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(0);
    expect(fieldsOf(h.deps.io.out).get("state")).toBe("engine-error");
  });

  it.each(["ambiguous", "timeout", "validation-failed"] as const)(
    "exits 0 for a run that ended in %s",
    async (state) => {
      const h = harness({
        result: { state, cleanup: { attempted: false } },
        record: { ...withoutVerdict(okRecord), state },
      });

      const code = await h.run("review", "owner/repo", "feature");

      expect(code).toBe(0);
      expect(h.persistRunRequests).toHaveLength(1);
    },
  );

  it("exits 0 for a completed run whose verdict is request-changes", async () => {
    const h = harness({
      result: {
        state: "ok",
        verdict: "request-changes",
        cleanup: { attempted: false },
      },
      record: { ...okRecord, verdict: "request-changes" },
    });

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(0);
    expect(fieldsOf(h.deps.io.out).get("verdict")).toBe("request-changes");
  });

  it("exits non-zero for an unregistered alias and persists no run", async () => {
    const h = harness();

    const code = await h.run("review", "other/repo", "feature");

    expect(code).not.toBe(0);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.persistRunRequests).toHaveLength(0);
    expect(h.deps.io.out).toEqual([]);
    expect(h.deps.io.err).toEqual([
      new RepoNotFoundError("other/repo").message,
    ]);
  });

  it("exits non-zero when no harness type can be resolved", async () => {
    const h = harness({
      registry: {
        "owner/repo": { url: "https://example.test/owner/repo.git" },
      },
    });

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(1);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.deps.io.err).toHaveLength(1);
    expect(h.deps.io.err[0]).toContain("--type");
  });

  it("exits non-zero for an unknown engine, before any run starts", async () => {
    const h = harness();

    const code = await h.run(
      "review",
      "owner/repo",
      "feature",
      "--engine",
      "gpt-9",
    );

    expect(code).toBe(1);
    expect(h.runReviewRequests).toHaveLength(0);
    expect(h.persistRunRequests).toHaveLength(0);
    expect(h.deps.io.err).toHaveLength(1);
  });
});

describe("review — output (AC-10, AC-13)", () => {
  it("prints the outcome as key/value lines in a fixed order on stdout", async () => {
    const h = harness();

    await h.run("review", "owner/repo", "feature");

    expect(h.deps.io.out.map((line) => line.split("\t")[0])).toEqual([
      ...REVIEW_OUTCOME_FIELDS,
    ]);
    expect(h.deps.io.err).toEqual([]);
  });

  it("echoes the alias the user typed, never the stored storage key", async () => {
    const h = harness();

    await h.run("review", "owner/repo", "feature");

    expect(fieldsOf(h.deps.io.out).get("repo")).toBe("owner/repo");
    // `runDir` is a real filesystem path and legitimately contains the
    // storage key; no rendered *field* may.
    const rendered = h.deps.io.out.filter(
      (line) => !line.startsWith("runDir\t"),
    );
    expect(rendered.join("\n")).not.toContain("owner__repo");
  });

  it("renders an absent verdict and a failure without fabricating fields", async () => {
    const h = harness({
      result: { state: "engine-error", cleanup: { attempted: false } },
      record: {
        repoName: "owner__repo",
        startedAtEpochMs: 1_700_000_000_000,
        durationMs: 12,
        harness: "pr-review",
        baseRef: "develop",
        targetRef: "feature",
        state: "engine-error",
        failure: {
          stage: "engine",
          message: "engine binary not found\nis it installed?",
        },
      },
    });

    await h.run("review", "owner/repo", "feature");

    const fields = fieldsOf(h.deps.io.out);
    expect(fields.get("verdict")).toBe("-");
    expect(fields.get("engine")).toBe("-");
    expect(fields.get("failureStage")).toBe("engine");
    expect(fields.get("failureMessage")).toBe(
      "engine binary not found is it installed?",
    );
    expect(h.deps.io.out).toHaveLength(REVIEW_OUTCOME_FIELDS.length);
  });

  it("renders a core error as one stderr line with no stack (AC-13)", async () => {
    const h = harness({
      runReviewFails: new Error("harness not found: quick"),
    });

    const code = await h.run("review", "owner/repo", "feature");

    expect(code).toBe(1);
    expect(h.deps.io.err).toEqual(["harness not found: quick"]);
    expect(h.deps.io.err.join("\n")).not.toContain("at ");
    expect(h.deps.io.out).toEqual([]);
  });
});

describe("review — help (AC-2)", () => {
  it("exits 0 and documents both positionals and all three options", async () => {
    const h = harness();

    const code = await h.run("review", "--help");

    expect(code).toBe(0);
    const help = h.deps.io.out.join("\n");
    expect(help).toContain("Usage: sentinel review");
    expect(help).toContain("<repo>");
    expect(help).toContain("<branch>");
    expect(help).toContain("--type");
    expect(help).toContain("--engine");
    expect(help).toContain("--timeout");
    expect(h.deps.io.err).toEqual([]);
  });

  it("lists review among the root commands", async () => {
    const h = harness();

    await h.run("--help");

    expect(h.deps.io.out.join("\n")).toContain("review");
  });
});
